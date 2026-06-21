# Données locales

Ce dossier contient des fichiers **propres à votre installation**. Ils ne sont **pas versionnés** (voir `.gitignore` à la racine) et ne doivent pas être poussés sur un dépôt public.

| Chemin | Contenu | Créé par |
|--------|---------|----------|
| `players/` | Profils joueurs (pseudo, photos JPEG, tête détourée PNG) | Page `/players` du hub |
| `sensors-config.json` | Ratio de seuil IR pour la détection de balle | Dashboard `/sensors` |

Au premier lancement, seul `players/.gitkeep` est présent dans le dépôt git. Les dossiers et fichiers ci-dessus sont créés automatiquement à l'usage.
