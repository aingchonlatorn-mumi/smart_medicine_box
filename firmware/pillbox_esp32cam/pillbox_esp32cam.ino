/* =============================================================================
   Smart PillBox — AI-Thinker ESP32-CAM + reed switch MC-38
   เฟิร์มแวร์ 2.3.2

   หน้าที่ของบอร์ด: รายงาน "สิ่งที่เห็น" เท่านั้น ไม่ตัดสินว่าทานยาแล้วหรือยัง
   การตีความอยู่ฝั่งเซิร์ฟเวอร์ทั้งหมด แก้กฎได้โดยไม่ต้อง flash บอร์ดใหม่

   การต่อสาย
     reed switch ขาที่ 1 → GPIO13
     reed switch ขาที่ 2 → GND
     ฝาปิด (แม่เหล็กชิด)  = ต่อวงจร → LOW
     ฝาเปิด (แม่เหล็กห่าง) = ตัดวงจร → INPUT_PULLUP ดึงขึ้นเป็น HIGH

   ⚠ ห้ามย้ายไป GPIO12 — เป็น strapping pin (MTDI) ที่ ESP32 อ่านตอนบูต
     ถ้าโดนดึง HIGH ตอนบูต (ซึ่งเกิดพอดีเวลาฝาเปิดค้างอยู่) บอร์ดจะบูตไม่ขึ้น

   ไฟเลี้ยง: จ่าย 5V เข้าขา 5V โดยตรง อย่างน้อย 1A และต่อตัวเก็บประจุ 470–1000uF
     คร่อม 5V กับ GND ใกล้บอร์ด ถ้าจ่ายไฟผ่านสาย USB-TTL อย่างเดียวจะไม่พอ
     บอร์ดจะรีเซ็ตตัวเองตอนเปิด WiFi หรือเปิดไฟส่องสว่าง

   Arduino IDE
     Board            = AI Thinker ESP32-CAM
     Partition Scheme = Huge APP (3MB No OTA/1MB SPIFFS)
     PSRAM            = Enabled
   ============================================================================= */

#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Preferences.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"   // ใช้ปิดวงจรตรวจไฟตก

// อ่าน MAC จาก eFuse โดยตรง (รองรับทั้ง arduino-esp32 v2 และ v3)
#if __has_include("esp_mac.h")
  #include "esp_mac.h"
#else
  #include "esp_system.h"
#endif

/* ------------------------------- ตั้งค่า ------------------------------- */
const char* ssid     = "AA";
const char* password = "aing0864017741";

const char* API_BASE   = "https://smart-pillbox-rosy.vercel.app";
const char* BOX_SERIAL = "B-001";
const char* FIRMWARE   = "2.3.3";

#define REED_PIN       13
#define FLASH_LED_PIN  4

// เปิดไฟส่องสว่างตอนถ่าย เพราะกล่องปิดสนิทแล้วมืดเกินกว่าจะนับเม็ดยาได้
#define USE_FLASH      true
// ห้ามเปิดแฟลชเต็มกำลังด้วย digitalWrite เพราะไฟ LED บนบอร์ด AI-Thinker กินกระแสสูงมาก
// จนแรงดันตกและบอร์ดรีเซ็ตเอง (Brownout) โดยเฉพาะตอน WiFi กำลังส่งข้อมูล
// จึงหรี่ด้วย PWM แทน ถ้ายังเจอบอร์ดรีเซ็ตให้ลดค่านี้ลงอีก
#define FLASH_DUTY     60      // 0-255 (60 ≈ 23% ของความสว่างเต็ม)
#define FLASH_FREQ     5000
#define FLASH_CHANNEL  7       // ช่อง 0 ถูกกล้องใช้เป็น XCLK แล้ว ห้ามใช้ซ้ำ
// หน่วงให้ระบบวัดแสงอัตโนมัติของกล้องปรับตัวเข้ากับแสงแฟลชก่อนถ่ายจริง
#define FLASH_SETTLE_MS 250

const unsigned long debounceDelay   = 50;
// ถ่ายภาพหลังปิดฝา ไม่ใช่ระหว่างฝาเปิด เพราะตอนฝาปิดจะไม่มีมือบังและเม็ดยาหยุดนิ่งแล้ว
// ทำให้การนับเม็ดยาแม่นยำขึ้น แลกกับการต้องใช้ไฟส่องสว่างในกล่องที่ปิดสนิท
const unsigned long CLOSE_SETTLE_MS = 600;    // รอให้เม็ดยาหยุดกลิ้งก่อนถ่าย
const unsigned long FRAME_GAP_MS    = 400;
const uint8_t       MAX_FRAMES      = 3;
const unsigned long MAX_OPEN_MS     = 120000;
const unsigned long HEARTBEAT_MS    = 900000;

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

