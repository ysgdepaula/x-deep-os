# Security

**Honest posture** : X-DEEP OS is a personal setup released as open source. It is **not** audited, certified, or production-hardened for enterprise use. Read this before installing, and take the precautions below.

If you need audited, managed, SOC 2 / RGPD-compliant, team-scale deployment — that's what [Teïa](https://teiasolutions.co) sells. X-DEEP OS is the DIY cousin.

---

## Supply chain — what you're actually installing

The repo has **three `package.json`** files and pins every dependency version via `package-lock.json`. Here's every direct dependency and its publisher :

### `.agent/scripts/` — validators
| Package | Publisher | Why |
|---|---|---|
| `yaml` | eemeli (100M+ downloads/week, widely used) | YAML parser for agent templates |

### `telegram-bot/` — Telegram harness
| Package | Publisher | Why |
|---|---|---|
| `@anthropic-ai/sdk` | Anthropic (official) | Claude API client |
| `@modelcontextprotocol/sdk` | Anthropic (official) | MCP protocol |
| `grammy` | Telegram community project | Bot framework |
| `openai` | OpenAI (official) | Whisper voice transcription |
| `dotenv` | motdotla (100M+ downloads/week) | Load `.env` files |

### `mcp-servers/` — MCP service factory
| Package | Publisher | Why |
|---|---|---|
| `@modelcontextprotocol/sdk` | Anthropic (official) | MCP protocol |
| `@notionhq/client` | Notion (official) | Notion API |
| `googleapis`, `google-auth-library` | Google (official) | Gmail / Calendar APIs |
| `zod` | colinhacks (60M+ downloads/week) | Schema validation |

**No typosquatting, no obscure packages, no postinstall scripts.** Everything comes from first-party publishers or packages with massive adoption and maintenance.

---

## Verify before you install

Before running `npm install` anywhere in this repo, you can :

```bash
# From any directory with a package.json
npm audit

# For a deeper scan (malicious-package detection)
npx @socket/audit
# or visit https://socket.dev and paste the repo URL

# Inspect the actual files that will be pulled
cat package-lock.json | jq '.packages | keys' | less
```

`npm audit` uses the GitHub advisory database. [Socket.dev](https://socket.dev) specifically catches malicious behavior that `npm audit` misses (typosquatting, install-time exfiltration, supply-chain compromises).

Repo-wide auditability :
```bash
# Count total source lines — the whole repo is human-readable in an afternoon
find .agent .claude/skills telegram-bot/src mcp-servers -type f \
  \( -name "*.mjs" -o -name "*.md" -o -name "*.yaml" -o -name "*.json" -o -name "*.sh" \) \
  ! -path "*/node_modules/*" \
  | xargs wc -l | tail -1
# → ~6000 lines total (bot + MCP + skills + agents + docs)
```

---

## Automated security on the repo itself

This repository has :

- **Dependabot alerts enabled** — GitHub notifies on newly disclosed CVEs for pinned deps
- **Dependabot auto-PRs** — weekly PRs to bump outdated dependencies
- **CI validation** (`.github/workflows/ci-quality.yml`) — every PR runs `validate-all.mjs` + lint + syntax check
- **Bash whitelist** in `auto-fix.yml` — restricts what the auto-fix agent can execute

No paid scanner (Snyk, Socket CLI) is integrated at this snapshot. If you fork for production, add one.

---

## What's explicitly NOT done

Be realistic about the limits of a one-person open-source snapshot :

- ❌ **No third-party security audit** (not SOC 2, not ISO, no penetration test)
- ❌ **No SBOM** (Software Bill of Materials) generated formally
- ❌ **No signed releases** (tags are not GPG-signed — considering it for v2)
- ❌ **No runtime sandboxing** for tool calls (trust the Anthropic tool-use layer; add your own container for higher-risk deployments)
- ❌ **No secrets scanning** in git history (run `trufflehog git file://.` yourself if you fork)

---

## Your responsibility as an installer

If you clone, install, and run this :

1. **Read the code before piping it into bash.** Especially `install.sh` — open it in an editor first.
2. **Use scoped credentials.** The bot needs a Telegram bot token, an Anthropic key, and OAuth for MCPs. Rotate them if exposed.
3. **Run locally first.** Don't deploy to Railway before you've confirmed the bot behaves as expected on your laptop.
4. **Pin your Node version.** Use `.nvmrc` or Volta. Avoid auto-updating dependencies in production without review.
5. **Isolate credentials.** The `credentials/` folder is gitignored, but verify with `git status` before every commit.

---

## Reporting a vulnerability

If you find a security issue in **this repository** (not in an upstream dep) :

- **Do not open a public issue.**
- Email : [`security@teiasolutions.co`](mailto:security@teiasolutions.co) (responsible disclosure)
- Expected response : 72 hours for acknowledgment, best effort on fix (this is a personal project, not a maintained product)

For vulnerabilities in upstream dependencies, report to the respective publishers (Anthropic, OpenAI, Google, etc.).

---

## If you need enterprise-grade

The whole point of making this distinction explicit : X-DEEP OS is the **DIY, self-hosted, no-SLA** version. For an audited, managed, compliance-ready deployment :

- **SOC 2 / ISO 27001** needs
- **RGPD** data residency requirements
- **Single-sign-on**, audit logs, role-based access
- **Managed deployment**, support, SLAs
- **Custom integrations** with your existing stack

→ [Teïa](https://teiasolutions.co) sells the enterprise harness. That's the open-core dichotomy.
