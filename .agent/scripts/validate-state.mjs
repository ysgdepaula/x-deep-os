#!/usr/bin/env node
// Validate .agent/state.json against state.schema.json
// Also detects duplicate keys (which JSON parsers silently merge)

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { validate } from "./validate-schema.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const STATE_PATH = resolve(REPO_ROOT, ".agent/state.json");
const SCHEMA_PATH = resolve(REPO_ROOT, ".agent/schemas/state.schema.json");

function checkDuplicateKeys(raw) {
  // Detect duplicate keys per JSON object level using a regex pass.
  // This catches the silent overwrite issue (rule 2026-04-05).
  const errors = [];
  const lines = raw.split("\n");
  const keyStack = [new Set()];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") keyStack.push(new Set());
      if (ch === "}") keyStack.pop();
    }
    const match = line.match(/^\s*"([^"]+)"\s*:/);
    if (match) {
      const key = match[1];
      const top = keyStack[keyStack.length - 1];
      if (top && top.has(key)) {
        errors.push({ path: `line ${i + 1}`, message: `duplicate key "${key}" — second occurrence will silently overwrite the first` });
      }
      top?.add(key);
    }
  }
  return errors;
}

function main() {
  let raw;
  try {
    raw = readFileSync(STATE_PATH, "utf8");
  } catch (err) {
    console.error(`[validate-state] cannot read ${STATE_PATH}: ${err.message}`);
    process.exit(1);
  }

  // Step 1: dup keys
  const dupErrors = checkDuplicateKeys(raw);
  if (dupErrors.length > 0) {
    console.error("[validate-state] DUPLICATE KEYS:");
    dupErrors.forEach((e) => console.error(`  ${e.path}: ${e.message}`));
    process.exit(1);
  }

  // Step 2: parse
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`[validate-state] invalid JSON: ${err.message}`);
    process.exit(1);
  }

  // Step 3: schema
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const errors = validate(data, schema);
  if (errors.length > 0) {
    console.error("[validate-state] SCHEMA ERRORS:");
    errors.forEach((e) => console.error(`  ${e.path}: ${e.message}`));
    process.exit(1);
  }

  console.log("[validate-state] OK");
}

main();
