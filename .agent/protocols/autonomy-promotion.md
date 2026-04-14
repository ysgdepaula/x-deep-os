# Protocole de Promotion d'Autonomie — X-DEEP

> Les sous-agents gagnent en autonomie progressivement, basé sur leur track record.

## Niveaux d'autonomie

| Level | Comportement | Description |
|-------|-------------|-------------|
| **0** | Propose → the user execute | L'agent propose des actions, the user les valide et les execute |
| **1** | Execute → the user approve avant | L'agent prepare l'execution, the user doit approuver avant envoi |
| **2** | Execute → the user review apres | L'agent execute, the user review apres coup (peut reverter) |
| **3** | Full autonome | L'agent execute sans supervision, audit hebdo uniquement |

## Criteres de promotion

| Transition | Condition | Qui decide |
|-----------|-----------|------------|
| 0 → 1 | >90% approval rate sur 20+ actions | X-DEEP Research propose, X-DEEP master valide |
| 1 → 2 | >90% approval rate sur 50+ actions | X-DEEP Research propose, X-DEEP master valide |
| 2 → 3 | >95% approval rate sur 100+ actions | X-DEEP Research propose, the user valide explicitement |

## Criteres de demotion

| Condition | Action |
|-----------|--------|
| Approval rate < 80% sur les 20 dernieres actions | Retour au niveau precedent |
| 1 action critique rejetee (perte de donnees, email incorrect envoye) | Retour a level 0 + review post-mortem |

## Processus

1. **X-DEEP Research** analyse les stats d'autonomie dans le nightly-audit
2. Si un agent atteint le seuil → propose la promotion dans `.agent/queue.md`
3. **X-DEEP master** presente la proposition a the user dans le `/briefing`
4. the user valide ou refuse
5. Si valide → mise a jour du `autonomy_level` dans state.json + templates
6. Log dans changelog : `[promotion] agent-sales: 0 → 1 (92% approval, 25 actions)`

## Tracking

Les stats sont dans `.agent/state.json` sous `agents.{id}.stats` :
- `total` : nombre total d'actions
- `approved` : nombre d'actions approuvees (par Validator ou par the user)
- `rejected` : nombre d'actions rejetees

Le nightly-audit met a jour les stats et calcule l'approval rate.

## Garde-fous

- Level 3 n'est jamais attribue automatiquement — the user doit le valider explicitement
- Les actions financieres (paiements) passent TOUJOURS par validation, meme en level 3
- Apres une demotion, le compteur repart a zero pour cette transition
