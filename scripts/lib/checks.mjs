/**
 * skillbench — lint kuralları, çakışma analizi ve kopya sürüklenmesi
 *
 * Her kural şeffaftır: hangi metnin neden işaretlendiğini söyler. Model yargısı yoktur.
 * Bir kuralı `--ignore <id>` ile kapatabilirsin.
 *
 * Önem: error = skill muhtemelen çalışmaz · warn = tetiklenme veya bakım sorunu
 *       info = bilinmesi iyi, aksiyon şart değil
 */

import { readFileSync } from "node:fs";
import { MESSAGE_KEYS, CATEGORY_LABEL, renderFinding } from "./i18n.mjs";

const SEV_WEIGHT = { error: 10, warn: 4, info: 1 };

const KNOWN_KEYS = new Set([
  "name", "description", "version", "license", "author", "homepage", "repository",
  "allowed-tools", "tools", "argument-hint", "user-invocable", "disable-model-invocation",
  "metadata", "model", "context", "when-to-use",
]);

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TRIGGER_RE = /\buse (?:this |it )?(?:when|for)\b|\bkullan(?:ıl)?\b|\bwhen the user\b/i;
const BOUNDARY_RE = /\bnot for\b|\bdo not use\b|\bdon'?t use\b|\binstead use\b|\bthat is\b.*—|\bdeğil\b/i;
const FIRST_PERSON_RE = /^(?:I\s|This skill\b|Bu skill\b|Bu beceri\b|A skill (?:that|to)\b)/i;
const AGENT_NAME_RE = /\bClaude Code\b|\bCodex CLI\b|\bGemini CLI\b|\bCursor\b/;
const ABS_PATH_RE = /[A-Za-z]:\\Users\\[\w.-]+|\/home\/[\w.-]+|\/Users\/[\w.-]+/;
// Bir komuta doğrudan `~` geçmek: kabuk genişletmesi olmayan yerde klasör adı "~" olur.
const LITERAL_TILDE_RE = /(?:--(?:out|output|file|path|dir)|[-\s]o|>)\s+"?~[/\\]/;

// ---------- tek skill denetimleri ----------

