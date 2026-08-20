---
name: collide
description: Find skills that compete for the same request and copies that have drifted apart — score how much each pair of descriptions overlaps, name the shared terms that blur the boundary, and flag skills duplicated across Claude Code, Codex CLI and Gemini CLI whose contents are no longer identical. Use when the wrong skill keeps opening, when a new skill stops an old one from triggering, before adding a skill next to a similar one, when the same skill is mirrored into several agents, when the user says "yanlış skill açılıyor", "bunlar çakışıyor mu", "which skills overlap", or runs /skillbench:collide. Not for checking how a single skill is written — that is skillbench:lint. Not for counting real activations — that is skillbench:coverage.
---

# Collisions and drift (collide)

Two skills whose descriptions say nearly the same thing will fight over the same request,
and the loser looks broken. This measures that overlap, and separately checks whether skills
copied into several agent homes are still the same file. Local only, no quota spent.

**Language rule: write every user-facing output in the language the user is speaking with you.**
**Evidence rule: a collision claim must name the shared terms. "These two feel similar" is
not a finding.**

## Step 1 — Measure

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/skillbench.mjs" --collide --md
```

Add `--path <repo>` to check only the skills in one repo — the useful mode when adding a
skill next to existing ones. Requires Node.js 18+.

Scoring is an idf-weighted cosine over the descriptions: rare shared words count for more
than common ones, so "evidence" counts and "the user" does not. Copies of the same skill in
different agent homes are excluded from collisions by name and handled as drift instead.

## Step 2 — Judge each pair, do not report the score

A score is a lead. For each pair above the threshold, open both descriptions and decide:

- **Real collision** — both would plausibly answer the same user sentence, and neither says
  what it is *not* for. This is the case worth fixing.
- **Family, correctly separated** — same domain, but the descriptions already name the split
  ("Not for X — that is <other>"). The `bothHaveBoundary` column tells you this at a glance.
  Report as healthy, not as a problem.
- **Vocabulary artefact** — the overlap comes from shared jargon, not shared purpose. Drop
  it and say you did.

Concretely: read the two descriptions and try to write one sentence that only one of them
should answer. If you cannot, it is a real collision.

## Step 3 — Fix by adding the boundary, not by rewording both

The reliable repair is asymmetric and small:

1. Decide which skill owns the contested request. Say why in one line.
2. In the *other* skill's description, add an explicit exclusion naming the winner:
   `Not for <case> — that is <winner>.`
3. In the winner's description, add the trigger phrases that were pulling toward the loser.
4. Add the contested sentence to the loser's `should_not_trigger` and the winner's
   `should_trigger` eval list, so the fix is checkable next time.

Rewriting both descriptions at once usually creates a new collision somewhere else. Change
one side and re-run.

## Step 4 — Drift

The drift table lists skills that exist in more than one agent home with different content.
For each, say which copy is newest (line counts and the hashes are in the report; check file
times if you need to) and offer to re-sync from that one. Never overwrite a copy without the
user confirming which side is authoritative — the divergent copy may hold the newer work.

If there is no drift, say so in one line: identical copies across agents is the good outcome
and worth confirming explicitly.

## Step 5 — Reply

Short: how many pairs were above threshold, which are real collisions after your judgement
(and how many you dropped as artefacts), the single boundary line you recommend adding and
to which skill, and the drift status. If nothing collides, say that plainly and do not
manufacture near-misses.
