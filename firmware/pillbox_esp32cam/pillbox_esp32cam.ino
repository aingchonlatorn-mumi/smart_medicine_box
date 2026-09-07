/* =============================================================================
   Smart PillBox — AI-Thinker ESP32-CAM + reed switch MC-38
   ต่อยอดจากสเก็ตช์เดิมที่ถ่ายภาพและเปิดดูผ่านหน้าเว็บได้แล้ว
   เพิ่มเข้ามา: ผูกบอร์ดกับกล่องอัตโนมัติ + ถ่ายเป็นชุด + ส่งขึ้นเซิร์ฟเวอร์

   หน้าที่ของบอร์ด: รายงาน "สิ่งที่เห็น" เท่านั้น
   ไม่ตัดสินว่าทานยาแล้วหรือยัง เพราะการตีความอยู่ฝั่งเซิร์ฟเวอร์ทั้งหมด
   แก้กฎ (เช่น เปิดกี่วินาทีถึงนับ) ได้โดยไม่ต้อง flash บอร์ดใหม่

   การต่อสาย
     reed switch ขาที่ 1 → GPIO13
     reed switch ขาที่ 2 → GND
     ฝาปิด (แม่เหล็กชิด)  = ต่อวงจร → LOW
     ฝาเปิด (แม่เหล็กห่าง) = ตัดวงจร → INPUT_PULLUP ดึงขึ้นเป็น HIGH

   ⚠ ห้ามย้ายไป GPIO12 — เป็น strapping pin (MTDI) ที่ ESP32 อ่านตอนบูต
     ถ้าโดนดึง HIGH ตอนบูต (ซึ่งเกิดพอดีเวลาฝาเปิดค้างอยู่) บอร์ดจะบูตไม่ขึ้น
     อาการจะสุ่มมาก คือบูตตอนฝาปิดรอด บูตตอนฝาเปิดเจ๊ง หาสาเหตุยาก

   ไฟเลี้ยง: จ่าย 5V เข้าขา 5V โดยตรง อย่างน้อย 1A
   ============================================================================= */

#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Preferences.h>

/* ------------------------------- ตั้งค่า ------------------------------- */
const char* ssid     = "AA";
const char* password = "aing0864017741";

const char* API_BASE   = "https://smart-pillbox-rosy.vercel.app";
const char* BOX_SERIAL = "B-001";      // ต้องตรงกับสติกเกอร์ข้างกล่องและแถวใน boxes
const char* FIRMWARE   = "2.0.0";

#define REED_PIN       13
#define FLASH_LED_PIN  4

// แฟลชปิดไว้ตามที่ทดสอบแล้วว่าทำให้ไฟกระชากจนบอร์ดรีบูต
// ถ้าเปลี่ยนไปใช้แหล่งจ่ายไฟที่แรงพอแล้วค่อยเปิดเป็น true
#define USE_FLASH      false

const unsigned long debounceDelay   = 50;      // กรองสัญญาณเด้งของ reed switch
const unsigned long FRAME_GAP_MS    = 1200;    // เว้นระยะระหว่างเฟรมในชุด
const uint8_t       MAX_FRAMES      = 3;       // ถ่ายกี่เฟรมต่อการเปิดฝา 1 ครั้ง
const unsigned long MAX_OPEN_MS     = 120000;  // เปิดค้างเกิน 2 นาที = น่าจะลืมปิด
const unsigned long HEARTBEAT_MS    = 900000;  // บอกเซิร์ฟเวอร์ว่ายังไม่ตาย ทุก 15 นาที

/* --------------------- Pin Mapping ของ AI-THINKER --------------------- */
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

WebServer server(80);
Preferences prefs;

String deviceMac;      // A0B7652C1FE8 — ตัวระบุบอร์ด ไม่ใช่ความลับ
String deviceKey;      // ตัวยืนยันตัวตน เก็บใน NVS ไม่ฝังในโค้ด

