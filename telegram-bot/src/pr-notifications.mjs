import { mergePR, addCommentToIssue, addLabel, removeLabel } from "./github.mjs";

// Track pending PR feedback requests: prNumber → { issueNumber, resolve }
const pendingFeedback = new Map();

/**
 * Handle PR-related commands from Telegram messages.
 * Returns true if the message was handled, false otherwise.
 *
 * Supported commands:
 *   approve #123  — merge PR #123
 *   reject #123   — reject PR, ask for feedback
 *   details #123  — show PR link
 */
export async function handlePRCommand(text, bot, chatId) {
  if (typeof text !== "string") return false;
  const msg = text.trim().toLowerCase();

  // Check for pending feedback (user is replying to "what's wrong?")
  if (pendingFeedback.size > 0) {
    // If the message doesn't look like a command, treat it as feedback for the most recent rejection
    if (!msg.startsWith("approve") && !msg.startsWith("reject") && !msg.startsWith("details")) {
      const lastPR = [...pendingFeedback.keys()].pop();
      if (lastPR) {
        return await handleFeedback(lastPR, text, bot, chatId);
      }
    }
  }

  // approve #123
  const approveMatch = msg.match(/^approve\s+#?(\d+)/);
  if (approveMatch) {
    const prNumber = parseInt(approveMatch[1]);
    return await handleApprove(prNumber, bot, chatId);
  }

  // reject #123
  const rejectMatch = msg.match(/^reject\s+#?(\d+)/);
  if (rejectMatch) {
    const prNumber = parseInt(rejectMatch[1]);
    return await handleReject(prNumber, bot, chatId);
  }

  // details #123
  const detailsMatch = msg.match(/^details\s+#?(\d+)/);
  if (detailsMatch) {
    const prNumber = parseInt(detailsMatch[1]);
    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;
    if (owner && repo) {
      await bot.api.sendMessage(chatId, `📄 PR #${prNumber}\nhttps://github.com/${owner}/${repo}/pull/${prNumber}`);
    } else {
      await bot.api.sendMessage(chatId, `📄 PR #${prNumber} (set GITHUB_REPO_OWNER/GITHUB_REPO_NAME to get the link).`);
    }
    return true;
  }

  return false;
}

/**
 * Approve and merge a PR.
 */
async function handleApprove(prNumber, bot, chatId) {
  try {
    await bot.api.sendMessage(chatId, `⏳ Merging PR #${prNumber}...`);
    await mergePR(prNumber);
    await bot.api.sendMessage(chatId, `✅ PR #${prNumber} merged. Your deploy target will pick it up automatically.`);
    console.log(`[PR] Approved and merged PR #${prNumber}`);
    return true;
  } catch (err) {
    await bot.api.sendMessage(chatId, `❌ Merge error on PR #${prNumber}: ${err.message.substring(0, 200)}`);
    console.error(`[PR] Merge error: ${err.message}`);
    return true;
  }
}

/**
 * Reject a PR — ask for feedback, then re-trigger fix loop.
 */
async function handleReject(prNumber, bot, chatId) {
  await bot.api.sendMessage(chatId,
    `❌ PR #${prNumber} rejected.\n\nWhat's wrong? Describe the issue and I'll relaunch the fix.`
  );

  // Store pending feedback request
  pendingFeedback.set(prNumber, { ts: Date.now() });

  // Auto-clear after 10 minutes
  setTimeout(() => pendingFeedback.delete(prNumber), 10 * 60 * 1000);

  console.log(`[PR] Rejected PR #${prNumber}, waiting for feedback`);
  return true;
}

/**
 * Handle user feedback after a rejection.
 * Adds feedback as comment on the linked issue and re-triggers the fix workflow.
 */
async function handleFeedback(prNumber, feedback, bot, chatId) {
  pendingFeedback.delete(prNumber);

  try {
    // Add feedback as comment on the issue (assume issue number = PR number for simplicity,
    // or extract from PR body — for now we comment on the PR itself)
    await addCommentToIssue(prNumber, `## Feedback from user (rejection)\n\n${feedback}\n\nPlease retry the fix with this feedback.`);

    // Re-add auto-fix label to re-trigger the workflow
    // First remove it (GitHub Actions only triggers on label added, not if already present)
    await removeLabel(prNumber, "auto-fix");
    // Small delay to ensure the event is distinct
    await new Promise(r => setTimeout(r, 2000));
    await addLabel(prNumber, "auto-fix");

    await bot.api.sendMessage(chatId,
      `🔄 Feedback sent on #${prNumber}. The fix agent will retry with your input.`
    );
    console.log(`[PR] Feedback added to #${prNumber}, re-triggering fix`);
  } catch (err) {
    await bot.api.sendMessage(chatId,
      `⚠️ Feedback captured but GitHub error: ${err.message.substring(0, 200)}`
    );
    console.error(`[PR] Feedback error: ${err.message}`);
  }

  return true;
}
