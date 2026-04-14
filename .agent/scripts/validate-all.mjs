#!/usr/bin/env node
// Run all X-DEEP agent validators in series.
// Exit code 0 = all pass, non-zero = at least one failed.
// Used by CI quality gate and manually before risky changes.

import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const validators = [
  { name: "state.json", script: "validate-state.mjs" },
  { name: "templates", script: "validate-templates.mjs" },
  { name: "skills", script: "validate-skills.mjs" },
];

let failed = 0;
const summary = [];

for (const v of validators) {
  const result = spawnSync("node", [resolve(__dirname, v.script)], {
    stdio: "inherit",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failed++;
    summary.push(`  FAIL  ${v.name}`);
  } else {
    summary.push(`  OK    ${v.name}`);
  }
}

console.log("\n[validate-all] Summary:");
summary.forEach((line) => console.log(line));

if (failed > 0) {
  console.error(`\n[validate-all] ${failed}/${validators.length} validators failed`);
  process.exit(1);
}

console.log(`\n[validate-all] All ${validators.length} validators passed`);
