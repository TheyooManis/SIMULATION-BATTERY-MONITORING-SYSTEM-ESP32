#include "json_helper.h"
#include <Adafruit_INA219.h>
#include <DallasTemperature.h>
#include <OneWire.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <Wire.h>
#include <math.h>

// ==========================================
// KONFIGURASI
// ==========================================

unsigned long lastMonitoringTime = 0;
unsigned long lastWarningTime = 0;

const unsigned long MONITORING_INTERVAL = 5000;
const unsigned long WARNING_INTERVAL = 2000;

bool criticalFlag = false;
String lastWarning = "";

char clientId[50];

const char *ssid = "Wokwi-GUEST";
const char *password = "";

const char *mqtt_server = "47.84.177.69";
const int PORT = 1883;

const char *TOKENS[10] = {"dc1068cc91b02188", "c24e5da3e874d518",
                          "58f7c99e4e866162", "8f7c99e4e8661620",
                          "f7c99e4e8661620c"};
const int NUM_CELLS = 5;

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ==========================================
// SENSOR INITIALIZATION
// ==========================================
Adafruit_INA219 ina219(0x40);
OneWire oneWire(4);
DallasTemperature sensors(&oneWire);

const int TRIG_PIN = 5;
const int ECHO_PIN = 18;

// ==========================================
// WIFI
// ==========================================
void setup_wifi() {
  Serial.print("Connecting WiFi");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi Connected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}
// ==========================================
//  Format Voltage
// ==========================================
String formatVoltage(float v) {
  String s = String(v, 2);

  // hapus trailing 0
  if (s.endsWith("0"))
    s.remove(s.length() - 1);

  if (s.endsWith("."))
    s.remove(s.length() - 1);

  return s;
}
// ==========================================
//  Format Temperature
// ==========================================
int formatTemp(float t) { return (int)floor(t); }
// ==========================================
//  BATTERY STATUS
// ==========================================
String CheckStatus(float cellVoltage, float cellTemp, float cellWaterLevel) {
  if (cellWaterLevel <= 10.0)
    return "LOW_WATER_LEVEL";
  if (cellVoltage < 2.10)
    return "LOW_VOLTAGE";
  if (cellVoltage > 2.45)
    return "OVERCHARGE";
  if (cellTemp > 45.0)
    return "OVERHEAT";

  if (cellVoltage >= 2.20 && cellVoltage <= 2.25)
    return "FLOAT_NORMAL";
  return "NORMAL";
}
// ==========================================
//  Random data generator for simulating sensor readings with slight variations
// ==========================================
float noiseFloat(float range) {
  return ((random(-1000, 1000) / 1000.0) * range);
}

// =========================================
// MQTT STATE STRING
// =========================================
const char *mqttStateString(int state) {
  switch (state) {
  case -4:
    return "MQTT_CONNECTION_TIMEOUT";
  case -3:
    return "MQTT_CONNECTION_LOST";
  case -2:
    return "MQTT_CONNECT_FAILED";
  case -1:
    return "MQTT_DISCONNECTED";
  case 0:
    return "MQTT_CONNECTED";
  case 1:
    return "MQTT_CONNECT_BAD_PROTOCOL";
  case 2:
    return "MQTT_CONNECT_BAD_CLIENT_ID";
  case 3:
    return "MQTT_CONNECT_UNAVAILABLE";
  case 4:
    return "MQTT_CONNECT_BAD_CREDENTIALS";
  case 5:
    return "MQTT_CONNECT_UNAUTHORIZED";
  default:
    return "UNKNOWN";
  }
}

