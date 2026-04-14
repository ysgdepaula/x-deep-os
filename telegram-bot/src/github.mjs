/**
 * GitHub API helper — create issues, manage PRs, add comments.
 * Uses GITHUB_TOKEN env var for authentication.
 * Configure with GITHUB_REPO_OWNER and GITHUB_REPO_NAME env vars.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const REPO_NAME = process.env.GITHUB_REPO_NAME;

const API_BASE = REPO_OWNER && REPO_NAME
  ? `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`
  : null;

async function ghFetch(path, options = {}) {
  if (!GITHUB_TOKEN) {
    console.warn("[GITHUB] No GITHUB_TOKEN — skipping API call");
    return null;
  }
  if (!API_BASE) {
    console.warn("[GITHUB] GITHUB_REPO_OWNER/GITHUB_REPO_NAME not set — skipping API call");
    return null;
  }
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `token ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body.substring(0, 200)}`);
  }
  return res.json();
}

/**
 * Create a GitHub Issue with labels.
 * Returns the created issue object (with .number and .html_url).
 */
export async function createIssue(title, body, labels = ["auto-fix"]) {
  console.log(`[GITHUB] Creating issue: ${title}`);
  return ghFetch("/issues", {
    method: "POST",
    body: JSON.stringify({ title, body, labels }),
  });
}

/**
 * Get open issues with a specific label.
 * Used to check for duplicates before creating a new issue.
 */
export async function getOpenIssues(label = "auto-fix") {
  return ghFetch(`/issues?state=open&labels=${encodeURIComponent(label)}&per_page=20`);
}

/**
 * Add a comment to an existing issue (for feedback after rejection).
 */
export async function addCommentToIssue(issueNumber, comment) {
  console.log(`[GITHUB] Adding comment to issue #${issueNumber}`);
  return ghFetch(`/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: comment }),
  });
}

/**
 * Add a label to an issue (to re-trigger auto-fix workflow).
 */
export async function addLabel(issueNumber, label) {
  return ghFetch(`/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [label] }),
  });
}

/**
 * Remove a label from an issue.
 */
export async function removeLabel(issueNumber, label) {
  try {
    await ghFetch(`/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, {
      method: "DELETE",
    });
  } catch { /* label might not exist */ }
}

/**
 * Close an issue.
 */
export async function closeIssue(issueNumber) {
  return ghFetch(`/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

/**
 * Merge a pull request.
 */
export async function mergePR(prNumber) {
  console.log(`[GITHUB] Merging PR #${prNumber}`);
  return ghFetch(`/pulls/${prNumber}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "squash" }),
  });
}
