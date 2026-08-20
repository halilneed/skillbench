---
name: coverage
description: Measure which skills actually fire in real work — count real activations from local Claude Code session history, show how often each skill was used, in which projects and how recently, and list the ones that have never fired at all. Use when the user asks whether their skills are being used, which skills are worth keeping, why a skill never activates in practice, wants to prune or prioritise their skill set, says "hangi skill'ler kullanılıyor", "bu skill hiç açılıyor mu", "are my skills actually used", or runs /skillbench:coverage. Not for checking how a skill is written — that is skillbench:lint. Not for finding skills that compete with each other — that is skillbench:collide.
---

# Real usage (coverage)

Stop guessing which skills earn their place. Claude Code records which skill was active for
each tool call; this reads that record and turns it into activation counts. Local only, no
quota spent.

**Language rule: write every user-facing output in the language the user is speaking with you.**
**Honesty rule: only Claude Code stores skill attribution. Codex CLI and Gemini CLI do not.
A skill on those agents is *unmeasured*, not unused — never report it as "never fired".**

## Step 1 — Measure

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/skillbench.mjs" --coverage --md
```

Add `--days 90` to bound the window (default is all history). Requires Node.js 18+. Read the
source note first: how many sessions were scanned and how many were unreadable. If sessions
were unreadable, that number goes in the report — a smaller sample changes what "never
fired" means.

## Step 2 — Read the three groups correctly

| Group | What it means | What it does *not* mean |
| --- | --- | --- |
| **Fired** | Real activations, with session count, projects and recency | High counts are not quality — one long session can dominate |
| **Never fired, measurable** | Installed on Claude Code, in history, never opened | Not necessarily useless — see the diagnosis below |
| **Never fired, unmeasured** | Lives on Codex/Gemini where activation is not recorded | Nothing at all. Do not rank or prune these |
| **Fired but not on disk** | An attribution with no matching skill file | Usually a renamed, removed or built-in skill |

Two numbers matter more than the raw count: **how many distinct sessions** (a skill used in
15 sessions is load-bearing; one used 60 times in a single session was a one-off) and **how
recently** (a skill last used 90 days ago is a candidate for removal even with a high count).

## Step 3 — Diagnose the cold ones

A skill that never fires has one of four causes, and they need opposite responses:

1. **The description does not trigger** — it describes the skill instead of the situation.
   Run `/skillbench:lint` on it; look for `fm-desc-no-trigger` and `fm-desc-too-short`.
2. **Another skill wins the request** — run `/skillbench:collide` and look for a
   high-scoring pair involving it.
3. **The situation never came up** — the skill is fine, the work just did not happen. Check
   the projects in the fired list: if the relevant project is absent from the history, this
   is the answer.
4. **It should not exist** — written speculatively, never needed. Say so plainly.

Do not recommend deleting anything on count alone. Name which of the four causes applies,
with the evidence you used.

## Step 4 — Reply

Short and ranked: how many skills fired versus how many did not (excluding unmeasured ones,
stated separately), the top three by distinct sessions, the cold ones worth fixing with the
cause for each, and the ones worth removing. If the user asked "which should I keep", give a
keep/fix/drop split with a reason per skill rather than a table dump.

Save a full report to `~/.agentlens/skillbench/coverage-<YYYY-MM-DD>.md` (expand the home
directory yourself; never pass a literal `~` to the script) only when the user wants a
document or is doing a clean-up pass. Say where you saved it.
