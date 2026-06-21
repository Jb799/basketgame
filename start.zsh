#!/usr/bin/env zsh
#
# start.zsh — Lance BasketGame sur macOS
#
# Usage :
#   ./start.zsh           # démarre le hub (production)
#   ./start.zsh --dev     # mode développement (rechargement auto)
#   ./start.zsh --open    # ouvre contrôleur + télé dans le navigateur
#   ./start.zsh --install # force npm install avant le démarrage
#

set -e

ROOT="${0:A:h}"
cd "$ROOT"

PORT_HUB="${PORT:-3000}"
PORT_GAME="${GAME_PORT:-3101}"

# ─── Couleurs ────────────────────────────────────────────────────────────────
autoload -Uz colors && colors
info()  { print -P "%F{cyan}▸%f $*" }
ok()    { print -P "%F{green}✔%f $*" }
warn()  { print -P "%F{yellow}⚠%f $*" }
err()   { print -P "%F{red}✖%f $*" >&2 }

# ─── Options ─────────────────────────────────────────────────────────────────
MODE="start"
OPEN_BROWSER=false
FORCE_INSTALL=false

for arg in "$@"; do
  case "$arg" in
    --dev)     MODE="dev" ;;
    --open)    OPEN_BROWSER=true ;;
    --install) FORCE_INSTALL=true ;;
    -h|--help)
      print "Usage: ./start.zsh [--dev] [--open] [--install]"
      print ""
      print "  --dev      Rechargement auto (npm run dev)"
      print "  --open     Ouvre le contrôleur et la télé dans Safari/Chrome"
      print "  --install  Force npm install avant le démarrage"
      exit 0
      ;;
    *)
      err "Option inconnue : $arg (essayez --help)"
      exit 1
      ;;
  esac
done

# ─── Node.js ─────────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  err "Node.js introuvable. Installez Node.js >= 18 : https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if (( NODE_MAJOR < 18 )); then
  err "Node.js >= 18 requis (version actuelle : $(node -v))"
  exit 1
fi

# ─── Dépendances ─────────────────────────────────────────────────────────────
if [[ "$FORCE_INSTALL" == true ]] || [[ ! -d node_modules ]]; then
  info "Installation des dépendances…"
  npm install
  ok "Dépendances prêtes"
fi

# ─── Libérer les ports si occupés ────────────────────────────────────────────
free_port() {
  local port=$1
  local pids
  pids=($(lsof -tnP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true))
  if (( ${#pids[@]} > 0 )); then
    warn "Port $port occupé (PID ${pids[*]}) — arrêt du processus…"
    kill -9 "${pids[@]}" 2>/dev/null || true
    sleep 0.5
  fi
}

free_port "$PORT_HUB"
free_port "$PORT_GAME"

# ─── IP locale (Wi-Fi / Ethernet) ────────────────────────────────────────────
local_ip() {
  local ip=""
  for iface in en0 en1; do
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    [[ -n "$ip" ]] && { print -r "$ip"; return 0 }
  done
  print -r "localhost"
}

IP=$(local_ip)

# ─── Bannière ────────────────────────────────────────────────────────────────
print ""
print -P "%F{magenta}╔══════════════════════════════════════════════════════╗%f"
print -P "%F{magenta}║%f       🏀  %B BasketGame%b — Lancement sur macOS          %F{magenta}║%f"
print -P "%F{magenta}╚══════════════════════════════════════════════════════╝%f"
print ""
ok "Node $(node -v)"
print ""
info "Contrôleur (PC / mobile) :  %Bhttp://${IP}:${PORT_HUB}/%b"
info "Télé (grand écran)       :  %Bhttp://${IP}:${PORT_HUB}/tv%b"
info "Capteurs IR (dashboard) :  %Bhttp://${IP}:${PORT_HUB}/sensors%b"
info "Trigger manuel/simulateur:  POST http://${IP}:${PORT_HUB}/api/trigger?col=N"
print ""

if [[ "$OPEN_BROWSER" == true ]]; then
  info "Ouverture du navigateur…"
  open "http://localhost:${PORT_HUB}/" 2>/dev/null || true
  open "http://localhost:${PORT_HUB}/tv" 2>/dev/null || true
fi

info "Ctrl+C pour arrêter le serveur"
print ""

# ─── Démarrage ─────────────────────────────────────────────────────────────────
trap 'print ""; warn "Arrêt de BasketGame…"; exit 0' INT TERM

if [[ "$MODE" == "dev" ]]; then
  exec npm run dev
else
  exec npm start
fi
