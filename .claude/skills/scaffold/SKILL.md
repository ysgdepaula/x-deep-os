---
name: scaffold
description: Generate a new agent template YAML or skill folder respecting schemas, update state.json and CLAUDE.md hierarchy
user_invocable: true
triggers:
  - scaffold agent
  - create new agent
  - scaffold skill
  - create new skill
  - genere un nouvel agent
  - cree un skill
---

# /scaffold — Generate X-DEEP architecture artifacts

Generate a new agent or skill, respecting schemas and conventions.
Owned by the `xdeep-engineering` agent.

## When this skill is invoked
- The user asks "create a new agent `xdeep-<name>`"
- The user asks "add a skill `/<verb-noun>` to agent Z"
- An `enhancement` or `blueprint` issue arrives specifying the artifact to create
- The canvas dashboard generates a PR

## Inputs expected
- **Artifact type**: `agent` | `skill`
- **Name**: kebab-case. For agents: `xdeep-<domain>`. For skills: `<verb>` or `<verb>-<noun>`.
- **Owner agent** (for skills): which agent will own this skill in `skills_owned`
- **Short description**: one sentence for the frontmatter/backstory

## Mandatory steps

### 1. Read context
- `.agent/state.json` — current state
- `.agent/rules.md` — rules to respect
- `.agent/schemas/` — schemas to respect (`agent-template.schema.json`, `skill-frontmatter.schema.json`)
- `CLAUDE.md` — "Quality Gates" section

### 2. Determine scope
- How many files will be touched?
- Which label fits? `auto-fix` (3 max), `enhancement` (10 max), `blueprint` (20 max)
- If > limit: split into multiple PRs or ask the user

### 3. Generate the artifact

**For a new agent:**
- Create `.agent/templates/xdeep-<name>.yaml` following `_base.yaml` structure
- Update `.agent/state.json` (add agent entry)
- Update `CLAUDE.md` hierarchy diagram

**For a new skill:**
- Create `.claude/skills/<verb-noun>/SKILL.md` with proper frontmatter
- Name MUST be a verb or verb-noun (see `docs/architecture-principles.md` — "skills are verbs, agents are nouns")
- Update `.agent/state.json` (add skill entry)
- Update the owning agent's `skills_owned` in its template YAML

### 4. Validate BEFORE commit
```bash
node .agent/scripts/validate-all.mjs
```
If fail:
- Read the errors
- Fix
- Re-validate
- NEVER commit with validators failing

### 5. Commit + PR
- Branch: `feat/scaffold-<artifact>-<name>` or `blueprint/<name>-<date>` for blueprints
- Clear commit message, conventional format (feat/fix/refactor)
- PR with the right label

## Naming rules (strict)
- **Agents**: nouns/domains → `xdeep-engineering`, `xdeep-sales`, `xdeep-research`
- **Skills**: verbs/verb-nouns → `/scaffold`, `/validate-all`, `/propose-refactor`, `/prep-call`
- **Anti-pattern**: skills named after domains (`/engineering`, `/sales`) — split into specific tasks

## Guardrails
- Never modify business logic — scope = architecture scaffolding only
- Mandatory validation before each commit touching `.agent/` or `.claude/skills/`
- No force push unless explicit user instruction
- If in doubt: write in `.agent/queue.md` instead of acting

## Expected output format

```
✅ Scaffold complete

Artifact: <agent | skill> <name>
Files changed (N):
- path/to/file1 (created)
- path/to/file2 (modified)

Validation: [validate-all OK]
Branch: <branch-name>
PR: <url or "draft, not pushed yet">
Label: <auto-fix | enhancement | blueprint>
```

## References
- Schemas: `.agent/schemas/`
- Validators: `.agent/scripts/`
- Naming principle: `docs/architecture-principles.md`
- Doc: `CLAUDE.md` section "Quality Gates"
