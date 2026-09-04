/**
 * skillbench — bulgu düzyazısının iki dilli kataloğu
 *
 * Neden ayrı dosya: `checks.mjs` artık düzyazı üretmez, yalnızca **makine verisi** üretir
 * (`check`, `severity`, `category` ve `vars`). Düzyazı burada, raporlama anında uygulanır.
 * Böylece JSON çıktısı dilden bağımsız kalır — CI tüketicisi `check` id'sine bakar,
 * çeviriye değil — ve `--lang` gerçekten tüm raporu çevirir.
 *
 * `gardener/scripts/lib/i18n.mjs` ile aynı sözleşme: iki araç `agentcheck` altında
 * birleşecek, o yüzden şekli kasten aynı tutuldu.
 */

/** Desteklenen diller. Varsayılan İngilizce: araç İngilizce konuşan bir kitleye çıkıyor. */
export const LANGS = ["en", "tr"];
export const DEFAULT_LANG = "en";

export const normalizeLang = (v) => (String(v || "").toLowerCase() === "tr" ? "tr" : "en");

export const SEVERITY_LABEL = {
  error: { en: "error", tr: "hata" },
  warn: { en: "warn", tr: "uyarı" },
  info: { en: "info", tr: "bilgi" },
};

export const LEVEL_LABEL = {
  poor: { en: "poor", tr: "kötü" },
  fair: { en: "fair", tr: "orta" },
  good: { en: "good", tr: "iyi" },
  clean: { en: "clean", tr: "temiz" },
};

/** Kategori anahtarları nötr; yalnızca görünen etiket çevrilir. */
export const CATEGORY_LABEL = {
  frontmatter: { en: "frontmatter", tr: "frontmatter" },
  activation: { en: "activation", tr: "aktivasyon" },
  structure: { en: "structure", tr: "yapı" },
  reference: { en: "reference", tr: "referans" },
  portability: { en: "portability", tr: "taşınabilirlik" },
  permission: { en: "permission", tr: "izin" },
  eval: { en: "eval", tr: "eval" },
};

