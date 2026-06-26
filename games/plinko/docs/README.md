# Plinko — Documentation du jeu

> Lancez la balle dans une des 7 colonnes, regardez-la rebondir sur les clous et atterrir dans une case du bas.

## Objectif

Accumuler le maximum de **pièces** en 5 tours. Chaque case du bas rapporte des pièces, des bombes (perte), des mini-jeux spéciaux ou rien (neutre). Le joueur avec le plus de pièces à la fin remporte la partie.

### Victoire et égalité

1. **Classement** par score final décroissant.
2. **Départage** : si égalité de score, le joueur ayant **collecté le plus de pièces** (`coinsWon`) est devant.
3. **Égalité parfaite** (même score **et** mêmes pièces récoltées entre plusieurs joueurs en tête) : **aucun vainqueur** — l'écran affiche **« Égalité ! »** avec les ex-aequo (pas de pluie de têtes, pas de médaille d'or unique).

## Règles

| Élément | Valeur |
|---------|--------|
| Colonnes ESP32 | 7 (`0`–`6`) |
| Joueurs | 2 à 5 (choisi au lancement depuis le contrôleur) |
| Tours | 5 |
| Coups par tour | Chaque joueur joue **une fois** sur le **même plateau** |
| Nouveau plateau | Généré aléatoirement au début de chaque tour |

### Profils joueurs (roster, optionnel)

Plinko déclare `controller.optionalPlayerRoster` : au lancement, le contrôleur propose
le nombre de joueurs (2–5) et un **choix optionnel** de profil par emplacement (page `/players`).
Les profils **sans photos complètes** sont sélectionnables ; repli initiales sur la télé.
Sans sélection : avatars par défaut (initiales **J1**, **J2**…).
Le hub transmet un `roster` enrichi dans `state.roster` lorsqu'au moins un profil est choisi
(voir [`API.md`](API.md)).

Le module partagé `window.PlayerFaces` affiche la photo du profil ou le placeholder initiales :

| Moment | Photo utilisée |
|--------|----------------|
| Onglet joueur | `idle` (ou initiales) |
| Gain de pièces (score volant + onglet) | `win` |
| Perte de pièces / vol subi | `lose` |
| Podium — 1er | `win` |
| Podium — dernier | `lose` |
| Podium — autres | `idle` |

Les visages sont affichés en grand sur la télé : score volant en taille `lg`, podium
en `xl`/`xxl`. À l'affichage du podium, une **pluie de têtes** du vainqueur
(`PlayerFaces.rainHeads`, variante `win`) fait tomber la photo de victoire en cascade
(ou le cutout / initiales si pas de photo). En cas d'**égalité**, la pluie est désactivée.

### Déroulement

