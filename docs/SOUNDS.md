# Sons — catalogue et guide pour agents IA

Référence unique pour choisir et déclencher les effets sonores dans BasketGame.

## Architecture

```
/shared/sound-engine.js   → window.SoundEngine (chargement, lecture, debounce)
/shared/effects.js        → window.Sounds (API sémantique par événement de jeu)
/shared/sounds/           → fichiers audio + sounds-manifest.json
```

**URL HTTP** : `/shared/sounds/<fichier>` — fonctionne en accès direct au jeu et derrière le proxy hub `/play`.

Ordre de chargement dans chaque jeu (`games/<id>/public/index.html`) :

```html
<script src="/shared/sound-engine.js"></script>
<script src="shared/effects.js"></script>
```

## Catalogue des samples

| ID manifest | Fichier | Rôle | Quand l'utiliser | Ne pas utiliser pour |
|-------------|---------|------|------------------|----------------------|
| `piglevelwin` | `piglevelwin.mp3` | Victoire finale (~4 s) | Podium, gagnant de série, fin de partie | Victoire de manche, rebonds, UI |
| `coin` | `coin.mp3` | Gain de pièces | Récompense monétaire positive | Pertes, erreurs |
| `bomb` | `bomb.mp3` | Explosion | Bombe Plinko, brèche zombie | Petits impacts |
| `meleeHit` | `hit-swing-sword.mp3` | Coup épée/couteau | Impact projectile zombie, slot couteau Plinko | Rebond de balle |
| `gameover` | `gameover.mp3` | Défaite | Game over Siège Zombie | Victoire, match nul |
| `achievement` | `achievement.mp3` | Succès intermédiaire | Score, manche gagnée, mini-jeu, vague bonus | Fin de série (trop court) |
| `swoosh` | `mixkit-game-ball-tap-2073.wav`* | Mouvement rapide | Lancer balle, projectile, spawn zombie | Impact au sol |
| `click` | `computer-mouse-click.mp3` | Clic UI | Changement de tour, reset | Événements de gameplay |
| `levelComplete` | `mixkit-game-level-completed-2059.wav` | Niveau / vague | Annonce nouvelle vague zombie | Chaque kill |
| `ballTap` | `mixkit-game-ball-tap-2073.wav` | Balle touche surface | Chute jeton P4, tir raté zombie | Victoire |
| `smallHit` | `mixkit-small-hit-in-a-game-2072.wav` | Petit impact / rebond | Atterrissage jeton, rebond plot Plinko, erreur | Explosion |
| `boostRecharge` | `mixkit-player-boost-recharging-2040.wav` | Gain de quantité | Multiplicateur ×2, score positif volant | Perte de points |

\* **Repli temporaire** : `swoosh` pointe vers `ballTap` accéléré (`playbackRate: 1.35`) tant que `swoosh.mp3` n'est pas ajouté. Mettre à jour `sounds-manifest.json` quand le fichier est disponible.

## API `window.Sounds`

Toujours préférer ces méthodes plutôt que `SoundEngine.play()` directement dans les jeux.

| Méthode | Sample(s) | Notes |
|---------|-----------|-------|
| `tokenDrop()` | `ballTap` | Début de chute |
| `tokenLand()` | `smallHit` | Debounce 80 ms (rebonds Plinko) |
| `changeTurn()` | `click` | |
| `roundWin()` | `achievement` | Victoire de **manche** (P4) |
| `victory()` | `piglevelwin` | Podium / série / fin partie |
| `draw()` | `achievement` vol. 0.4 | Match nul — son neutre en attendant un asset dédié |
| `error()` | `smallHit` rate 0.75 | Colonne pleine, tir invalide |
| `reset()` | `click` | |
| `dropStart()` | `swoosh` | Lancer balle Plinko |
| `coinWin(amount)` | `coin` × N | N = min(5, ceil(amount/10)), espacé 70 ms |
| `bombHit(size)` | `bomb` | `large` / `medium` / `small` → volume |
| `multiplierX2()` | `boostRecharge` | |
| `scorePop()` | `achievement` | |
| `scoreImpactGain()` | `boostRecharge` | |
| `scoreImpactLoss()` | `smallHit` rate 0.75 | |
| `meleeHit()` | `meleeHit` | |
| `gameOver()` | `gameover` | |
| `levelComplete()` | `levelComplete` | |
| `throwProjectile()` | `swoosh` | |
| `spawn()` | `swoosh` rate 0.7 | Apparition zombie |
| `breach()` | `bomb` | Brèche mur |
| `miss()` | alias `error()` | |
| `fallMiss()` | `ballTap` vol. 0.7 | Projectile tombe à côté |
| `thiefSwoosh()` | `swoosh` | Vol Plinko (avant pièces) |

