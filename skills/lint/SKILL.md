---
name: lint
description: Check skills and plugins for the mistakes that stop them working — missing or weak frontmatter, descriptions that never trigger, bodies too long to follow, broken references, unsafe paths, over-broad tool permissions and missing trigger evals. Works on a repo you are developing or on every skill installed across Claude Code, Codex CLI and Gemini CLI. Use when the user asks to review or check a skill, says a skill is not working, asks why a skill never activates, is about to publish a plugin, says "skill'imi kontrol et", "lint my skills", "bu skill neden çalışmıyor", or runs /skillbench:lint [path]. Not for measuring whether a skill actually fired in real sessions — that is skillbench:coverage. Not for finding two skills that compete for the same request — that is skillbench:collide.
---

# Skill lint (lint)

Find the reasons a skill silently fails: it never loads, never triggers, or points at files
that are not there. Everything is read locally; no network call and no quota is spent.

**Language rule: write every user-facing output in the language the user is speaking with you.**
**Evidence rule: every finding names the file and the exact text that triggered it. If you
cannot point at the text, it does not go in the report.**

## Step 0 — Scope

Decide what to lint before running anything:

| The user is | Run |
| --- | --- |
| developing a plugin/skill repo | `--path <repo>` — the repo they are in, not their whole machine |
| asking about one installed skill | no `--path`, then filter to that skill |
| doing a general clean-up | no `--path` (all installed skills, all agents) |

Read `${CLAUDE_PLUGIN_ROOT}/skills/lint/references/checks.md` before triaging — it says what
each check id means and when it is safe to ignore.

## Step 1 — Run

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/skillbench.mjs" --lint --path "<repo>" --md
```

Drop `--path` to lint everything installed. Add `--catalog` only if the user explicitly
wants third-party marketplace entries too — those are not installed, so their file and eval
checks are skipped and the result is noisier without being more useful. Requires Node.js
18+; if `node` is missing, stop and say so.

## Step 2 — Separate "broken" from "could be better"

The report is already grouped by severity. Read it that way:

- **hata / error** — the skill probably does not work: no frontmatter, no name or
  description, name/directory mismatch, a broken markdown link, a literal `~` handed to a
  script, an unparseable eval file. These are not stylistic; fix them first.
- **uyarı / warn** — it loads but will not behave: a description with no trigger phrases, a
  body over 500 lines, a plugin script called without `${CLAUDE_PLUGIN_ROOT}`, no eval file.
- **bilgi / info** — worth knowing, not worth blocking on: missing negative boundary,
  cross-skill reference, an agent name hard-coded in the body.

If a check fires on almost every skill (`eval-missing` usually does), say it once as a
pattern with the count — do not repeat it per skill.

## Step 3 — Turn findings into edits

For each error and each warn worth acting on, propose the concrete change:

- **Weak description** — rewrite it in place. A description that triggers reliably says what
  the skill does, *when* to use it (with the phrases a user would actually type, in both
  languages if the user works bilingually), and what it is *not* for. Show the before/after.
- **Body too long** — name which sections to move to `references/`, based on what the agent
  needs on every run versus what it needs occasionally.
- **Broken reference** — say whether the file should be created or the path fixed; check the
  neighbours first, since the file often exists in a sibling skill.
- **Missing eval** — offer to write the file: at least 4 `should_trigger` prompts in the
  user's own words and 3 `should_not_trigger` prompts taken from the *neighbouring* skills,
  since those are the ones that actually steal the activation.

Apply edits only when the user asks for them. Never rewrite a skill's description without
showing what changed — activation behaviour is the whole product.

## Step 4 — Reply

6–10 lines: how many skills were scanned and where, the error count and what they are, the
single change with the biggest effect, and the file path if you saved a report to
`~/.agentlens/skillbench/lint-<YYYY-MM-DD>.md` (expand the home directory yourself; never
pass a literal `~` to the script). If everything is clean, say so in one line — a clean lint
on a repo about to be published is a real result, not an empty one.
