#!/usr/bin/env node
// Validate .claude/skills/<name>/SKILL.md frontmatter against schema
// Checks: required fields, kebab-case name, uniqueness across all skills

import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "yaml";
import { validate } from "./validate-schema.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const SKILLS_DIR = resolve(REPO_ROOT, ".claude/skills");
const SCHEMA_PATH = resolve(REPO_ROOT, ".agent/schemas/skill-frontmatter.schema.json");

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return yaml.parse(match[1]);
  } catch {
    return null;
  }
}

function main() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const dirs = readdirSync(SKILLS_DIR).filter((name) => {
    try {
      return statSync(resolve(SKILLS_DIR, name)).isDirectory();
    } catch {
      return false;
    }
  });

  const namesSeen = new Map(); // name → file
  let totalErrors = 0;

  for (const dir of dirs) {
    const skillPath = resolve(SKILLS_DIR, dir, "SKILL.md");
    let content;
    try {
      content = readFileSync(skillPath, "utf8");
    } catch {
      console.error(`[validate-skills] ${dir}: SKILL.md missing`);
      totalErrors++;
      continue;
    }

    const fm = parseFrontmatter(content);
    if (!fm) {
      console.error(`[validate-skills] ${dir}: invalid or missing frontmatter`);
      totalErrors++;
      continue;
    }

    const errors = validate(fm, schema);

    // Uniqueness check
    if (fm.name) {
      if (namesSeen.has(fm.name)) {
        errors.push({
          path: ".name",
          message: `duplicate name "${fm.name}" — also defined in ${namesSeen.get(fm.name)}`,
        });
      } else {
        namesSeen.set(fm.name, dir);
      }
    }

    if (errors.length > 0) {
      console.error(`[validate-skills] ${dir}/SKILL.md:`);
      errors.forEach((e) => console.error(`  ${e.path}: ${e.message}`));
      totalErrors += errors.length;
    }
  }

  if (totalErrors > 0) {
    console.error(`[validate-skills] FAILED: ${totalErrors} errors across ${dirs.length} skills`);
    process.exit(1);
  }

  console.log(`[validate-skills] OK (${dirs.length} skills)`);
}

main();
