# Getting Started with X-DEEP OS

From zero to a working agent in 15 minutes.

This guide covers the **local-only** setup. For 24/7 Telegram deployment, continue to [`deployment.md`](deployment.md) after.

---

<details>
<summary><strong>Never used a terminal before? Start here</strong> (click to expand)</summary>

If you've never run commands in a terminal, this 5-minute primer gets you over the hurdle. If you're already comfortable with `cd`, `git clone`, and `npm install`, skip to Prerequisites below.

### What is a "terminal"?

It's a text-only window where you type commands instead of clicking. Every command does one thing: download something, move to a folder, run a program.

### Open the terminal

- **macOS**: press `Cmd+Space`, type `Terminal`, press Enter
- **Linux**: press `Ctrl+Alt+T` (or search "Terminal" in your apps)
- **Windows**: install [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) first (one-time setup, 10 min), then open "Ubuntu" from your Start menu

You'll see a line ending in `$` or `%` — that's the **prompt**. It's where you type.

### The 3 commands you'll use here

| Command | What it does |
|---|---|
| `cd <folder>` | Move into a folder. `cd /tmp` = go to the `/tmp` folder. `cd ..` = go up one level. |
| `git clone <URL>` | Download a project from GitHub. The folder lands in your current location. |
| `./script.sh` | Run a local script named `script.sh`. The `./` means "here, in this folder". |

### Copy-pasting commands

You'll copy commands from this guide into the terminal. On macOS/Linux:
- Select the command with your mouse (or `Cmd/Ctrl+A` inside a code block on GitHub)
- `Cmd+C` to copy, `Cmd+V` (macOS) or `Ctrl+Shift+V` (Linux) to paste into terminal
- Press **Enter** to run

**Do NOT copy the `$` or `%` at the start of the line** — those are just showing the prompt, they're not part of the command.

### Common mistakes

- **Typo in file names** — `.mjs` vs `.msj` looks identical but only `.mjs` works
- **Running from the wrong folder** — always check your prompt shows the folder you expect (e.g. `/tmp/x-deep-os $`)
- **Nothing happens when you press Enter** — some commands produce no output when they succeed. That's normal. Just run the next one.
- **Permission denied on `./install.sh`** — run `chmod +x install.sh` first
- **`command not found: claude`** — Claude Code isn't installed. See "Prerequisites" below.

### If something breaks

Don't panic. Copy the exact error message and:
1. Check you're in the right folder (`pwd` shows your current folder)
2. Check you typed the command exactly (spaces and dots matter)
3. Open an issue on the repo with the error message

You won't "break" your computer by running these commands. The worst that happens is "a folder in `/tmp` exists that you don't want" — and `/tmp` wipes itself when you restart.

</details>

## Prerequisites

- **macOS, Linux, or WSL on Windows** (the bash installer assumes Unix-like)
- **Node.js 20+** — `node --version` to check
- **Git**
- **Claude Code** — [download here](https://claude.ai/download) or via `brew install anthropic/tap/claude`
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com)

That's it. No Telegram, no Redis, no Railway needed for the local-only path.

---

## Step 1 — Clone and install

```bash
git clone https://github.com/ysgdepaula/x-deep-os.git
cd x-deep-os
./install.sh
```

The installer will ask you :

1. **Your name** — e.g. `Marc Dubois`
2. **Your agent's name** — e.g. `M-DEEP` (default: first letter + `-DEEP`). This is the name your agent will use for itself.
3. **Your role** — e.g. `CEO`, `Founder`, `Managing Director`
4. **Company name** — e.g. `Groupe Verdure`
5. **City** — e.g. `Lyon, France`
6. **Languages** — e.g. `French, English`

The installer generates :
- `CLAUDE.md` — your agent's system prompt, with your details filled in
- `.agent/rules.md` — an empty rules file that will grow as your agent learns
- `.agent/state.json` — updated with your agent prefix
- `.agent/templates/*.yaml` — agent templates renamed to match your prefix

All of `CLAUDE.md` and `.agent/rules.md` are **gitignored** — they stay on your machine.

---

## Step 2 — Verify the architecture

```bash
cd .agent/scripts
npm install
node validate-all.mjs
```

You should see :
```
[validate-state] OK
[validate-templates] OK (9 templates)
[validate-skills] OK (15 skills)

[validate-all] All 3 validators passed
```

If anything fails, check the error message — it will point to a specific file and line. If you're stuck, open a GitHub issue.

---

## Step 3 — Configure your Anthropic credentials

Claude Code reads `ANTHROPIC_API_KEY` from your shell environment :

```bash
# Add to ~/.zshrc or ~/.bashrc
export ANTHROPIC_API_KEY="sk-ant-api-..."
```

Reload your shell (`source ~/.zshrc`) or open a new terminal.

---

## Step 4 — Open Claude Code

From the repo root :

```bash
cd /path/to/x-deep-os
claude
```

Claude Code will load your `CLAUDE.md` as the system context.

---

## Step 5 — Say hello

Type :
```
hello
```

Claude Code will detect this as a trigger for the `/hello` skill and run your morning briefing. The first time, the output will be generic — it becomes richer as you connect MCPs, add knowledge, and the agent learns your preferences.

