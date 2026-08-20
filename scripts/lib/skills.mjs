/**
 * skillbench — skill keşfi, frontmatter ayrıştırma ve gerçek aktivasyon kanıtı
 *
 * TASARIM İLKESİ: Ağ çağrısı yok. Sadece yerel dosya okunur. Skill gövdeleri
 * çıktıya kopyalanmaz; yalnızca ölçüm ve satır numarası taşınır.
 *
 * Doğrulanmış konumlar (bu makinede gerçek dosyalarla):
 *   ~/.claude/skills/<ad>/SKILL.md                    → Claude Code, kullanıcı
 *   ~/.claude/skills/<plugin>/skills/<ad>/SKILL.md    → plugin olarak kurulmuş paket
 *   ~/.claude/plugins/marketplaces/<mkt>/skills/...   → marketplace plugin'i
 *   ~/.gemini/skills/<ad>/SKILL.md                    → Gemini CLI
 *   ~/.codex/skills/<ad>/SKILL.md                     → Codex CLI
 *   ~/.codex/skills/.system/<ad>/SKILL.md             → Codex yerleşik skill'i
 */

import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "node:fs";
import { join, dirname, basename, resolve, relative, sep } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();

/**
 * `catalog: true` olan kök, kurulmamış marketplace girdilerini de içerir. Oradaki
 * bir plugin'in `scripts/` ve `references/` dosyaları kuruluma kadar diske inmez;
 * bu yüzden dosya varlığı denetimleri o skill'lerde ÇALIŞTIRILMAZ (yanlış alarm olur).
 */
export const ROOTS = [
  { agent: "claude-code", path: join(HOME, ".claude", "skills"), source: "user" },
  { agent: "claude-code", path: join(HOME, ".claude", "plugins", "cache"), source: "installed" },
  { agent: "claude-code", path: join(HOME, ".claude", "plugins", "marketplaces"), source: "catalog", catalog: true },
  { agent: "gemini-cli", path: join(HOME, ".gemini", "skills"), source: "user" },
  { agent: "codex", path: join(HOME, ".codex", "skills"), source: "user" },
];

// ---------- dosya gezinme ----------

/**
 * Sembolik bağlar İZLENİR: `~/.claude/skills/<ad>` sık sık geliştirme deposuna bağlanır
 * (Dirent.isDirectory() bir symlink için false döner; sadece ona güvenmek o skill'leri
 * tamamen görünmez yapar). Döngüye girmemek için gerçek yollar takip edilir.
 */
function walk(dir, match, out = [], depth = 0, seen = new Set()) {
  if (depth > 6 || !existsSync(dir)) return out;
  let real;
  try { real = realpathSync(dir); } catch { real = dir; }
  if (seen.has(real)) return out;
  seen.add(real);

  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = join(dir, e.name);
    let isDir = e.isDirectory();
    if (!isDir && e.isSymbolicLink()) {
      try { isDir = statSync(p).isDirectory(); } catch { isDir = false; }
    }
    if (isDir) walk(p, match, out, depth + 1, seen);
    else if (match(e.name)) out.push(p);
  }
  return out;
}

/** Bir skill dizininden yukarı çıkarak en yakın plugin kökünü bulur. */
function findPluginRoot(dir, stopAt) {
  let cur = dir;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(cur, ".claude-plugin", "plugin.json"))) return cur;
    const up = dirname(cur);
    if (up === cur || (stopAt && cur === stopAt)) break;
    cur = up;
  }
  return null;
}

