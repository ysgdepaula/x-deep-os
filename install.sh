#!/usr/bin/env bash
# Y-DEEP installer — generates your personalized CLAUDE.md and .agent/rules.md
# from the templates, based on a short interactive prompt.

set -euo pipefail

cd "$(dirname "$0")"

BOLD=$'\033[1m'
CYAN=$'\033[36m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
DIM=$'\033[2m'
RESET=$'\033[0m'

echo ""
echo "${BOLD}${CYAN}Y-DEEP installer${RESET}"
echo "${DIM}Personal AI OS built on Claude Code.${RESET}"
echo ""

if [[ -f "CLAUDE.md" ]]; then
  echo "${YELLOW}CLAUDE.md already exists.${RESET}"
  read -r -p "Overwrite it? [y/N] " OVERWRITE
  if [[ ! "${OVERWRITE:-N}" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "${BOLD}Tell me about yourself.${RESET} All fields are plain text."
echo ""

read -r -p "Your name (e.g. Alex Martin): " USER_NAME
read -r -p "Your role (e.g. CEO, Founder, PM, Solo developer): " USER_ROLE
read -r -p "Company name (e.g. Acme Labs): " COMPANY_NAME
read -r -p "City (e.g. Berlin, Germany): " CITY
read -r -p "Languages (e.g. English, French): " LANGUAGES

USER_NAME="${USER_NAME:-User}"
USER_ROLE="${USER_ROLE:-Founder}"
COMPANY_NAME="${COMPANY_NAME:-Your Company}"
CITY="${CITY:-Your City}"
LANGUAGES="${LANGUAGES:-English}"

echo ""
echo "${BOLD}Generating files...${RESET}"

render_template() {
  local src="$1"
  local dest="$2"
  sed \
    -e "s|{{USER_NAME}}|${USER_NAME}|g" \
    -e "s|{{USER_ROLE}}|${USER_ROLE}|g" \
    -e "s|{{COMPANY_NAME}}|${COMPANY_NAME}|g" \
    -e "s|{{CITY}}|${CITY}|g" \
    -e "s|{{LANGUAGES}}|${LANGUAGES}|g" \
    "$src" > "$dest"
  echo "  ${GREEN}✓${RESET} $dest"
}

render_template "CLAUDE.template.md" "CLAUDE.md"

# rules.md — initialize empty user-specific file
if [[ ! -f ".agent/rules.md" ]]; then
  cat > .agent/rules.md <<RULES_EOF
# ${USER_NAME}'s Rules

> Self-evolving rules. Nightly-audit and learning protocol append to this file.
> Each rule has a date, a source, and a reason.

## Format
\`[YYYY-MM-DD] <rule> (source: <agent|user> — <context>)\`

## Rules

<!-- Rules will be added here over time. Examples:
[2026-04-14] ASCII-only email subjects (source: user — MCP Gmail corrupts UTF-8)
[2026-04-14] Always git pull before working and before pushing (source: user)
-->
RULES_EOF
  echo "  ${GREEN}✓${RESET} .agent/rules.md"
fi

# Anonymize agent templates to user's company/name
for template in .agent/templates/*.yaml; do
  [[ "$(basename "$template")" == "_base.yaml" ]] && continue
  sed -i.bak \
    -e "s|{{USER_NAME}}|${USER_NAME}|g" \
    -e "s|{{COMPANY}}|${COMPANY_NAME}|g" \
    -e "s|{{ROLE}}|${USER_ROLE}|g" \
    "$template"
  rm -f "${template}.bak"
done
echo "  ${GREEN}✓${RESET} .agent/templates/ (agents personalized)"

echo ""
echo "${BOLD}${GREEN}Done.${RESET}"
echo ""
echo "${BOLD}Next steps:${RESET}"
echo "  1. Review your generated ${CYAN}CLAUDE.md${RESET} and customize further"
echo "  2. Configure MCP servers — see ${CYAN}docs/customize.md${RESET}"
echo "  3. (Optional) Deploy the Telegram bot — see ${CYAN}docs/deployment.md${RESET}"
echo "  4. Open Claude Code in this directory and say 'hello' to test"
echo ""
echo "${DIM}Your CLAUDE.md and .agent/rules.md are gitignored — they stay local.${RESET}"
echo ""