// ภาพชุดที่ถ่ายระหว่างฝาเปิด เก็บไว้ใน PSRAM
uint8_t* frames[MAX_FRAMES];
size_t   frameSizes[MAX_FRAMES];
uint8_t  frameCount = 0;

int lastState = LOW;
int stableState = LOW;
unsigned long lastDebounceTime = 0;

/* ------------------------------- กล้อง ------------------------------- */
void setupCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;   // 640x480
  config.jpeg_quality = 12;
  config.fb_count = 1;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("❌ กล้องเริ่มต้นล้มเหลว: 0x%x\n", err);
    return;
  }
  Serial.println("✅ กล้อง OV2640 พร้อมทำงาน");
}

/**
 * ถ่าย 1 เฟรม แล้วคัดลอกออกมาเก็บใน PSRAM
 *
 * ต้องคัดลอกเพราะ fb_count = 1 ถ้าถือ frame buffer ไว้จะถ่ายเฟรมถัดไปไม่ได้
 * และต้องใช้ ps_malloc ไม่ใช่ malloc เพราะ RAM ภายในเหลือไม่ถึง 200KB
 * หลังเปิด WiFi + กล้อง เก็บภาพ VGA หลายเฟรมไม่พอแน่นอน
 */
void captureFrame() {
  if (frameCount >= MAX_FRAMES) return;

  if (USE_FLASH) { digitalWrite(FLASH_LED_PIN, HIGH); delay(120); }
  camera_fb_t* fb = esp_camera_fb_get();
  if (USE_FLASH) digitalWrite(FLASH_LED_PIN, LOW);

  if (!fb) {
    Serial.println("❌ ถ่ายภาพล้มเหลว");
    return;
  }

  uint8_t* copy = (uint8_t*)ps_malloc(fb->len);
  if (!copy) copy = (uint8_t*)malloc(fb->len);   // เผื่อบอร์ดไม่มี PSRAM

  if (copy) {
    memcpy(copy, fb->buf, fb->len);
    frames[frameCount] = copy;
    frameSizes[frameCount] = fb->len;
    frameCount++;
    Serial.printf("📸 เฟรมที่ %d ขนาด %u bytes\n", frameCount, (unsigned)fb->len);
  } else {
    Serial.println("❌ หน่วยความจำไม่พอเก็บภาพ");
  }

  esp_camera_fb_return(fb);
}

void freeFrames() {
  for (uint8_t i = 0; i < frameCount; i++) free(frames[i]);
  frameCount = 0;
}

/* ---------------------------- หน้าเว็บในเครื่อง ---------------------------- */
// เปิดดูภาพล่าสุดจากมือถือที่อยู่วง WiFi เดียวกัน ใช้ตอนเล็งกล้องตอนประกอบกล่อง

void handleJpg() {
  if (frameCount == 0) {
    server.send(200, "text/plain; charset=utf-8",
                "ยังไม่มีภาพ ลองเปิดฝากล่อง 1 ครั้งแล้วรีเฟรชหน้านี้");
    return;
  }
  WiFiClient client = server.client();
  client.print("HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Length: " +
               String(frameSizes[frameCount - 1]) + "\r\nConnection: close\r\n\r\n");
  client.write(frames[frameCount - 1], frameSizes[frameCount - 1]);
}

void handleStatus() {
  String html = "<meta charset='utf-8'><body style='font-family:sans-serif;padding:20px'>";
  html += "<h2>Smart PillBox</h2>";
  html += "<p>กล่อง: <b>" + String(BOX_SERIAL) + "</b><br>";
  html += "MAC: <b>" + deviceMac + "</b><br>";
  html += "ผูกกับกล่องแล้ว: <b>" + String(deviceKey.isEmpty() ? "ยัง" : "เรียบร้อย") + "</b><br>";
  html += "ฝาตอนนี้: <b>" + String(stableState == HIGH ? "เปิด" : "ปิด") + "</b><br>";
  html += "เฟิร์มแวร์: " + String(FIRMWARE) + "</p>";
  html += "<p><a href='/'>ดูภาพล่าสุด</a></p></body>";
  server.send(200, "text/html; charset=utf-8", html);
}

