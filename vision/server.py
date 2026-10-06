"""
บริการนับเม็ดยา — ห่อโมเดล YOLO ที่เทรนไว้ให้เว็บเรียกใช้ผ่าน HTTP

ทำไมต้องแยกเป็นบริการ Python
  โมเดลเป็น segmentation ที่ถอดผลลัพธ์เองในฝั่ง Node ได้ยาก ส่วนโค้ด Python
  ที่ใช้ทดสอบอยู่ทำงานได้แล้ว จึงใช้ตัวเดิมต่อ แล้วให้เว็บคุยผ่าน HTTP แทน

วิธีรัน
    pip install ultralytics
    MODEL_PATH=final_model.pt python3 vision/server.py      # ฟังที่พอร์ต 8008
    VISION_SERVICE_KEY=xxxxx python3 vision/server.py       # บังคับให้ต้องมีคีย์

แล้วตั้งค่าฝั่งเว็บใน .env.local
    VISION_SERVICE_URL=http://127.0.0.1:8008
    VISION_SERVICE_KEY=xxxxx        (ถ้าตั้งไว้ฝั่งนี้)

เส้นทาง
    GET  /health    ตรวจว่าโมเดลโหลดแล้ว
    POST /analyze   {"images": ["<base64 jpeg>", ...]} → ผลการนับ
"""
import base64
import json
import os
import statistics
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np
import torch
from ultralytics import YOLO

MODEL_PATH = os.environ.get("MODEL_PATH", "final_model.pt")
PORT = int(os.environ.get("PORT", "8008"))
SERVICE_KEY = os.environ.get("VISION_SERVICE_KEY", "")
MAX_BODY = 32 * 1024 * 1024          # 32 MB กันคำขอที่ใหญ่ผิดปกติ
MASK_DUP_IOU = 0.8                   # มาสก์ทับกันเกินค่านี้ถือว่าเป็นเม็ดเดียวกัน

# โมเดลที่เทรนไว้มี 7 คลาส แต่คลาสสุดท้ายเป็นกรอบที่ตีผิดตอนเตรียมชุดข้อมูล
# ไม่ใช่ยา จึงตัดทิ้งตั้งแต่ที่นี่ ไม่ให้หลุดไปถึงฝั่งเว็บและไม่นับรวมเป็นเม็ดยา
IGNORED_CLASSES = {"medicineeeeeee"}

# ค่าเดียวกับที่ใช้ตอนทดสอบกับ ESP32-CAM
PREDICT = dict(imgsz=1280, conf=0.35, iou=0.75, agnostic_nms=True, verbose=False)

print(f"กำลังโหลดโมเดล {MODEL_PATH} ...")
model = YOLO(MODEL_PATH)
print("โมเดลพร้อมทำงานแล้ว")


def dedupe_by_mask(masks, confs):
    """ตัดผลซ้ำที่มาสก์ทับกันเกินเกณฑ์ เก็บตัวที่มั่นใจกว่าไว้

    ใช้มาสก์แทนกรอบสี่เหลี่ยม เพราะแคปซูลสองเม็ดที่วางเฉียงติดกันมีกรอบทับกันมาก
    แต่ตัวเม็ดแทบไม่ทับกัน ถ้าตัดด้วยกรอบจะนับขาด
    """
    if masks is None or len(confs) == 0:
        return list(range(len(confs)))
    m = masks.reshape(len(confs), -1).float()
    inter = m @ m.T
    area = m.sum(1)
    iou = inter / (area[:, None] + area[None, :] - inter + 1e-6)
    keep = []
    for i in torch.argsort(confs, descending=True).tolist():
        if all(iou[i, j] < MASK_DUP_IOU for j in keep):
            keep.append(i)
    return keep


def analyze_one(image):
    """นับเม็ดยาในภาพเดียว คืน (จำนวนเม็ดยา, จำนวนแยกชนิด, จำนวนวัตถุที่ไม่ใช่ยา)"""
    r = model.predict(source=image, **PREDICT)[0]
    if r.boxes is None or len(r.boxes) == 0:
        return 0, {}, 0

    keep = dedupe_by_mask(r.masks.data if r.masks is not None else None, r.boxes.conf)
    names = [model.names[i] for i in r.boxes.cls.int()[keep].tolist()]
    pills = [n for n in names if n not in IGNORED_CLASSES]
    return len(pills), dict(Counter(pills)), len(names) - len(pills)


def analyze(images_b64):
    """นับจากหลายเฟรมแล้วใช้ค่ามัธยฐาน กันผลแกว่งจากเฟรมใดเฟรมหนึ่ง"""
    results = []
    for b64 in images_b64:
        buf = np.frombuffer(base64.b64decode(b64), np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if img is None:
            continue
        results.append(analyze_one(img))

    if not results:
        return None

    counts = [n for n, _, _ in results]
    median = statistics.median_low(counts)
    representative = counts.index(median)             # ใช้เฟรมที่นับได้เท่าค่ามัธยฐานเป็นตัวแทน
    per_class = results[representative][1]
    ignored = results[representative][2]

    ranked = sorted(per_class.items(), key=lambda kv: -kv[1])
    medicine = ranked[0][0] if ranked and (len(ranked) == 1 or ranked[0][1] != ranked[1][1]) else None

    return {
        "count": median,
        "per_class": per_class,
        "medicine": medicine,
        "frames": counts,
        "ignored": ignored,          # วัตถุที่ตรวจเจอแต่ไม่ใช่ยา ไม่ถูกนับรวม
        "model_version": os.path.basename(MODEL_PATH),
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
        if self.path.rstrip("/") == "/health":
            self._send(200, {"ok": True, "model": os.path.basename(MODEL_PATH)})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/analyze":
            return self._send(404, {"error": "not found"})
        if SERVICE_KEY and self.headers.get("x-vision-key") != SERVICE_KEY:
            return self._send(401, {"error": "unauthorized"})

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._send(400, {"error": "bad content length"})

        try:
            payload = json.loads(self.rfile.read(length))
            images = payload.get("images") or []
            if not isinstance(images, list) or not images:
                return self._send(400, {"error": "images ว่างเปล่า"})
            result = analyze(images)
        except Exception as e:
            print("[error]", e)
            return self._send(500, {"error": str(e)})

        if result is None:
            return self._send(400, {"error": "ถอดรหัสภาพไม่สำเร็จ"})
        print(f"นับได้ {result['count']} เม็ด จาก {len(images)} เฟรม {result['per_class']}")
        self._send(200, result)

    def log_message(self, *args):
        pass          # ปิด log ของ http.server ไม่ให้รก ใช้ print ของเราเอง


if __name__ == "__main__":
    print(f"พร้อมรับคำขอที่ http://0.0.0.0:{PORT}  (คีย์: {'เปิดใช้' if SERVICE_KEY else 'ไม่ได้ตั้ง'})")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