// ==========================================
// MQTT RECONNECT
// ==========================================
unsigned long lastReconnectAttempt = 0;
void reconnect() {

  if (mqttClient.connected())
    return;

  if (millis() - lastReconnectAttempt < 5000)
    return;

  lastReconnectAttempt = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MQTT] WiFi tidak terhubung");
    return;
  }

  Serial.println("[MQTT] Connecting... ");

  sprintf(clientId, "CLIENT-ESP-%04X", random(0xFFFF));

  if (mqttClient.connect(clientId)) {
    Serial.println("CONNECTED");
  } else {
    Serial.print("FAILED rc=");
    Serial.println(mqttStateString(mqttClient.state()));
  }
}
// ==========================================
// SETUP KOMPONEN DAN KONEKSI
// ==========================================
void setup() {
  Serial.begin(115200);

  Serial.println();
  Serial.println("=========================================");
  Serial.print("ESP32 Battery Monitor | MULTI-CELL (");
  Serial.print(NUM_CELLS);
  Serial.println(" Sel)");
  Serial.println("=========================================");

  Wire.begin(21, 22);

  if (ina219.begin()) {
    Serial.println("[OK] INA219 Connected");
    Serial.println("[INFO] INA219 Calibration: 32V, 1A");
    ina219.setCalibration_32V_1A();
  } else {
    Serial.println("[ERROR] INA219 Not Found");
  }

  sensors.begin();
  Serial.print("[OK] DS18B20 ditemukan: ");
  Serial.println(sensors.getDeviceCount());

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long initDuration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (initDuration == 0) {
    Serial.println("[ERROR] HC-SR04 Not Found / Timeout");
  } else {
    Serial.println("[OK] HC-SR04 Connected");
  }

  setup_wifi();

  mqttClient.setServer(mqtt_server, PORT);

  Serial.println("[OK] MQTT Configuration");
  Serial.print("[INFO] Broker : ");
  Serial.println(mqtt_server);
  Serial.print("[INFO] Port   : ");
  Serial.println(PORT);
}

