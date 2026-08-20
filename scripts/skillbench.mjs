#!/usr/bin/env node
/**
 * skillbench — kodlama ajanı skill'leri için lint ve gerçek kullanım kanıtı.
 *
 * Üç soruyu cevaplar:
 *   1. Skill'lerim doğru yazılmış mı?            → --lint
 *   2. Gerçekten tetikleniyorlar mı?             → --coverage
 *   3. Birbirlerinin işine mi giriyorlar?        → --collide
 *
 * TASARIM İLKESİ: Ağ çağrısı yok, kota harcanmaz. Sadece diskteki dosyalar ve
 * zaten var olan oturum kayıtları okunur. Skill gövdeleri çıktıya kopyalanmaz.
 *
 * Kullanım:
 *   node skillbench.mjs --list [--agent codex] [--catalog]
 *   node skillbench.mjs --lint [--path .] [--md]
 *   node skillbench.mjs --coverage [--days 90] [--md]
 *   node skillbench.mjs --collide [--md]
 *   node skillbench.mjs --selftest
 *
 * Bayraklar: --agent all|claude-code|codex|gemini-cli · --path DIZIN · --catalog
 *            --lang tr|en · --out DOSYA · --ignore kural1,kural2 · --limit N
 * Gereksinim: Node.js 18+. Bağımlılık yok.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { homedir } from "node:os";

import * as adapters from "./lib/adapters.mjs";
import { discoverSkills, activationStats, matchActivation } from "./lib/skills.mjs";
import { lintSkill, lintScore, findCollisions, findDrift, selftest, CHECKS } from "./lib/checks.mjs";

// ---------- argümanlar ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, fb = null) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] !== undefined ? argv[i + 1] : fb; };
const list = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : []);

const AGENT = opt("--agent", "all");
const PATH = opt("--path");
const CATALOG = flag("--catalog");
const DAYS = parseInt(opt("--days", "0"), 10) || 0;
const LIMIT = Math.max(1, parseInt(opt("--limit", "50"), 10) || 50);
const LANG = opt("--lang", "tr") === "en" ? "en" : "tr";
const OUT = opt("--out");
const IGNORE = list(opt("--ignore"));
const MD = flag("--md");

const tr = LANG === "tr";
const SEV = { error: tr ? "hata" : "error", warn: tr ? "uyarı" : "warn", info: tr ? "bilgi" : "info" };
const LEVEL = tr
  ? { kotu: "kötü", orta: "orta", iyi: "iyi", temiz: "temiz" }
  : { kotu: "poor", orta: "fair", iyi: "good", temiz: "clean" };

const t = (a, b) => (tr ? a : b);

// ---------- yardımcılar ----------
const outDir = () => resolve(homedir(), ".agentlens", "skillbench");

function emit(obj, md) {
  const text = MD ? md : JSON.stringify(obj, null, 2);
  if (OUT) {
    const target = resolve(OUT);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, "utf8");
    process.stdout.write(`${t("yazıldı", "written")}: ${target}\n`);
  } else {
    process.stdout.write(text + "\n");
  }
}

const short = (s, n = 70) => {
  const x = String(s ?? "").replace(/\s+/g, " ").trim();
  return x.length > n ? x.slice(0, n) + "…" : x;
};
const cell = (s, n = 80) => short(s, n).replace(/\|/g, "\\|");
const days = (iso) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 86400000) : null);

function load() {
  const skills = discoverSkills({ agent: AGENT, path: PATH, includeCatalog: CATALOG });
  return skills;
}

function sourceNote(skills) {
  const by = {};
  for (const s of skills) by[`${s.agent}/${s.source}`] = (by[`${s.agent}/${s.source}`] || 0) + 1;
  const where = PATH ? `\`${PATH}\`` : t("kurulu ajan kökleri", "installed agent roots");
  return `${skills.length} skill · ${where} · ${Object.entries(by).map(([k, v]) => `${k}: ${v}`).join(" · ")}`;
}

// ---------- komut: --list ----------

function cmdList() {
  const all = load();
  const skills = all.slice(0, LIMIT);
  const md = [
    `# skillbench — ${t("bulunan skill'ler", "discovered skills")}`, "",
    `**${t("Kaynak notu", "Source note")}:** ${sourceNote(all)}${all.length > skills.length ? ` · ${t("ilk", "first")} ${skills.length} ${t("gösteriliyor", "shown")}` : ""}`, "",
    `| ${t("Skill", "Skill")} | ${t("ajan", "agent")} | ${t("kaynak", "source")} | ${t("satır", "lines")} | eval | ${t("açıklama", "description")} |`,
    "|---|---|---|---|---|---|",
    ...skills.map((s) => `| \`${s.id}\` | ${s.agent} | ${s.source} | ${s.lines} | ${s.evalFile ? "✔" : "—"} | ${cell(s.description, 70)} |`),
  ].join("\n");
  emit({ kind: "list", count: all.length, shown: skills.length, skills: skills.map(slim) }, md);
}

const slim = (s) => ({
  id: s.id, name: s.name, agent: s.agent, source: s.source, installed: s.installed,
  plugin: s.plugin, file: s.file, lines: s.lines, bytes: s.bytes,
  description: s.description, hasEval: !!s.evalFile, refs: s.refs.length,
});

// ---------- komut: --lint ----------

function cmdLint() {
  const skills = load();
  const findings = skills.flatMap((s) => lintSkill(s, { ignore: IGNORE }));
  const score = lintScore(findings);

  const bySkill = new Map();
  for (const f of findings) {
    const g = bySkill.get(f.skill) || { skill: f.skill, agent: f.agent, error: 0, warn: 0, info: 0, score: 0 };
    g[f.severity]++;
    bySkill.set(f.skill, g);
  }
  for (const g of bySkill.values()) g.score = lintScore(findings.filter((f) => f.skill === g.skill)).raw;

  const byCheck = new Map();
  for (const f of findings) {
    const g = byCheck.get(f.check) || { check: f.check, severity: f.severity, category: f.category, n: 0, skills: [], why: f.why, fix: f.fix };
    g.n++;
    if (g.skills.length < 6) g.skills.push(f.skill);
    byCheck.set(f.check, g);
  }
  const order = { error: 0, warn: 1, info: 2 };
  const checks = [...byCheck.values()].sort((a, b) => order[a.severity] - order[b.severity] || b.n - a.n);
  const worst = [...bySkill.values()].sort((a, b) => b.score - a.score).slice(0, 20);

  const md = [
    `# skillbench — lint`, "",
    `**${t("Kaynak notu", "Source note")}:** ${sourceNote(skills)} · **${t("puan", "score")}:** ${score.raw} (${LEVEL[score.level]})`, "",
    `${findings.filter((f) => f.severity === "error").length} ${SEV.error} · ${findings.filter((f) => f.severity === "warn").length} ${SEV.warn} · ${findings.filter((f) => f.severity === "info").length} ${SEV.info}`,
    "",
    `## ${t("Kurallara göre", "By check")}`, "",
    ...(checks.length ? [
      `| ${t("Önem", "Sev")} | ${t("Kural", "Check")} | n | ${t("örnek skill'ler", "example skills")} |`, "|---|---|---|---|",
      ...checks.map((c) => `| ${SEV[c.severity]} | ${c.check} | ${c.n} | ${cell(c.skills.join(", "), 60)} |`),
    ] : [t("Bulgu yok.", "No findings.")]),
    "",
    `## ${t("En çok düzeltme isteyen skill'ler", "Skills needing most work")}`, "",
    ...(worst.length ? [
      `| Skill | ${t("ajan", "agent")} | ${SEV.error} | ${SEV.warn} | ${SEV.info} | ${t("puan", "score")} |`, "|---|---|---|---|---|---|",
      ...worst.map((g) => `| \`${g.skill}\` | ${g.agent} | ${g.error} | ${g.warn} | ${g.info} | ${g.score} |`),
    ] : [t("Hepsi temiz.", "All clean.")]),
    "",
    ...(checks.length ? [`## ${t("Kural açıklamaları", "What the checks mean")}`, "",
      ...checks.map((c) => `- **${c.check}** (${SEV[c.severity]}) — ${c.why} → *${c.fix}*`), ""] : []),
    ...(findings.length ? [
      `## ${t("Ayrıntı", "Detail")}`, "",
      `| Skill | ${t("Kural", "Check")} | ${t("ne bulundu", "what")} |`, "|---|---|---|",
      ...findings
        .sort((a, b) => order[a.severity] - order[b.severity] || a.skill.localeCompare(b.skill))
        .slice(0, 120)
        .map((f) => `| \`${f.skill}\` | ${f.check} | ${cell(f.detail, 70)} |`),
      findings.length > 120 ? `| … | | ${findings.length - 120} ${t("bulgu daha", "more findings")} |` : null,
    ].filter(Boolean) : []),
  ].join("\n");

  emit({ kind: "lint", generatedAt: new Date().toISOString(), source: { path: PATH, agent: AGENT, catalog: CATALOG, skills: skills.length }, score, byCheck: checks, bySkill: [...bySkill.values()], findings }, md);
}

// ---------- komut: --coverage ----------

function cmdCoverage() {
  const skills = load();
  const stats = activationStats(adapters, { days: DAYS });
  const matched = matchActivation(skills, stats.bySkill);

  const fired = matched.filter((m) => m.activation).sort((a, b) => b.activation.calls - a.activation.calls);
  const cold = matched.filter((m) => !m.activation);
  // Aktivasyon kaydı var ama diskte skill bulunamadı → kaldırılmış ya da başka kökte
  const known = new Set(matched.filter((m) => m.activation).map((m) => m.activation.id));
  const orphan = stats.bySkill.filter((a) => !known.has(a.id));

  const md = [
    `# skillbench — ${t("gerçek kullanım", "real usage")}`, "",
    `**${t("Kaynak notu", "Source note")}:** ${sourceNote(skills)}`,
    `${stats.window.sessionsScanned} ${t("Claude Code oturumu tarandı", "Claude Code sessions scanned")}${DAYS ? ` (${DAYS} ${t("gün", "days")})` : ""} · ${stats.window.attributedCalls} ${t("skill atıflı çağrı", "skill-attributed calls")}${stats.window.unreadable ? ` · ${stats.window.unreadable} ${t("okunamadı", "unreadable")}` : ""}`,
    "",
    `> ${t(
      "Hangi skill'in tetiklendiğini yalnızca **Claude Code** kaydediyor. Codex CLI ve Gemini CLI bu bilgiyi yapısal olarak tutmuyor; o ajanlardaki skill'ler için pasif ölçüm mümkün değil ve aşağıda \"ölçülemedi\" sayılırlar.",
      "Only **Claude Code** records which skill fired. Codex CLI and Gemini CLI do not store this structurally, so skills on those agents cannot be measured passively and count as \"unmeasured\" below."
    )}`,
    "",
    `## ${t("Ateşleyen skill'ler", "Skills that fired")}`, "",
    ...(fired.length ? [
      `| Skill | ${t("çağrı", "calls")} | ${t("oturum", "sessions")} | ${t("proje", "projects")} | ${t("son", "last seen")} |`, "|---|---|---|---|---|",
      ...fired.slice(0, LIMIT).map((m) => `| \`${m.skill.id}\` | ${m.activation.calls} | ${m.activation.sessions} | ${cell(m.activation.projects.join(", "), 40)} | ${days(m.activation.lastAt)} ${t("gün önce", "days ago")} |`),
    ] : [t("Hiçbir skill ateşlememiş.", "No skill fired.")]),
    "",
    `## ${t("Hiç ateşlemeyenler", "Never fired")}`, "",
    ...(cold.length ? [
      `| Skill | ${t("ajan", "agent")} | ${t("satır", "lines")} | ${t("durum", "status")} |`, "|---|---|---|---|",
      ...cold.slice(0, LIMIT).map((m) => `| \`${m.skill.id}\` | ${m.skill.agent} | ${m.skill.lines} | ${m.measurable ? t("ölçüldü — hiç açılmadı", "measured — never opened") : t("ölçülemedi (ajan kaydetmiyor)", "unmeasured (agent does not record)")} |`),
    ] : [t("Yok — hepsi en az bir kez ateşlemiş.", "None — every skill fired at least once.")]),
    "",
    ...(orphan.length ? [
      `## ${t("Diskte olmayan ama ateşlemiş", "Fired but not on disk")}`, "",
      `| ${t("Aktivasyon kimliği", "Attribution id")} | ${t("çağrı", "calls")} | ${t("son", "last seen")} |`, "|---|---|---|",
      ...orphan.slice(0, 20).map((a) => `| \`${a.id}\` | ${a.calls} | ${days(a.lastAt)} ${t("gün önce", "days ago")} |`),
      "",
      `> ${t("Bunlar kaldırılmış, yeniden adlandırılmış ya da yerleşik skill'ler olabilir.", "These may be removed, renamed, or built-in skills.")}`,
    ] : []),
  ].join("\n");

  emit({
    kind: "coverage", generatedAt: new Date().toISOString(),
    window: stats.window,
    fired: fired.map((m) => ({ ...slim(m.skill), ...m.activation })),
    neverFired: cold.map((m) => ({ ...slim(m.skill), measurable: m.measurable })),
    orphanActivations: orphan,
  }, md);
}

// ---------- komut: --collide ----------

function cmdCollide() {
  const skills = load();
  const collisions = findCollisions(skills);
  const drift = findDrift(skills);

  const md = [
    `# skillbench — ${t("çakışma ve sürüklenme", "collisions and drift")}`, "",
    `**${t("Kaynak notu", "Source note")}:** ${sourceNote(skills)}`, "",
    `## ${t("Açıklama çakışmaları", "Description collisions")}`, "",
    `${t(
      "İki skill'in açıklaması ne kadar örtüşüyorsa, aynı isteğe o kadar birlikte aday oluyorlar. Ortak terimler hangi kelimelerin ayrımı bozduğunu gösterir.",
      "The more two descriptions overlap, the more they compete for the same request. The shared terms show which words blur the boundary."
    )}`, "",
    ...(collisions.length ? [
      `| ${t("Puan", "Score")} | A | B | ${t("ortak terimler", "shared terms")} | ${t("ikisinde de sınır var mı", "both bounded")} |`,
      "|---|---|---|---|---|",
      ...collisions.slice(0, LIMIT).map((c) => `| ${c.score} | \`${c.a}\` | \`${c.b}\` | ${cell(c.sharedTerms.join(", "), 50)} | ${c.bothHaveBoundary ? "✔" : "—"} |`),
    ] : [t("Eşik üstünde çakışma yok.", "No collisions above threshold.")]),
    "",
    `## ${t("Kopya sürüklenmesi", "Copy drift")}`, "",
    `${t(
      "Aynı skill birden çok ajanın dizinine kopyalandıysa, kopyaların içeriği hâlâ aynı mı?",
      "When the same skill is copied into several agent homes, are the copies still identical?"
    )}`, "",
    ...(drift.length ? [
      `| Skill | ${t("farklı sürüm", "versions")} | ${t("kopyalar", "copies")} |`, "|---|---|---|",
      ...drift.map((d) => `| \`${d.name}\` | ${d.distinctVersions} | ${cell(d.copies.map((c) => `${c.agent}:${c.hash}(${c.lines})`).join(" · "), 70)} |`),
    ] : [t("Sürüklenme yok — çoklu kopyaların hepsi birebir aynı.", "No drift — every duplicated copy is byte-identical.")]),
    "",
  ].join("\n");

  emit({ kind: "collide", generatedAt: new Date().toISOString(), collisions, drift }, md);
}

// ---------- giriş ----------

function main() {
  if (flag("--selftest")) {
    const r = selftest();
    process.stdout.write(`${t("öz-test", "selftest")}: ${r.total - r.fails.length}/${r.total}\n`);
    if (r.fails.length) { process.stdout.write(r.fails.join("\n") + "\n"); process.exitCode = 1; }
    return;
  }
  if (flag("--list")) return cmdList();
  if (flag("--lint")) return cmdLint();
  if (flag("--coverage")) return cmdCoverage();
  if (flag("--collide")) return cmdCollide();

  process.stdout.write([
    "skillbench — skill'ler için lint ve gerçek kullanım kanıtı",
    "",
    "  --list                       bulunan skill'leri listeler",
    "  --lint [--path DIZIN]        yazım, referans, izin ve eval denetimi",
    "  --coverage [--days N]        gerçek oturum kayıtlarından aktivasyon istatistiği",
    "  --collide                    açıklama çakışması ve kopya sürüklenmesi",
    "  --selftest                   kural öz-testi (ağ/disk yok)",
    "",
    "  --agent all|claude-code|codex|gemini-cli · --catalog · --md · --lang tr|en",
    "  --out DOSYA · --limit N · --ignore kural1,kural2",
    "",
    `${CHECKS.length} lint kuralı · ${t("çıktı dizini önerisi", "suggested output dir")}: ${outDir()}`,
    "",
  ].join("\n"));
}

main();
