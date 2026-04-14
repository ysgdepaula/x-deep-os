#!/usr/bin/env bash
# X-DEEP-OS installer
# Generates your personalized CLAUDE.md and .agent/rules.md from the templates,
# based on a short interactive prompt.

set -euo pipefail

cd "$(dirname "$0")"

BOLD=$'\033[1m'
CYAN=$'\033[36m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
DIM=$'\033[2m'
RESET=$'\033[0m'

echo ""
echo "${BOLD}${CYAN}X-DEEP-OS installer${RESET}"
echo "${DIM}Personal AI OS for CEOs of service businesses.${RESET}"
echo ""
echo "${DIM}X-DEEP is the framework. You'll pick your own prefix (e.g. M-DEEP"
echo "for Marc, A-DEEP for Alex, Y-DEEP for Yan) — it becomes your agent's name.${RESET}"
echo ""

if [[ -f "CLAUDE.md" ]]; then
  echo "${YELLOW}CLAUDE.md already exists.${RESET}"
  read -r -p "Overwrite it? [y/N] " OVERWRITE
  if [[ ! "${OVERWRITE:-N}" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "${BOLD}Tell me about yourself.${RESET}"
echo ""

read -r -p "Your name (e.g. Marc Dubois): " USER_NAME
USER_NAME="${USER_NAME:-User}"

FIRST_LETTER=$(echo "$USER_NAME" | cut -c1 | tr '[:lower:]' '[:upper:]')
DEFAULT_DEEP="${FIRST_LETTER}-DEEP"
read -r -p "Your agent's name (default: ${DEFAULT_DEEP}, e.g. ${FIRST_LETTER}-DEEP / ${FIRST_LETTER}${FIRST_LETTER}-DEEP / MARC-DEEP): " DEEP_NAME
DEEP_NAME="${DEEP_NAME:-$DEFAULT_DEEP}"

read -r -p "Your role (e.g. CEO, Founder, Managing Director): " USER_ROLE
read -r -p "Company name (e.g. Groupe Verdure): " COMPANY_NAME
read -r -p "City (e.g. Lyon, France): " CITY
read -r -p "Languages (e.g. French, English): " LANGUAGES

USER_ROLE="${USER_ROLE:-CEO}"
COMPANY_NAME="${COMPANY_NAME:-Your Company}"
CITY="${CITY:-Your City}"
LANGUAGES="${LANGUAGES:-English}"

# Derive lowercase agent ID prefix from DEEP_NAME (e.g. "M-DEEP" -> "mdeep")
DEEP_ID=$(echo "$DEEP_NAME" | tr '[:upper:]' '[:lower:]' | tr -d '-')

echo ""
echo "${BOLD}Generating files for ${DEEP_NAME}...${RESET}"

render() {
  local src="$1"
  local dest="$2"
  sed \
    -e "s|{{DEEP_NAME}}|${DEEP_NAME}|g" \
    -e "s|{{DEEP_ID}}|${DEEP_ID}|g" \
    -e "s|{{USER_NAME}}|${USER_NAME}|g" \
    -e "s|{{USER_ROLE}}|${USER_ROLE}|g" \
    -e "s|{{COMPANY_NAME}}|${COMPANY_NAME}|g" \
    -e "s|{{CITY}}|${CITY}|g" \
    -e "s|{{LANGUAGES}}|${LANGUAGES}|g" \
    "$src" > "$dest"
  echo "  ${GREEN}✓${RESET} $dest"
}

render "CLAUDE.template.md" "CLAUDE.md"

# rules.md — initialize
if [[ ! -f ".agent/rules.md" ]]; then
  cat > .agent/rules.md <<RULES_EOF
# ${USER_NAME}'s Rules — ${DEEP_NAME}

> Self-evolving rules. Nightly-audit and learning protocol append to this file.
> Each rule has a date, a source, and a reason.

## Format
\`[YYYY-MM-DD] <rule> (source: <agent|user> — <context>)\`

## Rules

<!-- Rules will be added over time. Examples:
[2026-04-14] ASCII-only email subjects (source: user — MCP Gmail corrupts UTF-8)
[2026-04-14] Always git pull before working (source: user)
-->
RULES_EOF
  echo "  ${GREEN}✓${RESET} .agent/rules.md"
fi

# Personalize agent templates: X-DEEP -> {{DEEP_NAME}}, xdeep- -> {deep_id}-
for template in .agent/templates/*.yaml; do
  [[ "$(basename "$template")" == "_base.yaml" ]] && continue
  sed -i.bak \
    -e "s|X-DEEP|${DEEP_NAME}|g" \
    -e "s|xdeep-|${DEEP_ID}-|g" \
    -e "s|{{USER_NAME}}|${USER_NAME}|g" \
    -e "s|{{COMPANY}}|${COMPANY_NAME}|g" \
    -e "s|{{ROLE}}|${USER_ROLE}|g" \
    "$template"
  rm -f "${template}.bak"
done

if [[ -f ".agent/templates/xdeep-master.yaml" ]]; then
  mv ".agent/templates/xdeep-master.yaml" ".agent/templates/${DEEP_ID}-master.yaml"
fi
echo "  ${GREEN}✓${RESET} .agent/templates/ (agents personalized, master renamed to ${DEEP_ID}-master)"

echo ""
echo "${BOLD}${GREEN}Done. Welcome to ${DEEP_NAME}.${RESET}"
echo ""
echo "${BOLD}Next steps:${RESET}"
echo "  1. Review your generated ${CYAN}CLAUDE.md${RESET} and customize further"
echo "  2. Configure MCP servers (Gmail, Notion, Calendar, bank, etc.) — see ${CYAN}docs/customize.md${RESET}"
echo "  3. (Optional) Deploy the Telegram bot for 24/7 access — see ${CYAN}docs/deployment.md${RESET}"
echo "  4. Open Claude Code in this directory and say 'hello' to test"
echo ""
echo "${DIM}Your CLAUDE.md and .agent/rules.md are gitignored — they stay local.${RESET}"
echo ""
