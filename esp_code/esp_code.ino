// ============================================================
//  ESP32 - SYSTEME IR 7 CAPTEURS - v3.0
//  La détection et la calibration sont gérées côté Python.
//  L'ESP32 envoie UNIQUEMENT les valeurs brutes ADC.
//  Protocole :
//    -> "RAW:v1,v2,v3,v4,v5,v6,v7\n"  (toutes les 10ms)
// ============================================================

const int NUM_CAPTEURS = 7;

// Broches analogiques ADC1 sécurisées (éviter ADC2 qui conflit avec WiFi)
const int brochesCapteurs[NUM_CAPTEURS] = {33, 32, 34, 35, 36, 39, 25};

// Intervalle d'envoi des valeurs brutes (ms)
const unsigned long INTERVALLE_RAW = 10;

int valeursAnalogiques[NUM_CAPTEURS] = {0};
unsigned long dernierEnvoi = 0;

// ============================================================
void setup() {
  Serial.begin(115200);

  for (int i = 0; i < NUM_CAPTEURS; i++) {
    pinMode(brochesCapteurs[i], INPUT);
  }

  Serial.println("--- SYSTEME IR READY : 7 CAPTEURS SYNC ---");
}

// ============================================================
void loop() {
  unsigned long maintenant = millis();

  if (maintenant - dernierEnvoi >= INTERVALLE_RAW) {
    // Lecture + envoi de tous les capteurs en une seule ligne
    Serial.print("RAW:");
    for (int i = 0; i < NUM_CAPTEURS; i++) {
      Serial.print(analogRead(brochesCapteurs[i]));
      if (i < NUM_CAPTEURS - 1) Serial.print(",");
    }
    Serial.println();
    dernierEnvoi = maintenant;
  }
}
