#!/usr/bin/env bash
# ============================================================================
#  verifier.sh — contrôle ad-hoc de l'interface (pas une suite de tests :
#  ce dépôt n'en a pas ; ceci vérifie les comportements sur lesquels on est
#  déjà revenu en arrière une fois, donc qu'il ne faut pas recasser).
#
#      ./verifier.sh
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANCEUR="$HERE/argus-ui"
ok=0; ko=0
R() { if [ "$2" = "$3" ]; then echo "  OK   $1"; ok=$((ok+1)); else echo "  FAIL $1 (attendu '$3', obtenu '$2')"; ko=$((ko+1)); fi; }

echo "== 1. Syntaxe =="
bash -n "$LANCEUR" 2>/dev/null && { echo "  OK   argus-ui"; ok=$((ok+1)); } || { echo "  FAIL syntaxe argus-ui"; ko=$((ko+1)); }
command -v node >/dev/null 2>&1 && {
  node --check "$HERE/assets/app.js" 2>/dev/null \
    && { echo "  OK   app.js"; ok=$((ok+1)); } || { echo "  FAIL app.js"; ko=$((ko+1)); }
}
python3 -m py_compile "$HERE/serveur-ui.py" 2>/dev/null \
  && { echo "  OK   serveur-ui.py"; ok=$((ok+1)); } || { echo "  FAIL serveur-ui.py"; ko=$((ko+1)); }

echo "== 2. Aucune adresse personnelle figée (bug corrigé une fois) =="
R "pas de nom de machine en dur" "$(grep -cE 'argus-pc-1|tail49b6d2' "$LANCEUR")" "0"
R "fonction adresse_fixe"        "$(grep -c '^adresse_fixe()' "$LANCEUR")" "1"

echo "== 3. Le TTS est celui d'origine (le sélecteur a été retiré) =="
R "aucun selecteur de voix"      "$(grep -c 'voixSelect' "$HERE/index.html" "$HERE/assets/app.js" "$HERE/assets/style.css" | grep -vc ':0$')" "0"
R "lecture vocale presente"      "$(grep -c 'speechSynthesis' "$HERE/assets/app.js")" "$(grep -c 'speechSynthesis' "$HERE/assets/app.js")"

echo "== 4. La dictée demande le micro AVANT de démarrer =="
R "demanderMicro definie"        "$(grep -c 'function demanderMicro' "$HERE/assets/app.js")" "1"
R "micro reellement demande"      "$(grep -c 'getUserMedia({ audio: true })' "$HERE/assets/app.js")" "1"
R "relance differee sur Android" "$(grep -c 'InvalidStateError' "$HERE/assets/app.js")" "1"

echo "== 5. PWA intacte =="
R "manifest present"             "$([ -f "$HERE/manifest.webmanifest" ] && echo oui)" "oui"
R "service worker present"       "$([ -f "$HERE/sw.js" ] && echo oui)" "oui"
R "cache versionne"              "$(grep -c "const CACHE = 'argus-coquille-v" "$HERE/sw.js")" "1"

echo "== 6. Aucune donnee d'utilisation versionnee =="
R ".etat ignore"                 "$(grep -c '^\.etat/' "$HERE/.gitignore")" "1"
R "aucun .etat suivi par git"    "$(git -C "$HERE" ls-files 2>/dev/null | grep -c '^\.etat')" "0"

echo "== 7. Le lanceur repond sans planter =="
"$LANCEUR" --status >/dev/null 2>&1
R "argus-ui --status (code 0)"   "$?" "0"

echo
echo "===== $ok OK, $ko échec(s) ====="
[ "$ko" -eq 0 ] || exit 1