function readPluginName(pluginRoot) {
  try {
    const j = JSON.parse(readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"));
    return j.name || basename(pluginRoot);
  } catch { return basename(pluginRoot); }
}

// ---------- frontmatter ----------

/**
 * SKILL.md frontmatter'ı için küçük ve öngörülebilir bir YAML alt kümesi.
 * Desteklenen: `anahtar: değer`, girintili devam satırları, `>` ve `|` blokları.
 * Desteklenmeyen (bilerek): iç içe haritalar, akış listeleri — bunlar `raw` içinde kalır.
 */
export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { ok: false, data: {}, body: text, endLine: 0 };
  const block = m[1];
  const data = {};
  let key = null;
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (kv && !/^\s/.test(line)) {
      key = kv[1];
      let v = kv[2].trim();
      if (v === ">" || v === "|" || v === ">-" || v === "|-") v = "";
      data[key] = v;
    } else if (key && /^\s+\S/.test(line)) {
      data[key] = (data[key] ? data[key] + " " : "") + line.trim();
    }
  }
  // Tırnak içine alınmış skaler değerleri sadeleştir: name: "foo" → foo
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (typeof v === "string" && v.length > 1) {
      const q = v[0];
      if ((q === '"' || q === "'") && v.endsWith(q)) data[k] = v.slice(1, -1);
    }
  }
  return {
    ok: true,
    data,
    body: text.slice(m[0].length),
    endLine: m[0].split("\n").length - 1,
    keys: Object.keys(data),
  };
}

// ---------- gövde içindeki referanslar ----------

