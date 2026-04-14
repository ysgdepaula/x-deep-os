/**
 * Shared prompts for commands and scheduled tasks.
 * Kept separate so they can be reused across index.mjs and any cron
 * jobs you add later without creating circular imports.
 *
 * These are intentionally generic. Customise them to your assistant's
 * voice + the data sources you've wired up (MCP servers, skills, Notion
 * DBs, etc.). Anything that depends on your specific setup belongs in
 * CLAUDE.md, not here — these prompts just sketch the shape of the
 * interaction.
 */

export const HELLO_PROMPT = `Morning briefing. Execute the following, in order:
1. Get today's date (bash: \`date\`)
2. Read .agent/queue.md and .agent/changelog.md (pending actions from other sessions)
3. Pull the day's calendar (google-calendar MCP, if wired)
4. Pull unread/important emails (gmail MCP, if wired)
5. Any domain-specific sources you've configured (CRM, accounting, task DB, ...)

Format for Telegram (important — no Markdown tables, no ### headers):

**Status line** (emoji + one sentence)

🔔 **WHILE YOU WERE AWAY**
- item 1
- item 2

⚡ **DECISIONS PENDING**
- item 1

📅 **AGENDA**
- time — event
- time — event

📬 **EMAILS**
- *Inbox*: summary

📊 **KEY METRICS** (if relevant)
- item — status — action

⏱ **IN 15 MIN**
1. quick win 1
2. quick win 2

🎯 **FOCUS FOR TODAY**
1-2 sentences max.

Skip empty sections. Use **bold**, *italics*, and emojis. NO tables | col |, NO ## headers, NO --- separators.`;

export const WEEKLY_RESEARCH_PROMPT = `Weekly deep-research scan.

## Step 1 — Fresh scan
Run a handful of web_search queries on topics relevant to the assistant
(the stack you maintain, the industry you're in, the tooling you ship).
Keep it to 2-3 queries per theme.

## Step 2 — Top 3 opportunities
Pick the three most promising findings (impact x feasibility).
Do a follow-up web_search on each to go deeper.

## Step 3 — Plans
For each opportunity, write a mini-plan:
- Context + source + which sub-agent it belongs to
- Numbered tasks (compatible with atomic execution)
- Effort (low/medium/heavy) + impact (low/medium/strong)

## Step 4 — Persist
1. Save the report to .agent/weekly-research-YYYY-MM-DD.md (commit + push)
2. Add the actions to .agent/queue.md with tag [weekly-research]
3. Update .agent/changelog.md

## Rules
- Max 3 opportunities. Quality > quantity.
- Be concrete: "implement Y in Z" not "explore X".
- Plan only — do not implement.
- If nothing worth reporting → minimal "nothing this week" note.`;

export const NIGHTLY_AUDIT_PROMPT = `Nightly audit — produce an actionable report on repo health.

## Step 1 — Read shared state
Read: .agent/state.json, .agent/rules.md, .agent/queue.md, .agent/changelog.md

## Step 2 — Audit
1. Repo structure: orphan files, temp files, TODO/FIXME in code
2. CLAUDE.md: consistency with skills + state.json, stale sections
3. Skills: frontmatter correctness, prompts complete, drift vs. state.json
4. Code: dependencies, ungitignored .env, dead code
5. Git: patterns in the last 30 commits, automations worth adding
6. Plans: unfinished or abandoned
7. Rules: respected in recent commits, recurring error patterns
8. Any domain DBs you've wired (task tracker, CRM, ...) — flag stalled items

## Step 3 — Update
- state.json: added/removed skills, last_updated, version bump
- rules.md: new rules if error patterns detected
- queue.md: proposed actions tagged [nightly-audit]
- changelog.md: new section for today's date

## Step 4 — Report + commit
Save to reports/nightly-audit-YYYY-MM-DD.md:
- Health score [A/B/C/D]
- Quick wins, improvements, larger initiatives
- Detected issues + severity
- New rules + queued actions

Commit: "audit: nightly-audit YYYY-MM-DD — score [X], [N] quick wins"
Push to main.

## Rules
- Do NOT modify anything outside .agent/ and reports/.
- Be factual, concrete, actionable.
- Report must be readable in 2 minutes.
- If actions have been in the queue > 3 days → flag in the report.`;
