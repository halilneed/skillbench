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
    test: (s) => (!s.frontmatterOk ? "SKILL.md bir `---` frontmatter bloğuyla başlamıyor" : null),
    why: "Frontmatter olmadan skill hiç yüklenmez.", fix: "Dosyanın başına `---` ile ad ve açıklama bloğu ekle." },
  { id: "fm-no-name", severity: "error", category: "frontmatter",
    test: (s) => (s.frontmatterOk && !s.name ? "`name` alanı yok" : null),
    why: "Ad olmadan skill çağrılamaz.", fix: "`name: <dizin-adı>` ekle." },
  { id: "fm-no-description", severity: "error", category: "frontmatter",
    test: (s) => (s.frontmatterOk && !s.description ? "`description` alanı yok" : null),
    why: "Aktivasyon kararı yalnızca açıklamaya bakar; boşsa skill hiç tetiklenmez.", fix: "Ne yaptığını ve ne zaman kullanılacağını yazan bir açıklama ekle." },
  { id: "fm-name-dir-mismatch", severity: "error", category: "frontmatter",
    test: (s) => (s.name && s.name !== s.dirName ? `\`name: ${s.name}\` ama dizin \`${s.dirName}\`` : null),
    why: "Ad ile dizin ayrıştığında skill beklenen komutla çağrılamaz.", fix: "İkisini eşitle." },
  { id: "fm-name-format", severity: "warn", category: "frontmatter",
    test: (s) => (s.name && !NAME_RE.test(s.name) ? `\`${s.name}\` kebab-case değil` : null),
    why: "Büyük harf, boşluk ve alt çizgi platformlar arası taşınmıyor.", fix: "Küçük harf ve tire kullan." },
  { id: "fm-desc-too-short", severity: "warn", category: "aktivasyon",
    test: (s) => (s.description && s.description.length < 80 ? `açıklama ${s.description.length} karakter` : null),
    why: "Kısa açıklama yeterli tetikleyici sinyal taşımaz; skill sessizce hiç açılmaz.", fix: "Ne yaptığını, ne zaman kullanılacağını ve kullanıcının kuracağı cümleleri ekle." },
  { id: "fm-desc-too-long", severity: "warn", category: "aktivasyon",
    test: (s) => (s.description.length > 1024 ? `açıklama ${s.description.length} karakter` : null),
    why: "Çok uzun açıklama her istekle bağlama giriyor ve ayırt ediciliği azalıyor.", fix: "Ayrıntıyı gövdeye taşı; açıklamada tetikleyici ifadeleri bırak." },
  { id: "fm-desc-no-trigger", severity: "warn", category: "aktivasyon",
    test: (s) => (s.description && !TRIGGER_RE.test(s.description) ? "açıklamada \"use when …\" türü tetikleyici ifade yok" : null),
    why: "Ne yaptığını söyleyen ama ne zaman kullanılacağını söylemeyen açıklama yanlış zamanda açılır ya da hiç açılmaz.", fix: "\"Use when the user asks …\" biçiminde somut durumlar ekle." },
  { id: "fm-desc-no-boundary", severity: "info", category: "aktivasyon",
    test: (s) => (s.description && s.description.length > 120 && !BOUNDARY_RE.test(s.description) ? "açıklamada negatif sınır yok" : null),
    why: "Sınır yazılmadığında yakın skill'ler aynı isteğe aday oluyor.", fix: "\"Not for X — that is <diğer-skill>.\" satırı ekle." },
  { id: "fm-desc-first-person", severity: "warn", category: "aktivasyon",
    test: (s) => (FIRST_PERSON_RE.test(s.description) ? `açıklama "${s.description.slice(0, 40)}…" ile başlıyor` : null),
    why: "Açıklama ajana yönelik bir yönerge değil, üçüncü şahıs bir kapsam tarifi olmalı.", fix: "\"Bu skill …\" yerine doğrudan işi ve tetikleyicileri yaz." },
  { id: "fm-unknown-key", severity: "info", category: "frontmatter",
    test: (s) => { const u = (s.keys || []).filter((k) => !KNOWN_KEYS.has(k)); return u.length ? `bilinmeyen alan: ${u.join(", ")}` : null; },
    why: "Tanınmayan alan sessizce yok sayılır; yazım hatası olabilir.", fix: "Alan adını doğrula ya da kaldır." },

  // gövde
  { id: "body-very-long", severity: "error", category: "yapi",
    test: (s) => (s.lines > 800 ? `${s.lines} satır` : null),
    why: "Bu boyutta bir skill her açılışta bağlamı doldurur ve modelin talimatı takip etme oranı düşer.", fix: "Bölümleri `references/` altına ayır, gövdede yalnızca akışı bırak." },
  { id: "body-too-long", severity: "warn", category: "yapi",
    test: (s) => (s.lines > 500 && s.lines <= 800 ? `${s.lines} satır` : null),
    why: "500 satırın üstü kademeli açıklama (progressive disclosure) için sınır kabul edilir.", fix: "Ayrıntıyı `references/` altına taşı." },
  { id: "body-no-structure", severity: "info", category: "yapi",
    test: (s) => (s.lines > 60 && !/^##\s/m.test(s.body) ? "hiç `##` başlığı yok" : null),
    why: "Başlıksız uzun gövdede model adımları atlıyor.", fix: "Adımları `## Step 1 …` gibi başlıklara böl." },

  // referanslar
  { id: "ref-broken-link", severity: "error", category: "referans",
    test: (s) => { const b = s.refs.filter((r) => !r.exists && !r.isExample && r.kind !== "code"); return b.length ? b.map((r) => r.raw).join(", ") : null; },
    why: "Skill okunmasını istediği dosyayı bulamaz; adım sessizce atlanır.", fix: "Yolu düzelt ya da dosyayı ekle." },
  { id: "ref-broken-code", severity: "warn", category: "referans",
    test: (s) => { const b = s.refs.filter((r) => !r.exists && !r.isExample && r.kind === "code"); return b.length ? b.map((r) => r.raw).join(", ") : null; },
    why: "Ters tırnak içindeki yol örnek de olabilir, gerçek atıf da; ikincisiyse kırık.", fix: "Örnekse metni \"örn.\" ile işaretle, atıfsa dosyayı ekle." },
  { id: "ref-cross-skill", severity: "info", category: "referans",
    test: (s) => { const c = s.refs.filter((r) => r.cross); return c.length ? c.map((r) => r.raw).join(", ") : null; },
    why: "Başka bir skill'in dosyasına dayanıyor; o skill kurulu değilse referans kopar.", fix: "Dosyayı kendi `references/` dizinine kopyala ya da bağımlılığı açıklamada söyle." },
  { id: "plugin-root-missing", severity: "warn", category: "referans",
    test: (s) => {
      if (!s.pluginRoot) return null;
      const bare = s.refs.filter((r) => /^(?:scripts|assets)\//.test(r.raw) && !r.raw.includes("CLAUDE_PLUGIN_ROOT"));
      return bare.length ? bare.map((r) => r.raw).join(", ") : null;
    },
    why: "Plugin içindeki script'e göreli yolla çağrı, çalışma dizini farklıysa kırılır.", fix: "`${CLAUDE_PLUGIN_ROOT}/scripts/…` kullan." },
  { id: "plugin-root-orphan", severity: "warn", category: "referans",
    test: (s) => (!s.pluginRoot && /\$\{CLAUDE_PLUGIN_ROOT\}/.test(s.body) ? "plugin dışında `${CLAUDE_PLUGIN_ROOT}` kullanılıyor" : null),
    why: "Bu değişken yalnızca plugin olarak kurulmuş skill'lerde tanımlıdır.", fix: "Skill'i bir plugin'e taşı ya da göreli yol kullan." },

  // taşınabilirlik ve güvenlik
  { id: "path-absolute", severity: "warn", category: "tasinabilirlik",
    test: (s) => { const m = s.body.match(ABS_PATH_RE); return m ? m[0] : null; },
    why: "Mutlak kullanıcı yolu başka bir makinede yok.", fix: "Ev dizinini çalışma anında çöz, gövdeye gömme." },
  { id: "path-literal-tilde", severity: "error", category: "tasinabilirlik",
    test: (s) => { const m = s.body.match(LITERAL_TILDE_RE); return m ? m[0].trim() : null; },
    why: "Bir script'e literal `~` geçtiğinde kabuk genişletmesi olmayan yerde adı `~` olan bir klasör oluşur.", fix: "Ev dizinini skill içinde çöz ve tam yolu geçir." },
  { id: "agent-lock-in", severity: "info", category: "tasinabilirlik",
    test: (s) => { const m = s.body.match(AGENT_NAME_RE); return m ? m[0] : null; },
    why: "Skill formatı ajanlar arası taşınabilir; gövdedeki ajan adı onu tek platforma bağlıyor gibi okutur.", fix: "\"coding agent\" gibi nötr bir dil kullan (gerçekten platforma özgü değilse)." },
  { id: "tools-broad", severity: "warn", category: "izin",
    test: (s) => {
      const t = s.frontmatter["allowed-tools"] || s.frontmatter.tools;
      if (!t) return null;
      if (/(^|[\s,])\*([\s,]|$)/.test(t)) return "allowed-tools: *";
      return null;
    },
    why: "Her araca açık bir skill, izin kapılarını kendi kapsamında geniş bırakır.", fix: "Gerçekten kullandığın araçları say." },

  // eval kapsamı
  { id: "eval-missing", severity: "warn", category: "eval",
    test: (s) => (s.evalFile ? null : `evals/skill-triggers/${s.dirName}.json yok`),
    why: "Tetiklenme dosyası olmadan açıklamayı değiştirdiğinde neyi bozduğunu ölçemezsin.", fix: "should_trigger / should_not_trigger listeleriyle bir eval dosyası ekle." },
  { id: "eval-invalid", severity: "error", category: "eval",
    test: (s) => {
      if (!s.evalFile) return null;
      try { JSON.parse(readFileSync(s.evalFile, "utf8")); return null; }
      catch (e) { return `eval dosyası okunamıyor: ${e.message.slice(0, 60)}`; }
    },
    why: "Bozuk eval dosyası sessizce atlanır.", fix: "JSON'u düzelt." },
  { id: "eval-thin", severity: "info", category: "eval",
    test: (s) => {
      if (!s.evalFile) return null;
      let j; try { j = JSON.parse(readFileSync(s.evalFile, "utf8")); } catch { return null; }
      const yes = (j.should_trigger || []).length, no = (j.should_not_trigger || []).length;
      if (yes >= 4 && no >= 3) return null;
      return `should_trigger: ${yes}, should_not_trigger: ${no}`;
    },
    why: "Az sayıda örnek, açıklama değişikliğinin etkisini yakalamaz; negatif örnek yoksa çakışma hiç ölçülmez.", fix: "En az 4 pozitif ve 3 negatif örnek yaz; negatifler komşu skill'lerin isteklerinden seçilsin." },
];

export function lintSkill(skill, { ignore = [] } = {}) {
  const out = [];
  for (const c of CHECKS) {
    if (ignore.includes(c.id)) continue;
    // Kurulmamış katalog girdilerinde dosya varlığı denetimi yanlış alarm üretir.
    if (!skill.installed && c.category === "referans") continue;
    if (!skill.installed && c.category === "eval") continue;
    let hit;
    try { hit = c.test(skill); } catch { hit = null; }
    if (!hit) continue;
    out.push({
      check: c.id, severity: c.severity, category: c.category,
      skill: skill.id, agent: skill.agent, file: skill.file,
      detail: String(hit).slice(0, 200), why: c.why, fix: c.fix,
    });
  }
  return out;
}

export function lintScore(findings) {
  const raw = findings.reduce((n, f) => n + (SEV_WEIGHT[f.severity] || 0), 0);
  return { raw, level: raw >= 40 ? "kotu" : raw >= 15 ? "orta" : raw > 0 ? "iyi" : "temiz" };
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

  return { total: cases.length + 4, fails };
}