/* ------------------------------ เครือข่าย ------------------------------ */
bool connectWifi(uint32_t timeoutMs = 20000) {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.begin(ssid, password);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) delay(300);
  return WiFi.status() == WL_CONNECTED;
}

/**
 * ขอ device key ครั้งแรกแล้วเก็บลง NVS
 * ทำให้ไม่ต้องฝังคีย์ลับไว้ในโค้ด และแฟลชบอร์ดใหม่กี่ครั้งคีย์ก็ยังอยู่
 */
bool provision() {
  if (!connectWifi()) return false;

  WiFiClientSecure client;
  client.setInsecure();   // ข้ามการตรวจใบรับรอง — พอสำหรับต้นแบบ
                          // ถ้าจะใช้จริงควรฝัง root CA ของผู้ออกใบรับรองไว้
  HTTPClient http;
  http.begin(client, String(API_BASE) + "/api/hardware/provision");
  http.addHeader("Content-Type", "application/json");

  String body = String("{\"box_serial\":\"") + BOX_SERIAL +
                "\",\"mac\":\"" + deviceMac +
                "\",\"firmware\":\"" + FIRMWARE + "\"}";

  int code = http.POST(body);
  String res = http.getString();
  http.end();

  Serial.printf("provision [%d] %s\n", code, res.c_str());
  if (code != 200) return false;

  int at = res.indexOf("\"device_key\":\"");
  if (at < 0) return false;
  at += 14;
  deviceKey = res.substring(at, res.indexOf('"', at));

  prefs.begin("pillbox", false);
  prefs.putString("key", deviceKey);
  prefs.end();

  Serial.println("🔑 ผูกบอร์ดกับกล่องสำเร็จ เก็บคีย์ลง NVS แล้ว");
  return true;
}

/** ส่งเหตุการณ์ + ภาพทั้งชุดเป็น multipart ก้อนเดียว */
bool sendEvent(const char* eventType, unsigned long openMs) {
  if (!connectWifi()) {
    Serial.println("⚠️ ไม่มีเน็ต ข้ามการส่ง");
    return false;
  }
  if (deviceKey.isEmpty() && !provision()) return false;

  String boundary = "----pillbox" + String(millis());
  String head;

  auto addField = [&](const char* name, const String& value) {
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" +
            name + "\"\r\n\r\n" + value + "\r\n";
  };

  addField("event", eventType);
  addField("lid_open_seconds", String(openMs / 1000));
  addField("firmware", FIRMWARE);

  String imageHeads[MAX_FRAMES];
  for (uint8_t i = 0; i < frameCount; i++) {
    imageHeads[i] = "--" + boundary +
                    "\r\nContent-Disposition: form-data; name=\"image" + String(i) +
                    "\"; filename=\"f" + String(i) +
                    ".jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
  }
  String tail = "--" + boundary + "--\r\n";

  size_t total = head.length() + tail.length();
  for (uint8_t i = 0; i < frameCount; i++) total += imageHeads[i].length() + frameSizes[i] + 2;

  // ประกอบ body ใน PSRAM ด้วยเหตุผลเดียวกับตอนเก็บภาพ
  uint8_t* body = (uint8_t*)ps_malloc(total);
  if (!body) body = (uint8_t*)malloc(total);
  if (!body) {
    Serial.println("❌ หน่วยความจำไม่พอประกอบข้อมูลส่ง");
    return false;
  }

  size_t at = 0;
  memcpy(body + at, head.c_str(), head.length()); at += head.length();
  for (uint8_t i = 0; i < frameCount; i++) {
    memcpy(body + at, imageHeads[i].c_str(), imageHeads[i].length());
    at += imageHeads[i].length();
    memcpy(body + at, frames[i], frameSizes[i]); at += frameSizes[i];
    memcpy(body + at, "\r\n", 2); at += 2;
  }
  memcpy(body + at, tail.c_str(), tail.length()); at += tail.length();

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, String(API_BASE) + "/api/hardware/upload");
  http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
  http.addHeader("x-device-mac", deviceMac);
  http.addHeader("x-device-key", deviceKey);
  http.setTimeout(20000);

  int code = http.POST(body, at);
  String res = http.getString();
  free(body);
  http.end();

  Serial.printf("upload [%d] %s\n", code, res.c_str());

  // คีย์ใช้ไม่ได้แล้ว (เช่นแอดมินล้าง device_mac ในฐานข้อมูล) → ขอผูกใหม่รอบหน้า
  if (code == 401) {
    prefs.begin("pillbox", false);
    prefs.remove("key");
    prefs.end();
    deviceKey = "";
  }
  return code == 200;
}