//==========================================
// Monitoring Loop
//==========================================
void MonitoringLoop() {
  // Read HC-SR04
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    Serial.println("HC-SR04 error / disconnected");
    return;
  }

  float distanceCm = duration * 0.034 / 2;

  const float MAX_DISTANCE = 15.0;
  const float MIN_DISTANCE = 5.0;

  float baseWaterLevel = 0.0;
  if (distanceCm >= MAX_DISTANCE) {
    baseWaterLevel = 0.0;
  } else if (distanceCm <= MIN_DISTANCE) {
    baseWaterLevel = 100.0;
  } else {
    baseWaterLevel =
        ((MAX_DISTANCE - distanceCm) / (MAX_DISTANCE - MIN_DISTANCE)) * 100.0;
  }

  for (int i = 0; i < NUM_CELLS; i++) {
    float busVoltage = ina219.getBusVoltage_V();
    float shuntVoltage = ina219.getShuntVoltage_mV();
    float current_mA = ina219.getCurrent_mA();
    float baseVoltage = busVoltage + (shuntVoltage / 1000.0);
    float baseCurrent = roundf((current_mA / 1000.0) * 1000) / 1000;

    sensors.requestTemperatures();

    float baseTemp = sensors.getTempCByIndex(0);

    if (baseTemp == DEVICE_DISCONNECTED_C || isnan(baseTemp)) {
      Serial.println("Sensor error / disconnected");
      return;
    }

    float cellVoltage = baseVoltage + noiseFloat(0.010);
    float cellCurrent = baseCurrent + noiseFloat(0.05);
    float cellTemp = baseTemp + noiseFloat(0.3);
    float cellWaterLevel = baseWaterLevel;

    String status = CheckStatus(cellVoltage, cellTemp, cellWaterLevel);

    JsonVar var;

    var.insert("type", "MONITORING");
    var.insert("token", TOKENS[i]);
    var.insert("voltage", formatVoltage(cellVoltage));
    var.insert("current", cellCurrent);
    var.insert("temperature", formatTemp(cellTemp));
    var.insert("waterLevel", formatTemp(cellWaterLevel));
    var.insert("status", status);

    String payload = var.toString();

    mqttClient.publish("pltu/battery/sensor", payload.c_str());
    Serial.println("[MQTT] UPDATE Sel " + String(i + 1) + " => " + payload);

    delay(100);
  }
  Serial.println("-----------------------------------------");
}
// ==========================================
// Early Warning Loop
// ==========================================
void EarlyWarningLoop() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    Serial.println("HC-SR04 error / disconnected");
    return;
  }

  float distanceCm = duration * 0.034 / 2;
  const float MAX_DISTANCE = 15.0;
  const float MIN_DISTANCE = 5.0;

  float baseWaterLevel = 0.0;
  if (distanceCm >= MAX_DISTANCE) {
    baseWaterLevel = 0.0;
  } else if (distanceCm <= MIN_DISTANCE) {
    baseWaterLevel = 100.0;
  } else {
    baseWaterLevel =
        ((MAX_DISTANCE - distanceCm) / (MAX_DISTANCE - MIN_DISTANCE)) * 100.0;
  }

  for (int i = 0; i < NUM_CELLS; i++) {
    bool warningDetected = false;
    String warningMsg = "";
    String severity = "NORMAL";
    int faultCellIndex = -1;

    float busVoltage = ina219.getBusVoltage_V();
    float shuntVoltage = ina219.getShuntVoltage_mV();
    float baseVoltage = busVoltage + (shuntVoltage / 1000.0);

    sensors.requestTemperatures();
    float baseTemp = sensors.getTempCByIndex(0);

    if (baseTemp == DEVICE_DISCONNECTED_C || isnan(baseTemp)) {
      Serial.println("Sensor error / disconnected");
      return;
    }

    float cellVoltage = baseVoltage + noiseFloat(0.010);
    float cellTemp = baseTemp + noiseFloat(0.3);
    float cellWaterLevel = baseWaterLevel;

    String status = CheckStatus(cellVoltage, cellTemp, cellWaterLevel);

    if (status == "OVERCHARGE") {
      warningDetected = true;
      severity = "CRITICAL";
      warningMsg = "OVERCHARGE detected on cell " + String(i + 1);
      faultCellIndex = i;
      break;
    } else if (status == "LOW_VOLTAGE") {
      warningDetected = true;
      severity = "CRITICAL";
      warningMsg = "LOW VOLTAGE detected on cell " + String(i + 1);
      faultCellIndex = i;
      break;
    } else if (status == "OVERHEAT") {
      warningDetected = true;
      severity = "CRITICAL";
      warningMsg = "OVERHEAT detected on cell " + String(i + 1);
      faultCellIndex = i;
      break;
    } else if (status == "LOW_WATER_LEVEL") {
      warningDetected = true;
      severity = "WARNING";
      warningMsg = "LOW WATER LEVEL detected on cell " + String(i + 1);
      faultCellIndex = i;
      break;
    } else if (status == "FLOAT_NORMAL") {
      if (!warningDetected) {
        severity = "INFO";
        warningMsg = "Float condition stable on cell " + String(i + 1);
        faultCellIndex = i;
      }
    }

    // ===============================
    // ACTION TRIGGER
    // ===============================
    if (warningDetected) {
      Serial.println("[ALERT] " + severity + " => " + warningMsg);

      JsonVar alert;
      alert.insert("type", "EARLY_WARNING");
      alert.insert("token", TOKENS[i]);
      alert.insert("severity", severity);
      alert.insert("message", warningMsg);

      mqttClient.publish("pltu/battery/alert", alert.toString().c_str());

      criticalFlag = true;
      lastWarning = warningMsg;
    } else {
      if (criticalFlag) {
        Serial.println("[RECOVERY] System back to normal");

        JsonVar alert;
        alert.insert("type", "RECOVERY");
        alert.insert("token", TOKENS[i]);
        alert.insert("severity", "NORMAL");
        alert.insert("message", "All cells stable");

        mqttClient.publish("pltu/battery/alert", alert.toString().c_str());

        criticalFlag = false;
        lastWarning = "";
      }
    }
  }
}

// ==========================================
// LOOP
// ==========================================
void loop() {
  reconnect();
  mqttClient.loop();

  if (!mqttClient.connected()) {
    delay(1000);
    return;
  }

  unsigned long now = millis();

  // 🔴 Early Warning
  if (now - lastWarningTime >= WARNING_INTERVAL) {
    lastWarningTime = now;
    EarlyWarningLoop();
  }

  // 🟢 Monitoring
  if (now - lastMonitoringTime >= MONITORING_INTERVAL) {
    lastMonitoringTime = now;
    MonitoringLoop();
  }
}