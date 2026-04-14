import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.REPO_PATH || resolve(__dirname, "../..");

// Allowed commands for bash_execute
const ALLOWED_PREFIXES = ["git", "ls", "cat", "head", "tail", "grep", "find", "date", "wc", "echo", "pwd", "node", "npm"];
const BLOCKED_PATTERNS = ["rm -rf", "sudo", "chmod 777", "curl | sh", "eval(", "> /dev", "mkfs", "dd if=", ":(){ :", "&&rm", "; rm"];

function isSafeCommand(cmd) {
  const trimmed = cmd.trim();
  const firstWord = trimmed.split(/\s+/)[0];
  if (!ALLOWED_PREFIXES.includes(firstWord)) return false;
  for (const blocked of BLOCKED_PATTERNS) {
    if (trimmed.includes(blocked)) return false;
  }
  return true;
}

// --- Handlers ---

async function bashExecute({ command }) {
  if (!isSafeCommand(command)) {
    return `Command blocked. Allowed: ${ALLOWED_PREFIXES.join(", ")}. Blocked patterns: rm -rf, sudo, etc.`;
  }
  try {
    const output = execSync(command, {
      cwd: REPO_ROOT,
      timeout: 30000,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    return output.substring(0, 3000) || "(no output)";
  } catch (err) {
    const stderr = err.stderr?.substring(0, 1000) || "";
    const stdout = err.stdout?.substring(0, 1000) || "";
    return `Exit code ${err.status}\n${stdout}\n${stderr}`.trim().substring(0, 3000);
  }
}

async function fileRead({ path, offset = 0, limit = 200 }) {
  const resolved = resolve(REPO_ROOT, path);
  if (!resolved.startsWith(REPO_ROOT)) {
    return "Error: path must be within the repo";
  }
  try {
    const content = readFileSync(resolved, "utf8");
    const lines = content.split("\n");
    const slice = lines.slice(offset, offset + limit);
    return slice.map((line, i) => `${offset + i + 1}\t${line}`).join("\n").substring(0, 5000);
  } catch (err) {
    return `Error reading file: ${err.message}`;
  }
}

async function gitStatus() {
  return bashExecute({ command: "git status --short" });
}

async function gitLog({ count = 10 }) {
  const n = Math.min(Math.max(1, count), 20);
  return bashExecute({ command: `git log --oneline -${n}` });
}

async function webSearch({ query, search_depth = "basic", max_results = 5 }) {
  try {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return "Error: TAVILY_API_KEY not configured";
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth,
        max_results: Math.min(max_results, 10),
        include_answer: true,
      }),
    });
    if (!res.ok) return `Error: Tavily returned ${res.status}`;
    const data = await res.json();
    let output = "";
    if (data.answer) output += `Answer: ${data.answer}\n\n`;
    const results = (data.results || []).map(r =>
      `- ${r.title}\n  ${r.url}\n  ${r.content?.substring(0, 300) || ""}`
    );
    output += results.join("\n\n");
    return output.substring(0, 5000) || "(no results)";
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

async function webFetch({ url, max_length = 5000 }) {
  try {
    const userAgent = process.env.BOT_USER_AGENT || "X-DEEP-Bot/1.0";
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return `Error: HTTP ${res.status}`;
    const text = await res.text();
    return text.substring(0, max_length);
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

// --- Tool definitions (Anthropic format) ---

export const CUSTOM_TOOLS = [
  {
    name: "bash_execute",
    description: "Execute a shell command in the repo. Allowed: git, ls, cat, head, tail, grep, find, date, wc, node, npm. Blocked: rm -rf, sudo, etc.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
      },
      required: ["command"],
    },
  },
  {
    name: "file_read",
    description: "Read a file from the repo. Returns numbered lines.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path from repo root (e.g. 'CLAUDE.md', '.agent/rules.md')" },
        offset: { type: "number", description: "Start line (0-indexed, default 0)" },
        limit: { type: "number", description: "Max lines to return (default 200)" },
      },
      required: ["path"],
    },
  },
  {
    name: "git_status",
    description: "Show git status (modified, untracked, staged files)",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "git_log",
    description: "Show recent git commits (oneline format)",
    input_schema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of commits to show (max 20, default 10)" },
      },
    },
  },
  {
    name: "web_search",
    description: "Search the web using Tavily. Returns an AI-generated answer + source results with extracted content. Use search_depth 'advanced' for deep research.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        search_depth: { type: "string", enum: ["basic", "advanced"], description: "basic (fast) or advanced (deeper extraction). Default: basic" },
        max_results: { type: "number", description: "Number of results (max 10, default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "web_fetch",
    description: "Fetch the content of a URL. Returns raw text (HTML/JSON/text).",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        max_length: { type: "number", description: "Max characters to return (default 5000)" },
      },
      required: ["url"],
    },
  },
];

export const CUSTOM_HANDLERS = {
  bash_execute: bashExecute,
  file_read: fileRead,
  git_status: gitStatus,
  git_log: gitLog,
  web_search: webSearch,
  web_fetch: webFetch,
};