/* ------------------------------- setup ------------------------------- */
void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(REED_PIN, INPUT_PULLUP);
  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);

  setupCamera();

  WiFi.mode(WIFI_STA);
  deviceMac = WiFi.macAddress();   // A0:B7:65:2C:1F:E8
  deviceMac.replace(":", "");      // ฝั่งเซิร์ฟเวอร์เก็บแบบไม่มีเครื่องหมายคั่น
  deviceMac.toUpperCase();
  Serial.println("MAC ของบอร์ดนี้: " + deviceMac);

  Serial.print("กำลังเชื่อมต่อ Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(ssid, password);
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n--- Wi-Fi เชื่อมต่อแล้ว ---");
  Serial.print(">> ดูภาพและสถานะได้ที่: http://");
  Serial.println(WiFi.localIP());

  server.on("/", handleJpg);
  server.on("/status", handleStatus);
  server.begin();

  prefs.begin("pillbox", true);
  deviceKey = prefs.getString("key", "");
  prefs.end();

  if (deviceKey.isEmpty()) provision();
  sendEvent("boot", 0);

  stableState = digitalRead(REED_PIN);
  lastState = stableState;
}

/* -------------------------------- loop -------------------------------- */
void loop() {
  server.handleClient();

  static unsigned long openedAt      = 0;
  static unsigned long lastFrameAt   = 0;
  static unsigned long lastHeartbeat = 0;

  int reading = digitalRead(REED_PIN);
  if (reading != lastState) lastDebounceTime = millis();

  if ((millis() - lastDebounceTime) > debounceDelay && reading != stableState) {
    stableState = reading;

    if (stableState == HIGH) {
      // ฝาเปิด — เริ่มจับเวลาและถ่ายเป็นชุด
      Serial.println(">> [EVENT] ตรวจพบการเปิดฝา");
      openedAt = millis();
      lastFrameAt = 0;
      freeFrames();
    } else {
      // ฝาปิด — สรุปแล้วส่งขึ้นเซิร์ฟเวอร์ทีเดียว
      unsigned long openMs = millis() - openedAt;
      Serial.printf(".. [INFO] ปิดฝาแล้ว เปิดค้าง %.1f วินาที ถ่ายได้ %d เฟรม\n",
                    openMs / 1000.0, frameCount);
      sendEvent("lid_close", openMs);
      // ไม่ freeFrames() ทันที เพื่อให้เปิดหน้าเว็บดูภาพล่าสุดได้
    }
  }
  lastState = reading;

  // ถ่ายหลายเฟรมตลอดช่วงที่ฝาเปิด เพราะเฟรมเดียวมักไม่ทันจังหวะที่มือเข้ามา
  if (stableState == HIGH && frameCount < MAX_FRAMES &&
      millis() - lastFrameAt > FRAME_GAP_MS) {
    lastFrameAt = millis();
    captureFrame();
  }

  // เปิดค้างนานผิดปกติ แจ้งไว้ครั้งเดียวแล้วรีเซ็ตตัวจับเวลา
  if (stableState == HIGH && millis() - openedAt > MAX_OPEN_MS) {
    sendEvent("error", millis() - openedAt);
    openedAt = millis();
  }

  if (millis() - lastHeartbeat > HEARTBEAT_MS) {
    lastHeartbeat = millis();
    sendEvent("heartbeat", 0);
  }

  delay(20);
}