1. Le contrôleur choisit le nombre de joueurs (2–5) puis lance le jeu.
2. Un plateau aléatoire apparaît sur la télé (clous + cases).
3. Le joueur actif lance la balle via le plateau physique (trigger ESP32).
4. La balle descend et dévie sur les clous (physique : angle d'impact, élan latéral, légère attraction centre + variation aléatoire — pas un simple 50/50).
5. Elle atterrit dans une case : gain ou perte de pièces.
6. Au tour du joueur suivant, jusqu'à ce que tous aient joué.
7. Nouveau plateau → tour suivant.
8. Après 5 tours : **podium** + statistiques.

### Types de cases

| Type | Effet | Visuel |
|------|-------|--------|
| `coin` | +5 à +50 pièces (multiple de 5) | 1 à 5 icônes 🪙 selon le montant |
| `bomb` | -5 à -30 pièces (multiple de 5) | 💣 petite (-5/-10) / moyenne (-15/-20) / grande (-25/-30) |
| `neutral` | 0 | — |
| `knife` | Mini-jeu Couteau (rejeu) | 🔪 |
| `thief` | Mini-jeu Voleur | 🦹 |
| `golden` | Mini-jeu Panier d'Or (rejeu) | 🏆 |

**Probabilités approximatives** (génération aléatoire par case) : pièce 47 %, bombe 22 %, neutre 11 %, couteau 7,5 %, voleur 7,5 %, or 5 %. Les pièces/bombes/neutres sont nettement plus fréquents que les cases spéciales.

Les largeurs des cases et leur répartition sont **aléatoires** à chaque tour.

**Plancher à zéro** : un joueur ne peut pas descendre sous 0 pièce. Si une bombe dépasse le solde, seules les pièces disponibles sont perdues.

**Affichage** : chaque joueur voit `🪙` + son total de pièces (jamais négatif).

**Animation balle** : chute avec élan plafonné (vitesse max ~×1,65) — accélération progressive en série du même côté, sans excès.

**Mode feu 🔥** : 3× même côté → flammes sur la balle. Atterrissage en feu → **×2 géant** plein écran + montant (`+100`, `-28`…) qui vole vers l’onglet joueur avec sons (`Sounds.multiplierX2`, `scoreImpactGain` / `scoreImpactLoss`, `coinWin`).

**Sons** : API partagée `window.Sounds` (fichiers dans `/shared/sounds/`). Lancer `dropStart`, rebonds `tokenLand`, bombe `bombHit`, podium `victory`, couteau `meleeHit`. Catalogue complet : [`docs/SOUNDS.md`](../../../docs/SOUNDS.md).

**Transition plateau** : au nouveau tour (`BOARD_READY`), les cases et clous actuels défilent vers la droite ; le nouveau plateau entre en glissant depuis la gauche (effet bandeau). La balle disparaît dès l'atterrissage ou au changement de tour.

### Indicateur LED colonne (zone de lancement)

Chaque colonne du haut (zone ESP32, index `0`–`6`) affiche une **pastille LED** (`.drop-col__led`).

- Au lancer : la colonne détectée (`entryCol`) **clignote** pendant toute la chute.
- À l'atterrissage : 2–3 pulses rapides confirment la colonne visée, puis extinction.
- Même logique visuelle sur la rangée mini-jeu (colonnes `1`–`7`).

### Mini-jeux Couteau, Voleur et Panier d'Or

Quand la balle atterrit sur une case **couteau** ou **voleur** :

> Si **aucun adversaire** n'a de pièces (`score > 0`), le mini-jeu est **annulé** (`minigameSkipped: true`) — le tour passe normalement sans second lancer.

1. La balle **termine sa chute** sur la case + FX d'atterrissage.
2. Pause HUD (~0,4 s) puis bannière d'intro (~0,65 s) « MINI-JEU COUTEAU / VOLEUR ».
3. L'overlay mini-jeu remplace **uniquement la zone plateau** (tabs joueurs visibles en bas) : grille **7 colonnes** avec repères **`1`–`7`** en haut (affichage joueur ; l'ESP32 reste indexé `0`–`6`), cases **VIDE** 🕳️ ou **numéro de joueur** en grand.
4. Les données du layout arrivent dans `BALL_DROP.minigameStart` (et en secours via `MINIGAME_START` ou `state.minigame`).
5. Le joueur actif **relance la balle** via l'ESP32 pour viser une colonne (trigger `0`–`6` = colonne affichée `1`–`7`).
6. **VIDE** → texte PERDU, aucun effet sur les scores.
7. **Joueur touché** → slot machine affiche un **pourcentage tiré** parmi **5 %, 10 %, 15 %, 20 %, 25 %**, puis le **montant entier** réellement appliqué (arrondi, minimum 1 pièce si la victime en a) :
   - **Couteau** : la victime **perd** ce montant (plancher 0).
   - **Voleur** : la victime **perd** N et le lanceur **gagne exactement N**.
8. Le tour passe ensuite normalement au joueur suivant sur le **même plateau Plinko** (pas de second lancer principal, pas de nouveau plateau avant la fin du tour).

Le mode feu **ne s'applique pas** aux cases couteau/voleur/or.

### Mini-jeu Panier d'Or

Quand la balle atterrit sur une case **or** (`golden`) :

> Contrairement au couteau/voleur, le mini-jeu **n'est jamais annulé** (pas de victime requise).

1. Même séquence d'intro que les autres mini-jeux (FX atterrissage, pause, bannière).
2. Overlay **Panier d'Or** : un panier 🏆 glisse sur **toute la largeur** de la grille (colonnes 1 → 7 → 1), aligné sur la rangée du haut, à vitesse constante (~9 s par aller-retour).
3. Le montant affiché sur le panier est tiré une fois à l'armement : **50 à 100 pièces** (entier).
4. Le mouvement démarre à l'armement serveur (`MINIGAME_START`, `movementStartedAt`) — le client synchronise l'animation sur ce timestamp.
5. Le joueur **relance** via l'ESP32 : si la colonne tirée = colonne du panier **à cet instant**, il gagne le montant affiché ; sinon raté (0 pièce).
6. Le tour passe au joueur suivant sur le même plateau.

