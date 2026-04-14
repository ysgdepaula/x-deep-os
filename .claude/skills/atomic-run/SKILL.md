---
name: atomic-run
description: >
  Execute an implementation plan atom by atom, grouped into molecules for review.
  Use this skill when the user asks to "execute this plan", "implement this plan",
  "run this plan", "atomic-run", or any request to implement a plan file step by step.
  Also trigger when the user provides a plan file path and asks to start implementing it.
user_invocable: true
---

# Atomic Run — Molecule-Based Implementation

Execute a plan by running atoms one by one, grouped into **molecules** — batches sized to
maximize agent productivity while keeping review mental load near zero.

**Announce at start:** "I'm using the atomic-run skill. Analyzing plan and building molecules..."

---

## Invocation

```
/atomic-run docs/plans/2026-03-06-feature.md
/atomic-run docs/plans/2026-03-06-feature.md --from 4
```

---

## Step 1 — Parse & Classify

Read the entire plan. For each task (`### Task N: [Name]`), assign a **cognitive weight**:

| Weight | Label      | Criteria                                                                                                                             |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1      | mechanical | New files, migrations, types, scaffolding, config, imports, renaming — deterministic, no branching logic                             |
| 2      | light      | Integrates with existing code but pattern is clear and repetitive                                                                    |
| 3      | cognitive  | Business logic, algorithms, non-trivial state, architectural decisions, cross-module integration, anything with meaningful tradeoffs |

---

## Step 2 — Build Molecules

Group consecutive tasks into molecules using this rule:

**Molecule boundary = when cumulative weight would exceed 6, OR when a weight-3 task ends.**

Additional rules:

- A weight-3 task is always either alone or at the end of a molecule (never in the middle)
- Never put two weight-3 tasks in the same molecule
- A molecule has between 1 and ~8 atoms (no hard cap, let the weights guide it)

The goal: every molecule should feel like roughly the same mental effort to review — dense with mechanical atoms, or short when cognitive work is involved.

---

## Step 3 — Present the Molecule Plan

Before executing anything, show the full breakdown:

```
Plan: [Plan title]
Tasks: N total — M molecules

Molecule 1 — atoms 1–5 (mechanical)
  1. Create migration file
  2. Add User model types
  3. Scaffold AuthController
  4. Add routes
  5. Create DTO validators

Molecule 2 — atoms 6–7 (cognitive)
  6. Implement JWT refresh logic
  7. Handle token revocation edge cases

Molecule 3 — atoms 8–13 (mechanical)
  ...

Starting Molecule 1 ↓
```

---

## Step 4 — Execute a Molecule

Run each atom in the molecule sequentially without pausing:

1. Announce: `→ Task N: [Name]`
2. Implement all steps fully
3. Run any commands/tests the task specifies, verify output
4. Move to next atom immediately

No review between atoms. No stopping. Keep going until the molecule is done.

---

## Step 5 — Molecule Review

After the last atom of a molecule, present a clean summary in English — no code blocks, no full paths, file names only:

---

✅ **Molecule M done** — Tasks N to N+K

**Task N — Create migration file**

- add_users

**Task N+1 — Add User model types**
~ user — added 3 types

**Task N+2 — Scaffold AuthController**

- auth_controller

**Commits**
feat(auth): add user migration and model types
feat(auth): scaffold controller, routes and validators

**Next → Molecule M+1** — [first task name]
[One-line description]

Approve? Or describe what to change.

---

Guidelines:

- **Changes**: One section per task, one line per file with `+` created / `~` modified / `x` deleted. File name only, no path, no extension.
- **Commits**: Batch mechanical atoms if it reads cleaner. Cognitive atoms always get their own commit.
- **Next**: Show the next molecule's first task name and a one-line description.

---

## Step 6 — Handle Response

**Approved** (`ok`, `good`, `next`, `lgtm`, `go`, etc.):

1. Stage and commit all files from this molecule using the suggested commits
2. Print: `Committed: <message>` for each commit
3. Execute next molecule (back to Step 4)

**Edit requested** (user describes a change):

1. Apply edits on top of current work
2. Re-present the molecule review (back to Step 5)

---

## Step 7 — Plan Complete

```
🏁 Plan complete — N tasks, M molecules, K commits.
Review with `git log --oneline`.
```

---

## Important

- **Never pause mid-molecule** — atoms are for execution, molecules are for review
- **Stay faithful to the plan** — implement what the plan says, no extras
- **On failure** — if a step errors or tests fail, stop the molecule immediately and report which atom failed and why. Let the user decide how to proceed.
- **Molecule plan is a suggestion** — if the user wants to re-cut molecules before starting, they can ask. Once execution starts, the plan is locked.
- **`--from N`** — recompute molecules from task N onward, re-present the breakdown, then start
