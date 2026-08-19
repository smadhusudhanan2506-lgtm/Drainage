/* ─────────────────────────────────────────────────────────────
 *  DrainGuard Mesh — Production ESP32 IoT Node Firmware
 *  Pins: D27 (YF-S201 Flow Sensor) | D26 (12V Relay Module)
 *  Baud Rate: 115200
 * ───────────────────────────────────────────────────────────── */

#include <WiFi.h>
#include <HTTPClient.h>

// ── 1. Wi-Fi Settings ─────────────────────────────────────────
const char* ssid     = "Tomioka";
const char* password = "0987654321";

// ── 2. DrainGuard Mesh Server Endpoint ────────────────────────
// Local Wi-Fi endpoint:
const char* serverUrl = "http://10.35.172.182:3000/api/sensors/data";

// (When deployed on Render, replace with your live URL):
// const char* serverUrl = "https://your-app.onrender.com/api/sensors/data";

const char* SENSOR_ID = "S-06"; // Drainage node between School & Bus Terminal

// ── 3. Pin Assignments ────────────────────────────────────────
#define FLOW_PIN   27  // GPIO 27 (YF-S201 Signal Wire via Resistor Divider)
#define RELAY_PIN  26  // GPIO 26 (Relay Control IN)

// ── 4. Global State ───────────────────────────────────────────
volatile unsigned long pulseCount = 0;
unsigned long lastSendTime = 0;
unsigned long lastPulseTime = 0;

// Interrupt Service Routine for Flow Sensor
void IRAM_ATTR countPulse() {
  unsigned long now = micros();
  // Basic debounce filter (pulses should not be faster than 1000us)
  if (now - lastPulseTime > 1000) {
    pulseCount++;
    lastPulseTime = now;
  }
}

void setup() {
  // Initialize Serial Monitor
  Serial.begin(115200);
  delay(1200);

  Serial.println();
  Serial.println("==================================================");
  Serial.println("🌊 DrainGuard Mesh — ESP32 Sensor Node Online");
  Serial.println("==================================================");
  Serial.printf("📌 Flow Sensor Pin: GPIO %d (D27)\n", FLOW_PIN);
  Serial.printf("📌 Relay Control Pin: GPIO %d (D26)\n", RELAY_PIN);

  // Pin Configurations
  pinMode(FLOW_PIN, INPUT_PULLUP);
  pinMode(RELAY_PIN, OUTPUT);

  // Relay initially OFF (Standard active-LOW relay modules use HIGH for OFF)
  digitalWrite(RELAY_PIN, HIGH);

  // Attach Interrupt to D27
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), countPulse, FALLING);

  // Connect to Wi-Fi
  Serial.printf("📡 Connecting to Wi-Fi SSID: \"%s\" ", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Wi-Fi Connected Successfully!");
    Serial.print("🌐 ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("🎯 Target Server Endpoint: ");
    Serial.println(serverUrl);
    Serial.println("==================================================\n");
  } else {
    Serial.println("\n❌ Wi-Fi Connection Timeout!");
    Serial.println("👉 Please check that your 'Tomioka' hotspot is active and in 2.4 GHz mode.");
  }
}

void loop() {
  // Transmit telemetry every 2 seconds
  if (millis() - lastSendTime >= 2000) {
    unsigned long interval = millis() - lastSendTime;
    lastSendTime = millis();

    // ── Flow Calculation ──────────────────────────────────────
    // YF-S201 Formula: Frequency (Hz) = 7.5 * Q (Q = Flow rate in L/min)
    // Frequency = pulses / (interval_in_seconds)
    noInterrupts();
    unsigned long currentPulses = pulseCount;
    pulseCount = 0;
    interrupts();

    float intervalSec = (float)interval / 1000.0;
    float frequency = (float)currentPulses / intervalSec;
    float flowLitersMin = frequency / 7.5; // Flow in L/min

    // Scale flow to approximate m³/s for the visual map simulator
    float scaledFlow = flowLitersMin / 10.0;
    float waterLevel = 0.25;
    String status = "normal";

    // ── Three-Stage Flow Logic ────────────────────────────────
    // Stage 1: Zero / Stopped Flow -> COMPLETE BLOCKAGE (RED on Map)
    if (flowLitersMin <= 0.2) {
      status = "blocked";
      waterLevel = 0.95;
      digitalWrite(RELAY_PIN, LOW); // Trigger Emergency 12V Pump ON
      Serial.printf("[ALERT] Flow: 0.00 L/min -> 🚨 BLOCKAGE DETECTED (Pump ON)\n");
    }
    // Stage 2: Low / Restricted Flow -> PARTIAL RESTRICTION (ORANGE on Map)
    else if (flowLitersMin < 2.5) {
      status = "low_flow";
      waterLevel = 0.62;
      digitalWrite(RELAY_PIN, HIGH); // Pump Standby
      Serial.printf("[WARN]  Flow: %.2f L/min -> ⚠️ LOW WATER FLOW (Orange Warning)\n", flowLitersMin);
    }
    // Stage 3: High Continuous Flow -> NORMAL NOMINAL (BLUE on Map)
    else {
      status = "normal";
      waterLevel = 0.26;
      digitalWrite(RELAY_PIN, HIGH); // Pump Standby
      Serial.printf("[INFO]  Flow: %.2f L/min -> ✅ NORMAL WATER FLOW (Blue Stream)\n", flowLitersMin);
    }

    // ── HTTP Post to DrainGuard Mesh Web App ──────────────────
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(serverUrl);
      http.addHeader("Content-Type", "application/json");
      http.setTimeout(3500);

      // JSON Telemetry Payload
      String payload = "{";
      payload += "\"sensor_id\":\"" + String(SENSOR_ID) + "\",";
      payload += "\"flow_rate\":" + String(scaledFlow, 3) + ",";
      payload += "\"water_level\":" + String(waterLevel, 2) + ",";
      payload += "\"velocity\":" + String(scaledFlow * 1.3, 2) + ",";
      payload += "\"battery_level\":95,";
      payload += "\"status\":\"" + status + "\",";
      payload += "\"source\":\"esp32_hardware\"";
      payload += "}";

      int httpResponseCode = http.POST(payload);

      if (httpResponseCode > 0) {
        Serial.printf("📡 Transmitted to App | Response: %d OK\n", httpResponseCode);
      } else {
        Serial.printf("⚠️ Transmission Failed | Error Code: %d (%s)\n", 
                      httpResponseCode, http.errorToString(httpResponseCode).c_str());
      }

      http.end();
    } else {
      Serial.println("⚠️ Wi-Fi Lost. Attempting reconnection...");
      WiFi.reconnect();
    }

    Serial.println("--------------------------------------------------");
  }
}