## Règles anti-spam

Configurées dans [`shared/client/sounds/sounds-manifest.json`](../shared/client/sounds/sounds-manifest.json) :

- **`debounceMs`** : intervalle minimum entre deux lectures du même id.
- **`maxPolyphony`** : nombre max d'instances simultanées (`coin`: 3, `piglevelwin`: 1).
- Ne pas appeler `victory()` et `roundWin()` sur le même événement.
- `piglevelwin` : une seule fois par fin de partie / série.

## Mapping par jeu

### Puissance 4

| Événement | Méthode | Fichier |
|-----------|---------|---------|
| Chute jeton | `tokenDrop()` | ball-tap |
| Atterrissage | `tokenLand()` | small-hit |
| Changement tour | `changeTurn()` | click |
| Victoire manche | `roundWin()` | achievement |
| Victoire série (5) | `victory()` | piglevelwin |
| Match nul | `draw()` | achievement (bas) |
| Colonne pleine | `error()` | small-hit |
| Reset | `reset()` | click |

### Plinko

| Événement | Méthode | Fichier |
|-----------|---------|---------|
| Lancer balle | `dropStart()` | swoosh |
| Rebond plot | `tokenLand()` | small-hit |
| Bombe | `bombHit()` | bomb |
| Pièces | `coinWin()` | coin |
| Score + / − | `scoreImpactGain()` / `scoreImpactLoss()` | boost / small-hit |
| ×2 feu | `multiplierX2()` | boost-recharge |
| Slot couteau | `meleeHit()` | hit-swing-sword |
| Vol voleur | `thiefSwoosh()` + `coinWin()` | swoosh + coin |
| Slot mini-jeu | `scorePop()` | achievement |
| Podium | `victory()` | piglevelwin |

### Siège Zombie

| Événement | Méthode | Fichier |
|-----------|---------|---------|
| Spawn zombie | `spawn()` | swoosh grave |
| Lancer projectile | `throwProjectile()` | swoosh |
| Impact kill | `meleeHit()` + `scorePop()` | sword + achievement |
| Bombe zombie | `bombHit()` | bomb |
| Brèche | `breach()` | bomb |
| Nouvelle vague | `levelComplete()` | level-completed |
| Game over | `gameOver()` | gameover |
| Victoire coop | `victory()` | piglevelwin |
| Tir raté | `miss()` | small-hit |
| Chute à côté | `fallMiss()` | ball-tap |
| Bonus vague | `scorePop()` | achievement |

## Normalisation du volume

Cible : **-16 LUFS** intégré (ffmpeg `loudnorm` two-pass).

```bash
# macOS / Linux
node scripts/normalize-sounds.mjs

# Windows
.\scripts\normalize-sounds.ps1
```

1. Placer les **originaux** dans `shared/client/sounds/_source/`.
2. Lancer le script → écrit les fichiers normalisés dans `shared/client/sounds/`.
3. Ajuster les `gain` fins dans `sounds-manifest.json` si un son domine encore.

Prérequis : **ffmpeg** dans le PATH.

Commande npm : `npm run normalize-sounds`

## Ajouter un nouveau son

1. Déposer le fichier dans `shared/client/sounds/_source/`.
2. Lancer `npm run normalize-sounds`.
3. Ajouter une entrée dans `sounds-manifest.json` (`file`, `gain`, `debounceMs`, `maxPolyphony`).
4. Exposer via une méthode `Sounds.*` dans `shared/client/effects.js` (ou réutiliser une existante).
5. Documenter ici (tableau catalogue + mapping jeu si applicable).

## Sons manquants (à fournir)

| Priorité | Asset | Usage | Repli actuel |
|----------|-------|-------|--------------|
| **Haute** | `swoosh.mp3` | Lancer, projectile, spawn | ball-tap × 1.35 |
| Moyenne | Match nul neutre | `draw()` P4 | achievement vol. 0.4 |
| Basse | Grognement zombie | spawn | swoosh grave |
| Basse | Vol voleur distinct | mini-jeu Plinko | swoosh + coin |