export const CHECKS = [
  // frontmatter
  { id: "fm-missing", severity: "error", category: "frontmatter",
    test: (s) => (!s.frontmatterOk ? {} : null) },
  { id: "fm-no-name", severity: "error", category: "frontmatter",
    test: (s) => (s.frontmatterOk && !s.name ? {} : null) },
  { id: "fm-no-description", severity: "error", category: "frontmatter",
    test: (s) => (s.frontmatterOk && !s.description ? {} : null) },
  { id: "fm-name-dir-mismatch", severity: "error", category: "frontmatter",
    test: (s) => (s.name && s.name !== s.dirName ? { name: s.name, dirName: s.dirName } : null) },
  { id: "fm-name-format", severity: "warn", category: "frontmatter",
    test: (s) => (s.name && !NAME_RE.test(s.name) ? { name: s.name } : null) },
  { id: "fm-desc-too-short", severity: "warn", category: "activation",
    test: (s) => (s.description && s.description.length < 80 ? { length: s.description.length } : null) },
  { id: "fm-desc-too-long", severity: "warn", category: "activation",
    test: (s) => (s.description.length > 1024 ? { length: s.description.length } : null) },
  { id: "fm-desc-no-trigger", severity: "warn", category: "activation",
    test: (s) => (s.description && !TRIGGER_RE.test(s.description) ? {} : null) },
  { id: "fm-desc-no-boundary", severity: "info", category: "activation",
    test: (s) => (s.description && s.description.length > 120 && !BOUNDARY_RE.test(s.description) ? {} : null) },
  { id: "fm-desc-first-person", severity: "warn", category: "activation",
    test: (s) => (FIRST_PERSON_RE.test(s.description) ? { head: s.description.slice(0, 40) } : null) },
  { id: "fm-unknown-key", severity: "info", category: "frontmatter",
    test: (s) => { const u = (s.keys || []).filter((k) => !KNOWN_KEYS.has(k)); return u.length ? { keys: u.join(", ") } : null; } },

  // gövde
  { id: "body-very-long", severity: "error", category: "structure",
    test: (s) => (s.lines > 800 ? { lines: s.lines } : null) },
  { id: "body-too-long", severity: "warn", category: "structure",
    test: (s) => (s.lines > 500 && s.lines <= 800 ? { lines: s.lines } : null) },
  { id: "body-no-structure", severity: "info", category: "structure",
    test: (s) => (s.lines > 60 && !/^##\s/m.test(s.body) ? {} : null) },

  // referanslar
  { id: "ref-broken-link", severity: "error", category: "reference",
    test: (s) => { const b = s.refs.filter((r) => !r.exists && !r.isExample && r.kind !== "code"); return b.length ? { refs: b.map((r) => r.raw).join(", ") } : null; } },
  { id: "ref-broken-code", severity: "warn", category: "reference",
    test: (s) => { const b = s.refs.filter((r) => !r.exists && !r.isExample && r.kind === "code"); return b.length ? { refs: b.map((r) => r.raw).join(", ") } : null; } },
  { id: "ref-cross-skill", severity: "info", category: "reference",
    test: (s) => { const c = s.refs.filter((r) => r.cross); return c.length ? { refs: c.map((r) => r.raw).join(", ") } : null; } },
  { id: "plugin-root-missing", severity: "warn", category: "reference",
    test: (s) => {
      if (!s.pluginRoot) return null;
      const bare = s.refs.filter((r) => /^(?:scripts|assets)\//.test(r.raw) && !r.raw.includes("CLAUDE_PLUGIN_ROOT"));
      return bare.length ? { refs: bare.map((r) => r.raw).join(", ") } : null;
    } },
  { id: "plugin-root-orphan", severity: "warn", category: "reference",
    test: (s) => (!s.pluginRoot && /\$\{CLAUDE_PLUGIN_ROOT\}/.test(s.body) ? {} : null) },

  // taşınabilirlik ve güvenlik
  { id: "path-absolute", severity: "warn", category: "portability",
    test: (s) => { const m = s.body.match(ABS_PATH_RE); return m ? { match: m[0] } : null; } },
  { id: "path-literal-tilde", severity: "error", category: "portability",
    test: (s) => { const m = s.body.match(LITERAL_TILDE_RE); return m ? { match: m[0].trim() } : null; } },
  { id: "agent-lock-in", severity: "info", category: "portability",
    test: (s) => { const m = s.body.match(AGENT_NAME_RE); return m ? { match: m[0] } : null; } },
  { id: "tools-broad", severity: "warn", category: "permission",
    test: (s) => {
      const t = s.frontmatter["allowed-tools"] || s.frontmatter.tools;
      if (!t) return null;
      if (/(^|[\s,])\*([\s,]|$)/.test(t)) return {};
      return null;
    } },

  // eval kapsamı
  { id: "eval-missing", severity: "warn", category: "eval",
    test: (s) => (s.evalFile ? null : { dirName: s.dirName }) },
  { id: "eval-invalid", severity: "error", category: "eval",
    test: (s) => {
      if (!s.evalFile || s.evalKind !== "json") return null; // vaka dosyaları YAML olabilir
      try { JSON.parse(readFileSync(s.evalFile, "utf8")); return null; }
      catch (e) { return { message: e.message.slice(0, 60) }; }
    } },
  { id: "eval-thin", severity: "info", category: "eval",
    test: (s) => {
      if (!s.evalFile) return null;
      if (s.evalKind === "cases") {
        // Vaka-başına-dosya düzeninde negatif örnek kavramı yok; yalnızca sayıya bakılır.
        return (s.evalCases || 0) >= 4 ? null : { cases: s.evalCases || 0 };
      }
      let j; try { j = JSON.parse(readFileSync(s.evalFile, "utf8")); } catch { return null; }
      const yes = (j.should_trigger || []).length, no = (j.should_not_trigger || []).length;
      if (yes >= 4 && no >= 3) return null;
      return { yes, no };
    } },
];
/**
 * Bulgular makine verisidir: `check`, `severity`, `category` ve `vars`.
 * Düzyazı `i18n.mjs`'te, raporlama anında uygulanır — `renderFindings()`.
 */
export function lintSkill(skill, { ignore = [] } = {}) {
  const out = [];
  for (const c of CHECKS) {
    if (ignore.includes(c.id)) continue;
    // Kurulmamış katalog girdilerinde dosya varlığı denetimi yanlış alarm üretir.
    if (!skill.installed && c.category === "reference") continue;
    if (!skill.installed && c.category === "eval") continue;
    let hit;
    try { hit = c.test(skill); } catch { hit = null; }
    if (!hit) continue;   // null = tetiklenmedi; `{}` değeri de geçerli bir bulgudur
    out.push({
      check: c.id, severity: c.severity, category: c.category,
      skill: skill.id, agent: skill.agent, file: skill.file,
      vars: hit,
    });
  }
  return out;
}

/**
 * Aynı skill birden çok ajan dizininde kurulu olabilir (`~/.claude/skills`,
 * `~/.codex/skills`, `~/.gemini/skills`). İçerik birebir aynıysa bu **tek bir
 * skill'dir**: `eval-missing` ya da `fm-desc-too-short` gibi içerikten türeyen bulgular
 * kaynağın özelliğidir, kurulumun değil. Kurulum başına saymak puanı kopya sayısıyla
 * çarpar — tek sorun, üç ceza. Bir kullanıcının aynı skill'i üç ajana kopyalaması
 * kalitesini üçe katlamaz.
 *
 * Ayrım `contentHash` üzerinden yapılır, yalnızca skill adı üzerinden değil: kopyalar
 * ayrışmışsa (sürüklenme) bulgular gerçekten farklı olabilir ve ikisi de gösterilmeli.
 * Sürüklenmenin kendisini `findDrift` raporlar.
 *
 * Hayatta kalan bulguya `agents` (hangi ajanlarda görüldü) ve `mirrored` (kaç kurulum)
 * eklenir; bilgi kaybolmaz, yalnızca bir kez sayılır.
 */
export function dedupeMirrored(findings, skills = []) {
  const hashOf = new Map();
  for (const s of skills) hashOf.set(`${s.id} ${s.agent}`, s.contentHash);

  const seen = new Map();
  const out = [];
  for (const f of findings) {
    // Hash bulunamazsa dosya yoluna düşülür: yol kuruluma özgüdür, yani
    // birleştirme yapılmaz. Yanlış birleştirmek, birleştirmemekten kötüdür.
    const h = hashOf.get(`${f.skill} ${f.agent}`) ?? `file:${f.file}`;
    const key = `${f.check} ${f.skill} ${h}`;
    const prev = seen.get(key);
    if (prev) {
      if (f.agent && !prev.agents.includes(f.agent)) prev.agents.push(f.agent);
      prev.mirrored = prev.agents.length;
      continue;
    }
    const copy = { ...f, agents: f.agent ? [f.agent] : [], mirrored: 1 };
    seen.set(key, copy);
    out.push(copy);
  }
  return out;
}

/** Farklı skill sayısı — kurulum değil. Kaynak notu ve puan bunu kullanır. */
export const distinctSkills = (skills = []) => new Set(skills.map((s) => s.id)).size;

/**
 * Puan. `level` anahtarı dilden bağımsızdır (`poor`/`fair`/`good`/`clean`);
 * görünen etiket `i18n.mjs`'teki `levelLabel()` ile üretilir. CI eşiği buna
 * bağlanabilsin diye çeviriyle değişmez.
 */
export function lintScore(findings) {
  const raw = findings.reduce((n, f) => n + (SEV_WEIGHT[f.severity] || 0), 0);
  return { raw, level: raw >= 40 ? "poor" : raw >= 15 ? "fair" : raw > 0 ? "good" : "clean" };
}

// ---------- çakışma analizi ----------

const STOP = new Set(`
a an the and or of to for in on with when use uses using this that it its is are be as by from at
into your you их user agent skill skills not do does don't only also more than then them their
bir bu şu ve veya ile için gibi olan olarak ise da de den dan çok az en her hangi ne nasıl
kullan kullanılır yap yapar et eder olsun ki mi mı mu mü var yok
`.trim().split(/\s+/));

function tokenize(text) {
  return String(text || "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** Nadir kelimeleri ağırlıklandıran kosinüs benzerliği (idf). */
export function findCollisions(skills, { threshold = 0.34 } = {}) {
  const docs = skills.map((s) => ({ s, tf: countTokens(tokenize(s.description)) }));
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const N = docs.length || 1;
  const idf = (t) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;

  const vecs = docs.map((d) => {
    const v = new Map();
    let norm = 0;
    for (const [t, n] of d.tf) { const w = (1 + Math.log(n)) * idf(t); v.set(t, w); norm += w * w; }
    return { s: d.s, v, norm: Math.sqrt(norm) || 1 };
  });

  const out = [];
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      const a = vecs[i], b = vecs[j];
      // Aynı skill'in başka ajandaki kopyası çakışma değildir.
      if (a.s.name && a.s.name === b.s.name) continue;
      let dot = 0;
      const shared = [];
      for (const [t, w] of a.v) {
        const w2 = b.v.get(t);
        if (w2) { dot += w * w2; shared.push([t, w * w2]); }
      }
      const score = dot / (a.norm * b.norm);
      if (score < threshold) continue;
      out.push({
        a: a.s.id, b: b.s.id, agentA: a.s.agent, agentB: b.s.agent,
        score: Math.round(score * 100) / 100,
        sharedTerms: shared.sort((x, y) => y[1] - x[1]).slice(0, 6).map(([t]) => t),
        bothHaveBoundary: BOUNDARY_RE.test(a.s.description) && BOUNDARY_RE.test(b.s.description),
      });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

function countTokens(tokens) {
  const m = new Map();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

// ---------- kopya sürüklenmesi ----------

/** Aynı skill birden çok ajanda duruyorsa içerikleri hâlâ aynı mı? */
export function findDrift(skills) {
  const byName = new Map();
  for (const s of skills) {
    if (!s.name) continue;
    const g = byName.get(s.name) || [];
    g.push(s);
    byName.set(s.name, g);
  }
  const out = [];
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    const hashes = new Set(group.map((s) => s.contentHash));
    if (hashes.size === 1) continue;
    out.push({
      name,
      copies: group.map((s) => ({ agent: s.agent, file: s.file, lines: s.lines, hash: s.contentHash.slice(0, 8) })),
      distinctVersions: hashes.size,
    });
  }
  return out.sort((a, b) => b.distinctVersions - a.distinctVersions || a.name.localeCompare(b.name));
}

// ---------- öz-test (ağ yok, disk yok) ----------

function fake(over = {}) {
  return {
    id: "t", name: "t", dirName: "t", description: "Does a thing. Use when the user asks for a thing. Not for other things — that is another-skill.",
    file: "t/SKILL.md", dir: "t", agent: "test", source: "user", installed: true, plugin: null, pluginRoot: null,
    frontmatter: { name: "t", description: "x" }, frontmatterOk: true, keys: ["name", "description"],
    lines: 100, bytes: 1000, body: "## Step 1\n\nDo the thing.\n", refs: [], evalFile: null,
    contentHash: "a", ...over,
  };
}

export function selftest() {
  const fails = [];
  const has = (skill, id) => lintSkill(skill).some((f) => f.check === id);
  const hasnt = (skill, id) => !has(skill, id);

  const cases = [
    ["temiz skill error üretmemeli", () => lintSkill(fake()).every((f) => f.severity !== "error")],
    ["ad/dizin uyuşmazlığı", () => has(fake({ name: "a", dirName: "b" }), "fm-name-dir-mismatch")],
    ["ad biçimi", () => has(fake({ name: "My_Skill", dirName: "My_Skill" }), "fm-name-format")],
    ["kısa açıklama", () => has(fake({ description: "Does a thing." }), "fm-desc-too-short")],
    ["tetikleyici yok", () => has(fake({ description: "x".repeat(200) }), "fm-desc-no-trigger")],
    ["birinci şahıs", () => has(fake({ description: "This skill does a thing. Use when asked." }), "fm-desc-first-person")],
    ["çok uzun gövde", () => has(fake({ lines: 900 }), "body-very-long")],
    ["uzun gövde", () => has(fake({ lines: 600 }), "body-too-long")],
    ["kırık bağlantı", () => has(fake({ refs: [{ raw: "references/x.md", kind: "link", exists: false, isExample: false }] }), "ref-broken-link")],
    ["örnek yol işaretlenmemeli", () => hasnt(fake({ refs: [{ raw: "references/x.md", kind: "code", exists: false, isExample: true }] }), "ref-broken-code")],
    ["literal ~", () => has(fake({ body: 'node x.mjs --out "~/.agentlens/a.json"' }), "path-literal-tilde")],
    ["mutlak yol", () => has(fake({ body: "C:\\Users\\pc\\Desktop\\x" }), "path-absolute")],
    ["plugin kökü eksik", () => has(fake({ pluginRoot: "/p", refs: [{ raw: "scripts/a.mjs", kind: "quoted", exists: true, isExample: false }] }), "plugin-root-missing")],
    ["geniş izin", () => has(fake({ frontmatter: { "allowed-tools": "*" } }), "tools-broad")],
    ["eval yok", () => has(fake(), "eval-missing")],
    ["kurulmamış katalogda referans denetimi yok", () => hasnt(fake({ installed: false, refs: [{ raw: "references/x.md", kind: "link", exists: false, isExample: false }] }), "ref-broken-link")],
  ];
  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = fn(); } catch (e) { fails.push(`${name}: hata — ${e.message}`); continue; }
    if (!ok) fails.push(`başarısız: ${name}`);
  }

  // çakışma
  const a = fake({ id: "a", name: "a", description: "Fetch public complaints from forums and cluster them into ranked themes with evidence links for a niche." });
  const b = fake({ id: "b", name: "b", description: "Fetch public complaints from forums and cluster them into ranked themes with evidence links for a market." });
  const c = fake({ id: "c", name: "c", description: "Render a video composition to mp4 with deterministic frame timing and captions." });
  const col = findCollisions([a, b, c]);
  if (!col.some((x) => (x.a === "a" && x.b === "b"))) fails.push("çakışma: neredeyse aynı iki açıklama yakalanmadı");
  if (col.some((x) => x.a === "c" || x.b === "c")) fails.push("çakışma: alakasız skill yanlışlıkla eşleşti");

  // sürüklenme
  const d1 = fake({ id: "x", name: "x", agent: "claude-code", contentHash: "h1" });
  const d2 = fake({ id: "x", name: "x", agent: "codex", contentHash: "h2" });
  const d3 = fake({ id: "y", name: "y", agent: "codex", contentHash: "h3" });
  const drift = findDrift([d1, d2, d3]);
  if (drift.length !== 1 || drift[0].name !== "x") fails.push("sürüklenme: farklı içerikli kopya yakalanmadı");
  if (findDrift([fake({ name: "z", agent: "a" }), fake({ name: "z", agent: "b" })]).length) fails.push("sürüklenme: aynı içerikli kopya yanlış işaretlendi");

  // Dil kapısı: her check id'sinin katalogda karşılığı olmalı, yoksa rapor o bulguda
  // sessizce düzyazısız kalır. Çeviri eksiği testte patlasın, kullanıcıda değil.
  const ids = CHECKS.map((c) => c.id);
  const eksik = ids.filter((id) => !MESSAGE_KEYS.includes(id));
  if (eksik.length) fails.push(`dil: katalogda karşılığı yok — ${eksik.join(", ")}`);
  const fazla = MESSAGE_KEYS.filter((id) => !ids.includes(id));
  if (fazla.length) fails.push(`dil: katalogda fazladan id — ${fazla.join(", ")}`);

  // Kategori anahtarları nötr olmalı; `lintSkill` bunlara göre filtreliyor.
  const gecerliKategori = new Set(Object.keys(CATEGORY_LABEL));
  const kotuKategori = [...new Set(CHECKS.map((c) => c.category))].filter((k) => !gecerliKategori.has(k));
  if (kotuKategori.length) fails.push(`dil: bilinmeyen kategori — ${kotuKategori.join(", ")}`);

  // Her mesaj iki dilde de dolu ve gerçekten farklı olmalı.
  const ornekVars = { name: "a", dirName: "b", length: 10, head: "h", keys: "k", lines: 900, refs: "r", match: "m", message: "e", yes: 1, no: 0 };
  for (const id of ids) {
    for (const L of ["en", "tr"]) {
      const r = renderFinding({ check: id, vars: ornekVars }, L);
      if (!r.why || !r.fix || !r.detail) { fails.push(`dil: ${id} (${L}) düzyazısı eksik`); break; }
    }
    const en = renderFinding({ check: id, vars: ornekVars }, "en");
    const trr = renderFinding({ check: id, vars: ornekVars }, "tr");
    if (en.why === trr.why) fails.push(`dil: ${id} çevrilmemiş (why iki dilde aynı)`);
  }

  // Kopya birleştirme: aynı içerik tek kez, ayrışmış içerik ayrı ayrı sayılır.
  {
    const mk = (agent, hash) => ({ id: "s", agent, contentHash: hash });
    const kopyalar = [mk("claude-code", "h1"), mk("codex", "h1"), mk("gemini-cli", "h1")];
    const bulgu = (agent) => ({ check: "eval-missing", severity: "warn", skill: "s", agent, file: `/${agent}/SKILL.md` });
    const uc = [bulgu("claude-code"), bulgu("codex"), bulgu("gemini-cli")];

    const tek = dedupeMirrored(uc, kopyalar);
    if (tek.length !== 1) fails.push(`kopya: aynı içerikli 3 kurulum ${tek.length} bulguya indi, 1 olmalı`);
    if (tek[0] && tek[0].mirrored !== 3) fails.push("kopya: mirrored sayısı 3 değil");
    if (tek[0] && tek[0].agents.length !== 3) fails.push("kopya: agents listesi 3 ajan taşımıyor");
    if (lintScore(tek).raw !== 4) fails.push(`kopya: puan kopya sayısıyla çarpılmış (${lintScore(tek).raw}, 4 olmalı)`);

    // Sürüklenmiş kopya birleştirilmemeli: içerik farklıysa bulgular gerçekten ayrı olabilir.
    const surukmus = [mk("claude-code", "h1"), mk("codex", "h2")];
    const iki = dedupeMirrored([bulgu("claude-code"), bulgu("codex")], surukmus);
    if (iki.length !== 2) fails.push(`kopya: ayrışmış içerik birleştirildi (${iki.length}, 2 olmalı)`);

    // Hash bilinmiyorsa birleştirme yapılmaz — yanlış birleştirmek daha kötü.
    const hashsiz = dedupeMirrored([bulgu("claude-code"), bulgu("codex")], []);
    if (hashsiz.length !== 2) fails.push("kopya: hash yokken yanlış birleştirildi");

    // Farklı check'ler asla birleşmez.
    const farkli = dedupeMirrored(
      [bulgu("claude-code"), { ...bulgu("codex"), check: "fm-desc-too-short" }], kopyalar);
    if (farkli.length !== 2) fails.push("kopya: farklı check'ler birleştirildi");

    if (distinctSkills(kopyalar) !== 1) fails.push("farklı skill sayımı: 3 kurulum 1 skill olmalı");
    if (distinctSkills([mk("a", "h1"), { id: "t", agent: "a", contentHash: "h2" }]) !== 2) {
      fails.push("farklı skill sayımı: 2 ayrı skill 2 saymalı");
    }
  }

  // Puan seviyesi dilden bağımsız anahtar döndürmeli.
  if (!["poor", "fair", "good", "clean"].includes(lintScore([{ severity: "error" }]).level)) {
    fails.push("puan: seviye nötr anahtar değil");
  }
  // Bilinmeyen dil İngilizceye düşmeli.
  if (renderFinding({ check: "body-too-long", vars: { lines: 600 } }, "de").detail !== "600 lines") {
    fails.push("dil: bilinmeyen dil İngilizceye düşmüyor");
  }

  return { total: cases.length + 4 + 6 + 9, fails };
}
