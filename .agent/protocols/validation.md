# Protocole de Validation — X-DEEP

> Chaque action a haut risque passe par ce flow avant execution.

## Classification des risques

| Risque | Exemples | Validation |
|--------|----------|------------|
| **LOW** | Lire un email, chercher sur le web, consulter Notion, analyser des donnees | Aucune — execution directe |
| **HIGH** | Envoyer un email, modifier le CRM, creer un draft, publier du contenu, paiement, suppression | Validation obligatoire |

## Flow de validation

```
Sous-agent produit un output
        │
        ▼
  Risque LOW? ──yes──→ Execution directe
        │
       no
        │
        ▼
  X-DEEP Validator recoit :
    - La demande originale (contexte + intent)
    - L'output du sous-agent
    - Les constraints de l'agent (depuis son template YAML)
        │
        ▼
  Verification :
    1. Coherence output ↔ demande originale
    2. Respect des constraints de l'agent
    3. Respect de .agent/rules.md
    4. Pas d'hallucination factuelle
    5. Regles techniques (ASCII email subjects, routing email correct, etc.)
        │
        ▼
  Verdict :
    APPROVED → execution + log dans changelog
    REJECTED → feedback au sous-agent (raison + suggestion)
        │
        ▼
  Si REJECTED :
    - Sous-agent corrige et re-soumet (max 2 retries)
    - Si toujours REJECTED apres 2 retries → escalade X-DEEP master
    - X-DEEP master decide : forcer, modifier, ou abandonner
```

## Regles

- Le Validator ne modifie jamais l'output — il approuve ou rejette
- Chaque decision est loguee dans `.agent/changelog.md` avec : agent, action, verdict, raison
- Les stats de validation alimentent les `autonomy_stats` de l'agent dans state.json
- Un APPROVED incremente `approved`, un REJECTED incremente `rejected`
- Le Validator n'a pas d'opinion sur la strategie — il verifie la conformite

## Exemptions

Les agents avec `output_validation: none` ne passent pas par ce flow.
Les agents en autonomy_level 3 ne passent par le Validator que pour les actions financieres (paiements).
