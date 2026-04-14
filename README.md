# X-DEEP OS

> Personal AI OS for CEOs of service businesses.
> A Claude Code harness with multi-agent coordination, knowledge compilation, and self-healing loops — runnable 24/7 on Telegram.

**Status**: snapshot 2026-04-14. Runnable. README below is a stub — a full narrative README lands with Session 3.

## What this is

A founder or PME CEO running a service business — architecture firm, landscaping group, consulting practice — spends most of their day being a bottleneck: emails, quotes, tenders, cash, scheduling, admin. This repo is the framework one such CEO (Yan de Paula, Teïa Solutions) built to externalize that cognitive load.

The X is a variable. Each user picks their own prefix:
- Yan runs **Y-DEEP**
- Marc (fictional example) runs **M-DEEP**
- Alex (fictional example) runs **A-DEEP** or **ALX-DEEP**

## What's inside

```
x-deep-os/
├── install.sh                         ← interactive setup
├── CLAUDE.template.md                 ← your agent's system prompt (templated)
├── CLAUDE.example.md                  ← fictional persona Marc Dubois (CEO Groupe Verdure)
├── .agent/                            ← coordination layer
│   ├── schemas/                       ← JSON schemas for state, templates, skills
│   ├── protocols/                     ← validation, autonomy promotion, learning
│   ├── scripts/                       ← validators (Node.js)
│   ├── templates/                     ← 9 agent YAML templates
│   └── state.json                     ← starter state
├── .claude/skills/                    ← 15 skills (all verb-named)
│   ├── scaffold, validate-all, propose-refactor  (engineering)
│   ├── review-output                  (validator)
│   ├── research-scan, nightly-audit, weekly-digest  (research)
│   ├── scout, ingest                  (research)
│   ├── hello, sync-state, atomic-run  (master utilities)
│   ├── office-search, office-compare, office-monitor  (vertical example — FR real estate)
├── telegram-bot/                      ← 18-file grammY + Claude + Whisper harness
│   ├── src/                           (bot core, anonymized from a real deployment)
│   ├── .env.example                   (20+ env vars documented)
│   └── railway.toml                   (one-click Railway deploy)
├── mcp-servers/                       ← modular MCP factory
│   ├── core/                          (server.mjs + oauth2.mjs + apikey.mjs)
│   ├── services/gmail/                (real OAuth2 template)
│   ├── services/example-service/      (starter)
│   └── scripts/add-service.mjs
├── .github/workflows/                 ← self-healing CI
│   ├── auto-fix.yml                   (Claude Code Action + bash whitelist)
│   ├── ci-quality.yml                 (file limit + validators + lint)
│   ├── post-deploy-health.yml         (Telegram bot alive check + auto-revert)
│   └── pr-notify.yml                  (Telegram PR summary)
└── docs/
    ├── architecture-principles.md     ← 4 principles (READ THIS)
    ├── self-healing.md                ← complete flow diagram
    ├── customize.md                   ← stub (Session 3)
    └── deployment.md                  ← stub (Session 3)
```

## Quick start

### 1. Clone + install
```bash
git clone https://github.com/ysgdepaula/x-deep-os.git
cd x-deep-os
./install.sh
```

The installer asks for your name, role, company, city, languages, and the name you want for your agent (e.g. `M-DEEP`). It generates `CLAUDE.md` and renames the agent templates to match your prefix.

### 2. Validate the architecture
```bash
cd .agent/scripts && npm install
node validate-all.mjs
```
Should report: `All 3 validators passed`.

### 3. Open Claude Code
```bash
cd /path/to/x-deep-os
claude
```
Say `hello` and the `/hello` skill will run your morning briefing (adapted to your context in `CLAUDE.md`).

### 4. (Optional) Deploy 24/7 on Telegram
See [`telegram-bot/README.md`](telegram-bot/README.md). Cost: ~$15/month on Railway + Upstash Redis + Claude API.

## Core principles

Read [`docs/architecture-principles.md`](docs/architecture-principles.md) first. The key ideas:

1. **Three layers**: knowledge (what's true), agents (who am I), skills (how do I do this task)
2. **Skills are verbs, agents are nouns** — `/scaffold` not `/engineering`
3. **Skills load context on demand** — don't embed knowledge
4. **Agents delegate** — the master orchestrates specialists

## Influences

Built on:
- Andrej Karpathy — "Software 2.0" and "LLM OS"
- Anthropic — "Building effective agents" (orchestrator/workers pattern)
- Cognition AI — "Don't build multi-agents" (why shared state > parallel isolation)
- Model Context Protocol (MCP) — shared tool pool
- Claude Agent SDK — tool-use loop foundation

Full citations in [`docs/architecture-principles.md`](docs/architecture-principles.md#design-influences).

## What this is NOT

- A SaaS — it's a repo you clone and run
- A general-purpose agent platform — it's opinionated for a specific use case (solo/PME CEO)
- A product — no support, no SLA. Snapshot of a working personal setup.
- Production-grade — the author runs this for themselves. You're welcome to copy it.

## License

MIT. See [`LICENSE`](LICENSE).

## Questions, feedback

Open a GitHub issue or DM the author. Thoughtful critiques welcome — especially about the principles and the agent/skill separation.
