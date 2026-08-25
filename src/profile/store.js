// ThunderForge profile 存储层：DeepSeek Harness profile 的读写与目录操作。
//
// 实现沿革：最初 vendor 自 dshp（asdf17128/dshp，MIT）src/profile.js，现已并入
// 本仓库作为一等公民模块维护（MIT 归属见 LICENSES/ 台账）。
//
// A profile is a directory under `$DSH_HOME/profiles/<name>`:
//
//   package.json        `dependencies` = the plugins installed into it,
//                       `dsh.profile.bundles` = the ordered layer stack
//   cordis.yml          always an empty entry list — the tree is composed
//                       entirely from patches, so this file never varies
//   cordis.patch.yml    the user's own id-targeted overrides
//   pnpm-workspace.yaml pnpm settings dsh's own `plugin` command relies on
//   node_modules/       installed packages
//
// Everything portable therefore lives in three places: the dependency map, the
// bundle order, and the patch file. The rest is boilerplate this module can
// regenerate byte-for-byte, which is what makes a profile shareable as one file.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { dshHome } from '../dsh-home.js'

export function dshHomeLegacy() {
  return dshHome()
}

export function profilesDir() {
  return join(dshHome(), 'profiles')
}

export function profileDir(name) {
  return join(profilesDir(), name)
}

/**
 * `cordis.yml` is a fixed empty list; dsh composes the tree from patch layers.
 * The comment is dsh's own wording, kept so a generated profile is
 * indistinguishable from one dsh created.
 */
const CORDIS_YML = `# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
`

const PNPM_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`

/**
 * Profile names live beside pnpm's own `node_modules` in the same directory, so
 * a listing has to exclude it explicitly rather than trust every child.
 */
export function listProfiles() {
  const dir = profilesDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.'))
    .map((e) => e.name)
    .filter((name) => existsSync(join(dir, name, 'package.json')))
    .sort()
}

export function exists(name) {
  return existsSync(join(profileDir(name), 'package.json'))
}

/**
 * @typedef {object} Profile
 * @property {string} name
 * @property {Record<string,string>} plugins  dependency map
 * @property {string[]} bundles              ordered layer stack
 * @property {string} patch                  cordis.patch.yml contents ('' when absent)
 */

/** @returns {Profile} */
export function readProfile(name) {
  const dir = profileDir(name)
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) {
    throw new Error(`profile "${name}" not found under ${profilesDir()}`)
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const patchPath = join(dir, 'cordis.patch.yml')
  return {
    name,
    plugins: pkg.dependencies ?? {},
    bundles: pkg?.dsh?.profile?.bundles ?? [],
    patch: existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '',
  }
}

/**
 * Write a profile directory from scratch. Does not install anything — the
 * caller decides when to pay for a network round trip.
 * @param {Profile} profile
 */
export function writeProfile(profile) {
  const dir = profileDir(profile.name)
  mkdirSync(dir, { recursive: true })
  const pkg = {
    name: `dsh-profile-${profile.name}`,
    private: true,
    dependencies: profile.plugins,
    dsh: { profile: { bundles: profile.bundles } },
  }
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  writeFileSync(join(dir, 'cordis.yml'), CORDIS_YML)
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), PNPM_WORKSPACE)
  if (profile.patch.trim()) {
    writeFileSync(join(dir, 'cordis.patch.yml'), profile.patch)
  }
  return dir
}

/**
 * Copy a profile including its installed packages.
 *
 * node_modules is copied rather than reinstalled so a clone is instant and
 * byte-identical — the point of cloning is to experiment against exactly the
 * tree that currently works, not against whatever the registry serves today.
 */
export function cloneProfile(from, to) {
  const src = profileDir(from)
  const dst = profileDir(to)
  if (!exists(from)) throw new Error(`profile "${from}" not found`)
  if (existsSync(dst)) throw new Error(`profile "${to}" already exists`)
  cpSync(src, dst, { recursive: true, dereference: false, verbatimSymlinks: true })
  const pkgPath = join(dst, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.name = `dsh-profile-${to}`
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  return dst
}

export function removeProfile(name) {
  if (!exists(name)) throw new Error(`profile "${name}" not found`)
  rmSync(profileDir(name), { recursive: true, force: true })
}

/** Rough on-disk size, for `ls` to show what a clone would cost. */
export function profileSize(name) {
  const dir = profileDir(name)
  let bytes = 0
  const walk = (d, depth) => {
    if (depth > 6) return
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const path = join(d, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) walk(path, depth + 1)
      else {
        try {
          bytes += statSync(path).size
        } catch {
          /* vanished mid-walk */
        }
      }
    }
  }
  walk(dir, 0)
  return bytes
}
