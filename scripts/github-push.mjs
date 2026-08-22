// github-push — 抗网络波动的推送器：先走 git，github.com:443 被掐时自动降级 GitHub API。
//
// 背景（见 docs/NETWORK-NOTES.md）：部分网络环境下 github.com:443 连接被重置，
// 而 api.github.com 始终可达；Node fetch 可能被本机代理的 TLS 链绊住（需 --use-system-ca）。
//
// 降级路径产出**单条提交**（blobs→tree→commit→ref），不刷屏；不带 base_tree 的全新根树
// 天然同步删除。git blob sha 与 API blob sha 同源，远端已有的文件直接复用，只传增量。
//
// 用法: node scripts/github-push.mjs [--remote origin] [--branch main] [--force-api] [--message "msg"]
//   --force-api   跳过 git 直连，强制走 API（排障/演练用）
//   --message     API 降级时的提交信息，默认取本地 HEAD 的完整 message
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name) => args.includes(`--${name}`)
const remote = flag('remote') ?? 'origin'
const branch = flag('branch') ?? 'main'
const repoDir = flag('dir') ?? '.'

const git = (...gitArgs) => execFileSync('git', ['-C', repoDir, ...gitArgs], { encoding: 'utf8' }).trim()
const out = (line) => console.log(line)

// TLS 自重生：本机代理拦截证书链时，用 --use-system-ca 重新拉起自己（一次即止）
const CERT_TROUBLE = /unable to verify|self-?signed|UNABLE_TO_VERIFY|depth_zero_self_signed/i
async function robustFetch(url, init) {
  try {
    return await fetch(url, init)
  } catch (err) {
    if (CERT_TROUBLE.test(String(err?.cause ?? err)) && !process.execArgv.includes('--use-system-ca')) {
      out('⚠ TLS 证书链被本机代理拦截，以 --use-system-ca 重启自身…')
      const result = spawnSync(process.execPath, ['--use-system-ca', ...process.argv.slice(1)], { stdio: 'inherit' })
      process.exit(result.status ?? 1)
    }
    throw err
  }
}

function parseRemote() {
  const url = git('remote', 'get-url', remote)
  const https = url.match(/github\.com[/:]([^/]+)\/([^/.#]+)/)
  if (!https) throw new Error(`无法从 ${url} 解析 owner/repo`)
  return `${https[1]}/${https[2]}`
}

async function main() {
  if (!has('force-api')) {
    const pushed = spawnSync('git', ['-C', repoDir, 'push', remote, branch], { stdio: 'pipe', encoding: 'utf8' })
    if (pushed.status === 0) {
      out(`✓ git 直连推送成功（${remote}/${branch}）`)
      return
    }
    out(`⚠ git 直连失败（${(pushed.stderr || '').split('\n').pop()}），降级 GitHub API 通道…`)
  }

  const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
  const repo = parseRemote()
  const api = async (path, init = {}) => {
    const res = await robustFetch(`https://api.github.com/repos/${repo}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`)
    return body
  }

  // 远端 head 与树
  let remoteHead = null
  let remoteTree = []
  try {
    const ref = await api(`git/ref/heads/${branch}`)
    remoteHead = ref.object.sha
    let remoteCommitMissing = false
    try {
      git('cat-file', '-e', `${remoteHead}^{commit}`)
    } catch {
      remoteCommitMissing = true
    }
    if (remoteHead && remoteCommitMissing) {
      throw new Error(`远端 ${branch} 有本地不存在的提交 ${remoteHead.slice(0, 8)}，先 git pull 解决分歧再推`)
    }
    const tree = await api(`git/trees/${remoteHead}?recursive=1`)
    remoteTree = tree.tree.filter((entry) => entry.type === 'blob')
  } catch (err) {
    if (/本地不存在/.test(err.message) || /HTTP 40[45]/.test(err.message)) {
      if (/本地不存在/.test(err.message)) throw err
      out(`ℹ 远端分支 ${branch} 不存在或为空，将创建`)
    } else throw err
  }
  const remoteShas = new Map(remoteTree.map((entry) => [entry.path, entry.sha]))

  // 本地文件 → 增量建 blob（sha 同源，远端已有的跳过）
  const files = git('ls-files').split('\n').filter(Boolean)
  const treeEntries = []
  let created = 0
  let reused = 0
  for (const file of files) {
    const sha = git('hash-object', file)
    if (remoteShas.get(file) === sha) {
      reused += 1
      treeEntries.push({ path: file, mode: '100644', type: 'blob', sha })
      continue
    }
    const blob = await api('git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: readFileSync(`${repoDir === '.' ? '' : `${repoDir}/`}${file}`).toString('base64'), encoding: 'base64' }),
    })
    created += 1
    treeEntries.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha })
  }
  const deleted = remoteTree.length - [...remoteShas.keys()].filter((path) => files.includes(path)).length
  out(`增量：新建 blob ${created}，复用 ${reused}${deleted > 0 ? `，删除 ${deleted}` : ''}`)

  const tree = await api('git/trees', { method: 'POST', body: JSON.stringify({ tree: treeEntries }) })
  const message = flag('message') ?? git('log', '-1', '--format=%B')
  const commitBody = { message, tree: tree.sha, ...(remoteHead ? { parents: [remoteHead] } : {}) }
  const commit = await api('git/commits', { method: 'POST', body: JSON.stringify(commitBody) })

  if (remoteHead) {
    await api(`git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) })
  } else {
    await api('git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) })
  }
  out(`✓ API 推送完成：${commit.sha.slice(0, 8)}（${remoteHead ? '追加' : '新建'} ${repo}@${branch}）`)
  out('ℹ 本地与远端历史形状可能不同（内容一致）；网络恢复后可 git fetch + reset 对齐')
}

main().catch((err) => {
  console.error(`✗ ${err.message}`)
  process.exit(1)
})