## Layout télé (alignement physique)

- **7 colonnes** collées en haut de l'écran (`--zone-drop: 6%`) — alignées avec le plateau physique au-dessus de la télé.
- **Clous** sur toute la largeur de l'écran (motif triangulaire, 11 clous par rangée paire).
- **Cases** en bas (`--zone-slots: 14%`).
- **HUD + tabs joueurs** regroupés en bas dans `.bottom-dock`.

## Phases et délais

| Phase | Description | Triggers |
|-------|-------------|----------|
| `playing` | En attente du lancer | acceptés |
| `minigame_knife` | Mini-jeu Couteau — viser une colonne | acceptés (après armement) |
| `minigame_thief` | Mini-jeu Voleur — viser une colonne | acceptés (après armement) |
| `minigame_golden` | Mini-jeu Panier d'Or — viser le panier mobile | acceptés (après armement) |
| `resolving` | Résultat en cours (chute, FX, changement de tour) | refusés (`RESOLVING`) |
| `board_transition` | Nouveau plateau en glissement (~2,5 s) | refusés (`BOARD_TRANSITION`) |
| `round_summary` | Fin d'un tour (~4 s) | refusés (`ROUND_SUMMARY`) |
| `game_over` | Podium | refusés |

Après une chute normale : le serveur attend `RESOLVE_MS` (6500 ms) avant `TURN_CHANGE` / `ROUND_END` / `GAME_OVER`. Ce délai couvre la chute, les FX (×2 feu, score volant) et la pause résultat côté télé.

Après une case couteau/voleur/or : la phase reste `resolving` pendant la chute et les intros client ; le mini-jeu n'est **armé** qu'après `MINIGAME_ARM_MS` (5500 ms), ce qui empêche un second lancer pendant l'animation de la balle précédente.

Après un mini-jeu : `MINIGAME_RESOLVE_MS` (5500 ms) après `MINIGAME_RESULT`.

Au nouveau tour : phase `board_transition` pendant `BOARD_TRANSITION_MS` (2500 ms) après `BOARD_READY`, le temps que le bandeau de plateau défile sur la télé.

## Constantes (serveur)

| Constante | Valeur | Fichier |
|-----------|--------|---------|
| `TOTAL_ROUNDS` | 5 | `server/game.js` |
| `MIN_PLAYERS` / `MAX_PLAYERS` | 2 / 5 | `server/game.js` |
| `PLATFORM_COLUMNS` | 7 | `shared/constants.js` |
| `RESOLVE_MS` | 6500 | `server/index.js` |
| `MINIGAME_ARM_MS` | 5500 | `server/index.js` |
| `MINIGAME_RESOLVE_MS` | 5500 | `server/index.js` |
| `MINIGAME_PERCENTS` | 5, 10, 15, 20, 25 (%) | `shared/modules/plinko/minigame.js` |
| `GOLDEN_BASKET_MIN` / `MAX` | 50 / 100 pièces | `shared/modules/plinko/minigame.js` |
| `GOLDEN_BASKET_PERIOD_MS` | 9000 (aller-retour 0→6→0) | `shared/modules/plinko/minigame.js` |
| `FIRE_STREAK_MIN` | 3 | `shared/modules/plinko/simulator.js` |
| `ROUND_SUMMARY_MS` | 4000 | `server/index.js` |
| `BOARD_TRANSITION_MS` | 2500 | `server/index.js` |
| `PEGS_PER_ROW` | 11 | `shared/modules/plinko/board-generator.js` |

## Modules composés

| Module | Rôle |
|--------|------|
| `shared/modules/plinko` | Génération plateau + simulation de chute + layout mini-jeu |
| `shared/modules/plinko/minigame` | Layout 7 colonnes (trous/joueurs) + tirage % (5 / 10 / 15 / 20 / 25) + panier d'or (`getGoldenColAt`, `rollGoldenBasketCoins`) |
| `shared/modules/turn-manager` | Alternance des joueurs |
| `shared/modules/scoring` | Scores en pièces (`addPoints`) |

## Paramètres de lancement

Le jeu déclare `controller.startOptions` dans `game.config.json` :

```json
{ "id": "playerCount", "type": "number", "min": 2, "max": 5, "default": 2 }
```

Le hub transmet la valeur via `GAME_START_PARAMS` au spawn du serveur.
