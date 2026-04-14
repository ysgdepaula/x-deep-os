# Self-Healing Loop

When something breaks in your X-DEEP OS deployment, the system **attempts to fix itself** before bothering you. You stay in the loop but only get pinged when a decision is needed.

## The 7-step flow

```
1. Something breaks
       ↓
2. [telegram-bot/src/issue-detector.mjs] detects the pattern
       ↓
3. [telegram-bot/src/github.mjs] creates a GitHub Issue with label `auto-fix`
       ↓
4. [.github/workflows/auto-fix.yml] runs Claude Code Action on the issue
       ↓
5. Claude reads the code, fixes the bug, opens a Pull Request
       ↓
6. [.github/workflows/pr-notify.yml] sends you a Telegram notification
       ↓
7. You reply `approve #N` or `reject #N` in Telegram
       ↓
   approve → [telegram-bot/src/approvals.mjs] merges → Railway deploys
   reject  → comment added to issue → Claude tries again (max 3 attempts)
       ↓
8. [.github/workflows/post-deploy-health.yml] verifies the bot is still alive
   if fail → auto-revert to previous commit + escalation Telegram notification
```

## Diagram

```
┌─────────────┐   error   ┌──────────────────┐
│ Bot runtime │──────────▶│ issue-detector  │
└─────────────┘           └────────┬─────────┘
                                   │ creates
                                   ▼
                          ┌────────────────────┐
                          │ GitHub Issue      │
                          │ label: auto-fix   │
                          └────────┬───────────┘
                                   │ triggers
                                   ▼
                          ┌────────────────────┐
                          │ auto-fix.yml      │
                          │ + Claude Code Action │
                          └────────┬───────────┘
                                   │ opens PR
                                   ▼
                          ┌────────────────────┐            ┌──────────────┐
                          │ Pull Request      │──notifies──▶│ Telegram    │
                          └────────┬───────────┘            │ (you)       │
                                   │                         └──────┬───────┘
                                   │                                │
                                   │         approve #N             │
                                   │ ◀──────────────────────────────┘
                                   │
                                   ▼
                          ┌────────────────────┐
                          │ Merge to main     │
                          └────────┬───────────┘
                                   │ triggers deploy
                                   ▼
                          ┌────────────────────┐    fail    ┌───────────────┐
                          │ Railway redeploy  │───────────▶│ auto-revert  │
                          └────────┬───────────┘            └───────────────┘
                                   │ ok
                                   ▼
                          ┌────────────────────┐
                          │ post-deploy-health│
                          │ : bot alive ?     │
                          └────────────────────┘
```

## Why this matters

Most CEO-agent systems pick one of two failure modes:
- **Wake you up for everything** — your phone never stops buzzing
- **Hide everything** — you find out three days later your agent has been silently broken

The self-healing loop splits the middle:
- **Silent on easy bugs** — Claude fixes transient issues (type error, missing env var, API timeout) without pinging you
- **Loud when decisions are needed** — you only see PR notifications that need your `approve/reject`
- **Safe under failure** — if a fix breaks production, auto-revert brings it back instantly and surfaces an issue for human review

## The components

### Issue detection — `telegram-bot/src/issue-detector.mjs`

Triggers a GitHub Issue when:
- Error keyword pattern (`error`, `exception`, `failed`, etc.) appears in journal 3+ times in 24h
- The bot crashes on startup
- A tool call fails repeatedly with the same error

The detector extracts the stack trace, the recent user message, and the conversation context, then opens an issue pre-populated with all of it. Claude Code Action doesn't have to go hunting.

### GitHub integration — `telegram-bot/src/github.mjs`

Wraps Octokit. Creates issues with the right label, looks up PR status, adds comments on rejection. Requires `GITHUB_TOKEN` with `repo` scope.

### Auto-fix workflow — `.github/workflows/auto-fix.yml`

Runs on `issues.labeled` events. Key safety rails:
- **Bash whitelist** — only allowed commands: `git, npm, node, npx, yarn, pnpm, gh, jq, cat, ls, head, tail, grep, find, mkdir, cp, mv, touch, echo, sed, date, pwd, wc`
- **Forbidden** — `rm -rf /, sudo, ssh, dd, mkfs, external curl POST/PUT/DELETE, chmod 777, chown, eval remote`
- **Max 3 attempts** — after 3 rejected fixes, the label flips to `needs-human` and you get a Telegram ping
- **File limit by label** — `auto-fix` = 3 files max, `enhancement` = 10, `blueprint` = 20 (enforced by `ci-quality.yml`)
- **Validators mandatory** — if `.agent/` is touched, `node .agent/scripts/validate-all.mjs` must pass before commit

### PR notification — `.github/workflows/pr-notify.yml`

Sends the PR title, summary, file count, and URL to Telegram. You see everything you need to decide without opening GitHub.

### Approval handler — `telegram-bot/src/approvals.mjs`

Parses `approve #N` or `reject #N <feedback>` messages. On `approve`, merges via `github.mjs`. On `reject`, posts the feedback as a comment on the issue and re-labels with `auto-fix` — Claude tries again, reading the rejection feedback in its next attempt.

### Post-deploy health — `.github/workflows/post-deploy-health.yml`

Waits 90s for Railway to redeploy, then calls `getMe` on the Telegram bot to verify it's alive.
- **On success** — sends "Deploy OK" to Telegram
- **On failure** — auto-revert the last commit (creates a revert commit, pushes to main, Railway redeploys the previous version), opens an auto-fix issue, Telegram notification

## Setup

### 1. GitHub repo secrets
In your repo → Settings → Secrets → Actions, add:
- `TELEGRAM_BOT_TOKEN` — your bot token
- `TELEGRAM_CHAT_IDS` — comma-separated list of Telegram user IDs to notify
- `ANTHROPIC_API_KEY` — for Claude Code Action
- `GITHUB_TOKEN` — already provided by GitHub, but verify Actions have write access

### 2. Claude Code Action
The workflow uses `anthropics/claude-code-action@v1`. It runs automatically — no installation needed beyond the secrets above. See the [Claude Code Action docs](https://docs.anthropic.com/claude/docs/claude-code-action) for version updates.

### 3. Railway webhook (optional)
For the post-deploy health check to time correctly, you can configure a Railway webhook that triggers the workflow on deploy complete rather than the 90s `sleep` fallback. See `docs/deployment.md` for the full setup.

## Limits and known gotchas

- **Claude can't fix everything** — complex logic bugs, architectural issues, anything requiring product knowledge will be escalated after 3 tries
- **Auto-revert requires a previous commit** — if the failing commit is the first one on main, rollback fails and you get the manual-intervention issue
- **Bash whitelist is strict** — if a legitimate fix needs a non-whitelisted command, Claude comments on the issue and waits for human. This is intentional.
- **File limit is global** — a blueprint PR touching many files across the repo can exceed the cap even if individual directories are fine. Split into smaller PRs.

## Disable self-healing

If you want to opt out:
- **Fully disable** — delete the three workflow files
- **Disable only auto-fix** — remove `auto-fix.yml`, keep `ci-quality` and `post-deploy-health`
- **Disable Telegram notifications** — remove the `pr-notify.yml` workflow, issues and PRs still work silently

See `.github/workflows/` for the actual files.
