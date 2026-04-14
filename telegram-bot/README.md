# X-DEEP OS — Telegram Bot

Always-on Telegram harness for X-DEEP OS. Wraps Claude Code with:

- **grammY** — Telegram bot framework
- **Claude tool_use loop** — messages from Telegram feed directly into Claude with full MCP access
- **Whisper** — voice messages are transcribed and treated as text
- **Skills loader** — auto-discovers skills from `.claude/skills/` and exposes them
- **Approval flow** — high-risk actions wait for your `approve #N` / `reject #N` in Telegram
- **Self-healing loop** — bot errors become GitHub Issues → Claude Code Action opens a PR → Telegram approval merges it → Railway redeploys

## Quick start

### 1. Install dependencies
```bash
cd telegram-bot
npm install
```

### 2. Get credentials
- **Telegram bot**: talk to [@BotFather](https://t.me/botfather), run `/newbot`, copy the token
- **Telegram user ID**: talk to [@userinfobot](https://t.me/userinfobot), copy your numeric ID
- **Anthropic API key**: [console.anthropic.com](https://console.anthropic.com)
- **OpenAI API key** (for voice): [platform.openai.com](https://platform.openai.com)
- **GitHub PAT**: [github.com/settings/tokens](https://github.com/settings/tokens) with `repo` + `workflow` scopes
- **Redis**: [upstash.com](https://upstash.com) — free tier is enough

### 3. Configure
```bash
cp .env.example .env
# edit .env and fill in the values
```

### 4. Run locally
```bash
npm run dev
```

Open Telegram, message your bot, and it should respond.

## Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link
railway login
railway link

# Add a Redis plugin (free tier)
railway add  # select Redis

# Set env vars (see .env.example for the full list)
railway variables set TELEGRAM_BOT_TOKEN=...
railway variables set ANTHROPIC_API_KEY=...
# ... etc

# Deploy
railway up
```

The bot runs 24/7 on Railway for ~$5-10/month.

## Architecture

```
Telegram message
    ↓
[index.mjs] — grammY bot entry, auth check (TELEGRAM_USER_ID)
    ↓
[context.mjs] — load conversation history from Redis
    ↓
[skills-loader.mjs] — auto-discover skills from .claude/skills/
    ↓
[agent.mjs] — Claude tool_use loop
    │
    ├── [providers/claude.mjs] — Anthropic SDK wrapper
    ├── [mcp-manager.mjs] — connect to MCP servers (Gmail, Notion, etc.)
    ├── [tools/custom.mjs] — custom tools (run_skill, send_telegram_msg)
    └── [approvals.mjs] — queue high-risk actions for user approval
    ↓
Telegram reply
```

When something breaks:
```
Error in bot
    ↓
[issue-detector.mjs] — detects pattern (keywords OR 3x/24h)
    ↓
[github.mjs] — creates GitHub Issue with label `auto-fix`
    ↓
Claude Code Action (.github/workflows/auto-fix.yml)
    ↓
Opens PR with the fix
    ↓
[pr-notifications.mjs] — Telegram notification with PR summary
    ↓
You reply `approve #N` or `reject #N`
    ↓
Merge → Railway redeploys → [health-check.mjs] verifies
```

## Customization

- **Add a new MCP server**: edit `src/mcp-config.mjs`, add an entry with path to your server
- **Add a custom tool**: edit `src/tools/custom.mjs`
- **Change the system prompt**: edit `src/system-prompt.mjs` (but prefer editing `CLAUDE.md` at the repo root — it's loaded dynamically)
- **Change which skills are intent-restricted**: edit `mcp-manager.mjs` `INTENT_SERVERS`
- **Disable self-healing**: set `GITHUB_TOKEN` empty in `.env`

## Files

| File | Role |
|---|---|
| `index.mjs` | grammY entry, command routing, auth |
| `agent.mjs` | Claude tool_use loop |
| `providers/claude.mjs` | Anthropic SDK wrapper |
| `config.mjs` | env + config loader |
| `context.mjs` | Redis conversation state + git repo sync |
| `skills-loader.mjs` | auto-discover `.claude/skills/` |
| `system-prompt.mjs` | base system prompt (plus CLAUDE.md loaded) |
| `prompts.mjs` | prompts for `/hello`, `/briefing`, audits |
| `approvals.mjs` | approve/reject flow |
| `issue-detector.mjs` | bug pattern detection |
| `github.mjs` | Issues + PR API |
| `pr-notifications.mjs` | Telegram PR summaries |
| `health-check.mjs` | post-deploy verification |
| `mcp-manager.mjs` | connects to MCP servers dynamically |
| `mcp-config.mjs` | MCP server definitions |
| `journal.mjs` | event logging |
| `tools/custom.mjs` | custom tools exposed to Claude |
| `utils.mjs` | helpers |

## Troubleshooting

- **Bot doesn't respond**: check `TELEGRAM_USER_ID` matches your actual ID (auth strict by design)
- **"Redis connection refused"**: start Redis locally (`redis-server`) or set `REDIS_URL` to Upstash
- **Voice messages don't work**: set `OPENAI_API_KEY` or disable voice in Telegram settings
- **MCP tools missing**: run `npm run test-mcp` to list loaded tools; check `MCP_SERVERS_PATH`
- **Approval flow not triggering**: high-risk detection is heuristic — see `approvals.mjs` `detectRisk()`

## License
MIT — see repo root `LICENSE`.
