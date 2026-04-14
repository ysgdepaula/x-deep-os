import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createIssue, getOpenIssues } from "./github.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.REPO_PATH || resolve(__dirname, "../..");
const JOURNAL_DIR = resolve(REPO_ROOT, ".agent/journal");

// Keywords that indicate a bug report (EN + FR)
const BUG_KEYWORDS = /\b(broken|bug|error|crash|fail|fails|failing|not working|doesn'?t work|stuck|impossible|no response|marche pas|fonctionne pas|erreur|bloque|plante|echoue|probleme)\b/i;

// Track recent errors to detect patterns (in-memory, resets on restart)
const errorLog = [];
const MAX_ERROR_LOG = 100;

/**
 * Analyze a journal entry to determine if it represents a bug worth filing.
 * Returns { isBug, severity, title, body } or { isBug: false }.
 */
export async function detectIssue(entry) {
  // Track all corrections and errors
  if (entry.type === "correction" || BUG_KEYWORDS.test(entry.input || "")) {
    errorLog.push({ ts: entry.ts, summary: entry.summary, input: entry.input });
    if (errorLog.length > MAX_ERROR_LOG) errorLog.shift();
  }

  // Rule 1: Explicit bug report from user (correction + bug keywords)
  const inputText = (entry.input || "").toLowerCase();
  const isBugReport = entry.type === "correction" && BUG_KEYWORDS.test(inputText);

  // Rule 2: Same error pattern 3+ times in 24h
  const now = Date.now();
  const recentErrors = errorLog.filter(e => now - new Date(e.ts).getTime() < 86400000);
  const patternCount = countSimilarErrors(entry.summary, recentErrors);
  const isRecurring = patternCount >= 3;

  if (!isBugReport && !isRecurring) {
    return { isBug: false };
  }

  // Check for duplicates before creating
  const isDuplicate = await checkDuplicate(entry.summary);
  if (isDuplicate) {
    console.log(`[ISSUE] Duplicate detected, skipping: ${entry.summary}`);
    return { isBug: false };
  }

  // Determine severity
  const severity = isRecurring ? "high" : "medium";

  // Build structured issue
  const title = `[auto-fix] ${entry.summary.substring(0, 80)}`;
  const body = buildIssueBody(entry, severity, patternCount);

  return { isBug: true, severity, title, body };
}

/**
 * Push a detected issue to GitHub.
 */
export async function pushIssueToGitHub(title, body) {
  try {
    const issue = await createIssue(title, body, ["auto-fix"]);
    if (issue) {
      console.log(`[ISSUE] Created: #${issue.number} — ${title}`);
      return issue;
    }
  } catch (err) {
    console.error(`[ISSUE] Failed to create GitHub issue: ${err.message}`);
  }
  return null;
}

/**
 * Count similar errors in recent log (fuzzy match on summary keywords).
 */
function countSimilarErrors(summary, recentErrors) {
  if (!summary) return 0;
  const words = summary.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return 0;

  return recentErrors.filter(e => {
    const eSummary = (e.summary || "").toLowerCase();
    // At least 50% of keywords match
    const matches = words.filter(w => eSummary.includes(w)).length;
    return matches >= words.length * 0.5;
  }).length;
}

/**
 * Check if a similar issue is already open on GitHub.
 */
async function checkDuplicate(summary) {
  try {
    const openIssues = await getOpenIssues("auto-fix");
    if (!openIssues || !Array.isArray(openIssues)) return false;

    const summaryLower = (summary || "").toLowerCase();
    return openIssues.some(issue => {
      const titleLower = (issue.title || "").toLowerCase();
      const words = summaryLower.split(/\s+/).filter(w => w.length > 3);
      const matches = words.filter(w => titleLower.includes(w)).length;
      return matches >= words.length * 0.5;
    });
  } catch {
    return false; // Don't block on API errors
  }
}

/**
 * Build a structured issue body with all context for the fix agent
 * (e.g. Claude Code Action in GitHub Actions).
 */
function buildIssueBody(entry, severity, patternCount) {
  const recentJournal = loadRecentJournalContext();
  const botSrcPath = process.env.BOT_SRC_PATH || "telegram-bot/src/";
  const entryFile = process.env.BOT_ENTRY_FILE || "src/index.mjs";

  return `## Bug Report (auto-detected)

**Severity**: ${severity}
**Detected via**: ${patternCount >= 3 ? `recurring pattern (${patternCount}x in 24h)` : "user feedback"}
**Channel**: ${entry.channel}
**Intent**: ${entry.intent}

## Symptom
${entry.summary}

## User Message
> ${(entry.input || "").substring(0, 500)}

## Bot Response
> ${(entry.output || "").substring(0, 300)}

## Recent Context (journal entries)
${recentJournal}

## Instructions for Fix Agent
1. Read CLAUDE.md and .agent/rules.md for project context
2. The bot code is in ${botSrcPath}
3. Focus on the symptom described above
4. Max 3 files changed
5. Smoke-test by importing the changed module(s), e.g. \`node -e "import('./src/<file>.mjs')"\`
6. Bot entry point: ${entryFile}
`;
}

/**
 * Load last 5 relevant journal entries for context.
 */
function loadRecentJournalContext() {
  try {
    const date = new Date().toISOString().split("T")[0];
    const filePath = resolve(JOURNAL_DIR, `${date}.jsonl`);
    if (!existsSync(filePath)) return "(no journal entries today)";

    const lines = readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
    const recent = lines.slice(-5).map(line => {
      try {
        const e = JSON.parse(line);
        return `- [${e.type}] ${e.summary}`;
      } catch { return null; }
    }).filter(Boolean);

    return recent.join("\n") || "(no entries)";
  } catch {
    return "(journal not available)";
  }
}
