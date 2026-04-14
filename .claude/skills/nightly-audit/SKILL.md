---
name: nightly-audit
description: Audit nocturne automatique — analyse la structure agent, skills, memoire, config, code et produit un rapport d'ameliorations
user_invocable: true
---

# Audit Nocturne — X-DEEP

Tu es X-DEEP en mode audit. Ton job : analyser tout le workspace, mettre a jour l'etat partage (.agent/), et produire un rapport actionnable.

## Etape 0 — Lire l'etat partage

1. Lis `.agent/state.json` — carte du systeme
2. Lis `.agent/rules.md` — regles a suivre ET enrichir
3. Lis `.agent/queue.md` — actions en attente
4. Lis `.agent/changelog.md` — journal recent

## Etape 0.5 — Verification intelligente de la queue (AVANT de signaler quoi que ce soit)

Avant de re-signaler un probleme deja dans queue.md, **verifie si le probleme existe encore** :

### 1. Plans PENDING — verifier si le code est deja la

Pour chaque plan avec `## Status: PENDING` :
- Lire le plan et identifier les fichiers/services qu'il propose de creer
- Chercher si ces fichiers existent deja sur disque (`ls`, `grep`)
- Si les fichiers existent et sont fonctionnels → le plan est EXECUTED, **le marquer comme tel** au lieu de le re-signaler
- Si partiellement fait → signaler ce qui reste, pas le plan entier

Exemple : un plan "Creer outbound.mjs" est PENDING mais `sales-tool/src/services/outbound.mjs` existe deja → marquer EXECUTED.

### 2. Queue items ouverts — verifier la pertinence

Pour chaque item `- [ ]` dans queue.md :
- **Fichier orphelin** → verifier qu'il existe encore (`ls`). Si supprime → marquer `[x]` avec "FAIT — fichier supprime"
- **Projet/skill absent de CLAUDE.md** → relire CLAUDE.md et verifier. Si ajoute → marquer `[x]`
- **Agent sans skills** → relire state.json. Si des skills ont ete assignes → marquer `[x]`
- **Plan sans Status header** → relire le plan. Si le header est la → marquer `[x]`
- **Bug/fix a verifier** → chercher dans git log si un commit recent le resout

### 3. Compteur d'escalade — seulement si le probleme persiste pour de vrai

Le compteur d'escalade (Xe signalement) ne s'incremente que si :
- Le probleme a ete **verifie** comme encore present dans le code/config actuel
- Ce n'est pas juste un item non coche dans queue.md

**Regle** : si un item de queue est resolvable en < 2 min (ajouter une ligne dans CLAUDE.md, marquer un plan EXECUTED, supprimer un fichier), **le resoudre directement** au lieu de le re-signaler. L'audit est un auditeur MAIS les micro-corrections factuelles (pas de jugement requis) sont dans son scope.

### 4. Cross-reference changelog + git

Avant de signaler un probleme :
- Lire les 15 dernieres lignes de changelog.md — le fix a peut-etre ete fait dans une autre session
- Checker `git log --oneline -10` — un commit recent peut avoir resolu le probleme
- Si resolu → marquer l'item `[x]` dans queue.md avec la reference (commit hash ou date)

---

## Checklist d'audit

### 1. Structure du repo
- Liste tous les dossiers et fichiers a la racine
- Detecte les fichiers orphelins (pas dans un projet, pas references)
- Detecte les fichiers temporaires ou de debug oublies
- Verifie que chaque projet a un README ou une structure coherente
- Cherche les TODO/FIXME/HACK dans le code : `grep -r "TODO\|FIXME\|HACK"` (hors node_modules)

### 2. CLAUDE.md — Coherence
- Lis `$HOME/.xdeep/CLAUDE.md`
- Verifie que chaque skill referencee existe dans `.claude/skills/`
- Verifie que chaque commande dev listee fonctionne (les fichiers existent)
- Verifie que les chemins MCP references existent (`~/.mcp-servers/`)
- Detecte les sections obsoletes ou en contradiction avec l'etat actuel

### 3. Skills — Qualite & Completude
- Lis chaque fichier `.claude/skills/*/SKILL.md`
- Verifie que chaque skill a un frontmatter correct (name, description, user_invocable)
- Detecte les skills qui pourraient etre ameliorees (prompts vagues, etapes manquantes)
- Propose de nouvelles skills basees sur les patterns repetitifs dans git log (derniers 30 commits)

