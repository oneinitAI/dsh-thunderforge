// ThunderForge 可移植 profile 格式（serialize/parse/diff）。
// 实现沿革：最初 vendor 自 dshp（asdf17128/dshp，MIT），现已并入本仓库维护。
// 格式契约：patch 块逐字节往返（含 !!js 表达式），手写 YAML 子集而非依赖库。
/**
 * The portable profile file — the format that makes a setup shareable.
 *
 * Three things reproduce a profile: which plugins at which versions, the order
 * of the bundle stack, and the user's patch. Everything else dsh regenerates.
 * So the export is those three, in a format a person can read in a forum post
 * and a machine can round-trip exactly.
 *
 * It is emitted as YAML-ish text written by hand rather than through a YAML
 * library: the patch block is copied verbatim (it may contain `!!js`
 * expressions that a serializer would mangle or evaluate), and keeping the
 * writer trivial means the file stays diffable and hand-editable.
 */

const HEADER = "# dsh profile — reproduce with: dshp import <this-file>";

/**
 * @param {import('./profile.js').Profile} profile
 * @returns {string}
 */
export function serialize(profile) {
  const lines = [HEADER, "dshp: 1", `name: ${profile.name}`];

  lines.push("bundles:");
  for (const b of profile.bundles) lines.push(`  - ${quote(b)}`);

  const pluginNames = Object.keys(profile.plugins);
  if (pluginNames.length === 0) {
    lines.push("plugins: {}");
  } else {
    lines.push("plugins:");
    for (const name of pluginNames.sort()) {
      lines.push(`  ${quote(name)}: ${quote(profile.plugins[name])}`);
    }
  }

  if (profile.patch.trim()) {
    lines.push("patch: |");
    for (const line of profile.patch.replace(/\n+$/, "").split("\n")) {
      lines.push(`  ${line}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

/** Quote only when a bare scalar would be ambiguous, to keep the file readable. */
function quote(value) {
  return /^[A-Za-z0-9._@/-]+$/.test(value) ? value : JSON.stringify(value);
}

function unquote(value) {
  const v = value.trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  return v;
}

/**
 * Parse a portable file back into a profile.
 *
 * Hand-rolled for the same reason `serialize` is: the `patch: |` block must
 * come back byte-identical, including any `!!js` expression inside it.
 *
 * @param {string} text
 * @returns {import('./profile.js').Profile}
 */
export function parse(text) {
  const lines = text.split("\n");
  const profile = { name: "", plugins: {}, bundles: [], patch: "" };
  let section = null;
  const patchLines = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (section === "patch") {
      // The block ends at the first non-empty line that is not indented.
      if (raw.trim() && !/^\s/.test(raw)) {
        section = null;
      } else {
        patchLines.push(raw.startsWith("  ") ? raw.slice(2) : raw);
        continue;
      }
    }
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (line === "bundles:") {
      section = "bundles";
      continue;
    }
    if (line === "plugins:") {
      section = "plugins";
      continue;
    }
    if (line === "plugins: {}") {
      section = null;
      continue;
    }
    if (line === "patch: |") {
      section = "patch";
      continue;
    }

    if (section === "bundles" && line.startsWith("- ")) {
      profile.bundles.push(unquote(line.slice(2)));
      continue;
    }
    if (section === "plugins" && line.includes(":")) {
      const idx = line.lastIndexOf(":");
      profile.plugins[unquote(line.slice(0, idx))] = unquote(line.slice(idx + 1));
      continue;
    }

    const m = /^([a-zA-Z]+):\s*(.*)$/.exec(line);
    if (m) {
      section = null;
      if (m[1] === "name") profile.name = unquote(m[2]);
      else if (m[1] === "dshp" && m[2].trim() !== "1") {
        throw new Error(`unsupported dshp format version: ${m[2].trim()}`);
      }
    }
  }

  profile.patch = patchLines.join("\n").replace(/\n+$/, "");
  if (profile.patch) profile.patch += "\n";
  if (!profile.name) throw new Error("portable file has no `name`");
  if (profile.bundles.length === 0) throw new Error("portable file lists no bundles");
  return profile;
}

/**
 * Human-readable difference between two profiles.
 * @returns {{bundles: string[], plugins: string[], patch: boolean}}
 */
export function diff(a, b) {
  const bundles = [];
  const inA = new Set(a.bundles);
  const inB = new Set(b.bundles);
  for (const x of a.bundles) if (!inB.has(x)) bundles.push(`- ${x}`);
  for (const x of b.bundles) if (!inA.has(x)) bundles.push(`+ ${x}`);
  if (bundles.length === 0 && a.bundles.join() !== b.bundles.join()) {
    bundles.push("~ same bundles, different order");
  }

  const plugins = [];
  const names = new Set([...Object.keys(a.plugins), ...Object.keys(b.plugins)]);
  for (const n of [...names].sort()) {
    const va = a.plugins[n];
    const vb = b.plugins[n];
    if (va && !vb) plugins.push(`- ${n}@${va}`);
    else if (!va && vb) plugins.push(`+ ${n}@${vb}`);
    else if (va !== vb) plugins.push(`~ ${n}: ${va} -> ${vb}`);
  }

  return { bundles, plugins, patch: a.patch.trim() !== b.patch.trim() };
}
