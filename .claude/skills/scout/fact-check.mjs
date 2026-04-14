#!/usr/bin/env node
// fact-check.mjs — cross-ref findings du sous-agent scout-research vs knowledge/ + state.json
// Produit un verdict enrichi et detecte les nouvelles sources recurrentes

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';
import { loadSources } from './sources-loader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const KNOWLEDGE_DIR = resolve(REPO_ROOT, '.agent/knowledge/articles');
const STATE_PATH = resolve(REPO_ROOT, '.agent/state.json');
const RAW_DIR = resolve(REPO_ROOT, '.agent/raw');

/**
 * factCheck({ findings, verdict, new_sources_detected }) -> verdict enrichi + side-effects (raw/)
 * Input : output JSON du sous-agent (voir output-schema.md)
 * Output : { verdict_enriched, confidence, cross_refs, new_source_files_written }
 */
export function factCheck(scoutOutput) {
  const knowledgeIndex = buildKnowledgeIndex();
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  const sources = loadSources();
  const existingSourceNames = extractExistingSourceNames(sources);

  const findings = scoutOutput.findings || [];
  const claimTexts = findings.map((f) => `${f.claim} ${f.evidence || ''}`.toLowerCase());

  const contradictionHits = [];
  const redundancyHits = [];

  for (const article of knowledgeIndex) {
    const content = article.text;
    for (let i = 0; i < claimTexts.length; i++) {
      const claim = claimTexts[i];
      const overlap = keywordOverlap(claim, content);
      if (overlap.score >= 3) {
        const contradictionSignals = /\b(never|pas|ne pas|oppos|contradic|not recommend|deprecated)\b/i.test(content);
        if (contradictionSignals) {
          contradictionHits.push({ article: article.relPath, claim_idx: i, overlap: overlap.score });
        } else {
          redundancyHits.push({ article: article.relPath, claim_idx: i, overlap: overlap.score });
        }
      }
    }
  }

  const stateAgents = new Set(Object.keys(state.agents || {}));
  const stateSkills = new Set();
  for (const agent of Object.values(state.agents || {})) {
    for (const skill of agent.skills || []) stateSkills.add(skill);
  }
  const relatedAgents = [...stateAgents].filter((a) =>
    claimTexts.some((c) => c.includes(a.toLowerCase().replace('x-deep-', '')))
  );
  const relatedSkills = [...stateSkills].filter((s) => claimTexts.some((c) => c.includes(s.toLowerCase())));

  let verdictLabel = scoutOutput.verdict?.label || 'NEW';
  const reasoning = [];

  if (contradictionHits.length > 0) {
    verdictLabel = 'CONTRADICTS';
    reasoning.push(`Contradiction detectee avec ${contradictionHits.length} article(s) knowledge.`);
  } else if (redundancyHits.length >= 2 || relatedSkills.length > 0) {
    if (verdictLabel === 'NEW' || verdictLabel === 'IMPROVEMENT') {
      verdictLabel = 'ALREADY_DONE';
      reasoning.push(
        `Deja couvert par ${redundancyHits.length} article(s) et ${relatedSkills.length} skill(s).`
      );
    }
  } else if (relatedAgents.length > 0 && verdictLabel === 'NEW') {
    verdictLabel = 'IMPROVEMENT';
    reasoning.push(`Peut enrichir ${relatedAgents.length} agent(s) existant(s).`);
  }

  const confidences = findings.map((f) => f.confidence || 3);
  const avgConfidence = confidences.length
    ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
    : 3;

  const newSourceFiles = processNewSources(scoutOutput.new_sources_detected || [], existingSourceNames);

  return {
    verdict_enriched: {
      label: verdictLabel,
      confidence: avgConfidence,
      reasoning: reasoning.join(' ') || scoutOutput.verdict?.reasoning || '',
      cross_refs: {
        knowledge_articles: [...new Set([...redundancyHits, ...contradictionHits].map((h) => h.article))],
        state_agents: relatedAgents,
        state_skills: relatedSkills,
        contradiction_hits: contradictionHits,
      },
    },
    new_source_files_written: newSourceFiles,
  };
}

function buildKnowledgeIndex() {
  const articles = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (e.endsWith('.md')) {
        const text = readFileSync(full, 'utf8').toLowerCase();
        articles.push({ relPath: relative(REPO_ROOT, full), text });
      }
    }
  }
  walk(KNOWLEDGE_DIR);
  return articles;
}

function keywordOverlap(claim, article) {
  const stopwords = new Set([
    'le', 'la', 'les', 'de', 'du', 'des', 'et', 'a', 'au', 'aux', 'un', 'une', 'ou',
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'on', 'for', 'with',
    'that', 'this', 'as', 'by', 'pour', 'dans', 'sur', 'sont', 'est', 'avec',
  ]);
  const words = claim
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w));
  const unique = [...new Set(words)];
  let hits = 0;
  for (const w of unique) {
    if (article.includes(w)) hits++;
  }
  return { score: hits, total: unique.length };
}

function extractExistingSourceNames(sources) {
  const names = new Set();
  for (const cat of ['experts', 'labs', 'repos', 'newsletters']) {
    for (const entry of sources[cat] || []) {
      names.add(entry.name.toLowerCase());
    }
  }
  return names;
}

function processNewSources(detected, existingNames) {
  const written = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const src of detected) {
    if (!src.name) continue;
    const key = src.name.toLowerCase();
    if (existingNames.has(key)) continue;
    if ((src.citations_count || 0) < 3) continue;
    const slug = src.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const filename = `${today}-new-source-${slug}.md`;
    const filepath = join(RAW_DIR, filename);
    const body = [
      '---',
      `type: reference`,
      `date: ${today}`,
      `source: scout-auto-detected`,
      `name: ${src.name}`,
      `url: ${src.url || 'unknown'}`,
      '---',
      '',
      `# Nouvelle source detectee : ${src.name}`,
      '',
      `- URL : ${src.url || 'unknown'}`,
      `- Citations dans findings : ${src.citations_count || 'n/a'}`,
      `- Pourquoi pertinent : ${src.why_relevant || 'non precise'}`,
      '',
      'A compiler dans `.agent/knowledge/articles/platform/scout-sources.md` par le nightly-audit.',
      '',
    ].join('\n');
    mkdirSync(dirname(filepath), { recursive: true });
    writeFileSync(filepath, body, 'utf8');
    written.push(relative(REPO_ROOT, filepath));
  }
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = {
    findings: [
      {
        claim: 'Nightly audit scans repo and produces improvements',
        evidence: 'Pattern well documented',
        sources: [{ name: 'Example', type: 'expert' }],
        confidence: 4,
      },
    ],
    verdict: { label: 'NEW' },
    new_sources_detected: [],
  };
  console.log(JSON.stringify(factCheck(sample), null, 2));
}