### 4. Memoire — Hygiene
- Lis tous les fichiers dans le dossier memoire (`~/.claude/projects/<project>/memory/`)
- Verifie que MEMORY.md est synchronise avec les fichiers existants
- Detecte les memoires potentiellement obsoletes (infos qui ne correspondent plus au code)
- Propose des memoires manquantes basees sur CLAUDE.md et l'etat du projet

### 5. Config MCP — Sante
- Lis `~/.claude.json` pour la config MCP
- Verifie que les credentials existent pour chaque service configure
- Detecte les services configures mais potentiellement inutilises
- Verifie la coherence entre services MCP documentes dans CLAUDE.md et ceux configures

### 6. Code — Quick Wins
- Pour chaque projet Node.js : verifie si `package.json` a des deps outdated (`npm outdated` si possible)
- Detecte les `node_modules` qui pourraient etre nettoyes
- Cherche les fichiers `.env` ou credentials qui ne sont pas dans `.gitignore`
- Verifie la presence de `.gitignore` adequats

### 7. Git — Patterns
- Analyse les 30 derniers commits (`git log --oneline -30`)
- Detecte les patterns repetitifs (memes types de fix, memes fichiers modifies)
- Propose des automatisations (hooks, skills) pour les taches recurrentes

### 8. Scheduled Tasks — Etat
- Verifie les taches planifiees existantes dans `.claude/scheduled-tasks/`
- Detecte celles qui pourraient etre obsoletes
- Propose de nouvelles automatisations

### 9. CRM Scan — Suivi pipeline & apprentissage

Scanne le Sales CRM Notion (data source `136b816c-d06a-81ce-9164-000b75301a98`) :

1. **Corrections de the user** :
   - Compare l'etat actuel du CRM avec le dernier snapshot (`.agent/crm-snapshot.json`)
   - Detecte les champs modifies manuellement par the user (Type, Priority, Statut, Prochain step)
   - Pour chaque correction : extraire le delta → learning protocol → proposer regle dans rules.md
   - Mettre a jour les stats de xdeep-sales dans state.json (approved si inchange, rejected si corrige)

2. **Follow-ups en retard** :
   - Lister les fiches ou Follow-up due < aujourd'hui ET Statut != Gagne/Perdu/Standby
   - Ajouter dans queue.md : "[sales] Relancer [Nom] @ [Entreprise] — [Prochain step]"

3. **Fiches incompletes** :
   - Detecter les fiches sans Type, sans Secteur, ou sans Prochain step
   - Auto-qualifier si possible (regles dans rules.md)
   - Sinon proposer dans queue.md

4. **Sauvegarder le snapshot** :
   - Ecrire l'etat actuel du CRM dans `.agent/crm-snapshot.json` (Name, Statut, Type, Priority, Prochain step, Follow-up due)
   - Ce snapshot sert de base de comparaison pour la prochaine nuit

5. **Resume pour le briefing** :
   - Nb prospects a relancer
   - Nb corrections the user detectees → regles apprises
   - Hot deals sans activite depuis > 7 jours
   - Fiches incompletes a qualifier

## Phase 1.5 — Journal Consolidation (apprentissage continu)

Le journal omnicanal (`.agent/journal/*.jsonl`) capture TOUT ce que the user dit sur Telegram et dans le terminal. Cette phase transforme les signaux bruts en connaissances durables.

### 1. Lire le journal du jour

```bash
# Lire le journal d'aujourd'hui (et hier si l'audit tourne apres minuit)
cat .agent/journal/$(date +%Y-%m-%d).jsonl 2>/dev/null
cat .agent/journal/$(date -v-1d +%Y-%m-%d).jsonl 2>/dev/null
```

Chaque ligne est un JSON avec : `ts, channel, type, intent, input, output, summary, rule_extracted, tags, session_id`

Types : `idea` | `correction` | `decision` | `task` | `reflection` | `context` | `interaction`

### 2. Consolider les corrections → rules.md

Pour chaque entree de type `correction` avec un `rule_extracted` non-null :
- Verifier que la regle n'existe pas deja dans rules.md (eviter doublons)
- Si nouvelle : l'ajouter dans la section "Lecons apprises" avec la date
- Format : `- [YYYY-MM-DD] [regle] (source: journal — [summary])`

