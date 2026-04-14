---
name: validate-all
description: Run all X-DEEP validators (state, templates, skills), plus lint and typecheck across projects, report findings
user_invocable: true
triggers:
  - validate
  - run validators
  - check the archi
  - valide tout
---

# /validate-all — Run all X-DEEP validators

Single entry point to verify the X-DEEP architecture is healthy.
Owned by the `xdeep-engineering` agent.

## When this skill is invoked
- Before any commit touching `.agent/` or `.claude/skills/`
- Before opening a PR with `auto-fix`, `enhancement`, or `blueprint` label
- On demand when the user suspects drift
- By `/scaffold` as part of its step 4

## What it runs

### Core validators (always)
```bash
node .agent/scripts/validate-all.mjs
```
This runs:
- `validate-state.mjs` — checks `.agent/state.json` structure, no duplicates
- `validate-templates.mjs` — all `.agent/templates/*.yaml` parse + schema + cross-ref state
- `validate-skills.mjs` — all `.claude/skills/*/SKILL.md` frontmatter valid + unique names

### Project checks (if relevant files changed)
- `telegram-bot/` changed → `cd telegram-bot && npm run lint`
- `dashboard/` changed → `cd dashboard && npm run lint && npx tsc --noEmit && npm test`
- `sales-tool/` changed → `cd sales-tool && npm run lint`

## Expected output format

**Success case:**
```
✅ All validators passed

Core:
- state.json: OK
- templates: OK (10 agents)
- skills: OK (15 skills)

Projects checked: telegram-bot (lint OK)
```

**Failure case:**
```
❌ Validation failed (2 errors)

Core errors:
- .agent/templates/xdeep-sales.yaml: reports_to references non-existent agent
- .claude/skills/foo/SKILL.md: frontmatter missing required field 'name'

Project errors:
- telegram-bot lint: 3 warnings, 1 error in src/index.mjs

Suggested next step: fix errors above, then re-run /validate-all
```

## Guardrails
- NEVER commit if validation fails
- If validator script itself errors (not a validation failure): escalate to the user
- If a fix requires changing schemas: stop and propose, don't modify schemas autonomously
