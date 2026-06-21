# Guide ESP32 — Plateforme BasketGame

> 📖 **À LIRE** avant de modifier le protocole de communication ESP32 → Hub.
> 🔄 **À METTRE À JOUR** si le format série, la calibration, les endpoints ou le port changent.
> Pour le plateau physique 7 colonnes, voir [`HARDWARE.md`](HARDWARE.md).
> Voir la règle complète dans [`AGENTS.md`](../AGENTS.md#-règle-obligatoire--documentation-en-continu).

---

## Vue d'ensemble

L'ESP32 est branché en **USB sur le Mac** qui fait tourner le hub. Il envoie les **valeurs brutes ADC** des 7 capteurs IR ; le **hub** (`hub/esp32SensorService.js`) gère la **calibration**, la **détection de balle** et relaie les triggers vers le jeu actif.

```
Capteur IR → ESP32 → USB série → Hub (calibration + détection) → Jeu actif
                                      │
                                      └── Dashboard /sensors (temps réel)
```

> **L'ESP32 ne gère pas la logique du jeu** ni la détection elle-même. Il transmet uniquement les lectures analogiques. C'est le hub qui calcule les seuils et déclenche `POST /api/trigger` en interne.

---

## Protocole série (USB)

| Paramètre | Valeur |
|-----------|--------|
| Débit | 115200 baud |
| Format | Lignes texte terminées par `\n` |
| Fréquence | ~10 ms (configurable côté firmware) |

### Message principal — valeurs brutes

```
RAW:v1,v2,v3,v4,v5,v6,v7
```

- `v1`…`v7` : lectures ADC 12 bits (0–4095), une par colonne.
- Colonne 1 (index 0) = gauche, colonne 7 (index 6) = droite.

Exemple :

```
RAW:3850,3920,4010,3888,3955,3901,3842
```

### Détection côté hub

Au démarrage (ou sur demande via **Recalibrer** sur `/sensors`) :

1. **Calibration** (5 s) : mesure des baselines sans balle.
2. **Seuil par capteur** : `baseline × ratio` — ratio **global** par défaut **55 %** (réglable sur `/sensors`), avec **overrides individuels** possibles par colonne (10–90 % chacun). Persistant dans `data/sensors-config.json`.
3. **Trigger** : sur front montant (valeur < seuil), le hub appelle le même flux que `POST /api/trigger?col=N` (avec anti-rebond 500 ms).

---

## Code Arduino — Envoi des valeurs brutes

Firmware de référence (v3) : l'ESP32 n'envoie que des lignes `RAW:…`.

```cpp
// ESP32 - 7 capteurs IR — valeurs brutes uniquement
// La calibration et la détection sont gérées par le hub Node.js.

const int NUM_CAPTEURS = 7;
const int brochesCapteurs[NUM_CAPTEURS] = {33, 32, 34, 35, 36, 39, 25};
const unsigned long INTERVALLE_RAW = 10;

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < NUM_CAPTEURS; i++) {
    pinMode(brochesCapteurs[i], INPUT);
  }
}

void loop() {
  static unsigned long dernierEnvoi = 0;
  unsigned long maintenant = millis();
  if (maintenant - dernierEnvoi < INTERVALLE_RAW) return;
  dernierEnvoi = maintenant;

  Serial.print("RAW:");
  for (int i = 0; i < NUM_CAPTEURS; i++) {
    Serial.print(analogRead(brochesCapteurs[i]));
    if (i < NUM_CAPTEURS - 1) Serial.print(",");
  }
  Serial.println();
}
```

> Utiliser des broches **ADC1** (33, 32, 34, 35, 36, 39, 25) pour éviter les conflits Wi-Fi/ADC2. En mode USB série, le Wi-Fi n'est pas nécessaire.

---

## Configuration du hub

### Détection automatique du port

Au démarrage, le hub cherche un port USB/UART typique (CP210x, CH340, `usbserial`, `usbmodem`…).

### Forcer un port

```bash
# Variable d'environnement
ESP32_SERIAL_PORT=/dev/cu.usbserial-0001 npm start

# Argument CLI
node hub/index.js --serial-port=/dev/cu.usbserial-0001
```

### Dashboard capteurs

Accessible depuis le contrôleur (**Capteurs IR**) ou directement :

```
http://localhost:3000/sensors
```

Affiche en temps réel : valeurs ADC, seuils, historique graphique, journal des détections. **Seuil global** réglable (10–90 %, défaut 55 %) plus **curseur par capteur** pour un override individuel (badge « Perso »). Bouton **Réinitialiser tous les capteurs** pour revenir au global. Bouton **Recalibrer** → `POST /api/sensors/recalibrate`.

Fichier de persistance : `data/sensors-config.json` (`thresholdRatio` + `sensorOverrides` optionnels par index 0–6). Voir [`data/README.md`](../data/README.md).

---

## Mapping colonnes

```
Colonne physique :  1    2    3    4    5    6    7
Index hub / jeu  :  0    1    2    3    4    5    6
Position série   :  v1   v2   v3   v4   v5   v6   v7
```

Adapter selon l'orientation de ton montage physique.

---

## Mode HTTP legacy (simulateur / tests)

Le hub expose toujours `POST /api/trigger` pour le simulateur intégré au contrôleur ou des tests `curl` :

```
POST http://<hub>:3000/api/trigger?col=N
```

Ce endpoint n'est plus utilisé par l'ESP32 en production (connexion USB série).

---

## Schéma de câblage (7 colonnes IR)

```
ESP32                     Capteurs IR (x7)
─────                     ─────────────────
GPIO 33 ──────────────── Colonne 1 (OUT)
GPIO 32 ──────────────── Colonne 2 (OUT)
GPIO 34 ──────────────── Colonne 3 (OUT)
GPIO 35 ──────────────── Colonne 4 (OUT)
GPIO 36 ──────────────── Colonne 5 (OUT)
GPIO 39 ──────────────── Colonne 6 (OUT)
GPIO 25 ──────────────── Colonne 7 (OUT)
3.3V    ──────────────── VCC capteurs
GND     ──────────────── GND capteurs
USB     ──────────────── Mac (hub BasketGame)
```

---

## Dépannage

### Aucun port série détecté

1. Vérifier le câble USB (data, pas charge seule).
2. Lister les ports : `ls /dev/cu.*` (macOS).
3. Forcer le port : `ESP32_SERIAL_PORT=/dev/cu.… npm start`.

### Détections fantômes ou manquées

1. Ouvrir `/sensors` et vérifier les baselines / seuils.
2. Relancer une calibration (**Recalibrer**) sans balle devant les capteurs.
3. Ajuster l'éclairage ambiant (capteurs IR sensibles).

### Le jeu ne réagit pas

1. Vérifier qu'un jeu est lancé depuis le contrôleur.
2. Consulter les logs hub : `[ESP32] Capteur N: BALLE`.
3. Tester avec le simulateur (bouton **Simuler la balle** sur `/`).

### Test sans ESP32

```bash
# Lancer un jeu
curl -s -X POST http://localhost:3000/api/games/puissance4/start

# Simuler une colonne
curl -X POST "http://localhost:3000/api/trigger?col=3"
```

Ou utiliser le panneau **Simuler la balle** sur le contrôleur.
