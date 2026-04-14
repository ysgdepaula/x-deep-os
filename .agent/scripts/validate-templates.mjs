#!/usr/bin/env node
// Validate .agent/templates/*.yaml against agent-template.schema.json
// Cross-references with state.json (agent ids must exist, reports_to must resolve)

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "yaml";
import { validate } from "./validate-schema.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const TEMPLATES_DIR = resolve(REPO_ROOT, ".agent/templates");
const SCHEMA_PATH = resolve(REPO_ROOT, ".agent/schemas/agent-template.schema.json");
const STATE_PATH = resolve(REPO_ROOT, ".agent/state.json");

function main() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  let state;
  try {
    state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    state = { agents: {} };
  }
  const agentIds = new Set(Object.keys(state.agents || {}));

  const files = readdirSync(TEMPLATES_DIR).filter(
    (f) => f.endsWith(".yaml") && !f.startsWith("_")
  );
  let totalErrors = 0;

  for (const file of files) {
    const filepath = resolve(TEMPLATES_DIR, file);
    let parsed;
    try {
      parsed = yaml.parse(readFileSync(filepath, "utf8"));
    } catch (err) {
      console.error(`[validate-templates] ${file}: YAML parse error — ${err.message}`);
      totalErrors++;
      continue;
    }

    const errors = validate(parsed, schema);

    // Cross-ref: id must be in state.json (skip ydeep-master.yaml since it always exists)
    if (parsed?.agent?.id && !agentIds.has(parsed.agent.id)) {
      errors.push({
        path: ".agent.id",
        message: `id "${parsed.agent.id}" not found in state.json agents`,
      });
    }

    // Cross-ref: reports_to must resolve
    const reportsTo = parsed?.agent?.reports_to;
    if (reportsTo && reportsTo !== "human" && !agentIds.has(reportsTo)) {
      errors.push({
        path: ".agent.reports_to",
        message: `reports_to "${reportsTo}" must be "human" or an existing agent id`,
      });
    }

    if (errors.length > 0) {
      console.error(`[validate-templates] ${file}:`);
      errors.forEach((e) => console.error(`  ${e.path}: ${e.message}`));
      totalErrors += errors.length;
    }
  }

  if (totalErrors > 0) {
    console.error(`[validate-templates] FAILED: ${totalErrors} errors across ${files.length} files`);
    process.exit(1);
  }

  console.log(`[validate-templates] OK (${files.length} templates)`);
}

main();