const MESSAGES = {
  // ---------- frontmatter ----------
  "fm-missing": {
    detail: {
      en: () => "SKILL.md does not start with a `---` frontmatter block",
      tr: () => "SKILL.md bir `---` frontmatter bloğuyla başlamıyor",
    },
    why: {
      en: "Without frontmatter the skill never loads at all.",
      tr: "Frontmatter olmadan skill hiç yüklenmez.",
    },
    fix: {
      en: "Add a `---` block with a name and a description at the top of the file.",
      tr: "Dosyanın başına `---` ile ad ve açıklama bloğu ekle.",
    },
  },
  "fm-no-name": {
    detail: { en: () => "no `name` field", tr: () => "`name` alanı yok" },
    why: {
      en: "Without a name the skill cannot be invoked.",
      tr: "Ad olmadan skill çağrılamaz.",
    },
    fix: { en: "Add `name: <directory-name>`.", tr: "`name: <dizin-adı>` ekle." },
  },
  "fm-no-description": {
    detail: { en: () => "no `description` field", tr: () => "`description` alanı yok" },
    why: {
      en: "The activation decision looks only at the description; if it is empty the skill never triggers.",
      tr: "Aktivasyon kararı yalnızca açıklamaya bakar; boşsa skill hiç tetiklenmez.",
    },
    fix: {
      en: "Add a description saying what it does and when to use it.",
      tr: "Ne yaptığını ve ne zaman kullanılacağını yazan bir açıklama ekle.",
    },
  },
  "fm-name-dir-mismatch": {
    detail: {
      en: (v) => `\`name: ${v.name}\` but directory is \`${v.dirName}\``,
      tr: (v) => `\`name: ${v.name}\` ama dizin \`${v.dirName}\``,
    },
    why: {
      en: "When the name and the directory diverge the skill cannot be called by the command people expect.",
      tr: "Ad ile dizin ayrıştığında skill beklenen komutla çağrılamaz.",
    },
    fix: { en: "Make them match.", tr: "İkisini eşitle." },
  },
  "fm-name-format": {
    detail: {
      en: (v) => `\`${v.name}\` is not kebab-case`,
      tr: (v) => `\`${v.name}\` kebab-case değil`,
    },
    why: {
      en: "Capitals, spaces and underscores do not travel across platforms.",
      tr: "Büyük harf, boşluk ve alt çizgi platformlar arası taşınmıyor.",
    },
    fix: { en: "Use lowercase and hyphens.", tr: "Küçük harf ve tire kullan." },
  },
  "fm-desc-too-short": {
    detail: {
      en: (v) => `description is ${v.length} characters`,
      tr: (v) => `açıklama ${v.length} karakter`,
    },
    why: {
      en: "A short description carries too little trigger signal; the skill quietly never opens.",
      tr: "Kısa açıklama yeterli tetikleyici sinyal taşımaz; skill sessizce hiç açılmaz.",
    },
    fix: {
      en: "Add what it does, when to use it, and the phrasings a user would actually type.",
      tr: "Ne yaptığını, ne zaman kullanılacağını ve kullanıcının kuracağı cümleleri ekle.",
    },
  },
  "fm-desc-too-long": {
    detail: {
      en: (v) => `description is ${v.length} characters`,
      tr: (v) => `açıklama ${v.length} karakter`,
    },
    why: {
      en: "An over-long description enters context on every request and loses its discriminating power.",
      tr: "Çok uzun açıklama her istekle bağlama giriyor ve ayırt ediciliği azalıyor.",
    },
    fix: {
      en: "Move the detail into the body; keep the trigger phrases in the description.",
      tr: "Ayrıntıyı gövdeye taşı; açıklamada tetikleyici ifadeleri bırak.",
    },
  },
  "fm-desc-no-trigger": {
    detail: {
      en: () => 'no "use when …" style trigger phrase in the description',
      tr: () => 'açıklamada "use when …" türü tetikleyici ifade yok',
    },
    why: {
      en: "A description that says what it does but not when to use it opens at the wrong moment, or never.",
      tr: "Ne yaptığını söyleyen ama ne zaman kullanılacağını söylemeyen açıklama yanlış zamanda açılır ya da hiç açılmaz.",
    },
    fix: {
      en: 'Add concrete situations in the form "Use when the user asks …".',
      tr: '"Use when the user asks …" biçiminde somut durumlar ekle.',
    },
  },
  "fm-desc-no-boundary": {
    detail: {
      en: () => "no negative boundary in the description",
      tr: () => "açıklamada negatif sınır yok",
    },
    why: {
      en: "With no boundary written down, neighbouring skills all become candidates for the same request.",
      tr: "Sınır yazılmadığında yakın skill'ler aynı isteğe aday oluyor.",
    },
    fix: {
      en: 'Add a "Not for X — that is <other-skill>." line.',
      tr: '"Not for X — that is <diğer-skill>." satırı ekle.',
    },
  },
  "fm-desc-first-person": {
    detail: {
      en: (v) => `description starts with "${v.head}…"`,
      tr: (v) => `açıklama "${v.head}…" ile başlıyor`,
    },
    why: {
      en: "A description should be a third-person statement of scope, not an instruction aimed at the agent.",
      tr: "Açıklama ajana yönelik bir yönerge değil, üçüncü şahıs bir kapsam tarifi olmalı.",
    },
    fix: {
      en: 'Instead of "This skill …", write the job and its triggers directly.',
      tr: '"Bu skill …" yerine doğrudan işi ve tetikleyicileri yaz.',
    },
  },
  "fm-unknown-key": {
    detail: {
      en: (v) => `unknown field: ${v.keys}`,
      tr: (v) => `bilinmeyen alan: ${v.keys}`,
    },
    why: {
      en: "An unrecognised field is ignored silently; it may be a typo.",
      tr: "Tanınmayan alan sessizce yok sayılır; yazım hatası olabilir.",
    },
    fix: { en: "Verify the field name or remove it.", tr: "Alan adını doğrula ya da kaldır." },
  },

  // ---------- gövde ----------
  "body-very-long": {
    detail: { en: (v) => `${v.lines} lines`, tr: (v) => `${v.lines} satır` },
    why: {
      en: "A skill this size fills the context every time it opens, and the model's instruction-following rate drops.",
      tr: "Bu boyutta bir skill her açılışta bağlamı doldurur ve modelin talimatı takip etme oranı düşer.",
    },
    fix: {
      en: "Split the sections into `references/` and leave only the flow in the body.",
      tr: "Bölümleri `references/` altına ayır, gövdede yalnızca akışı bırak.",
    },
  },
  "body-too-long": {
    detail: { en: (v) => `${v.lines} lines`, tr: (v) => `${v.lines} satır` },
    why: {
      en: "Past 500 lines is the accepted limit for progressive disclosure.",
      tr: "500 satırın üstü kademeli açıklama (progressive disclosure) için sınır kabul edilir.",
    },
    fix: { en: "Move the detail into `references/`.", tr: "Ayrıntıyı `references/` altına taşı." },
  },
  "body-no-structure": {
    detail: { en: () => "no `##` headings at all", tr: () => "hiç `##` başlığı yok" },
    why: {
      en: "In a long body with no headings the model skips steps.",
      tr: "Başlıksız uzun gövdede model adımları atlıyor.",
    },
    fix: {
      en: "Break the steps into headings like `## Step 1 …`.",
      tr: "Adımları `## Step 1 …` gibi başlıklara böl.",
    },
  },

  // ---------- referanslar ----------
  "ref-broken-link": {
    detail: { en: (v) => v.refs, tr: (v) => v.refs },
    why: {
      en: "The skill cannot find the file it asks to read; the step is skipped silently.",
      tr: "Skill okunmasını istediği dosyayı bulamaz; adım sessizce atlanır.",
    },
    fix: { en: "Fix the path or add the file.", tr: "Yolu düzelt ya da dosyayı ekle." },
  },
  "ref-broken-code": {
    detail: { en: (v) => v.refs, tr: (v) => v.refs },
    why: {
      en: "A path in backticks may be an example or a real reference; if it is the latter, it is broken.",
      tr: "Ters tırnak içindeki yol örnek de olabilir, gerçek atıf da; ikincisiyse kırık.",
    },
    fix: {
      en: 'If it is an example, mark it "e.g."; if it is a reference, add the file.',
      tr: 'Örnekse metni "örn." ile işaretle, atıfsa dosyayı ekle.',
    },
  },
  "ref-cross-skill": {
    detail: { en: (v) => v.refs, tr: (v) => v.refs },
    why: {
      en: "It depends on another skill's file; if that skill is not installed the reference breaks.",
      tr: "Başka bir skill'in dosyasına dayanıyor; o skill kurulu değilse referans kopar.",
    },
    fix: {
      en: "Copy the file into your own `references/`, or state the dependency in the description.",
      tr: "Dosyayı kendi `references/` dizinine kopyala ya da bağımlılığı açıklamada söyle.",
    },
  },
  "plugin-root-missing": {
    detail: { en: (v) => v.refs, tr: (v) => v.refs },
    why: {
      en: "Calling a script inside a plugin by a relative path breaks when the working directory differs.",
      tr: "Plugin içindeki script'e göreli yolla çağrı, çalışma dizini farklıysa kırılır.",
    },
    fix: { en: "Use `${CLAUDE_PLUGIN_ROOT}/scripts/…`.", tr: "`${CLAUDE_PLUGIN_ROOT}/scripts/…` kullan." },
  },
  "plugin-root-orphan": {
    detail: {
      en: () => "`${CLAUDE_PLUGIN_ROOT}` used outside a plugin",
      tr: () => "plugin dışında `${CLAUDE_PLUGIN_ROOT}` kullanılıyor",
    },
    why: {
      en: "That variable is only defined for skills installed as a plugin.",
      tr: "Bu değişken yalnızca plugin olarak kurulmuş skill'lerde tanımlıdır.",
    },
    fix: {
      en: "Move the skill into a plugin, or use a relative path.",
      tr: "Skill'i bir plugin'e taşı ya da göreli yol kullan.",
    },
  },

  // ---------- taşınabilirlik ve güvenlik ----------
  "path-absolute": {
    detail: { en: (v) => v.match, tr: (v) => v.match },
    why: {
      en: "An absolute user path does not exist on anyone else's machine.",
      tr: "Mutlak kullanıcı yolu başka bir makinede yok.",
    },
    fix: {
      en: "Resolve the home directory at run time instead of hardcoding it in the body.",
      tr: "Ev dizinini çalışma anında çöz, gövdeye gömme.",
    },
  },
  "path-literal-tilde": {
    detail: { en: (v) => v.match, tr: (v) => v.match },
    why: {
      en: "Passing a literal `~` to a script creates a directory actually named `~` wherever shell expansion does not happen.",
      tr: "Bir script'e literal `~` geçtiğinde kabuk genişletmesi olmayan yerde adı `~` olan bir klasör oluşur.",
    },
    fix: {
      en: "Resolve the home directory inside the skill and pass the full path.",
      tr: "Ev dizinini skill içinde çöz ve tam yolu geçir.",
    },
  },
  "agent-lock-in": {
    detail: { en: (v) => v.match, tr: (v) => v.match },
    why: {
      en: "The skill format is portable across agents; an agent name in the body reads as if it were tied to one platform.",
      tr: "Skill formatı ajanlar arası taşınabilir; gövdedeki ajan adı onu tek platforma bağlıyor gibi okutur.",
    },
    fix: {
      en: 'Use neutral wording like "coding agent" (unless it really is platform-specific).',
      tr: '"coding agent" gibi nötr bir dil kullan (gerçekten platforma özgü değilse).',
    },
  },
  "tools-broad": {
    detail: { en: () => "allowed-tools: *", tr: () => "allowed-tools: *" },
    why: {
      en: "A skill open to every tool leaves the permission gates wide within its own scope.",
      tr: "Her araca açık bir skill, izin kapılarını kendi kapsamında geniş bırakır.",
    },
    fix: { en: "List the tools you actually use.", tr: "Gerçekten kullandığın araçları say." },
  },

  // ---------- eval kapsamı ----------
  "eval-missing": {
    detail: {
      en: (v) => `evals/skill-triggers/${v.dirName}.json (or ${v.dirName}/case.yaml) is missing`,
      tr: (v) => `evals/skill-triggers/${v.dirName}.json (ya da ${v.dirName}/case.yaml) yok`,
    },
    why: {
      en: "Without a trigger file you cannot measure what a description change broke.",
      tr: "Tetiklenme dosyası olmadan açıklamayı değiştirdiğinde neyi bozduğunu ölçemezsin.",
    },
    fix: {
      en: "Add an eval file with should_trigger / should_not_trigger lists.",
      tr: "should_trigger / should_not_trigger listeleriyle bir eval dosyası ekle.",
    },
  },
  "eval-invalid": {
    detail: {
      en: (v) => `eval file cannot be read: ${v.message}`,
      tr: (v) => `eval dosyası okunamıyor: ${v.message}`,
    },
    why: {
      en: "A broken eval file is skipped silently.",
      tr: "Bozuk eval dosyası sessizce atlanır.",
    },
    fix: { en: "Fix the JSON.", tr: "JSON'u düzelt." },
  },
  "eval-thin": {
    detail: {
      en: (v) => (v.cases !== undefined
        ? `case files: ${v.cases}`
        : `should_trigger: ${v.yes}, should_not_trigger: ${v.no}`),
      tr: (v) => (v.cases !== undefined
        ? `vaka dosyası: ${v.cases}`
        : `should_trigger: ${v.yes}, should_not_trigger: ${v.no}`),
    },
    why: {
      en: "Too few examples will not catch the effect of a description change, and with no negative examples collision is never measured at all.",
      tr: "Az sayıda örnek, açıklama değişikliğinin etkisini yakalamaz; negatif örnek yoksa çakışma hiç ölçülmez.",
    },
    fix: {
      en: "Write at least 4 positive and 3 negative examples; draw the negatives from neighbouring skills' requests.",
      tr: "En az 4 pozitif ve 3 negatif örnek yaz; negatifler komşu skill'lerin isteklerinden seçilsin.",
    },
  },
};

