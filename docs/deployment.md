# Deploy X-DEEP OS 24/7

> **Coming in Session 3** — this doc will cover the full deployment path: Railway + Upstash Redis + Telegram + GitHub Actions + monitoring, with cost breakdown and alternatives.

## What's planned here

1. **Full infra diagram** — iPhone → Telegram → Railway → Redis → Claude → MCPs → GitHub Actions
2. **Railway setup** — `railway up`, env var configuration, Redis plugin, custom domain
3. **Alternatives to Railway** — Fly.io, Render, Cloud Run, self-hosted (pros/cons)
4. **Redis setup** — Upstash (free tier), local Redis for dev, Postgres as alternative
5. **Cost breakdown** — ~$15/month for a personal OS running 24/7 (Railway + Claude API)
6. **Monitoring** — logs, health checks, alert routing
7. **Security** — credential isolation pattern, bash whitelist, approval gating, backups

## For now

- See [`telegram-bot/README.md`](../telegram-bot/README.md) for basic Railway deployment
- See [`self-healing.md`](self-healing.md) for the post-deploy health check + auto-rollback
- See [`telegram-bot/.env.example`](../telegram-bot/.env.example) for all the env vars you need to set
- See [`mcp-servers/README.md`](../mcp-servers/README.md) for MCP server deployment patterns
