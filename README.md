# X-DEEP OS

> Personal AI OS for CEOs of service businesses.
> Multi-agent coordination, knowledge compilation, self-healing loops, runnable 24/7 on Telegram.

---

## The problem

You run a service business. Architecture firm. Landscaping holding. Consulting practice. Dental clinic. You have 15, 40, maybe 100 people. You are the bottleneck.

Every tender, quote, hire, escalation, acquisition, banking conversation passes through your head. Your team can execute — but they can't *decide* without you. So you spend your week being a decision router, not a strategist.

You tried hiring a COO. Too expensive too early. You tried an assistant. They handle calendar, not judgment. You tried ChatGPT. It answers questions; it doesn't anticipate, remember, follow up, or arbitrate.

## The insight

Most AI tools automate **tasks** (send this email, book this meeting). What you actually need is to externalize **cognition**: the context, the preferences, the rules of thumb, the accumulated history of your company, the way you decide.

X-DEEP OS is what happens when you take that idea seriously and build for it.

It's not a SaaS. It's a framework you install — a Claude Code setup with three discrete layers:

1. **Knowledge** — what's true in your domain (your ICP, your pricing rules, your suppliers, your team's strengths). Compiled, versioned, queried.
2. **Agents** — who they are and what they own (a sales agent, a finance agent, a research agent). Identities with constraints and autonomy levels that grow with trust.
3. **Skills** — the specific tasks they can perform (review the pipeline, prep a call, chase an invoice). Verbs, not domains.

Three layers. One changelog. One shared state. One master agent that orchestrates.

## The X is a variable

The framework is X-DEEP. The **X** stands for your first letter. You install it, pick your prefix, and it becomes yours.

- Yan (the author) runs **Y-DEEP**
- Marc (fictional CEO Groupe Verdure, in the example persona) runs **M-DEEP**
- Alex might run **A-DEEP** or **ALX-DEEP**

## What you actually get

After `./install.sh`:

**Morning brief** — `hello` in Claude Code (or Telegram) returns your day: calendar, unread emails across accounts, pipeline moves overnight, open tasks, decisions pending. Not a dashboard — a peer in your ear.

**Pipeline steering** — `/review-pipeline`, `/prep-call`, `/draft-followup`. The sales agent knows your ICP, your voice, your rules. It drafts; you approve.

**Cash & finance** — `/weekly-cash-review`, `/chase-invoice`. The finance agent watches all accounts, flags anomalies, drafts follow-ups with your accountant.

**Research on demand** — `/scout <link>`. Share an article, a tweet, a repo. It audits against your existing knowledge and returns: NEW, ALREADY_DONE, CONTRADICTS, or IMPROVEMENT with 1-3 concrete proposals.

**Ops-level intelligence** — Running nightly, `/nightly-audit` scans your codebase, your queue, your journal. Detects drift, proposes refactors, updates rules. `/weekly-digest` synthesizes the week every Sunday.

**Self-healing** — When something breaks, the bot creates a GitHub issue → Claude Code Action opens a PR → you approve or reject in Telegram → it deploys. Max 3 tries then a human ping. See [`docs/self-healing.md`](docs/self-healing.md) for the full flow.

**Always on** — All of this runs 24/7 on Railway with Telegram as the interface. Voice messages transcribed. Approvals via `approve #N`. ~$15/month.

## Who this is for

- **CEOs of service businesses** (10-200 people) who are the cognitive bottleneck of their org
- **Solo founders** before their first COO hire
- **Technical enough** to run `git clone` and edit a YAML file — doesn't mean you code for a living
- **Privacy-aware** — your knowledge, contacts, and credentials stay in your infra, never in a SaaS you don't control

## Who this is NOT for

- You want a product with support and an SLA — this is a personal setup, not a product
- You need a team collaboration tool — this is a single-user agent
- You want plug-and-play UI — you'll edit markdown and YAML files
- You need regulated compliance (HIPAA, SOC 2, etc.) out of the box — adapt at your own risk