Example first output (truncated) :
```
Bonjour Marc — lundi 14 avril, 09:12.

Status: premier run, pas d'historique encore. Voici le plan pour demarrer:

1. Connecte Gmail et Calendar (edit CLAUDE.md section "Available tools")
2. Ajoute 1-2 contacts cles (memory/contacts/)
3. Lance /scout sur une ressource que tu trouves utile pour tester
4. Reviens demain, on aura deja de la matiere
```

---

## Step 6 — Connect your first MCP

The agent becomes useful when it has access to your data. Start with Gmail or Notion.

### Example: Gmail

1. Follow the Gmail OAuth setup — see [`../mcp-servers/credentials/README.md`](../mcp-servers/credentials/README.md#gmail-oauth-setup-example)
2. Register the MCP in your Claude Code settings :

```json
// ~/.claude/settings.json (or .claude/settings.local.json in this repo)
{
  "mcpServers": {
    "gmail-work": {
      "command": "node",
      "args": [
        "/absolute/path/to/x-deep-os/mcp-servers/core/server.mjs",
        "--service", "gmail"
      ],
      "env": {
        "MCP_CONFIG_DIR": "/absolute/path/to/x-deep-os/mcp-servers",
        "ACCOUNT_NAME": "work"
      }
    }
  }
}
```

3. Restart Claude Code. Test with `search my inbox for yesterday`.

---

## Step 7 — Create your first custom skill

Let's add a skill specific to your context. Example for a CEO: `/weekly-oneoners` that generates 1:1 prep notes for each of your direct reports.

### 7a. Use the scaffolder
```
User: scaffold skill weekly-oneoners

Claude: I'll generate a new skill at .claude/skills/weekly-oneoners/
```

The `/scaffold` skill will :
- Create `.claude/skills/weekly-oneoners/SKILL.md` with proper frontmatter
- Register it in `.agent/state.json`
- Validate

### 7b. Edit the skill to fit your context

Open `.claude/skills/weekly-oneoners/SKILL.md` :

```markdown
---
name: weekly-oneoners
description: Generate 1:1 prep notes for each direct report this week
user_invocable: true
triggers:
  - weekly 1:1s
  - prep oneoners
  - /weekly-oneoners
---

# /weekly-oneoners

Generate prep notes for each scheduled 1:1 this week.

## Steps
1. Read Google Calendar for all events tagged `1:1` in the next 7 days
2. For each report :
   - Last interaction date (Slack, email, Notion doc)
   - Open action items from last 1:1 (Notion page)
   - Known projects / stress points (from recent standups)
3. Produce a structured note per person

## Output format
```
## 1:1 with <Name> — <date>
Last time: <summary>
Open actions: <bullet list>
Their focus right now: <2 lines>
Things to cover: <3 bullets>
```

## Guardrails
- Max 300 words per person
- Never include salary / HR info
```

### 7c. Test it
```
User: prep my weekly 1:1s
```

Claude detects the trigger, runs the skill, produces the notes.

---

## Step 8 — Verify and iterate

After a few days of use :

### Check autonomy stats
```bash
cat .agent/state.json | jq '.agents'
```
Each agent has `stats.total`, `stats.approved`, `stats.rejected`. When an agent consistently hits >90% approval, consider promoting it.

### Read the changelog
```bash
tail -30 .agent/changelog.md
```
See what the agent did overnight (if you set up the nightly-audit trigger).

### Read the rules that emerged
```bash
cat .agent/rules.md
```
Over time, this file accumulates the rules the agent learned from your corrections. It is the single most valuable artifact of the whole system.

---

## What's next

Now that local-only is working, you can :

- **Deploy 24/7** — see [`deployment.md`](deployment.md) to run the bot on Telegram
- **Add more skills** — see [`customize.md`](customize.md) for patterns by vertical
- **Add a sub-agent** — see [`architecture.md#new-agent`](architecture.md#new-agent)
- **Set up self-healing** — see [`self-healing.md`](self-healing.md)

---

## Troubleshooting

### "command not found: claude"
Install Claude Code: `brew install anthropic/tap/claude` (macOS) or download from [claude.ai/download](https://claude.ai/download).

### "validate-all failed"
Read the specific error — it names the file and the field. Most often: YAML syntax error after hand-editing a template, or a new agent added to `state.json` but no matching template file.

### The agent responds but ignores my `CLAUDE.md`
Make sure you're running `claude` from the repo root (where `CLAUDE.md` lives). If you're inside a subfolder, Claude Code won't find it.

### Trigger phrases don't match
Triggers are loose pattern matching, not exact. Try the shorter form (`hello`, not `please run hello`). If it still doesn't work, check `.claude/skills/<skill-name>/SKILL.md` frontmatter for the `triggers:` list.

### MCP tools missing
Restart Claude Code after editing `settings.json`. Check `mcp-servers/<service>/` exists and has a valid `config.json` + `tools.mjs`. Run `node mcp-servers/core/server.mjs --service <name>` manually to see errors.

### Validators pass, but the bot crashes
Run `node telegram-bot/src/index.mjs` directly to see the stack trace. Most common: missing env var. Check `.env` against `.env.example`.

---

## See also

- [`architecture.md`](architecture.md) — how the layers fit together
- [`architecture-principles.md`](architecture-principles.md) — the rules that shape the whole system
- [`customize.md`](customize.md) — adding MCPs, agents, skills
- [`deployment.md`](deployment.md) — 24/7 infra setup