String deviceMac;      // ตัวระบุบอร์ด ไม่ใช่ความลับ
String deviceKey;      // ตัวยืนยันตัวตน เก็บใน NVS ไม่ฝังในโค้ด

uint8_t* frames[MAX_FRAMES];
size_t   frameSizes[MAX_FRAMES];
uint8_t  frameCount = 0;

unsigned long cycleCount = 0;   // นับรอบเปิด-ปิดฝา ใช้อ้างอิงตอนทำการทดลอง

int lastState = LOW;
int stableState = LOW;
unsigned long lastDebounceTime = 0;

/**
 * อ่าน MAC จาก eFuse ของชิปโดยตรง
 *
 * ห้ามใช้ WiFi.macAddress() ตอนต้น setup() เพราะจะได้ 00:00:00:00:00:00
 * ถ้า WiFi stack ยังไม่เริ่มทำงาน — เจอปัญหานี้จริง บอร์ดผูกกล่องด้วย MAC
 * ศูนย์ทั้งหมด ซึ่งถ้ามีบอร์ดตัวที่สองจะชนกันที่ค่าเดียวกันทันที
 * ส่วน eFuse อ่านได้เสมอไม่ว่า WiFi จะพร้อมหรือยัง
 */
String readMacFromEfuse() {
  uint8_t mac[6] = {0};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);

  char buf[13];
  snprintf(buf, sizeof(buf), "%02X%02X%02X%02X%02X%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(buf);
}

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

  // บอร์ดนี้คืนเฟรมเก่าที่ค้างอยู่ในบัฟเฟอร์ได้ ถ้าใช้บัฟเฟอร์เดียวและโหมดมาตรฐาน
  // ผลคือภาพที่ได้อาจเป็นภาพตอนฝายังเปิดอยู่ ซึ่งมีมือบังและเม็ดยายังไม่นิ่ง
  // ใช้สองบัฟเฟอร์คู่กับโหมดเอาเฟรมล่าสุด เพื่อให้ได้ภาพ ณ เวลาที่สั่งถ่ายจริง
  if (psramFound()) {
    config.fb_count   = 2;
    config.grab_mode  = CAMERA_GRAB_LATEST;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    config.fb_count  = 1;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("❌ กล้องเริ่มต้นล้มเหลว: 0x%x\n", err);
    return;
  }
  Serial.println("✅ กล้อง OV2640 พร้อมทำงาน");
}

/**
 * ถ่าย 1 เฟรม แล้วคัดลอกออกมาเก็บใน PSRAM
 * ต้องคัดลอกเพราะบัฟเฟอร์ของกล้องมีจำกัด ถ้าถือไว้จะถ่ายเฟรมถัดไปไม่ได้
 * และต้องใช้ ps_malloc เพราะ Internal SRAM เหลือไม่พอเก็บภาพ VGA หลายเฟรม
 */
/** เปิด-ปิดไฟแฟลชแบบหรี่ได้ รองรับทั้ง Arduino core รุ่น 2.x และ 3.x */
void setFlash(uint8_t duty) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(FLASH_LED_PIN, duty);
#else
  ledcWrite(FLASH_CHANNEL, duty);
#endif
}

/**
 * ทิ้งเฟรมที่ค้างอยู่ในบัฟเฟอร์
 * ต้องทิ้งแม้จะตั้งโหมดเอาเฟรมล่าสุดไว้แล้ว เพราะเฟรมแรกหลังกล้องว่างมานาน
 * ยังใช้ค่าแสงและสมดุลสีชุดเก่า ภาพจึงสว่างไม่เท่าเฟรมถัด ๆ ไป
 */
void discardFrames(uint8_t count) {
  for (uint8_t i = 0; i < count; i++) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
    delay(60);
  }
}

