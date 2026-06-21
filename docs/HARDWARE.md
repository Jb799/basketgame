# Matériel — Le plateau physique 7 colonnes

> 📖 **À LIRE** avant de modifier `shared/constants.js`, la logique de colonnes d'un jeu, ou tout ce qui touche au mapping physique.
> 🔄 **À METTRE À JOUR** si le nombre de colonnes, le mapping ou les contraintes d'affichage changent.
> Pour le câblage et le code ESP32, voir [`ESP32.md`](ESP32.md).

---

## Principe

BasketGame repose sur un **système physique fabriqué sur mesure** : un plateau **horizontal**, posé devant une télé, dont la longueur correspond à la **largeur exacte de l'écran**. Le plateau est divisé en **7 colonnes égales** sur toute sa longueur.

Quand une balle traverse l'une des colonnes, un capteur relié à l'ESP32 le détecte et l'ESP32 envoie l'**index de la colonne** au hub.

```
        ◄────────────  largeur de la télé  ────────────►
   ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐
   │  C0  │  C1  │  C2  │  C3  │  C4  │  C5  │  C6  │   ← 7 colonnes égales
   │      │      │      │  🏀  │      │      │      │   ← une balle passe en C3
   └──────┴──────┴──────┴──────┴──────┴──────┴──────┘
      0      1      2      3      4      5      6        ← index envoyé par l'ESP32
   (gauche)                                  (droite)
```

---

## Contrainte centrale : 7 colonnes

- Le nombre de colonnes est **fixe** : 7. C'est une propriété **du matériel**, pas d'un jeu.
- Cette valeur est définie une seule fois dans le code :

```js
// shared/constants.js
const PLATFORM_COLUMNS = 7;
```

- **Tous les jeux** reçoivent donc toujours une colonne dans l'intervalle `[0, 6]`. Le module `shared/modules/grid7` utilise `PLATFORM_COLUMNS` par défaut.
- Le nombre de **rangées** (ou toute disposition verticale) est, lui, **libre par jeu** : Puissance 4 utilise 6 rangées, un autre jeu pourrait n'avoir aucune notion de rangée.

> Si un jour le plateau physique change de nombre de colonnes, **modifier uniquement `PLATFORM_COLUMNS`** et adapter le CSS des jeux concernés. Mettre alors à jour ce document et `AGENTS.md`.

---

## Mapping colonne physique → index logiciel

```
Colonne physique :   1     2     3     4     5     6     7
Index envoyé     :    0     1     2     3     4     5     6
```

L'orientation (gauche/droite) dépend du montage. Si le plateau est inversé par rapport à l'écran, adapter le mapping côté ESP32 (voir [`ESP32.md`](ESP32.md)) plutôt que côté serveur, pour que les jeux raisonnent toujours « 0 = gauche de l'écran ».

---

## Identité visuelle (paniers physiques)

Les paniers fabriqués pour le plateau sont **noir et orange**. L'interface logicielle reprend cette palette via `shared/client/brand.css` :

| Token CSS | Valeur | Usage |
|-----------|--------|-------|
| `--brand-black` | `#0a0a0a` | Fonds principaux |
| `--brand-orange` | `#ff6b00` | Accent, joueur 1 (Puissance 4), boutons primaires |
| `--brand-text` | `#f5f5f5` | Texte principal |

Le hub importe `brand.css` depuis `/shared/brand.css` ; chaque jeu peut en faire de même pour rester cohérent avec le matériel.

---

## Contraintes d'affichage (télé)

- Affichage pensé pour un **grand écran paysage**, en plein écran.
- L'interface d'un jeu qui suit la grille physique peut réutiliser `shared/client/column-layout.css` :
  - `.platform-grid` : grille de 7 colonnes égales, pleine largeur.
  - `.platform-column` : une colonne (cible des animations de chute).
- Aligner visuellement les colonnes de l'interface sur les colonnes physiques du plateau : une balle qui tombe en colonne 4 doit s'animer dans la 4ᵉ colonne à l'écran.

---

## Rôle de l'ESP32 (résumé)

L'ESP32 est un **capteur d'entrée uniquement** : il lit les 7 capteurs IR et envoie les valeurs ADC brutes en USB au Mac. Le **hub** calibre, détecte les balles et relaie les triggers vers le jeu actif. L'ESP32 ne connaît ni le jeu en cours, ni les règles, ni l'état. Détails et firmware dans [`ESP32.md`](ESP32.md).
