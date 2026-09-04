#!/usr/bin/env python3
"""
สร้างภาพ Rich Menu ขนาด 2500x1686 (6 ช่อง 2 แถว x 3 คอลัมน์)
ใช้โทนเดียวกับเว็บแอป: indigo #4F46E5 บนพื้นขาว เส้นคั่นบาง

    python3 scripts/make_richmenu_image.py

ผลลัพธ์: public/richmenu/richmenu.png
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 2500, 1686

INDIGO = (79, 70, 229)
INK = (15, 23, 42)
MUTED = (100, 116, 139)
LINE = (226, 232, 240)
WHITE = (255, 255, 255)

FONT_PATH = "/System/Library/Fonts/Supplemental/SukhumvitSet.ttc"
BOLD, MEDIUM = 5, 3


def font(size: int, index: int = MEDIUM) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size, index=index)


def centered(draw: ImageDraw.ImageDraw, xy, text, fnt, fill):
    """วางข้อความให้กึ่งกลางแนวนอนที่จุด xy (x คือกึ่งกลาง, y คือขอบบน)"""
    x, y = xy
    left, top, right, bottom = draw.textbbox((0, 0), text, font=fnt)
    draw.text((x - (right - left) / 2 - left, y - top), text, font=fnt, fill=fill)


# ---------------------------------------------------------------- ไอคอน
# วาดด้วยรูปทรงพื้นฐาน ให้คมที่ขนาด 2500px โดยไม่ต้องพึ่งไฟล์ภาพภายนอก

def icon_home(d, cx, cy, s, color):
    w = int(s * 0.9)
    d.polygon([(cx, cy - s * 0.62), (cx - w * 0.72, cy - s * 0.02),
               (cx + w * 0.72, cy - s * 0.02)], outline=color, width=12)
    d.rounded_rectangle([cx - w * 0.5, cy - s * 0.02, cx + w * 0.5, cy + s * 0.6],
                        radius=14, outline=color, width=12)
    d.rounded_rectangle([cx - s * 0.17, cy + s * 0.16, cx + s * 0.17, cy + s * 0.6],
                        radius=8, outline=color, width=12)


def icon_calendar(d, cx, cy, s, color):
    box = [cx - s * 0.62, cy - s * 0.5, cx + s * 0.62, cy + s * 0.6]
    d.rounded_rectangle(box, radius=18, outline=color, width=12)
    d.line([box[0], cy - s * 0.15, box[2], cy - s * 0.15], fill=color, width=12)
    for i in (-1, 0, 1):
        d.line([cx + i * s * 0.34, box[1] - s * 0.16, cx + i * s * 0.34, box[1] + s * 0.08],
               fill=color, width=12)
    for r in range(2):
        for c in range(3):
            x = cx + (c - 1) * s * 0.32
            y = cy + 0.08 * s + r * s * 0.28
            d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=color)


def icon_clock(d, cx, cy, s, color):
    r = s * 0.6
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=12)
    d.line([cx, cy, cx, cy - r * 0.55], fill=color, width=12)
    d.line([cx, cy, cx + r * 0.42, cy + r * 0.2], fill=color, width=12)


def icon_chart(d, cx, cy, s, color):
    base = cy + s * 0.55
    for i, h in enumerate((0.45, 0.85, 0.62)):
        x = cx + (i - 1) * s * 0.42
        d.rounded_rectangle([x - s * 0.14, base - s * h, x + s * 0.14, base],
                            radius=8, outline=color, width=12)
    d.line([cx - s * 0.7, base + s * 0.1, cx + s * 0.7, base + s * 0.1], fill=color, width=12)


def icon_person(d, cx, cy, s, color):
    r = s * 0.26
    d.ellipse([cx - r, cy - s * 0.55, cx + r, cy - s * 0.55 + 2 * r], outline=color, width=12)
    d.arc([cx - s * 0.58, cy - s * 0.06, cx + s * 0.58, cy + s * 1.05],
          start=200, end=340, fill=color, width=12)


def icon_help(d, cx, cy, s, color):
    r = s * 0.6
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=12)
    # ใช้ตัวอักษรจริงแทนการวาดส่วนโค้ง ให้รูปทรงถูกต้องแน่นอน
    mark = font(int(s * 1.15), BOLD)
    left, top, right, bottom = d.textbbox((0, 0), "?", font=mark)
    d.text((cx - (right - left) / 2 - left, cy - (bottom - top) / 2 - top),
           "?", font=mark, fill=color)


CELLS = [
    # (ชื่อ, คำอธิบาย, ไอคอน, เป็นปุ่มหลัก, x, y, w, h) — ต้องตรงกับ scripts/setup-richmenu.mjs
    ("ภาพรวมการทานยา", "มื้อถัดไปและสถานะวันนี้", icon_home,     True,     0,    0, 1666, 843),
    ("ลงทะเบียน",      "ผูกกล่องยา",              icon_person,   False, 1666,    0,  834, 843),
    ("ตารางทานยา",     "ดูและแก้ไขเวลา",          icon_calendar, False,    0,  843,  833, 843),
    ("รายงาน",         "สรุปให้แพทย์ดู",          icon_chart,    False,  833,  843,  834, 843),
    ("ติดต่อสอบถาม",   "วิธีใช้งาน",              icon_help,     False, 1667,  843,  833, 843),
]


def main() -> None:
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    f_title = font(88, BOLD)
    f_sub = font(52, MEDIUM)

    for title, sub, icon, primary, x0, y0, w, h in CELLS:
        cx, cy = x0 + w / 2, y0 + h / 2

        # ช่องแรกเป็นปุ่มหลัก ใช้พื้นสีเข้มให้เด่นกว่าช่องอื่น
        fg = WHITE if primary else INK
        sub_fg = (199, 210, 254) if primary else MUTED
        if primary:
            d.rectangle([x0, y0, x0 + w, y0 + h], fill=INDIGO)

        icon(d, cx, cy - h * 0.15, h * 0.19, WHITE if primary else INDIGO)
        centered(d, (cx, cy + h * 0.06), title, f_title, fg)
        centered(d, (cx, cy + h * 0.24), sub, f_sub, sub_fg)

    # เส้นคั่นตามผังจริง วาดทีหลังเพื่อให้อยู่บนสุด
    d.line([1666, 0, 1666, 843], fill=LINE, width=4)
    d.line([0, 843, W, 843], fill=LINE, width=4)
    d.line([833, 843, 833, H], fill=LINE, width=4)
    d.line([1667, 843, 1667, H], fill=LINE, width=4)

    out = Path(__file__).resolve().parent.parent / "public" / "richmenu" / "richmenu.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)
    size_kb = out.stat().st_size / 1024
    print(f"สร้างแล้ว: {out}  ({W}x{H}, {size_kb:.0f} KB)")
    if size_kb > 1024:
        print("⚠️  LINE จำกัดไฟล์ไม่เกิน 1 MB")


if __name__ == "__main__":
    main()