const REF_RE = /(\]\(|["'`])((?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?[\w./\\-]*(?:references|scripts|assets|templates|examples|evals)\/[\w./\\-]+)/g;

/** "Örn:", "e.g." gibi işaretler bir yolun gerçek atıf değil örnek olduğunu söyler. */
const EXAMPLE_MARK = /(?:^|[\s(])(?:örn\.?|örnek|e\.?g\.?|for example|mesela|gibi|such as)[\s:]/i;

/**
 * Gövdede adı geçen ve var olması beklenen dosya yollarını çıkarır.
 *
 * Bir yol birden çok tabana göre çözülebilir: skill'in kendi dizini, kardeş skill'lerin
 * ortak kökü (`hyperframes-core/references/x.md` gibi çapraz atıflar için) ve plugin kökü.
 * Herhangi biri tutarsa referans "var" sayılır — aksi hâlde tamamen geçerli çapraz
 * atıflar kırık gibi raporlanır.
 */
export function extractRefs(body, { dir, pluginRoot }) {
  const parent = dirname(dir);
  const bases = [dir, parent];
  if (pluginRoot) bases.push(pluginRoot, join(pluginRoot, "skills"));
  // Kardeş skill dizinleri: "`references/x.md`" sık sık komşu bir skill'in dosyasını gösterir.
  try {
    for (const e of readdirSync(parent, { withFileTypes: true })) {
      const p = join(parent, e.name);
      if (p === dir) continue;
      let isDir = e.isDirectory();
      if (!isDir && e.isSymbolicLink()) { try { isDir = statSync(p).isDirectory(); } catch { isDir = false; } }
      if (isDir) bases.push(p);
    }
  } catch { /* kök okunamıyorsa kardeşsiz devam */ }

  const seen = new Set();
  const refs = [];
  for (const m of body.matchAll(REF_RE)) {
    const raw = m[2];
    if (seen.has(raw) || /^https?:/.test(raw)) continue;
    seen.add(raw);

    // Markdown bağlantısı ve tırnaklı yol güçlü kanıttır; ters tırnak içindeki yol
    // pekâlâ bir örnek olabilir, bu yüzden ayrı işaretlenir.
    const kind = m[1] === "](" ? "link" : m[1] === "`" ? "code" : "quoted";
    const lineStart = body.lastIndexOf("\n", m.index) + 1;
    const isExample = EXAMPLE_MARK.test(body.slice(lineStart, m.index));

    if (raw.includes("${CLAUDE_PLUGIN_ROOT}")) {
      if (!pluginRoot) { refs.push({ raw, kind, isExample, target: null, exists: false, reason: "plugin-disi" }); continue; }
      const target = resolve(pluginRoot, raw.replace("${CLAUDE_PLUGIN_ROOT}/", "").replace(/\\/g, "/"));
      refs.push({ raw, kind, isExample, target, exists: existsSync(target), reason: null });
      continue;
    }

    const rel = raw.replace(/\\/g, "/");
    const own = resolve(dir, rel);
    const hit = bases.map((b) => resolve(b, rel)).find((t) => existsSync(t));
    refs.push({
      raw, kind, isExample,
      target: hit || own,
      exists: !!hit,
      cross: !!hit && hit !== own,
      reason: null,
    });
  }
  return refs;
}

// ---------- keşif ----------

function classify(file, root) {
  const rel = relative(root.path, dirname(file));
  if (rel.split(sep).includes(".system")) return "system";
  return null;
}

/** Kurulu plugin kimlikleri (`plugin@marketplace`) — katalog girdisini kurulu olandan ayırır. */
function installedPluginNames() {
  try {
    const j = JSON.parse(readFileSync(join(HOME, ".claude", "plugins", "installed_plugins.json"), "utf8"));
    return new Set(Object.keys(j.plugins || {}).map((k) => k.split("@")[0]));
  } catch { return new Set(); }
}

/**
 * Tetikleme eval'ı iki yaygın düzenden birinde olabilir:
 *   evals/skill-triggers/<ad>.json          → should_trigger / should_not_trigger listeleri
 *   evals/skill-triggers/<ad>/case.yaml     → vaka başına bir dosya
 * Yalnızca birincisini aramak, ikinci düzeni kullanan depolarda "eval yok" yanlış
 * pozitifi üretir.
 */
function findEvals({ dir, pluginRoot, dirName }) {
  const jsonCandidates = [
    pluginRoot ? join(pluginRoot, "evals", "skill-triggers", `${dirName}.json`) : null,
    join(dir, "evals", "skill-triggers", `${dirName}.json`),
    pluginRoot ? join(pluginRoot, "evals", `${dirName}.json`) : null,
  ].filter(Boolean);
  const json = jsonCandidates.find((p) => existsSync(p));
  if (json) return { file: json, kind: "json", cases: null };

  const dirCandidates = [
    pluginRoot ? join(pluginRoot, "evals", "skill-triggers", dirName) : null,
    join(dir, "evals", "skill-triggers", dirName),
    join(dir, "evals"),
  ].filter(Boolean);
  for (const d of dirCandidates) {
    if (!existsSync(d)) continue;
    let files;
    try { files = readdirSync(d).filter((f) => /\.(ya?ml|json)$/i.test(f)); } catch { continue; }
    if (files.length) return { file: join(d, files[0]), kind: "cases", cases: files.length };
  }
  return { file: null, kind: null, cases: 0 };
}

function loadSkill(file, root, installedSet) {
  const dir = dirname(file);
  const text = readFileSync(file, "utf8");
  const fm = parseFrontmatter(text);
  const pluginRoot = findPluginRoot(dir);
  const plugin = pluginRoot ? readPluginName(pluginRoot) : null;
  const name = (fm.data.name || "").trim();
  const dirName = basename(dir);
  const source = classify(file, root) || root.source || (plugin ? "plugin" : "user");
  const installed = !root.catalog || (plugin ? installedSet.has(plugin) : false);
  const lines = text.split("\n").length;

  const ev = findEvals({ dir, pluginRoot, dirName });

  return {
    id: plugin && name ? `${plugin}:${name}` : name || dirName,
    name, dirName, description: (fm.data.description || "").trim(),
    file, dir, agent: root.agent, source, installed, plugin, pluginRoot,
    frontmatter: fm.data, frontmatterOk: fm.ok, keys: fm.keys || [],
    lines, bytes: Buffer.byteLength(text, "utf8"),
    body: fm.body,
    refs: extractRefs(fm.body, { dir, pluginRoot }),
    evalFile: ev.file, evalKind: ev.kind, evalCases: ev.cases,
    contentHash: hash(text),
  };
}

/** Küçük, bağımlılıksız içerik parmak izi (sürüklenme tespiti için). */
function hash(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  return (h1.toString(16) + h2.toString(16)).padStart(16, "0");
}

/**
 * Skill'leri bulur.
 * `path` verilirse yalnızca o dizin taranır (geliştirme döngüsü için);
 * verilmezse kurulu ajanların skill kökleri taranır.
 */
export function discoverSkills({ agent = "all", path = null, includeCatalog = false } = {}) {
  const roots = path
    ? [{ agent: "local", path: resolve(path), source: "project" }]
    : ROOTS.filter((r) => (agent === "all" || r.agent === agent) && (includeCatalog || !r.catalog));

  const installedSet = installedPluginNames();
  const out = [];
  const seenFiles = new Set();
  for (const root of roots) {
    if (!existsSync(root.path)) continue;
    for (const file of walk(root.path, (n) => n === "SKILL.md")) {
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      try { out.push(loadSkill(file, root, installedSet)); } catch { /* okunamayan skill atlanır */ }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------- gerçek aktivasyon kanıtı ----------

/**
 * Claude Code transcript'lerinden hangi skill'in gerçekten kaç kez ateşlediğini sayar.
 *
 * ÖNEMLİ: Bu alan (`attributionSkill`) yalnızca Claude Code kayıtlarında var.
 * Codex ve Gemini CLI hangi skill'in tetiklendiğini yapısal olarak kaydetmiyor;
 * o ajanlar için pasif ölçüm mümkün değildir ve rapor bunu açıkça söyler.
 */
export function activationStats(adapters, { days = 0 } = {}) {
  const sessions = adapters.listAllSessions({ agent: "claude-code", days });
  const stats = new Map();
  let scanned = 0, unreadable = 0, attributed = 0;

  for (const meta of sessions) {
    let s;
    try { s = adapters.getAdapter(meta.agent).loadSession(meta.file); }
    catch { unreadable++; continue; }
    scanned++;
    const project = s.cwd ? basename(s.cwd) : "?";
    for (const ev of s.events) {
      if (ev.kind !== "call" || !ev.skill) continue;
      attributed++;
      const id = normalizeAttribution(ev.skill, ev.plugin);
      const e = stats.get(id) || { id, calls: 0, sessions: new Set(), projects: new Set(), firstAt: null, lastAt: null };
      e.calls++;
      e.sessions.add(s.id);
      e.projects.add(project);
      if (ev.ts) {
        if (!e.firstAt || ev.ts < e.firstAt) e.firstAt = ev.ts;
        if (!e.lastAt || ev.ts > e.lastAt) e.lastAt = ev.ts;
      }
      stats.set(id, e);
    }
  }

  return {
    window: { days, sessionsScanned: scanned, unreadable, attributedCalls: attributed, source: "claude-code" },
    bySkill: [...stats.values()]
      .map((e) => ({ ...e, sessions: e.sessions.size, projects: [...e.projects] }))
      .sort((a, b) => b.calls - a.calls),
  };
}

/** Claude Code bazen plugin adını iki kez yazar: "halil-agent:halil-agent:intake". */
export function normalizeAttribution(skill, plugin) {
  let id = String(skill || "");
  if (plugin && !id.startsWith(plugin + ":")) id = `${plugin}:${id}`;
  const parts = id.split(":");
  const dedup = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
  return dedup.join(":");
}

/**
 * Aktivasyon kaydını keşfedilen skill'lerle eşler (id ya da yalın ad üzerinden).
 *
 * Yalnızca Claude Code kaydı olduğu için başka ajanlardaki kopyalar EŞLENMEZ; aksi
 * hâlde üç ajana kopyalanmış tek bir skill aynı çağrı sayısını üç kez gösterirdi.
 */
export function matchActivation(skills, bySkill) {
  const MEASURABLE = new Set(["claude-code", "local"]);
  const byId = new Map();
  for (const a of bySkill) byId.set(a.id, a);
  const bare = new Map();
  for (const a of bySkill) {
    const n = a.id.split(":").pop();
    if (!bare.has(n)) bare.set(n, a);
  }
  return skills.map((s) => {
    const measurable = MEASURABLE.has(s.agent);
    if (!measurable) return { skill: s, activation: null, measurable: false };
    const hit = byId.get(s.id) || byId.get(s.name) || bare.get(s.name) || bare.get(s.dirName) || null;
    return { skill: s, activation: hit, measurable: true };
  });
}
