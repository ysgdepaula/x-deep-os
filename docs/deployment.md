# Deploy X-DEEP OS 24/7

Complete infrastructure guide: from "it runs on my laptop" to "it's in my pocket 24/7 via Telegram."

---

## The full infra

```mermaid
graph TB
    subgraph "You"
        Phone[iPhone / Telegram]
    end

    subgraph "Compute (Railway)"
        Bot[telegram-bot<br/>grammY + Claude tool_use]
        MCP[MCP servers<br/>Gmail, Notion, etc.]
    end

    subgraph "State (Upstash)"
        Redis[(Redis<br/>conversations<br/>approvals queue)]
    end

    subgraph "AI (Anthropic)"
        Claude[Claude API<br/>opus-4-6]
        Whisper[OpenAI Whisper<br/>voice transcription]
    end

    subgraph "Self-healing (GitHub)"
        Actions[GitHub Actions<br/>auto-fix + health check]
        PR[Pull Requests]
    end

    subgraph "External services"
        Gmail[Gmail API]
        Notion[Notion API]
        Bank[Bank API]
    end

    Phone -->|message| Bot
    Bot --> Redis
    Bot --> Claude
    Bot --> Whisper
    Bot --> MCP
    MCP --> Gmail
    MCP --> Notion
    MCP --> Bank

    Bot -->|error| Actions
    Actions -->|creates| PR
    PR -->|notify| Phone
    Phone -->|approve #N| Bot
    Bot -->|merge| Actions
```

---

## Technical choices & alternatives

### Compute — Railway

**Why Railway** :
- `git push`-driven deploy, no devops config
- Clean logs, easy env var management
- Built-in Redis plugin
- ~$5-10/month for a Node.js process

**Alternatives** :
| Option | Pros | Cons |
|---|---|---|
| **Fly.io** | Cheap, multi-region | More config required |
| **Render** | Similar to Railway | Slightly slower cold starts |
| **Google Cloud Run** | Scales to zero when idle | Not great for always-on bots (cold start = missed Telegram messages) |
| **Self-hosted** (Raspberry Pi, home server) | $0 ongoing | You own the uptime problem |
| **Vercel Edge Functions** | Free tier generous | Not built for long-running bots |

**Recommendation** : Railway for the first 6 months. When your bill exceeds $50/month, move to Fly.io.

### State — Upstash Redis

**Why Redis** :
- Conversation state (chat history per user)
- Approval queue (PRs awaiting approve/reject)
- TTL for ephemeral data
- Fast enough that you never think about it

**Why Upstash specifically** :
- Free tier (10k commands/day) is plenty for a solo user
- Serverless, pay-per-request beyond the free tier
- REST + native Redis protocol both supported

**Alternatives** :
| Option | Pros | Cons |
|---|---|---|
| **Railway Redis plugin** | One-click | Pricier than Upstash at scale |
| **Local Redis** (Docker) | Free | You manage it |
| **Postgres** | Unified with other data | Higher latency for simple KV |
| **SQLite + WAL mode** | Zero cost, zero latency | Not distributed, single-writer |
| **Valkey** (Redis fork) | Fully open source | Newer, smaller community |

**Recommendation** : Upstash free tier. It just works.

### AI — Anthropic Claude + OpenAI Whisper

**Why Claude** :
- Tool use reliability (MCP support, function calling)
- 1M context window (you can stuff your entire `.agent/` tree in)
- Sonnet 4.6 for most tasks, Opus 4.6 for complex reasoning

**Why OpenAI Whisper (not Claude)** :
- Claude doesn't have audio input yet
- Whisper is fast, cheap, supports many languages
- Alternatives: Deepgram, AssemblyAI, local whisper.cpp (for privacy)

**Cost** :
- Claude API : variable, typically $10-40/month for solo heavy use (Sonnet)
- Whisper : pennies for voice messages (< $1/month typically)

### Front-end — Telegram

