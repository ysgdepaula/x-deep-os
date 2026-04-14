# Customize X-DEEP OS to your context

> **Coming in Session 3** — this doc will guide you through adapting the OS to your specific role, industry, and tool stack.

## What's planned here

1. **Adding a new MCP server** — step-by-step guide to wire up Gmail, Notion, Stripe, your internal API, etc.
2. **Creating a new agent** — when to add one, how to write the YAML template, how it integrates with the master
3. **Creating a new skill** — naming rules (verbs, not domains), frontmatter, the scaffold skill
4. **Adapting to a vertical** — concrete walkthrough for: architecture firm, landscaping holding, legal practice, dental practice, consulting firm
5. **Connecting Telegram / Slack / WhatsApp** — harness alternatives
6. **Tuning autonomy levels** — when to promote an agent to level 1/2/3
7. **Swapping Redis** — using Postgres, SQLite, or Upstash

## For now

See the current docs that are ready:
- [architecture-principles.md](architecture-principles.md) — 4 principles (3 layers, skills-are-verbs, context-on-demand, agent delegation)
- [self-healing.md](self-healing.md) — complete self-healing loop (issue → fix → approval → deploy)
- [`CLAUDE.example.md`](../CLAUDE.example.md) — fictional persona "Marc Dubois, CEO Groupe Verdure" showing a filled-out config

And run:
- `./install.sh` — interactive setup
- `node .agent/scripts/validate-all.mjs` — verify your changes don't break the archi