### 3. Decisions et idees non compilees

Pour chaque entree de type `decision` ou `idea` dans le journal :
- Verifier si elle a ete compilee via `/ingest` (chercher dans raw/ un fichier correspondant)
- Si NON compilee → signaler dans queue.md : "[knowledge] Decision/idee non compilee : [summary]"
- Le nightly-audit ne compile PAS — il detecte ce que le real-time a rate

### 4. Generer des evals depuis les corrections

Pour chaque `correction` du jour :
- Creer un fichier eval dans `.agent/evals/<agent>/` (determiner l'agent depuis l'intent)
  - intent sales/relance/prep → `.agent/evals/sales/`
  - intent finance → `.agent/evals/finance/`
  - intent hello → `.agent/evals/sales/` (si le sujet est sales) ou dossier general
  - sinon → creer `.agent/evals/general/` si necessaire

Format eval (suivre le README) :
```markdown
# Eval — [date]

**Input:** [input du journal]
**Bad Output:** [output du journal]
**Correction:** [rule_extracted]
**Rule:** [regle ajoutee dans rules.md]
```

### 5. Decay des regles

Analyser `.agent/rules.md` section "Lecons apprises" :
- Pour chaque regle datee : calculer l'age en jours
- Si age > 90 jours ET la regle n'a pas ete referencee dans le journal des 30 derniers jours → proposer archivage dans queue.md
- Si age > 180 jours ET jamais referencee → la deplacer dans `.agent/knowledge/archived-rules.md`
- Ne JAMAIS supprimer une regle sans passer par queue.md d'abord