**Why Telegram** :
- Always-on, mobile-first, free
- Voice messages native
- Groups possible (you + your assistant + your co-founder all talking to the bot)
- Bot API is stable and well-documented
- Zero UI to build

**Alternatives** :
| Option | Pros | Cons |
|---|---|---|
| **Slack** | Team-friendly | Slack Workspace needed, bot install friction |
| **Discord** | Good for communities | Less adult-tool vibe |
| **WhatsApp Business API** | Where your customers already are | Expensive, Meta approval needed |
| **iOS Shortcuts + SMS** | Pure native | No group, limited interaction model |
| **Custom web dashboard** | Infinite flexibility | You now have a UI to build and maintain |

**Recommendation** : Telegram. The friction to set up is lower than anything else.

### Self-healing — GitHub Actions + Claude Code Action

**Why** :
- GitHub Actions is already there if your code is on GitHub
- Claude Code Action runs Claude in CI with repo write access
- Bash whitelist keeps it safe
- Max 3 attempts prevents infinite loops

**Alternatives** :
- **Custom webhook** (your own server runs the fixer) — more control, more maintenance
- **Replit Agent** — built-in Replit environment, less integration with your repo
- **No self-healing** — just Telegram notifications for errors, you fix manually

**Recommendation** : Use the provided `.github/workflows/`. It's tested.

---

## Cost breakdown

For a solo user running 24/7 :

| Service | Free tier | Typical monthly |
|---|---|---|
| Railway (compute) | $5 credit | $5-10 |
| Upstash Redis | 10k cmd/day | $0 |
| Anthropic Claude API | — | $10-40 |
| OpenAI Whisper | — | $0-1 |
| Telegram Bot API | Free | $0 |
| GitHub Actions | 2000 min/mo free | $0 |
| Domain (optional) | — | $0-2 |
| **Total** | | **~$15-50/mo** |

Most months sit around **$15/month** once you've tuned your Claude usage. If you go Opus-heavy for every call, it can climb to $50-100. Set budget alerts in the Anthropic console.

---

## Security

### Credentials isolation

Each MCP service stores credentials in `mcp-servers/credentials/<service>/`. This folder is **gitignored**.

For production (Railway), do NOT commit credentials. Instead:
- Store as env vars in Railway UI
- Or use Railway's secret file mount
- The MCP framework reads from env first, then from file

Pattern :
```bash
# Local dev
mcp-servers/credentials/gmail-work/token.json

# Railway (production)
MCP_AUTH_BEARER_TOKEN=... (env var)
```

### Bash whitelist (self-healing)

The auto-fix workflow restricts what Claude Code Action can run :

**ALLOWED** : `git, npm, node, npx, yarn, pnpm, gh, jq, cat, ls, head, tail, grep, find, mkdir, cp, mv, touch, echo, sed, date, pwd, wc`

**FORBIDDEN** : `rm -rf /, sudo, ssh, dd, mkfs, external curl POST/PUT/DELETE, chmod 777, chown, eval of remote content`

If a legitimate fix needs something outside the whitelist, Claude comments on the issue and waits for human. This is intentional.

### Approval gating

HIGH-risk actions (send email, pay, publish, merge PR, acquisition commitment) require explicit approval in Telegram before execution. The `xdeep-validator` agent enforces this — see [`.agent/protocols/validation.md`](../.agent/protocols/validation.md).

### Secrets rotation

- GitHub PAT: rotate every 90 days (GitHub reminds you)
- OAuth tokens: refresh is automatic, but re-authorize annually
- Telegram bot token: rotate via `@BotFather` if you suspect a leak
- Claude API key: rotate quarterly

### Logs and journals

The bot's journal (`.agent/journal/*.jsonl`) contains your messages. It stays on disk — never uploaded anywhere. Gitignored. But:
- On Railway, the disk is managed by Railway
- If you attach a Railway volume, back it up
- If you use an external log aggregator (Datadog, Sentry), review what you send

---

## Setup walk-through

### 1. Bootstrap
```bash
git clone https://github.com/ysgdepaula/x-deep-os.git
cd x-deep-os
./install.sh
```

