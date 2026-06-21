# Données locales

Ce dossier contient des fichiers **propres à votre installation**. Ils ne sont **pas versionnés** (voir `.gitignore` à la racine) et ne doivent pas être poussés sur un dépôt public.

| Chemin | Contenu | Créé par |
|--------|---------|----------|
| `players/` | Profils joueurs (pseudo, photos JPEG, tête détourée PNG) | Page `/players` du hub |
| `sensors-config.json` | Seuils IR : ratio global + overrides par capteur | Dashboard `/sensors` |

Exemple `sensors-config.json` :

```json
{
  "thresholdRatio": 0.55,
  "sensorOverrides": {
    "2": 0.40,
    "5": 0.62
  }
}
```

Les clés de `sensorOverrides` sont les index capteur `0`–`6` (colonnes 1–7). Absence de clé = le capteur suit le seuil global.

Au premier lancement, seul `players/.gitkeep` est présent dans le dépôt git. Les dossiers et fichiers ci-dessus sont créés automatiquement à l'usage.