## Quick start

```bash
git clone https://github.com/ysgdepaula/x-deep-os.git
cd x-deep-os

# Interactive setup — asks your name, role, company, city, agent prefix
./install.sh

# Verify the architecture
cd .agent/scripts && npm install
node validate-all.mjs
# → All 3 validators passed

# Open Claude Code and say "hello"
cd ..
claude
```

The installer generates your personalized `CLAUDE.md` and renames the agent templates to match your prefix. Your `CLAUDE.md` and any credentials you add are gitignored — they stay local.

For a 24/7 Telegram setup: [`telegram-bot/README.md`](telegram-bot/README.md).

## Architecture principles

Before customizing, read [`docs/architecture-principles.md`](docs/architecture-principles.md). Four rules that shape everything:

1. **Three layers** — knowledge / agents / skills are separate, not mixed
2. **Skills are verbs, agents are nouns** — `/scaffold`, not `/engineering`
3. **Skills load context on demand** — they reference knowledge, they don't embed it
4. **Agents delegate** — the master orchestrates, sub-agents execute

These four principles are the single most opinionated part of the system. Everything else follows.

## What's inside

```
x-deep-os/
├── README.md              ← you are here
├── install.sh             ← interactive setup
├── CLAUDE.template.md     ← your agent's system prompt, templated
├── CLAUDE.example.md      ← fictional persona: Marc Dubois, CEO Groupe Verdure
├── .agent/                ← coordination layer (schemas, protocols, 9 agent templates)
├── .claude/skills/        ← 15 verb-named skills (scaffold, scout, weekly-digest, ...)
├── telegram-bot/          ← 18-file grammY + Claude + Whisper harness (optional)
├── mcp-servers/           ← modular MCP factory (gmail, example-service, scaffolder)
├── .github/workflows/     ← self-healing CI (auto-fix, ci-quality, post-deploy-health)
└── docs/
    ├── architecture-principles.md   ← start here
    ├── architecture.md              ← 3 layers deep dive
    ├── getting-started.md           ← install walkthrough
    ├── customize.md                 ← adapt to your context
    ├── deployment.md                ← 24/7 infra
    └── self-healing.md              ← the auto-fix loop
```

## Influences

X-DEEP OS stands on:

- **[Andrej Karpathy — "Software 2.0" and "LLM OS"](https://karpathy.bearblog.dev/the-openai-way/)** — the idea that an LLM + tools is a new substrate for software. X-DEEP applies this to the cognitive work of a CEO.
- **[Anthropic — "Building effective agents" (Dec 2024)](https://www.anthropic.com/engineering/building-effective-agents)** — the orchestrator/worker pattern, the argument for starting simple. X-DEEP's master + sub-agents structure is a direct application.
- **Cognition AI — "Don't build multi-agents" (2025)** — the warning that parallel agents lose context and drift. X-DEEP addresses this with a shared changelog and shared state so all sessions read from the same source of truth.
- **[Model Context Protocol (MCP)](https://modelcontextprotocol.io)** — the shared tool pool across agents.
- **[Claude Agent SDK](https://docs.anthropic.com/claude/docs/claude-code)** — the tool-use loop underlying the Telegram harness.

Full citations in [`docs/architecture-principles.md`](docs/architecture-principles.md#design-influences).

## Status

**Snapshot 2026-04-14.** This is a working personal setup that its author uses every day. It's not a maintained open-source product — if you fork and customize, you own the fork. I'll read issues and PRs, but response times are whenever-I-have-time.

## License

MIT. See [`LICENSE`](LICENSE).

## Questions, critique

Open a GitHub issue or DM [@ysgdepaula](https://github.com/ysgdepaula). Thoughtful critiques are the whole point — especially on the agent/skill separation and the principles doc. If you run a service business and this resonates, I want to hear it.
