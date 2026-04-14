#!/usr/bin/env node
// sources-loader.mjs — parse scout-sources.md -> JSON structure utilisable par /scout
// Liste vivante : enrichie via raw -> compile, lue a chaque invocation

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const SOURCES_PATH = resolve(REPO_ROOT, '.agent/knowledge/articles/platform/scout-sources.md');

/**
 * Parse scout-sources.md et retourne un objet { experts, labs, repos, newsletters, runnerUp }.
 * Chaque entree : { name, handle?, url?, why, scan, signal }
 */
export function loadSources(customPath = SOURCES_PATH) {
  const raw = readFileSync(customPath, 'utf8');
  const sections = splitByH2(raw);

  return {
    experts: parseSection(sections['Experts (5)'] || sections['Experts'] || ''),
    labs: parseSection(sections['Labs officiels (3)'] || sections['Labs officiels'] || ''),
    repos: parseSection(sections['Repos GitHub (5)'] || sections['Repos GitHub'] || ''),
    newsletters: parseSection(sections['Newsletters (2)'] || sections['Newsletters'] || ''),
    runnerUp: parseRunnerUp(sections['A considerer plus tard (pas dans la graine)'] || ''),
    meta: {
      path: customPath,
      loadedAt: new Date().toISOString(),
    },
  };
}

function splitByH2(md) {
  const sections = {};
  const lines = md.split('\n');
  let current = null;
  let buffer = [];
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      if (current) sections[current] = buffer.join('\n');
      current = h2[1].trim();
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }
  if (current) sections[current] = buffer.join('\n');
  return sections;
}

function parseSection(md) {
  const entries = [];
  const blocks = md.split(/^###\s+/m).slice(1);
  for (const block of blocks) {
    const lines = block.split('\n');
    const name = lines[0].trim();
    const entry = { name };
    for (const line of lines.slice(1)) {
      const match = line.match(/^-\s+\*\*(Handle|URL|URLs|Pourquoi|Scan|Signal)\*\*\s*:\s*(.+)$/);
      if (match) {
        const key = match[1].toLowerCase().replace(/s$/, '');
        entry[key] = match[2].trim();
      }
    }
    entries.push(entry);
  }
  return entries;
}

function parseRunnerUp(md) {
  return md
    .split('\n')
    .filter((l) => l.trim().startsWith('- '))
    .map((l) => l.replace(/^-\s+/, '').trim());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sources = loadSources();
  console.log(JSON.stringify(sources, null, 2));
}
