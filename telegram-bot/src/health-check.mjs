import { mcpManager } from "./mcp-manager.mjs";
import { loadRecentSummaries } from "./journal.mjs";
import { closeIssue, getOpenIssues } from "./github.mjs";

// Track the last known git commit to detect deploys
let lastKnownCommit = null;

/**
 * Run a health check on the bot. Returns a report object.
 * Called after detecting a new deploy (git commit changed).
 */
export async function runHealthCheck() {
  const checks = [];

  // 1. MCP connections
  try {
    const tools = mcpManager.getAnthropicTools();
    const mcpOk = tools.length > 0;
    checks.push({ name: "MCP servers", ok: mcpOk, detail: `${tools.length} tools` });
  } catch {
    checks.push({ name: "MCP servers", ok: false, detail: "unreachable" });
  }

  // 2. Journal is writable
  try {
    const summaries = loadRecentSummaries(1, 1);
    checks.push({ name: "Journal", ok: true, detail: summaries ? "has entries" : "empty (normal if fresh deploy)" });
  } catch {
    checks.push({ name: "Journal", ok: false, detail: "read failed" });
  }

  // 3. Context files accessible
  try {
    const { loadContext } = await import("./context.mjs");
    const ctx = await loadContext();
    const rulesOk = (ctx.rules || "").length > 50;
    checks.push({ name: "Context (rules.md)", ok: rulesOk, detail: rulesOk ? "loaded" : "empty or missing" });
  } catch {
    checks.push({ name: "Context", ok: false, detail: "load failed" });
  }

  const allOk = checks.every(c => c.ok);
  return { allOk, checks };
}

/**
 * Check if a new deploy happened (git commit changed).
 * If so, run health check and notify via Telegram.
 */
export async function checkForDeploy(bot, chatId) {
  try {
    const { execSync } = await import("child_process");
    const { resolve, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const REPO_ROOT = process.env.REPO_PATH || resolve(__dirname, "../..");

    const currentCommit = execSync("git rev-parse HEAD", {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 5000,
    }).trim();

    if (lastKnownCommit === null) {
      lastKnownCommit = currentCommit;
      return; // First check, just store
    }

    if (currentCommit !== lastKnownCommit) {
      lastKnownCommit = currentCommit;
      console.log(`[HEALTH] New deploy detected: ${currentCommit.substring(0, 8)}`);

      // Wait 30s for services to stabilize
      await new Promise(r => setTimeout(r, 30000));

      const report = await runHealthCheck();

      if (report.allOk) {
        console.log("[HEALTH] All checks passed");

        // Try to close any open auto-fix issues that might be resolved
        await tryCloseResolvedIssues(bot, chatId);

        await bot.api.sendMessage(chatId,
          `✅ Deploy verified (${currentCommit.substring(0, 8)})\n` +
          report.checks.map(c => `${c.ok ? "✅" : "❌"} ${c.name}: ${c.detail}`).join("\n")
        );
      } else {
        console.warn("[HEALTH] Some checks failed");
        await bot.api.sendMessage(chatId,
          `⚠️ Deploy with problems (${currentCommit.substring(0, 8)})\n` +
          report.checks.map(c => `${c.ok ? "✅" : "❌"} ${c.name}: ${c.detail}`).join("\n")
        );
      }
    }
  } catch (err) {
    // Git not available (first deploy before clone) — skip silently
    if (!err.message?.includes("not a git repository")) {
      console.error(`[HEALTH] Check error: ${err.message}`);
    }
  }
}

/**
 * Try to close auto-fix issues if the deploy looks healthy.
 */
async function tryCloseResolvedIssues(bot, chatId) {
  try {
    const issues = await getOpenIssues("auto-fix");
    if (!issues || issues.length === 0) return;

    for (const issue of issues) {
      // Only close if the issue is older than 10 minutes (give time for verification)
      const age = Date.now() - new Date(issue.created_at).getTime();
      if (age > 10 * 60 * 1000) {
        await closeIssue(issue.number);
        await bot.api.sendMessage(chatId,
          `🎉 Issue #${issue.number} auto-closed (deploy healthy)`
        );
        console.log(`[HEALTH] Closed resolved issue #${issue.number}`);
      }
    }
  } catch (err) {
    console.error(`[HEALTH] Failed to close issues: ${err.message}`);
  }
}
