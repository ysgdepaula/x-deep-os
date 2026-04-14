#!/usr/bin/env node
// proposals.mjs — transforme les proposals du sous-agent scout en entrees queue.md
// Respecte : max 3/scout, limite 10 fichiers (sinon label blueprint), format standard queue

import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const QUEUE_PATH = resolve(REPO_ROOT, '.agent/queue.md');

/**
 * writeProposals({ proposals, reportPath, slug, dryRun }) -> { written: [...] }
 * Prend les proposals du scout output et append dans queue.md au format standard.
 */
export function writeProposals({ proposals = [], reportPath, slug, dryRun = false }) {
  if (!proposals.length) return { written: [] };

  const capped = proposals.slice(0, 3);
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];
  const written = [];

  for (const p of capped) {
    const files = p.files_affected || [];
    const blueprint = files.length > 10;
    const tag = p.tag || 'research';
    const effort = p.effort || 'S';
    const risk = p.risk || 'low';
    const dryFlag = dryRun ? ' [dry-run]' : '';
    const blueprintFlag = blueprint ? ' [blueprint]' : '';

    const line = [
      `- [ ] [${today}] [scout]${dryFlag}${blueprintFlag} ${p.title} `,
      `— effort ${effort}, risk ${risk}, tag ${tag}. `,
      `${p.gain || ''} `,
      `Files: ${files.length > 0 ? files.slice(0, 5).join(', ') : 'n/a'}${files.length > 5 ? `... (+${files.length - 5})` : ''}. `,
      `Rapport: ${reportPath || 'n/a'}.`,
    ].join('');
    lines.push(line);
    written.push({ title: p.title, blueprint, dryRun });
  }

  if (!dryRun) {
    appendFileSync(QUEUE_PATH, '\n' + lines.join('\n') + '\n', 'utf8');
  }

  return { written, lines };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = {
    proposals: [
      {
        title: 'Ajouter section LLM-as-OS dans agent-architecture.md',
        effort: 'XS',
        gain: 'Meilleure explicabilite',
        files_affected: ['.agent/knowledge/articles/platform/agent-architecture.md'],
        risk: 'low',
        tag: 'knowledge',
      },
    ],
    reportPath: '.agent/scout/reports/2026-04-14-karpathy-llm-os.md',
    slug: '2026-04-14-karpathy-llm-os',
    dryRun: true,
  };
  console.log(JSON.stringify(writeProposals(sample), null, 2));
}
