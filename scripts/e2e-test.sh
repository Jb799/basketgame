#!/usr/bin/env bash
# Test end-to-end du hub BasketGame : pages, découverte, partie gagnante,
# proxy, reset, arrêt. Usage : bash scripts/e2e-test.sh
set +e
cd "$(dirname "$0")/.."

pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; }
check() { if [ "$1" = "$2" ]; then pass "$3 ($1)"; else fail "$3 (attendu $2, reçu $1)"; fi; }

# Nettoyage des ports
lsof -tnP -iTCP:3000 -iTCP:3101 2>/dev/null | xargs kill -9 2>/dev/null
sleep 1
echo '{"1":0,"2":0}' > games/puissance4/server/scores.json

node hub/index.js > /tmp/hub.log 2>&1 &
HUB_PID=$!
sleep 2

echo "── Pages & assets ──"
check "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/)" 200 "contrôleur /"
check "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/tv)" 200 "télé /tv"
check "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/shared/ws-client.js)" 200 "shared/ws-client.js"

echo "── API hub ──"
check "$(curl -s http://localhost:3000/api/health | grep -c '"status":"idle"')" 1 "health idle"
check "$(curl -s http://localhost:3000/api/games | grep -c '"id":"puissance4"')" 1 "découverte puissance4"
check "$(curl -s -o /dev/null -w '%{http_code}' -X POST 'http://localhost:3000/api/trigger?col=3')" 503 "trigger sans jeu → 503"

echo "── Profils joueurs ──"
TMP_JPG=$(mktemp /tmp/bg-photo.XXXXXX.jpg)
printf '\xff\xd8\xff\xe0testjpeg' > "$TMP_JPG"
P1=$(curl -s -X POST http://localhost:3000/api/players -H 'Content-Type: application/json' -d '{"pseudo":"E2E-Un"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).player.id')
P2=$(curl -s -X POST http://localhost:3000/api/players -H 'Content-Type: application/json' -d '{"pseudo":"E2E-Deux"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).player.id')
for id in "$P1" "$P2"; do
  for v in idle win lose; do
    curl -s -X PUT "http://localhost:3000/api/players/$id/photos/$v" -H 'Content-Type: image/jpeg' --data-binary @"$TMP_JPG" > /dev/null
  done
done
check "$(curl -s http://localhost:3000/api/players | grep -o '"hasAllPhotos":true' | wc -l | tr -d ' ')" 2 "2 profils avec 3 photos"
check "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/games/puissance4/start)" 400 "start sans roster → 400"

echo "── Démarrage du jeu ──"
curl -s -X POST http://localhost:3000/api/games/puissance4/start -H 'Content-Type: application/json' -d "{\"roster\":[\"$P1\",\"$P2\"]}" > /dev/null
check "$(curl -s http://localhost:3000/api/health | grep -c '"status":"running"')" 1 "jeu running"
check "$(curl -s http://localhost:3000/play/api/state | grep -c '"pseudo":"E2E-Un"')" 1 "roster transmis au jeu"
check "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/play/)" 200 "proxy /play/"
check "$(curl -s http://localhost:3000/play/ | grep -c '<title>')" 1 "proxy sert l'UI du jeu"

echo "── Partie gagnante P1 (vertical) ──"
for col in 0 1 0 1 0 1 0; do
  curl -s -X POST "http://localhost:3000/api/trigger?col=$col" > /dev/null
done
check "$(curl -s http://localhost:3000/play/api/state | grep -c '"winner":1')" 1 "victoire joueur 1 détectée"
check "$(curl -s http://localhost:3000/play/api/state | grep -c '"1":1')" 1 "score J1 = 1"

echo "── Contrôles du jeu (controller actions) ──"
check "$(curl -s http://localhost:3000/api/games | grep -c '"id":"reset-round"')" 1 "actions exposées dans /api/games"
curl -s -X POST http://localhost:3000/api/games/action/reset-round > /dev/null
check "$(curl -s http://localhost:3000/play/api/state | grep -c '"isOver":false')" 1 "reset-round via hub → manche relancée"

echo "── Arrêt ──"
curl -s -X POST http://localhost:3000/api/games/stop > /dev/null
check "$(curl -s http://localhost:3000/api/health | grep -c '"status":"idle"')" 1 "retour à idle"
check "$(curl -s -o /dev/null -w '%{http_code}' -X POST 'http://localhost:3000/api/trigger?col=2')" 503 "trigger après stop → 503"

echo "── Nettoyage profils de test ──"
curl -s -X DELETE "http://localhost:3000/api/players/$P1" > /dev/null
curl -s -X DELETE "http://localhost:3000/api/players/$P2" > /dev/null
rm -f "$TMP_JPG"

kill -9 $HUB_PID 2>/dev/null
lsof -tnP -iTCP:3000 -iTCP:3101 2>/dev/null | xargs kill -9 2>/dev/null
echo '{"1":0,"2":0}' > games/puissance4/server/scores.json
echo "DONE"
