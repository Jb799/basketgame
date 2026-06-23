# Siège Zombie — Règles et objectif

Jeu **coopératif** pour la plateforme BasketGame : des zombies escaladent un immeuble en ruine sur **7 colonnes** (alignées sur le plateau physique). Tous les joueurs défendent ensemble en lançant des ballons dans les paniers — chaque trigger ESP32 tire dans la colonne correspondante.

## Objectif

Survivre le plus longtemps possible en éliminant les zombies **avant qu'ils n'atteignent le toit** (rangée des fenêtres). Le score monte à chaque kill ; le **TOP score** est persisté entre les parties.

## Règles

| Règle | Détail |
|-------|--------|
| Mode | Coop — pas de tours, autant de joueurs que souhaité |
| Colonnes | 7 (index 0 = gauche → 6 = droite), contrainte matérielle |
| Rangées | 10 (0 = fenêtres / toit, 9 = sol) |
| Vies | **3** au départ (`START_LIVES`) |
| Tir | 💣 tombe toujours ; à l'impact (~620 ms) explosion 💥 + tache verte si kill |
| Colonne vide à l'impact | Bombe continue dans le vide, pas de pénalité |
| Brèche | Un zombie atteint la rangée 0 → **-1 vie**, fenêtre brisée |
| Game Over | 0 vies restantes |
| Vagues | Enchaînées avec pause de 3 s ; difficulté croissante |

## Scoring

- **Par kill** : `100 + vague × 25` points
- **Bonus fin de vague** : `vague × 200` points
- **TOP score** : enregistré dans `server/scores.json` (`highScore`, `bestWave`)

## Vagues — formule de difficulté

Pour la vague `w` :

| Paramètre | Formule |
|-----------|---------|
| Zombies total | `4 + w × 2` |
| Intervalle spawn | `max(600, 4500 - w × 350)` ms |
| Intervalle montée | `max(350, 2800 - w × 180)` ms |
| Points / kill | `100 + w × 25` |
| Bonus clear | `w × 200` |

## Interface

Rendu télé avec **emojis** : 🧟 zombies, 🧑 défenseurs (fenêtres), 💣 projectiles. Lors d'une brèche, la **colonne touchée** pulse en rouge avec 💥 en haut pour indiquer où la horde a passé.

| Source | Usage |
|--------|-------|
| `shared/constants.js` | `PLATFORM_COLUMNS` (7) |
| `shared/server/createGameServer` | Serveur HTTP + WebSocket |
| Persistance custom | `server/scores.json` (TOP score coop) |

Pas de `TurnManager`, `grid7` ni `Scoring` multi-joueurs — logique spécifique tower defense.

## Moteur d'animation client

Le client repose sur un positionnement **100 % pixel** mesuré depuis le DOM réel, pour que zombies, bombes et effets partagent exactement le même repère (plus de décalage explosion / tache verte).

| Module | Rôle |
|--------|------|
| `public/js/layout.js` | Mesure les centres des slots (col × row) en pixels, recalculés au `resize` |
| `public/js/entities.js` | Sprites zombie en `transform: translate` ; montée par tween RAF unique ; `freeze` + mort |
| `public/js/shots.js` | Séquenceur de tir `THROW → FALL → IMPACT` ; bufferise `SHOT_RESULT` jusqu'à l'impact ; FX en pixels |
| `public/js/app.js` | Routing WebSocket minimal vers `Shots` / `Entities` / `UI` |

**Sons** : API partagée `window.Sounds` (plus de `SiegeSounds` local). Spawn `spawn()`, tir `throwProjectile()`, kill `meleeHit()` + `scorePop()`, vague `levelComplete()`, game over `gameOver()`. Catalogue : [`docs/SOUNDS.md`](../../../docs/SOUNDS.md).

Principe clé : à réception du `SHOT_RESULT` touché, le zombie visé est **gelé** instantanément ; la bombe vient se poser sur ce point figé, où explosion, tache verte et score apparaissent, puis le zombie chute. Tout est donc parfaitement aligné.

## Constantes serveur

| Constante | Valeur |
|-----------|--------|
| `START_LIVES` | 3 |
| `ROWS` | 10 |
| `WAVE_BREAK_MS` | 3000 |
| `TICK_MS` | 200 |
| `THROW_MS` | 140 |
| `FALL_MS` | 480 |
| `PROJECTILE_IMPACT_MS` | 620 (`THROW_MS + FALL_MS`) |

## Contrôleur

- **Nouvelle partie** — reset score de la manche en cours (TOP conservé)
- **Réinitialiser TOP score** — remet `highScore` et `bestWave` à 0
