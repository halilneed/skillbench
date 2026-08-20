# Check catalogue and triage guide

Every check is a transparent test in `scripts/lib/checks.mjs`. A hit means "this text
matched this condition" — nothing is inferred by a model. Turn any check off with
`--ignore <id>`.

Scoring: `error = 10`, `warn = 4`, `info = 1`. Total ≥ 40 → `kötü`, ≥ 15 → `orta`,
> 0 → `iyi`, 0 → `temiz`. The number ranks skills against each other; it is not a verdict.

**Checks in the `referans` and `eval` categories are skipped for uninstalled marketplace
entries.** Those plugins ship their `scripts/` and `references/` only at install time, so
running file-existence checks on the catalogue produces pure noise.

## Frontmatter

| id | sev | fires when | triage |
| --- | --- | --- | --- |
| `fm-missing` | error | the file does not start with a `---` block | Always real. The skill is not loaded at all. |
| `fm-no-name` | error | no `name:` | Always real. |
| `fm-no-description` | error | no `description:` | Always real, and the worst of the three: activation is decided from the description alone. |
| `fm-name-dir-mismatch` | error | `name` differs from the directory name | Always real — the invocation path uses one, the file lives at the other. |
| `fm-name-format` | warn | not kebab-case | Uppercase and underscores travel badly between agents. Low risk if the skill is single-platform. |
| `fm-unknown-key` | info | a frontmatter key outside the known set | Usually a typo (`descripton:`) — check spelling before dismissing. Newer platform fields also land here. |

## Activation quality

| id | sev | fires when | triage |
| --- | --- | --- | --- |
| `fm-desc-too-short` | warn | description under 80 characters | Strongly correlated with never firing. A short description carries no trigger surface. Fix before anything else if the skill is cold. |
| `fm-desc-too-long` | warn | over 1024 characters | Costs context on every request and dilutes the distinctive terms. Move detail into the body. |
| `fm-desc-no-trigger` | warn | no "use when …" style phrase | The description says what the skill *is* instead of when it applies. The single most common cause of a skill that never opens. |
| `fm-desc-no-boundary` | info | a long description with no "not for …" clause | Only matters when a neighbouring skill exists. Cross-check with `/skillbench:collide` before acting. |
| `fm-desc-first-person` | warn | starts with "I ", "This skill …", "Bu skill …" | Wastes the highest-signal position in the description on a phrase every skill shares. |

## Structure

| id | sev | fires when | triage |
| --- | --- | --- | --- |
| `body-very-long` | error | over 800 lines | At this size instruction-following degrades measurably. Split it. |
| `body-too-long` | warn | 500–800 lines | The conventional ceiling for progressive disclosure. Move the occasionally-needed parts to `references/`. |
| `body-no-structure` | info | over 60 lines with no `##` heading | Without headings the agent skips steps. Cheap to fix. |

## References

| id | sev | fires when | triage |
| --- | --- | --- | --- |
| `ref-broken-link` | error | a markdown link or quoted path that does not resolve | Real. The step that reads it silently does nothing. Resolution already tries the skill directory, sibling skills and the plugin root before declaring it missing. |
| `ref-broken-code` | warn | a backtick-quoted path that does not resolve | Weaker evidence — a backtick path can be an illustration. Paths on a line marked "örn." / "e.g." are already excluded. Read the sentence before acting. |
| `ref-cross-skill` | info | the path resolves, but inside a *different* skill | Works today, breaks when that skill is not installed. Fine inside one plugin; fragile across plugins. |
| `plugin-root-missing` | warn | a plugin skill calls `scripts/…` without `${CLAUDE_PLUGIN_ROOT}` | Real whenever the working directory is not the plugin root — which is the normal case. |
| `plugin-root-orphan` | warn | `${CLAUDE_PLUGIN_ROOT}` used outside a plugin | The variable is undefined there; the path expands to nonsense. |

## Portability and safety

| id | sev | fires when | triage |
| --- | --- | --- | --- |
| `path-literal-tilde` | error | a `~/…` path is passed straight to a command | On Windows and in any non-shell spawn, this creates a directory literally named `~`. Resolve the home directory inside the skill and pass the full path. |
| `path-absolute` | warn | a hard-coded `C:\Users\…`, `/home/…` or `/Users/…` path | Works on the author's machine only. |
| `agent-lock-in` | info | a specific agent name appears in the body | Only act on it when the skill is meant to be portable — a genuinely Claude-Code-specific skill should name Claude Code. Naming agents in the *description* is not flagged: there it is a capability statement. |
| `tools-broad` | warn | `allowed-tools: *` | Grants the skill every tool. List what it actually uses. |

## Eval coverage

| id | sev | fires when | triage |
| --- | --- | --- | --- |
| `eval-missing` | warn | no `evals/skill-triggers/<name>.json` | Expect this to fire on nearly every skill in a fresh scan. Report it once as a pattern with the count, not per skill. It matters most for skills you are actively tuning. |
| `eval-invalid` | error | the eval file is not parseable JSON | Silently skipped, so it looks like coverage exists when it does not. |
| `eval-thin` | info | fewer than 4 `should_trigger` or 3 `should_not_trigger` | Negative examples are the ones that catch collisions; a file with none cannot detect the failure mode it exists for. Draw negatives from the neighbouring skills' territory. |

## What lint cannot tell you

Lint reads text. It cannot tell you whether a skill *actually* fires — for that use
`/skillbench:coverage`, which counts real activations from session history — or whether
another skill is stealing its requests, which is `/skillbench:collide`. A skill can pass
every check here and still never open.
