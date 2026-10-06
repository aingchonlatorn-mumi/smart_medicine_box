// ไฟล์ทดสอบว่าไลบรารีของ ESP32 ใช้งานได้ครบหรือไม่
// ถ้าไฟล์นี้คอมไพล์ผ่าน แปลว่าบอร์ดและแพ็กเกจถูกต้อง ปัญหาอยู่ที่สเก็ตช์เดิม
// ถ้าไฟล์นี้ไม่ผ่าน แปลว่าเป็นเรื่องการติดตั้ง ไม่ใช่โค้ดของโครงงาน

#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Preferences.h>
#include "esp_mac.h"

WebServer server(80);
Preferences prefs;
WiFiClientSecure secureClient;
HTTPClient http;

void setup() {
  Serial.begin(115200);

  uint8_t mac[6] = {0};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  Serial.printf("MAC: %02X%02X%02X%02X%02X%02X\n",
                mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

  Serial.println(psramFound() ? "พบ PSRAM" : "ไม่พบ PSRAM");
  Serial.println("ไลบรารีครบทุกตัว");
}

void loop() {
  delay(1000);
}