Pour verifier si une regle est "referencee" : chercher ses mots-cles dans les journal/*.jsonl des 30 derniers jours.

### 6. Stats du journal

Inclure dans le rapport :
- Nb total d'entrees journal du jour
- Repartition par type (X ideas, Y corrections, Z decisions...)
- Nb de regles extraites et ajoutees
- Nb d'articles knowledge crees/enrichis
- Nb d'evals generes
- Regles proposees pour archivage (decay)

## Phase 1.7 — Knowledge Health Sweep (ce que le real-time ne peut pas faire)

La compilation knowledge se fait en temps reel via `/ingest` (au moment ou la source arrive). Le nightly-audit ne compile PAS — il detecte ce qui a vieilli, derive ou manque sans qu'un event l'ait declenche.

### 1. Staleness detection (decay)

```bash
ls .agent/knowledge/articles/core/ .agent/knowledge/articles/platform/ .agent/knowledge/articles/vertical-a/
```

Pour chaque article, lire le frontmatter `last_compiled:` :
- **> 30 jours** → flaguer dans queue.md : "[knowledge] Article stale : [titre] — dernier compile [date]"
- **> 60 jours** → URGENT dans queue.md
- **> 90 jours** → ESCALADE — l'article est peut-etre faux

### 2. Cross-document contradictions

Lire les articles par paires (related: links) et verifier :
- Deux articles donnent-ils des regles contradictoires ?
- Un article reference-t-il un fait qu'un autre article contredit ?
- Si contradiction detectee → queue.md avec les deux articles et la contradiction

### 3. Global patterns

Analyser l'ensemble des articles :
- **Redondance** : deux articles couvrent-ils le meme sujet ? → proposer fusion
- **Gaps** : un sujet avec 5+ entries dans rules.md mais pas d'article ? → proposer a queue.md
- **Orphelins** : article dans articles/ mais absent d'index.md ? → signaler
- **Sources mortes** : fichier raw/ reference dans un frontmatter qui n'existe plus ? → signaler

### 4. Tracabilite bidirectionnelle

**raw/ → articles (compiled_to)** :
- Lire chaque fichier dans `.agent/raw/` et verifier que `compiled_to:` est rempli
- Si `compiled_to:` est vide → source non compilee → signaler dans queue.md
- Si `compiled_to:` pointe vers un article qui n'existe plus → source morte → signaler
- Sources > 7 jours sans `compiled_to:` → URGENT

**articles → raw/ (sources)** :
- Lire chaque article dans `.agent/knowledge/articles/` et verifier que `sources:` est rempli
- Si `sources:` contient un fichier raw/ qui n'existe plus → reference cassee → signaler
- Si `sources:` est vide → article sans provenance → signaler (sauf articles fondateurs v1)

### 5. Apprentissage du filtre memorisation

Lire `.agent/memory-filter-log.jsonl` (si existe) :

1. **Compter les decisions** des 7 derniers jours :
   - Total propositions : [nb]
   - Memorise : [nb] | Ignore : [nb] | Timeout : [nb]
   - Precision : memorise / (memorise + ignore) — objectif > 80%

2. **Detecter les patterns** :
   - Quels `signal_type` the user accepte le plus ? (email, calendar, conversation)
   - Quels `vertical` sont les plus memorises ?
   - Quels `source` (gmail-pro, gmail-outbound, gmail-perso) produisent le plus de bruit (ignore) ?

3. **Proposer des ajustements** dans queue.md si precision < 80% :
   - "[knowledge] Filtre trop bruyant : [X]% precision. Proposer : [ajustement scoring]"
   - Exemples d'ajustements : augmenter le seuil, baisser le score d'un type de signal, ignorer une source

4. **Stats dans le rapport** (section ci-dessous)

### 6. Detection de memoires resolues

Lire les interactions du jour (journal, changelog, queue.md items marques [x]) et comparer avec les articles knowledge :

1. **Articles sur des sujets clos** :
   - Article sur un prospect → le deal est gagne/perdu dans le CRM → proposer archivage ou mise a jour
   - Article sur un bug/incident → le fix a ete deploye (commit dans changelog) → proposer mise a jour "Resolu"
   - Article sur une decision pendante → the user a tranche dans la journee → mettre a jour l'article

2. **Comment detecter** :
   - Chercher dans le changelog du jour des mots-cles qui matchent les titres d'articles (ex: "Example Project" dans changelog → verifier article poc-factory)
   - Chercher dans queue.md les items [x] qui correspondent a un sujet d'article
   - Chercher dans le journal les decisions qui closent un sujet ouvert

3. **Action** :
   - Si resolu → queue.md : "[knowledge] Article resolu : [titre] — [raison]. Archiver ou mettre a jour ?"
   - Ne PAS archiver automatiquement — proposer a the user dans le briefing

### 7. Detection de signaux rates (filet de securite)

Comparer les interactions du jour avec les ingests du jour :

1. **Lire le journal** (`.agent/journal/*.jsonl`) — extraire les entries de type `decision` et `correction`
2. **Lire raw/** — lister les fichiers crees aujourd'hui (par date dans le nom)
3. **Comparer** : pour chaque decision/correction du journal, y a-t-il un fichier raw/ correspondant ?
   - Matcher par mots-cles (tags du journal vs nom du fichier raw/)
   - Si pas de match → signal rate

4. **Action** :
   - Signal rate → queue.md : "[knowledge] Signal rate : [summary] — source: [channel] [date]"
   - C'est le filet de securite : ce que le real-time (auto-ingest + filtre) a loupe

5. **Stats** : inclure dans le rapport (section ci-dessous)

### 8. Lifecycle des articles

Gerer le cycle de vie complet des articles :

1. **Staleness** (deja dans section 1) :
   - > 30j → flaguer | > 60j → URGENT | > 90j → ESCALADE

2. **Archivage** :
   - Quand un article est confirme "resolu" par the user → deplacer dans `articles/archived/`
   - Retirer de index.md, ajouter dans une section "Archived" en bas de l'index
   - Garder la tracabilite (le fichier raw/ reste, l'article garde ses sources)

3. **Compteur de references** :
   - A chaque audit, scanner le journal et le changelog pour des mentions des titres d'articles
   - Incrementer un compteur mental (pas un fichier — juste pour le rapport)
   - Articles jamais references en 60j → proposer archivage dans queue.md

4. **Creer le dossier archived/** si un archivage est approuve

### 9. Stats knowledge dans le rapport

- Articles total : [nb] (core: [X], platform: [Y], your-vertical: [Z])
- Articles stale > 30j : [liste ou "aucun"]
- Contradictions detectees : [liste ou "aucune"]
- Sources non compilees : [liste ou "aucune"]
- Gaps detectes : [liste ou "aucun"]

## Phase 2 — Research Scan (X-DEEP Research)

Apres l'audit technique, lance un scan de veille :

1. Execute le skill `/research-scan` (ou son contenu si en mode remote)
2. Le digest est ecrit dans `.agent/research-digest.md`
3. Les propositions sont ajoutees dans `.agent/queue.md` avec tag `[research]`

## Phase 2.3 — Scout Replay (goal drift detection)

Relecture des 5 derniers rapports `/scout` pour detecter si les verdicts tiennent toujours :

### 1. Charger les rapports recents

- Lister `.agent/scout/reports/*.md` (les 5 plus recents par date)
- Pour chaque rapport, extraire : verdict, propositions, date

### 2. Verifier chaque proposition approuvee

Pour chaque rapport avec verdict `IMPROVEMENT` :
- Les propositions sont-elles encore dans `.agent/queue.md` non-cochees alors que > 7 jours ? -> flag `stale-proposal`
- Une proposition a-t-elle ete approuvee mais jamais implementee ? Cross-ref avec state.json / git log -> flag `approved-not-implemented`

### 3. Verifier la coherence verdicts

Pour chaque rapport avec verdict `ALREADY_DONE` ou `CONTRADICTS` :
- Le skill / agent / pattern cite dans cross_refs existe-t-il toujours dans state.json ?
- Si non (supprime depuis) -> flag `verdict-outdated`

### 4. Nouvelles sources en attente

Lister les fichiers `.agent/raw/YYYY-MM-DD-new-source-*.md` non compiles :
- Si > 3 jours -> proposer compilation dans `scout-sources.md` via queue.md
- Si 0 citation supplementaire depuis detection -> proposer archivage sans ajout

### 5. Stats scout dans le rapport

- Nb scouts derniers 7 jours
- Repartition verdicts (NEW/ALREADY_DONE/CONTRADICTS/IMPROVEMENT)
- Propositions stale (> 7j non traitees)
- Goal drift flags detectes

Si drift detecte -> ligne dans `.agent/queue.md` avec tag `[scout] [goal-drift]`.

## Phase 2.5 — Contact Sync (mise a jour carnet contacts)

Le carnet de contacts est dans `~/.claude/projects/<project>/memory/contacts/`.

### 1. Scanner les interactions du jour

Lire le journal du jour (`.agent/journal/*.jsonl`) et identifier les contacts mentionnes :
- Noms de personnes dans les champs `input` et `output`
- Emails dans les interactions

### 2. Mettre a jour last_interaction

Pour chaque contact identifie :
- Lire `memory/contacts/_index.json`
- Si le contact existe → pas d'action (les fichiers contacts sont dans la memoire locale, pas dans le repo git)
- Si le contact n'existe PAS → ajouter dans `.agent/queue.md` : "[contacts] Nouveau contact detecte : [nom] [email] — creer fiche"

### 3. Detecter les contacts dormants

Scanner `memory/contacts/_index.json` (si accessible) :
- Contacts avec `last_interaction` > 6 mois → proposer passage en `dormant` dans queue.md
- Contacts avec `last_interaction` > 12 mois → proposer archivage dans queue.md

### 4. Dedup check

Comparer les contacts par nom normalise (lowercase, sans accents) :
- Si deux fiches ont des noms similaires → signaler dans le rapport
- Si un email apparait dans deux fiches differentes → signaler

### 5. Stats contacts dans le rapport

- Nb contacts actifs total
- Nouveaux contacts detectes aujourd'hui
- Contacts dormants (> 6 mois)
- Doublons potentiels detectes

## Phase 2.7 — Self-Healing Issues Scan

Scanner les GitHub Issues du repo pour le suivi du systeme auto-fix :

### 1. Lister les issues ouvertes

```bash
gh issue list --repo ${GITHUB_REPO} --label auto-fix --state open --json number,title,createdAt,comments
gh issue list --repo ${GITHUB_REPO} --label needs-human --state open --json number,title,createdAt
```

### 2. Detecter les issues bloquees

- Issues `auto-fix` ouvertes > 48h sans PR → flaguer URGENT dans queue.md
- Issues `needs-human` → rappeler dans le rapport (the user doit intervenir)
- Issues fermees aujourd'hui → reporter comme "fix-rate" stat

### 3. Journal → Issues manquantes

Scanner le journal du jour pour des patterns d'erreur non encore transformes en issues :
- Corrections repetees (3x meme sujet) sans issue GitHub correspondante
- Erreurs dans les logs du journal (type=correction + mots-cles bug)
- Si pattern detecte et pas d'issue ouverte → proposer creation dans queue.md

### 4. Stats self-healing

- Issues auto-fix ouvertes : [nb]
- Issues needs-human : [nb]
- Issues fermees cette semaine : [nb]
- Fix-rate : [fermees / total crees] %
- Temps moyen de resolution : [heures]

## Phase 2.9 — Auto-Issue Creation (X-DEEP Engineering)

Quand l'audit detecte des problemes techniques actionnables, creer automatiquement des GitHub Issues au lieu de juste ecrire dans queue.md.

### 1. Criteres de creation d'issue

Creer une issue `auto-fix` si :
- Import casse detecte (node --check fail)
- Lint error (pas warning) dans un projet
- Fichier orphelin signale 3+ audits consecutifs (checker queue.md pour le comptage)
- Rule violee 3+ audits consecutifs sans correction
- Health check fail (MCP unreachable, journal broken)

Creer une issue `enhancement` si :
- Pattern repetitif detecte dans git log (meme type de fix > 3 fois)
- Refactor propose dans queue.md depuis > 7 jours sans action
- Quick win identifie avec effort < 5 min et impact haut

### 2. Format de l'issue

```bash
gh issue create \
  --title "[type] description courte" \
  --body "## Contexte\n[Ce que l'audit a detecte]\n\n## Fichiers concernes\n- [path1]\n- [path2]\n\n## Suggestion de fix\n[Action concrete a prendre]\n\n## Detecte par\nnightly-audit [date]" \
  --label "[auto-fix ou enhancement]"
```

### 3. Garde-fous

- Max 2 issues creees par nuit (eviter le flood)
- Ne jamais creer une issue dupliquee (checker `gh issue list --label auto-fix --state open` avant)
- Ne jamais creer une issue pour un warning (seulement les erreurs)
- Loguer chaque issue creee dans `.agent/changelog.md`

## Phase 3 — Learning Audit (verification apprentissage)

Verifie que le learning protocol a bien fonctionne dans les conversations recentes :

1. **Scanner les corrections non capturees** :
   - Lis `git log --oneline -30` et cherche les commits de type "fix" ou "correction"
   - Lis `.agent/changelog.md` du jour — cherche des patterns "the user a corrige", "retry", "2e tentative"
   - Lis les fichiers memoire recents (modifies aujourd'hui) — sont-ils complets ?

2. **Verifier la coherence memoire ↔ rules** :
   - Pour chaque memoire de type `feedback_*` : y a-t-il une regle correspondante dans `.agent/rules.md` ?
   - Pour chaque regle dans rules.md : y a-t-il une memoire correspondante ?
   - Detecter les doublons et les contradictions

3. **Detecter les signaux implicites rates** :
   - Cherche dans le changelog les moments ou the user a du repeter une instruction
   - Cherche les patterns "nope", "non", "pk", "essaie a nouveau" — indicateurs de friction
   - Si un signal implicite a ete rate : creer la memoire manquante ET ajouter dans queue.md

4. **Score d'apprentissage** :
   - Corrections capturees du premier coup : [nb] / [total]
   - Corrections ratees (2+ repetitions) : [nb] — LISTER chacune
   - Objectif : 100% capture au premier signal

Le score est inclus dans le rapport final section "Learning Audit".

## Phase 2.95 — Engineering Evals (dry-run)

Verifier que l'agent Engineering serait capable de generer le code attendu sans casser l'archi.
Tournee dry-run : on lit les evals dans `.agent/evals/engineering/code-generation/` et on verifie que les outils de validation sont en place et fonctionnels.

### 1. Smoke test des validators

```bash
node .agent/scripts/validate-all.mjs
```

Si ca fail → BLOQUE l'audit, signaler en CRITIQUE dans le rapport. Sans validators fonctionnels, la generation de code n'est pas safe.

### 2. Lire les evals existants

```bash
ls .agent/evals/engineering/code-generation/
```

Pour chaque eval :
- Verifier qu'il a les sections requises (Input, Bad Output, Good Output, Regle, Criteres)
- Compter les criteres de scoring
- Si un eval est mal forme → flag dans le rapport

### 3. Stats engineering dans le rapport

Inclure :
- Nb d'evals code-generation : [N]
- Validators OK : [bool]
- Issues `auto-fix` ouvertes : [N]
- Issues `enhancement` ouvertes : [N]
- Issues `blueprint` ouvertes : [N]
- PRs blueprint en staging non promues : [N] (a verifier via `gh pr list --base staging`)
- Auto-rollbacks dans les 7 derniers jours : [N] (chercher dans changelog "AUTO-REVERTED")

### 4. Si validators fail, escalade

Si `validate-all.mjs` retourne != 0 :
- Ajouter dans queue.md : "[engineering] CRITIQUE — validators failing, generation de code unsafe"
- Detail des erreurs dans le rapport
- Notifier dans le briefing du matin

## Phase 3 — Improvement Proposals

Analyse le digest + les evenements de la journee pour proposer des ameliorations :

1. **Echecs/rejets** — Lis `.agent/changelog.md` du jour. Si des actions ont ete REJECTED :
   - Identifier le pattern (quel agent, quel type d'erreur)
   - Proposer une correction (nouvelle constraint, nouvelle regle)

2. **Stats d'autonomie** — Pour chaque agent dans `.agent/state.json` :
   - Calculer l'approval rate = approved / total (les stats sont mises a jour en temps reel par le bot Telegram dans approvals.mjs)
   - Verifier les seuils de promotion (cf `.agent/protocols/autonomy-promotion.md`) :
     - Level 0 → 1 : >90% approval sur 20+ actions
     - Level 1 → 2 : >90% approval sur 50+ actions
     - Level 2 → 3 : >95% approval sur 100+ actions (the user valide explicitement)
   - Si un agent atteint le seuil → ajouter dans queue.md : "[promotion] xdeep-[agent]: [current] → [next] ([rate]% approval, [total] actions)"
   - Si un agent est sous 80% sur les 20 dernieres → signaler URGENT demotion dans queue.md
   - Verifier les seuils de demotion :
     - Approval rate < 80% sur les 20 dernieres actions → retour au niveau precedent
     - 1 action critique rejetee → retour a level 0

3. **Croisement research + echecs** — Si une trouvaille du scan resout un probleme detecte → le signaler comme prioritaire

## Etape post-audit — Mettre a jour l'etat partage

1. **`.agent/state.json`** — mettre a jour skills/projets si divergence, incrementer version, maj last_updated
2. **`.agent/rules.md`** — ajouter dans "Lecons apprises" si pattern d'erreur detecte
3. **`.agent/queue.md`** — ajouter les ameliorations qui necessitent validation the user
4. **`.agent/changelog.md`** — ajouter la date + resume des trouvailles

## Auto-ingest post-audit

Si l'audit a produit des trouvailles significatives (nouvelles regles, patterns detectes, corrections) :
1. Sauvegarder un resume dans `.agent/raw/YYYY-MM-DD-nightly-audit.md` (type=document, vertical=platform, tags=[audit, regles])
2. Compiler les regles et patterns dans les articles knowledge concernes (enrichir, pas creer sauf nouveau sujet)
3. Health check
4. Confirmer dans le changelog : `[nightly-audit] Auto-ingest : [article(s)] mis a jour`

Si l'audit est de routine sans nouvelle regle → pas d'ingest (pas de bruit).

## Format du rapport

Le rapport est sauvegarde dans 2 endroits :
1. `$HOME/.xdeep/.nightly-audit-latest.md` — version fichier (detail complet)
2. `$HOME/.xdeep/reports/nightly-audit-YYYY-MM-DD.md` — archive

### Regles de formatage (Telegram-friendly)

Le rapport est lu par the user sur Telegram. Il doit etre lisible en texte brut :
- **Headers en MAJUSCULES** — pas de `#`, `##`, `###`
- **Pas de tableaux markdown** (`| col |`) — utiliser des listes simples
- **Pas de triple backticks** pour les blocs de code
- **Pas de gras/italique markdown** (`**bold**`, `_italic_`) — le texte brut suffit
- **Emojis uniquement en debut de ligne** comme marqueurs visuels
- **Sections conditionnelles** — skip complet si rien a signaler (pas de "aucun")
- **1 ligne = 1 info** — pas de paragraphes denses
- Meme style que /hello : direct, scannable en 30 secondes

### Template de sortie

```
Audit X-DEEP — [jour] [date]. Score [A/B/C/D]. [N] actions, [M] resolues auto.

QUICK WINS (appliques)
- [action faite] — [resultat]
(skip si aucun quick win applique)

A FAIRE (< 30 min)
- [action] — [pourquoi] (~X min)
- [action] — [pourquoi] (~X min)
(skip si rien)

GROS CHANTIERS
- [chantier] — [ROI estime] (~Xh)
(skip si rien)

QUEUE
- [N] items ouverts, [M] resolus cette nuit
- Nouveaux : [liste 1 ligne chacun]
(skip si rien de nouveau)

AGENTS
- [agent] : level [N], [X] actions, [Y]% approval [promotion possible / stable / demotion risque]
(lister uniquement les agents avec un changement ou un seuil proche)

CRM
- [N] relances overdue
- Hot deals inactifs : [noms]
- Corrections the user detectees : [N] — regles apprises
(skip si RAS)

KNOWLEDGE
- [N] articles, [M] stale
- Sources non compilees : [liste]
- Signaux rates : [liste]
(skip si tout OK)

GIT
- [N] commits depuis dernier audit
- Pattern dominant : [type]
- Anomalies : [liste]
(skip si rien de notable)

CODE
- TODO/FIXME restants : [N]
- Securite : [OK ou problemes]
(skip si RAS)

SELF-HEALING
- Issues ouvertes : [N] auto-fix, [N] needs-human
- Bloquees > 48h : [liste]
(skip si 0 issues)

CONTACTS
- Nouveaux detectes : [liste]
- Dormants > 6 mois : [liste]
(skip si rien)

LEARNING
- [X]/[Y] corrections capturees au 1er signal
- Ratees : [liste]
(skip si 100% capture)

REGLES APPRISES
- [regle] (source: [quoi])
(skip si aucune nouvelle regle)

VEILLE
- [top 1-3 trouvailles pertinentes]
(skip si rien de pertinent)
```

### Exemples

Audit propre :
```
Audit X-DEEP — dimanche 13 avril. Score A. 2 actions, 1 resolue auto.

QUICK WINS (appliques)
- state.json v12 : skill orphelin assigne a xdeep-research

A FAIRE (< 30 min)
- Confirmer deploy Railway post-fix Telegram (~10 min)

REGLES APPRISES
- Toujours verifier que le probleme existe avant de re-signaler (source: escalade fantome your outbound tool)
```

Audit charge :
```
Audit X-DEEP — lundi 14 avril. Score C. 8 actions, 3 resolues auto.

QUICK WINS (appliques)
- 2 plans PENDING marques EXECUTED (code existait)
- Item queue obsolete coche (fichier supprime)

A FAIRE (< 30 min)
- Creer skill /comms pour xdeep-comms (~20 min)
- Marquer 3 plans ABANDONED — inactifs > 14j (~5 min)

GROS CHANTIERS
- Integrer Mem0 pour memoire semantique (~1-2j)

CRM
- 3 relances overdue : Dupont (Example Customer A), Martin (Example Customer B), Garcia (Example Customer C)
- 1 hot deal inactif > 7j : Dubois (Thales)

AGENTS
- xdeep-sales : level 0, 25 actions, 92% approval — promotion possible (seuil 90% atteint)

REGLES APPRISES
- Ne pas re-signaler sans cross-check code (source: faux positif plan your outbound tool)
- Toujours verifier l'existence des fichiers orphelins avant escalade

VEILLE
- Claude Code v2.1 : support natif des hooks post-deploy
- MCP Registry : nouveau serveur Stripe disponible
```

## Regles
- Sois factuel — ne propose que des choses concretes et actionnables
- Priorise par impact : quick wins d'abord
- Ne modifie que `.agent/` et le rapport — tu es un auditeur, pas un executeur. **Exception** : les micro-corrections factuelles (marquer un plan EXECUTED quand le code existe, cocher un item queue resolu) sont dans ton scope
- Si tu ne peux pas verifier quelque chose (ex: service externe down), note-le comme "non verifiable"
- Le rapport doit etre lisible en 2 minutes (resume en haut, details en bas)
- **JAMAIS re-signaler un probleme sans verifier qu'il existe encore** — lire le fichier/code concerne AVANT d'incrementer le compteur d'escalade
- **Un plan PENDING dont les livrables existent sur disque est EXECUTED** — le marquer, pas le re-signaler
- **Un item de queue dont le probleme est resolu est [x]** — le cocher avec la preuve (commit, fichier, date)