/** ถ่ายหนึ่งเฟรมเก็บลงหน่วยความจำ — ผู้เรียกเป็นผู้จัดการไฟส่องสว่างเอง */
void captureFrame() {
  if (frameCount >= MAX_FRAMES) return;

  camera_fb_t* fb = esp_camera_fb_get();

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

/**
 * ถ่ายภาพเป็นชุดหลังปิดฝา
 * เปิดไฟค้างไว้ตลอดชุดแทนการเปิด-ปิดทีละเฟรม เพื่อให้ระบบวัดแสงอัตโนมัติของกล้อง
 * ปรับตัวเพียงครั้งเดียว ทุกเฟรมจึงมีความสว่างใกล้เคียงกันและนำไปเทียบกันได้
 */
void captureBurst() {
  freeFrames();

  if (USE_FLASH) {
    setFlash(FLASH_DUTY);
    delay(FLASH_SETTLE_MS);
  }

  // ทิ้งเฟรมค้างทุกครั้ง ไม่ใช่เฉพาะตอนเปิดไฟ เพราะกล้องว่างมาตั้งแต่ปิดฝาครั้งก่อน
  // เฟรมที่ค้างอยู่จึงเป็นภาพเก่าที่ถ่ายไว้คนละจังหวะกับที่ต้องการ
  discardFrames(2);

  for (uint8_t i = 0; i < MAX_FRAMES; i++) {
    captureFrame();
    if (i < MAX_FRAMES - 1) delay(FRAME_GAP_MS);
  }

  if (USE_FLASH) setFlash(0);
  Serial.printf(".. [INFO] ถ่ายภาพหลังปิดฝาได้ %d เฟรม\n", frameCount);
}

void freeFrames() {
  for (uint8_t i = 0; i < frameCount; i++) {
    if (frames[i]) {
      free(frames[i]);
      frames[i] = NULL;
    }
  }
  frameCount = 0;
}

/* ---------------------------- หน้าเว็บในเครื่อง ---------------------------- */
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

/**
 * ภาพสด ณ เวลาที่เรียก — คนละอย่างกับ "/" ที่คืนภาพชุดล่าสุดตอนปิดฝา
 * มีไว้ให้สคริปต์ทดสอบฝั่งคอมพิวเตอร์ดึงภาพไปเข้าแบบจำลองได้โดยไม่ต้องเปิด-ปิดฝา
 * เรียกซ้ำได้เรื่อย ๆ และได้ภาพใหม่ทุกครั้ง จึงไม่ต้องยิงทิ้งเพื่อไล่เฟรมค้าง
 *
 *   GET /live        ถ่ายด้วยแสงที่มีอยู่
 *   GET /live?flash=1  เปิดไฟส่องสว่างเหมือนตอนถ่ายจริง
 */
void handleLive() {
  bool useFlash = server.hasArg("flash") && server.arg("flash") != "0";

  if (useFlash) {
    setFlash(FLASH_DUTY);
    delay(FLASH_SETTLE_MS);
  }
  discardFrames(2);
  camera_fb_t* fb = esp_camera_fb_get();
  if (useFlash) setFlash(0);

  if (!fb) {
    server.send(503, "text/plain; charset=utf-8", "ถ่ายภาพไม่สำเร็จ");
    return;
  }

  WiFiClient client = server.client();
  client.print("HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nCache-Control: no-store"
               "\r\nContent-Length: " + String(fb->len) + "\r\nConnection: close\r\n\r\n");
  client.write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

void handleStatus() {
  String html = "<meta charset='utf-8'><body style='font-family:sans-serif;padding:20px'>";
  html += "<h2>Smart PillBox Status</h2>";
  html += "<p>กล่อง: <b>" + String(BOX_SERIAL) + "</b><br>";
  html += "MAC: <b>" + deviceMac + "</b><br>";
  html += "ผูกกับกล่องแล้ว: <b>" + String(deviceKey.isEmpty() ? "ยังไม่ผูก" : "เรียบร้อย") + "</b><br>";
  html += "ฝาตอนนี้: <b>" + String(stableState == HIGH ? "เปิด" : "ปิด") + "</b><br>";
  html += "PSRAM คงเหลือ: <b>" + String(ESP.getFreePsram() / 1024) + " KB</b><br>";
  html += "เฟิร์มแวร์: " + String(FIRMWARE) + "</p>";
  html += "<p><a href='/'>ดูภาพชุดล่าสุดตอนปิดฝา</a> · ";
  html += "<a href='/live?flash=1'>ถ่ายภาพสดเดี๋ยวนี้</a></p></body>";
  server.send(200, "text/html; charset=utf-8", html);
}

/* ------------------------------ เครือข่าย ------------------------------ */
bool connectWifi(uint32_t timeoutMs = 15000) {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.begin(ssid, password);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < timeoutMs) {
    delay(300);
  }
  return WiFi.status() == WL_CONNECTED;
}

/** ขอ device key ครั้งแรกแล้วเก็บลง NVS — ไม่ต้องฝังคีย์ลับไว้ในโค้ด */
bool provision() {
  if (!connectWifi()) return false;

  WiFiClientSecure client;
  client.setInsecure();   // ข้ามการตรวจใบรับรอง พอสำหรับต้นแบบ

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
  String head = "";

  auto addField = [&](const char* name, const String& value) {
    head += "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" +
            name + "\"\r\n\r\n" + value + "\r\n";
  };

  addField("box_serial", BOX_SERIAL);
  addField("device_mac", deviceMac);
  addField("event", eventType);
  // ชื่อฟิลด์ต้องตรงกับที่เซิร์ฟเวอร์อ่าน ไม่งั้นระยะเวลาเปิดฝาจะเป็น null
  // แล้วตัวกรอง "เปิดแวบเดียวไม่นับเป็นการหยิบยา" จะไม่ทำงาน
  // ส่งเป็นมิลลิวินาทีตามที่วัดได้จริง ไม่ปัดเป็นวินาที
  // การปัดทำให้การเปิด 1.9 วินาทีกลายเป็น 1 แล้วเซิร์ฟเวอร์คัดทิ้งว่าเปิดสั้นเกินไป
  addField("lid_open_ms", String(openMs));
  // คงฟิลด์เดิมไว้ด้วย เผื่อเซิร์ฟเวอร์รุ่นเก่ายังอ่านชื่อนี้
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
  http.addHeader("x-device-serial", BOX_SERIAL);
  http.addHeader("x-device-mac", deviceMac);
  http.addHeader("x-device-key", deviceKey);
  http.setTimeout(25000);

  int code = http.POST(body, at);
  String res = http.getString();
  free(body);
  http.end();

  Serial.printf("upload [%d] %s\n", code, res.c_str());

  // คีย์ใช้ไม่ได้แล้ว เกิดได้สองแบบ
  //   401 คีย์ผิด
  //   400 ฝั่งเซิร์ฟเวอร์ไม่มีบอร์ดผูกไว้กับกล่องนี้ เช่นหลังล้างฐานข้อมูล
  // ทั้งสองกรณีต้องทิ้งคีย์เดิมแล้วขอใหม่ ไม่งั้นบอร์ดจะส่งคีย์ที่ใช้ไม่ได้ซ้ำไปตลอด
  if (code == 400 || code == 401) {
    Serial.println("คีย์เดิมใช้ไม่ได้ ล้างออกแล้วขอใหม่");
    prefs.begin("pillbox", false);
    prefs.remove("key");
    prefs.end();
    deviceKey = "";

    // ขอคีย์ใหม่แล้วส่งซ้ำทันที เพื่อไม่ให้เสียเหตุการณ์นี้ไปเปล่า ๆ
    // ใช้ตัวแปรกันไว้ไม่ให้เรียกซ้ำซ้อนเกินหนึ่งชั้น ถ้าขอคีย์ใหม่แล้วยังไม่ผ่าน
    static bool retrying = false;
    if (!retrying && provision()) {
      retrying = true;
      bool ok = sendEvent(eventType, openMs);
      retrying = false;
      return ok;
    }
  }
  return code == 200;
}

/* ------------------------------- setup ------------------------------- */
void setup() {
  // ปิดวงจรตรวจไฟตกก่อนทำอย่างอื่นทั้งหมด
  //
  // บอร์ด AI-Thinker กินกระแสพุ่งสูงตอนเปิดภาครับส่งสัญญาณไร้สายและตอนเปิดไฟ
  // ส่องสว่าง ถ้าแหล่งจ่ายไฟส่งไม่ทัน แรงดันจะตกจนวงจรนี้สั่งรีเซ็ตบอร์ด แล้ว
  // วนบูตใหม่ไม่จบ ซึ่งเกิดขึ้นจริงกับบอร์ดชุดนี้
  //
  // การปิดวงจรนี้เป็นการแก้ที่ปลายเหตุ ต้นเหตุคือแหล่งจ่ายไฟ ควรจ่ายไฟผ่านขา 5V
  // ด้วยอะแดปเตอร์ที่จ่ายได้อย่างน้อย 1 แอมแปร์ และต่อตัวเก็บประจุคร่อมไฟเลี้ยง
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  delay(300);

  pinMode(REED_PIN, INPUT_PULLUP);

#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(FLASH_LED_PIN, FLASH_FREQ, 8);
#else
  ledcSetup(FLASH_CHANNEL, FLASH_FREQ, 8);
  ledcAttachPin(FLASH_LED_PIN, FLASH_CHANNEL);
#endif
  setFlash(0);

  if (psramFound()) {
    Serial.printf("✅ พบ PSRAM: %d bytes\n", ESP.getFreePsram());
  } else {
    Serial.println("⚠️ ไม่พบ PSRAM ระบบจะสำรองไปใช้ Internal SRAM แทน");
  }

  setupCamera();

  WiFi.mode(WIFI_STA);
  // ลดกำลังส่งลงจากค่าสูงสุด เพื่อให้กระแสพุ่งตอนส่งข้อมูลน้อยลง
  // ระยะใช้งานจริงอยู่ในบ้าน จึงไม่ต้องใช้กำลังส่งเต็มที่
  WiFi.setTxPower(WIFI_POWER_13dBm);
  deviceMac = readMacFromEfuse();
  Serial.println("MAC ของบอร์ดนี้: " + deviceMac);

  Serial.print("กำลังเชื่อมต่อ Wi-Fi");
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempts++;
    if (attempts > 40) {   // รอเกิน 20 วินาทีแล้วยังไม่ติด ลองใหม่
      Serial.println("\n[Wi-Fi] หมดเวลาเชื่อมต่อ กำลังเริ่มใหม่อีกครั้ง...");
      WiFi.disconnect();
      WiFi.begin(ssid, password);
      attempts = 0;
    }
  }

  Serial.println("\n--- Wi-Fi เชื่อมต่อแล้ว ---");
  Serial.print(">> ดูภาพและสถานะได้ที่: http://");
  Serial.println(WiFi.localIP());

  server.on("/", handleJpg);
  server.on("/live", handleLive);
  server.on("/status", handleStatus);
  server.begin();

  prefs.begin("pillbox", true);
  deviceKey = prefs.getString("key", "");
  prefs.end();

  if (deviceKey.isEmpty()) {
    provision();
  }
  sendEvent("boot", 0);

  stableState = digitalRead(REED_PIN);
  lastState = stableState;
}

