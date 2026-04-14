import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.REPO_PATH || resolve(__dirname, "../..");
const SKILLS_DIR = resolve(REPO_ROOT, ".claude/skills");

/**
 * Parse a minimal YAML frontmatter block into a flat { key: value } object.
 * Handles single-line scalars and multi-line folded scalars (`key: >`).
 * Does NOT handle lists, nested objects, or quoted strings with colons —
 * sufficient for SKILL.md frontmatter which is kept simple by convention.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const out = {};
  const lines = match[1].split(/\r?\n/);
  let currentKey = null;
  let folded = [];
  const flush = () => {
    if (currentKey !== null) {
      out[currentKey] = folded.join(" ").trim();
    }
    currentKey = null;
    folded = [];
  };
  for (const raw of lines) {
    const keyMatch = raw.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (keyMatch) {
      flush();
      currentKey = keyMatch[1];
      const val = keyMatch[2];
      if (val === ">" || val === "|") {
        folded = [];
      } else {
        folded = [val];
      }
    } else if (currentKey !== null && raw.trim()) {
      folded.push(raw.trim());
    }
  }
  flush();
  return out;
}

function coerceBool(v, defaultValue = true) {
  if (v === undefined || v === null || v === "") return defaultValue;
  const s = String(v).toLowerCase();
  if (s === "false" || s === "no" || s === "0") return false;
  if (s === "true" || s === "yes" || s === "1") return true;
  return defaultValue;
}

/**
 * Scan .claude/skills/<name>/SKILL.md and return an array of skill metadata.
 * Each entry: { name, description, userInvocable, command, path }.
 * Returns [] if the directory is not accessible (e.g. remote env without repo).
 */
export function loadSkills() {
  let entries;
  try {
    entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(SKILLS_DIR, entry.name, "SKILL.md");
    try {
      statSync(skillFile);
    } catch {
      continue;
    }
    let content;
    try {
      content = readFileSync(skillFile, "utf8");
    } catch {
      continue;
    }
    const fm = parseFrontmatter(content);
    if (!fm || !fm.name) continue;
    const userInvocable = coerceBool(fm.user_invocable, true);
    skills.push({
      name: fm.name,
      description: fm.description || "",
      userInvocable,
      command: `/${fm.name}`,
      path: skillFile,
    });
  }
  return skills;
}

let _skillsCache = null;
export function getSkills() {
  if (!_skillsCache) _skillsCache = loadSkills();
  return _skillsCache;
}

/**
 * Given a message, return the matching skill if the message starts with
 * one of the skill commands (/<name>). Returns null otherwise.
 * Matches the longest command first so /dashboard-update beats /dashboard.
 */
export function matchSkillCommand(message) {
  if (typeof message !== "string") return null;
  const m = message.toLowerCase().trim();
  if (!m.startsWith("/")) return null;
  const skills = getSkills()
    .filter((s) => s.userInvocable)
    .sort((a, b) => b.command.length - a.command.length);
  for (const s of skills) {
    if (m === s.command || m.startsWith(s.command + " ") || m.startsWith(s.command + "@")) {
      return s;
    }
  }
  return null;
}

/**
 * Build a compact context block for a skill that has no dedicated context
 * module in system-prompt.mjs. Injects just the description so the model
 * knows what it's supposed to do.
 */
export function buildSkillFallbackContext(skill) {
  if (!skill) return "";
  return `## Skill context ${skill.command} (loaded dynamically)
${skill.description}

The full skill file is available on disk: ${skill.path.replace(REPO_ROOT, "")}. Read it if you need the step-by-step detail.`;
}

/**
 * Parity check — log which user-invocable skills are available
 * via dynamic routing. Called once at boot from index.mjs. Never throws.
 */
export function logSkillParity() {
  try {
    const skills = getSkills();
    const invocable = skills.filter((s) => s.userInvocable);
    const names = invocable.map((s) => s.name).sort();
    console.log(`[SKILLS] Loaded ${invocable.length} user-invocable skills: ${names.join(", ")}`);
    if (invocable.length === 0) {
      console.warn(`[SKILLS] ⚠️ No skills found at ${SKILLS_DIR} — Telegram will fall back to the generic prompt only.`);
    }
  } catch (err) {
    console.warn(`[SKILLS] Parity check failed: ${err.message}`);
  }
}
