# skillbench

[![CI](https://github.com/hailneed/skillbench/actions/workflows/ci.yml/badge.svg)](https://github.com/hailneed/skillbench/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](#requirements)

> **Lint plus real-usage evidence for coding-agent skills.** Answers three questions: is my
> skill written correctly, does it **actually trigger**, and is it competing with another
> skill? Sees skills across Claude Code, Codex CLI and Gemini CLI at once.
>
> No network calls. No API key. No quota.

**Site:** https://hailneed.github.io/skillbench/ · *Türkçe açıklama aşağıda.*

A skill that quietly never opens is more common than a skill that is broken — and far
harder to notice. `skillbench` does not guess at this: it reads the activation record out
of your session history.

## What it looks like

```
$ npx --yes github:hailneed/skillbench --lint --md
```

```markdown
# skillbench — lint

**Source note:** 22 skill (38 installations) · installed agent roots ·
claude-code/installed: 3 · claude-code/user: 13 · gemini-cli/user: 8 ·
codex/user: 8 · codex/system: 6 · **score:** 131 (poor)

1 error · 24 warn · 25 info

## By check

| Sev   | Check               |  n | example skills                         |
|-------|---------------------|----|----------------------------------------|
| error | ref-broken-link     |  1 | skill-creator                          |
| warn  | eval-missing        | 19 | dotnet-web-conventions, intake, …      |
| warn  | fm-desc-no-trigger  |  3 | hyperframes, skill-creator, watch      |
| warn  | path-absolute       |  1 | intake                                 |
| info  | fm-desc-no-boundary | 16 | stats, dotnet-web-conventions, …       |
| info  | agent-lock-in       |  3 | advise, analyze, media-use             |
| info  | eval-thin           |  3 | advise, analyze, stats                 |

- **eval-missing** (warn) — Without a trigger file you cannot measure what a description
  change broke. → *Add an eval file with should_trigger / should_not_trigger lists.*
```

That `131 (poor)` is a real score from a real machine. **19 of the 22 skills have no eval
file at all**, so nobody can tell what a description edit breaks.

Note the source note: 22 skills across 38 installations. Eight of them are mirrored into
three agent homes each, and a finding derived from a skill's *content* is a property of
the skill, not of each copy — so it is counted once, with `mirrored: 3` recorded on it.
Counting per installation would have multiplied the score by however many agents you use.

## Commands

| Command | What you get |
|---|---|
| `/skillbench:lint [path]` | **Lint**: the frontmatter contract, description quality (trigger phrasing, negative boundary), body size, broken references, portability, permission breadth, eval coverage |
| `/skillbench:coverage` | **Real usage**: which skill fired how many times, in how many sessions, on which project; and which never opened, with the reason |
| `/skillbench:collide` | **Collision and drift**: which two descriptions compete for the same request and on which shared words; and whether copies of a skill mirrored into several agents still match |

26 lint checks, three severities (`error` / `warn` / `info`), and for every check a "why it
matters" and a "how to fix it" line. The rule engine is transparent — silence any check
you disagree with using `--ignore`.

## How real usage is measured

Claude Code records **which skill was active** for every tool call in the transcript
(`attributionSkill` / `attributionPlugin`). `skillbench` reads that field and turns it into
calls per skill, distinct session count, project, and last-used date.

> **Codex CLI and Gemini CLI do not record this structurally.** Skills on those agents are
> reported as *unmeasured* — **not** as *unused*. Live trigger testing (measuring with
> `claude -p`) is deferred to v0.2 because it costs quota.

That distinction is the centre of the product: when there is no number, it says there is no
number instead of inventing one.

## Supported locations

| Location | What | Status |
|---|---|---|
| `~/.claude/skills/<name>/SKILL.md` | Claude Code user skill | **verified** |
| `~/.claude/skills/<plugin>/skills/…` | package installed as a plugin (symlinks included) | **verified** |
| `~/.claude/plugins/cache/…` | installed marketplace plugin | **verified** |
| `~/.claude/plugins/marketplaces/…` | catalogue entry (not installed) | included with `--catalog`; file and eval checks are skipped |
| `~/.gemini/skills/<name>/SKILL.md` | Gemini CLI | **verified** |
| `~/.codex/skills/<name>/SKILL.md` | Codex CLI (including `.system/` built-ins) | **verified** |
| `--path <repo>` | the repo you are developing | the main development mode |

Symlinks are followed. `~/.claude/skills/<name>` is very often linked to a development
repo, and because `Dirent.isDirectory()` returns `false` for a symlink, a naive scanner
misses those skills entirely.

## Install

```
# Inside Claude Code, once:
/plugin marketplace add hailneed/plugins
/plugin install skillbench@hailneed
```

Then:

```
/skillbench:coverage
```

### Requirements

Claude Code + Node.js 18+. No dependencies, no API key.

## Without the plugin

```
git clone https://github.com/hailneed/skillbench
cd skillbench

node scripts/skillbench.mjs --list --md                  # skills that were found
node scripts/skillbench.mjs --lint --path ../my-plugin --md
node scripts/skillbench.mjs --coverage --days 90 --md    # real activations
node scripts/skillbench.mjs --collide --md               # collision + drift
node scripts/skillbench.mjs --selftest                   # rule self-test (no network/disk)
```

Flags: `--agent all|claude-code|codex|gemini-cli` · `--path DIR` · `--catalog` ·
`--lang en|tr` · `--out FILE` · `--limit N` · `--ignore check1,check2`.

Note it is `--path`, not `--repo`. An unrecognised flag exits **2** rather than being
ignored, so you never measure a different scope than you meant to.

## In CI

There is a GitHub Action, so you do not have to write the plumbing:

```yaml
- uses: hailneed/skillbench@main
  with:
    path: skills          # default: the repository root
    fail-on: error        # error | warn | info | never
```

Error findings appear as **inline annotations** on the offending `SKILL.md`, and the full
findings table is written to the job summary.

| Input | Default | What it does |
|---|---|---|
| `path` | `.` | directory to lint |
| `fail-on` | `error` | lowest severity that fails the job; `never` reports without failing |
| `max-score` | *(none)* | fail if `score.raw` exceeds this — independent of `fail-on` |
| `ignore` | *(none)* | comma-separated check ids to silence |
| `lang` | `en` | language of the human-readable prose |
| `summary` | `true` | write the findings table to the job summary |

Outputs: `score` · `level` · `findings` · `errors` · `json` (path to the full report).

```yaml
- uses: hailneed/skillbench@main
  id: lint
  with:
    fail-on: never        # report, do not block
- run: echo "score ${{ steps.lint.outputs.score }} (${{ steps.lint.outputs.level }})"
```

### Or wire it yourself

The JSON output is **language-neutral**: `check`, `severity`, `category`, `vars` and
`score.level` are identical whatever `--lang` you pass. Only `detail`, `why` and `fix` are
localised, so a threshold never breaks on a translation.

```yaml
- run: node scripts/skillbench.mjs --lint --path . --out lint.json
- run: |
    node -e '
      const a = require("./lint.json");
      const errors = a.findings.filter((f) => f.severity === "error");
      if (errors.length) {
        console.error(errors.map((f) => f.check + ": " + f.skill).join("\n"));
        process.exit(1);
      }
      if (a.score.raw > 40) { console.error("lint score too high: " + a.score.raw); process.exit(1); }
    '
```

`score.level` is one of `poor` · `fair` · `good` · `clean`. Check categories are
`frontmatter` · `activation` · `structure` · `reference` · `portability` · `permission` ·
`eval`.

## How it works

1. **Discovery** (`scripts/lib/skills.mjs`) walks the skill roots and plugin directories of
   three agents, parses frontmatter with a predictable YAML subset, and extracts and
   resolves the file references in the body. A path is tried against the skill's own
   directory, sibling skills and the plugin root — so cross-references are not reported
   as broken.
2. **Rules** (`scripts/lib/checks.mjs`) apply 26 checks, measure description similarity
   with idf-weighted cosine, and compare the content fingerprints of mirrored copies.
   Findings are machine data; all prose lives in `scripts/lib/i18n.mjs`.
3. **Activation** (`scripts/lib/adapters.mjs`) — the shared adapter layer from
   `agent-blackbox`; it turns session logs into one event schema, and skill attribution is
   read from there.
4. **The skills** interpret the output: `lint` turns findings into edits, `coverage`
   distinguishes the four possible reasons a skill is cold, and `collide` proposes fixing
   an overlap by adding a **one-sided** boundary line.

## Roadmap (and how it makes money)

- **v0.1 (this repo):** 3 skills + a dependency-free scanner + 26 checks, MIT.
- **v0.2:** live trigger testing (actually running the `should_trigger` /
  `should_not_trigger` prompts and measuring the rate, behind a budget gate), description
  rewrite suggestions with a before/after trigger comparison, `--format sarif`.
- **Skillbench Cloud (paid, optional):** continuous measurement for a team skill library,
  regression history showing what a description change did to triggering, and a
  pre-publish gate for marketplace authors. The plugin stays free.
  Waitlist: https://hailneed.github.io/skillbench/#cloud

This repo is part of the `agentlens` family: the adapter layer is shared with
[`agent-blackbox`](https://github.com/hailneed/agent-blackbox), where the canonical copy lives.

## License

MIT.

---

## Türkçe

**skillbench**, kodlama ajanı skill'leri için lint ve gerçek kullanım kanıtı aracıdır. Üç
soruyu cevaplar:

- **`/skillbench:lint`** — skill doğru yazılmış mı? Frontmatter sözleşmesi, aktivasyon
  kalitesi, yapı, referanslar, taşınabilirlik, araç izinleri ve eval kapsamı üzerinde 26
  şeffaf denetim. Geliştirdiğin depoda (`--path`) ya da Claude Code, Codex CLI ve Gemini
  CLI'da kurulu tüm skill'lerde çalışır.
- **`/skillbench:coverage`** — gerçekten ateşliyor mu? Claude Code her araç çağrısında hangi
  skill'in aktif olduğunu kaydeder; bu, skill başına gerçek aktivasyona, farklı oturum
  sayısına, projeye ve son kullanım tarihine çevrilir. Hiç açılmayanlar listelenir.
- **`/skillbench:collide`** — iki skill aynı isteğe mi giriyor? idf ağırlıklı örtüşme puanı
  ve sınırı bulanıklaştıran ortak kelimeler; ayrıca birden çok ajan dizinine kopyalanmış
  skill'ler için sürüklenme tespiti.

**Yapısı gereği dürüst:** skill atıfını yalnızca Claude Code saklıyor. Codex CLI ve Gemini
CLI'daki skill'ler *ölçülemedi* olarak raporlanır, *kullanılmadı* olarak **değil**. Canlı
tetiklenme testi kota harcadığı için bilerek v0.2'ye bırakıldı.

**Hiçbir şey makineden çıkmaz.** Ağ çağrısı yok, API anahtarı yok, kota yok. Node.js 18+,
bağımlılık yok.

Çıktı varsayılan olarak İngilizcedir; Türkçe için `--lang tr` ver:

```
node scripts/skillbench.mjs --coverage --md --lang tr
```

```
/plugin marketplace add hailneed/plugins
/plugin install skillbench@hailneed
```