/* -------------------------------- loop -------------------------------- */
void loop() {
  server.handleClient();

  static unsigned long openedAt      = 0;
  static unsigned long lastHeartbeat = 0;

  int reading = digitalRead(REED_PIN);
  if (reading != lastState) lastDebounceTime = millis();

  if ((millis() - lastDebounceTime) > debounceDelay && reading != stableState) {
    stableState = reading;

    if (stableState == HIGH) {
      Serial.println(">> [EVENT] ตรวจพบการเปิดฝา");
      openedAt = millis();
      // แจ้งเซิร์ฟเวอร์ทันทีว่าฝาถูกเปิด เพื่อบันทึกเวลาเริ่มไว้แม้ภาพจะยังไม่ถูกส่ง
      sendEvent("lid_open", 0);
    } else {
      unsigned long openMs = millis() - openedAt;
      Serial.printf(".. [INFO] ปิดฝาแล้ว เปิดค้าง %lu ms\n", openMs);
      unsigned long t0 = millis();
      delay(CLOSE_SETTLE_MS);
      captureBurst();
      unsigned long captureMs = millis() - t0;

      unsigned long t1 = millis();
      bool sent = sendEvent("lid_close", openMs);
      unsigned long uploadMs = millis() - t1;

      // พิมพ์เป็นบรรทัดคั่นด้วยจุลภาค เพื่อให้คัดลอกไปทำตารางผลการทดลองได้ทันที
      // หัวตาราง: cycle,open_ms,frames,bytes,capture_ms,upload_ms,ok
      size_t totalBytes = 0;
      for (uint8_t i = 0; i < frameCount; i++) totalBytes += frameSizes[i];
      cycleCount++;
      Serial.printf("CSV,%lu,%lu,%u,%u,%lu,%lu,%d\n",
                    cycleCount, openMs, frameCount, (unsigned)totalBytes,
                    captureMs, uploadMs, sent ? 1 : 0);
      // ไม่ล้างเฟรมทันที เพื่อให้เปิดหน้าเว็บดูภาพล่าสุดได้
    }
  }
  lastState = reading;

  // เปิดค้างนานผิดปกติ แจ้งครั้งเดียวแล้วรีเซ็ตตัวจับเวลา
  if (stableState == HIGH && (millis() - openedAt) > MAX_OPEN_MS) {
    sendEvent("error", millis() - openedAt);
    openedAt = millis();
  }

  if ((millis() - lastHeartbeat) > HEARTBEAT_MS) {
    lastHeartbeat = millis();
    sendEvent("heartbeat", 0);
  }

  delay(20);
}