/** Katalogdaki check id'leri — öz-test bunu `CHECKS` ile karşılaştırır. */
export const MESSAGE_KEYS = Object.freeze(Object.keys(MESSAGES));

const pick = (entry, lang) => (entry && (entry[lang] ?? entry[DEFAULT_LANG])) ?? null;

/**
 * Makine bulgusunu seçilen dilde düzyazıyla zenginleştirir.
 * `vars` korunur: JSON tüketicisi çeviriye değil verilere bakabilsin.
 */
export function renderFinding(finding, lang = DEFAULT_LANG) {
  const L = normalizeLang(lang);
  const m = MESSAGES[finding.check];
  if (!m) return { ...finding };
  const vars = finding.vars || {};
  const detailFn = pick(m.detail, L);
  return {
    ...finding,
    detail: typeof detailFn === "function" ? String(detailFn(vars)).slice(0, 200) : (finding.detail ?? null),
    why: pick(m.why, L),
    fix: pick(m.fix, L),
  };
}

export const renderFindings = (findings, lang) => findings.map((f) => renderFinding(f, lang));

export const severityLabel = (sev, lang) => pick(SEVERITY_LABEL[sev], normalizeLang(lang)) ?? sev;
export const levelLabel = (lvl, lang) => pick(LEVEL_LABEL[lvl], normalizeLang(lang)) ?? lvl;
export const categoryLabel = (cat, lang) => pick(CATEGORY_LABEL[cat], normalizeLang(lang)) ?? cat;
