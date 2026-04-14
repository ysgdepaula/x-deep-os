---
name: propose-refactor
description: Analyze code or architecture for drift, duplication, or code smells and write a concrete refactor proposal to .agent/queue.md
user_invocable: true
triggers:
  - propose a refactor
  - cleanup proposal
  - what could we refactor
  - propose refactor
---

# /propose-refactor — Write a refactor proposal to queue.md

Analyze the codebase and write a concrete, scoped refactor proposal in `.agent/queue.md`.
Never execute the refactor — only propose. The user decides.
Owned by the `xdeep-engineering` agent.

## When this skill is invoked
- User asks "what could we refactor here?"
- `/nightly-audit` detects code smells or drift
- After a `/scaffold` run that touched 8+ files (likely accumulated complexity)
- Before a major version release, to surface cleanup opportunities

## Inputs expected
- **Scope** (optional): specific folder, file, or subsystem. If omitted: repo-wide scan.

## Steps

### 1. Scan for drift signals
- Duplicated logic across skills or scripts
- Mixed concerns (business logic in engineering skill, etc.)
- Naming inconsistencies (verb-noun vs domain-named skills — see `docs/architecture-principles.md`)
- Dead code or unreferenced files
- Stale comments referencing removed features

### 2. Prioritize findings
Keep at most **3 proposals** per run (avoid queue spam).

For each proposal, score:
- **Impact** (1-5): how much does this improve the system?
- **Effort** (1-5): file count, test surface, risk
- **Reversibility**: easy to revert?

Surface only proposals with **Impact ≥ 3** AND **Effort ≤ 3** OR **Impact 5** regardless of effort.

### 3. Write to queue.md

Format each proposal as:
```
## [refactor] <short title> — proposed YYYY-MM-DD
**Motivation**: <what drift signal triggered this>
**Scope**: <files/folders affected, estimated file count>
**Impact**: <1-5> — <one-sentence justification>
**Effort**: <1-5> — <time estimate>
**Label**: <auto-fix | enhancement | blueprint>
**Plan**:
  1. <atomic step>
  2. <atomic step>
  3. <atomic step>
**Rollback**: <how to revert if needed>
**Validation**: <which tests/validators confirm success>
```

### 4. Report back
```
✅ Refactor proposals written to .agent/queue.md

Proposals (N):
1. <title> — impact X, effort Y
2. <title> — impact X, effort Y

Next step: user reviews queue.md and decides which to execute via /scaffold or manually.
```

## Guardrails
- NEVER modify code directly — write to queue.md only
- If a proposal would touch > 20 files: break it into smaller proposals
- Do not propose renames that would break public API (skill names, agent IDs referenced externally)
- If you find a bug (not just a smell), also flag it separately with `[bug]` label