### 2. Get credentials
- **Telegram bot** — talk to [@BotFather](https://t.me/botfather), `/newbot`, copy token
- **Telegram user ID** — [@userinfobot](https://t.me/userinfobot), copy numeric ID
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com)
- **OpenAI API key** — [platform.openai.com](https://platform.openai.com) (for voice)
- **GitHub PAT** — [github.com/settings/tokens](https://github.com/settings/tokens), scopes: `repo`, `workflow`
- **Upstash Redis** — [upstash.com](https://upstash.com), create a database, copy the connection URL

### 3. Configure bot
```bash
cd telegram-bot
cp .env.example .env
# Edit .env with your credentials
```

Key env vars (see `.env.example` for the full list) :
```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_USER_ID=123456789
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
REDIS_URL=rediss://default:...@...upstash.io:6379
GITHUB_TOKEN=ghp_...
GITHUB_REPO_OWNER=<your-username>
GITHUB_REPO_NAME=x-deep-os
DEEP_NAME=M-DEEP
USER_NAME=Marc Dubois
```

### 4. Test locally
```bash
npm install
npm run dev
```

Open Telegram, message your bot, confirm it responds.

### 5. Deploy to Railway
```bash
npm install -g @railway/cli
railway login
railway init
railway link  # or create a new project

# Add Redis plugin
railway add  # select Redis (or skip, and use Upstash instead)

# Set env vars
railway variables set TELEGRAM_BOT_TOKEN=...
railway variables set ANTHROPIC_API_KEY=...
# ... etc (copy all from .env)

# Deploy
railway up
```

### 6. Enable self-healing
In your GitHub repo → Settings → Secrets and variables → Actions, add :
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_IDS` (same as your TELEGRAM_USER_ID)
- `ANTHROPIC_API_KEY`

The three workflows (`auto-fix.yml`, `ci-quality.yml`, `post-deploy-health.yml`, `pr-notify.yml`) will now trigger automatically.

### 7. Verify
- Send "hello" via Telegram → you should get your morning brief
- Push a commit that breaks the bot intentionally (typo in index.mjs)
- The health check should fail, auto-revert, and send you a Telegram notification

---

## Monitoring

### What to watch

- **Bot uptime** — Telegram's `getMe` endpoint via `post-deploy-health.yml`
- **Claude budget** — Anthropic console, set a monthly alert
- **Failed skills** — review `.agent/journal/*.jsonl` weekly or rely on nightly-audit to surface patterns
- **Approval rate per agent** — `.agent/state.json` tracks this; a dropping rate means demotion soon

### Optional: external monitoring

- [UptimeRobot](https://uptimerobot.com) — free uptime ping
- [Grafana Cloud](https://grafana.com) — logs + metrics if you want them
- [Better Stack](https://betterstack.com) — modern Sentry alternative

For a solo setup, the Telegram notifications from `post-deploy-health.yml` are usually enough.

---

## Scaling considerations

This setup is optimized for **one user with one agent system**. If you :

- **Add more users** (your co-founder, your assistant) → move state keys from Redis `user:*` to `user:<id>:*` and route in the bot. The `TELEGRAM_USER_ID` auth check becomes a whitelist.
- **Add more verticals** (different businesses using the same infra) → one bot per vertical, each with its own `DEEP_NAME` and knowledge base. Use `REDIS_PREFIX` to isolate state.
- **Add sync across users** (team shared knowledge) → split knowledge articles into private vs shared, store shared in a team DB (Notion, Postgres), read via MCP.

None of this is in the box — it's what you add when you outgrow the personal version.

---

## See also

- [`self-healing.md`](self-healing.md) — the auto-fix loop in detail
- [`../telegram-bot/README.md`](../telegram-bot/README.md) — bot-specific install
- [`../mcp-servers/README.md`](../mcp-servers/README.md) — MCP server framework
- [`../telegram-bot/.env.example`](../telegram-bot/.env.example) — all env vars
