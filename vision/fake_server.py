"""
บริการจำลองผลการนับเม็ดยา — ใช้ทดสอบระบบโดยไม่ต้องใช้โมเดลและกล่องจริง

ตอบกลับด้วยค่าที่เราตั้งไว้ ทำให้ทดสอบทุกกรณีได้ตามต้องการ เช่น ทานยาถูกต้อง
เปิดกล่องแล้วไม่หยิบ หยิบเกินขนาด เติมยา และพบยาแปลกปลอม โดยไม่ต้องรอฮาร์ดแวร์

วิธีรัน
    python3 vision/fake_server.py            # ฟังที่พอร์ต 8008

ตั้งค่าที่จะให้ตอบกลับ
    curl "http://127.0.0.1:8008/set?count=24&medicine=Ferrous%20Fumarate"
    curl "http://127.0.0.1:8008/set?count=23"              # จำลองว่าหยิบไป 1 เม็ด
    curl  http://127.0.0.1:8008/state                      # ดูค่าปัจจุบัน
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("PORT", "8008"))
SERVICE_KEY = os.environ.get("VISION_SERVICE_KEY", "")

state = {"count": 24, "medicine": "Ferrous Fumarate", "stable": True}


def result():
    return {
        "count": state["count"],
        "per_class": {state["medicine"]: state["count"]} if state["count"] else {},
        "medicine": state["medicine"] if state["count"] else None,
        "frames": [state["count"]] * 3 if state["stable"] else
                  [state["count"], state["count"] + 1, state["count"]],
        "model_version": "fake",
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        path = url.path.rstrip("/")
        if path == "/health":
            return self._send(200, {"ok": True, "model": "fake"})
        if path == "/state":
            return self._send(200, state)
        if path == "/set":
            q = parse_qs(url.query)
            if "count" in q:
                state["count"] = int(q["count"][0])
            if "medicine" in q:
                state["medicine"] = q["medicine"][0]
            if "stable" in q:
                state["stable"] = q["stable"][0] not in ("0", "false")
            print("ตั้งค่าใหม่:", state)
            return self._send(200, state)
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/analyze":
            return self._send(404, {"error": "not found"})
        if SERVICE_KEY and self.headers.get("x-vision-key") != SERVICE_KEY:
            return self._send(401, {"error": "unauthorized"})

        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length)          # อ่านทิ้ง ไม่ได้ใช้ภาพจริง
        out = result()
        print(f"ตอบกลับ: {out['count']} เม็ด ({out['medicine']})")
        self._send(200, out)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"บริการจำลองพร้อมที่ http://127.0.0.1:{PORT}  ค่าเริ่มต้น {state}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
