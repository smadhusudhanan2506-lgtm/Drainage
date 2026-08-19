#include <WiFi.h>
#include <HTTPClient.h>

// ── 1. Your Wi-Fi Credentials ───────────────────────────────
const char* ssid     = "Tomioka";
const char* password = "0987654321";

// ── 2. Live Public DrainGuard Server URL ────────────────────
// Works across mobile hotspots, different Wi-Fi networks & 4G/5G
const char* serverUrl = "https://rude-squids-attack.loca.lt/api/sensors/data";
const char* SENSOR_ID = "S-06"; // Drainage segment between School & Bus Stand

// ── 3. Exact Hardware Pins ──────────────────────────────────
#define FLOW_PIN   27  // D27 (YF-S201 Yellow Signal Wire)
#define RELAY_PIN  26  // D26 (Relay Control IN)

// ── 4. Variables ────────────────────────────────────────────
volatile int pulseCount = 0;
unsigned long lastSendTime = 0;

void IRAM_ATTR countPulse() {
  pulseCount++;
}

void setup() {
  // Start Serial Monitor at 115200 baud
  Serial.begin(115200);
  delay(1000); // 1-second delay for Serial port initialization

  Serial.println();
  Serial.println("==========================================");
  Serial.println("🌊 DrainGuard Mesh — ESP32 Sensor Starting");
  Serial.println("==========================================");

  pinMode(FLOW_PIN, INPUT_PULLUP);
  pinMode(RELAY_PIN, OUTPUT);

  // Relay initially OFF (Active-LOW relays use HIGH for OFF)
  digitalWrite(RELAY_PIN, HIGH);

  // Attach interrupt to Flow Sensor on D27
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), countPulse, FALLING);

  // Connect to Wi-Fi network "Tomioka"
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 35) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("✅ WiFi Connected Successfully!");
    Serial.print("📡 ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("🎯 Target Server: ");
    Serial.println(serverUrl);
    Serial.println("==========================================");
  } else {
    Serial.println();
    Serial.println("❌ WiFi Connection Failed!");
    Serial.println("👉 Make sure 'Tomioka' hotspot is 2.4 GHz.");
  }
}

void loop() {
  // Read and transmit telemetry every 2 seconds
  if (millis() - lastSendTime >= 2000) {
    lastSendTime = millis();

    // ── Flow Rate Calculation ───────────────────────────────
    // YF-S201: Frequency (Hz) = 7.5 * Q (Q = Liters/min)
    float pulsesPerSec = (float)pulseCount / 2.0;
    float flowRate = (pulsesPerSec / 7.5); // Liters/min
    pulseCount = 0; // Reset counter for next interval

    float scaledFlow = flowRate / 10.0;
    float waterLevel = 0.25;
    String status = "normal";

    // ── Flow State Classification ───────────────────────────
    if (flowRate <= 0.2) {
      // 🚨 ZERO FLOW / COMPLETE BLOCKAGE -> Map turns RED!
      status = "blocked";
      waterLevel = 0.95;
      digitalWrite(RELAY_PIN, LOW); // Turn Emergency Pump ON (Active LOW)
      Serial.println("🚨 ZERO FLOW / COMPLETE BLOCKAGE! (Pump ON)");
    } 
    else if (flowRate < 2.5) {
      // ⚠️ LOW WATER FLOW -> Map turns ORANGE 1st!
      status = "low_flow";
      waterLevel = 0.62;
      digitalWrite(RELAY_PIN, HIGH); // Pump Standby
      Serial.println("⚠️ LOW WATER FLOW DETECTED (Orange Warning)");
    } 
    else {
      // ✅ NORMAL FLOW -> Map restores to BLUE!
      status = "normal";
      waterLevel = 0.26;
      digitalWrite(RELAY_PIN, HIGH); // Pump Standby
      Serial.println("✅ NORMAL WATER FLOW (Continuous Stream)");
    }

    // ── Transmit JSON Data to DrainGuard Server ─────────────
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(serverUrl);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("bypass-tunnel-reminder", "true");

      String payload = "{";
      payload += "\"sensor_id\":\"" + String(SENSOR_ID) + "\",";
      payload += "\"flow_rate\":" + String(scaledFlow, 3) + ",";
      payload += "\"water_level\":" + String(waterLevel, 2) + ",";
      payload += "\"velocity\":" + String(scaledFlow * 1.3, 2) + ",";
      payload += "\"battery_level\":95,";
      payload += "\"status\":\"" + status + "\",";
      payload += "\"source\":\"esp32_hardware\"";
      payload += "}";

      Serial.print("Transmitting: ");
      Serial.println(payload);

      int httpResponse = http.POST(payload);
      Serial.print("Server Response: ");
      Serial.println(httpResponse);
      Serial.println("------------------------------------------");

      http.end();
    } else {
      Serial.println("⚠️ WiFi Disconnected. Reconnecting...");
      WiFi.reconnect();
    }
  }
}
