---
name: wrong-name-on-purpose
description: This skill does a thing.
allowed-tools: "*"
nosuchkey: yes
---

# Broken fixture skill

This file exists for CI. It is deliberately broken so `skillbench --lint` has real
findings to produce; it is not an example of a good skill.

It lives under `evals/` and not under `skills/`, so the plugin loader never picks it up.

Kept in English on purpose: the CI language gate asserts that the default report
contains no Turkish, and quoted fixture text would make that assertion ambiguous.

It triggers, at minimum:

- `fm-name-dir-mismatch` — `name` says `wrong-name-on-purpose`, the directory is `broken-skill`
- `fm-desc-too-short` — the description is far under 80 characters
- `fm-desc-no-trigger` — no "use when …" phrasing
- `fm-desc-first-person` — the description opens with "This skill"
- `fm-unknown-key` — `nosuchkey` is not a recognised field
- `tools-broad` — `allowed-tools: *`
- `ref-broken-link` — the link below points at a file that does not exist
- `path-absolute` — the absolute path below belongs to one machine only
- `eval-missing` — there is no eval file for this skill

Read [the missing reference](references/does-not-exist.md) before continuing.

Output goes to C:\Users\someone\Desktop\output.
