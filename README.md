# Smart PillBox — กล่องยาอัจฉริยะ

เว็บแอป (Next.js + Supabase + LINE Messaging API) สำหรับเตือนและติดตามการทานยาผู้สูงอายุ
หน้าจอทั้งหมดทำตามไฟล์ดีไซน์ `Smart PillBox - Architecture.dc.html` (Claude Design)

โดเมนที่ deploy: https://smart-pillbox-rosy.vercel.app

---

## ⚠️ ต้องทำก่อนใช้งาน 1 อย่าง

รัน `supabase/migrations/0001_logs_rls.sql` ใน Supabase → SQL Editor **หนึ่งครั้ง**
ไม่งั้นหน้า Logs / Reports จะว่าง เพราะตาราง `logs` เปิด RLS ไว้แต่ไม่มี policy
(รายละเอียดและวิธีทำให้ปลอดภัยขึ้นอยู่ในไฟล์นั้น)

---

## หน้าจอ

| เส้นทาง | ทำอะไร | อ้างอิงดีไซน์ |
|---|---|---|
| `/` | กรอกซีเรียลกล่อง 3 หลัก (B-001) เพื่อเริ่มลงทะเบียน | 3a |
| `/login` | เข้าสู่ระบบด้วยเบอร์โทร + ซีเรียล (หรือปุ่ม LINE) | 3a |
| `/onboarding` | กรอกชื่อ เบอร์ วันเกิด ยอมรับเงื่อนไข | 3a |
| `/onboarding/success` | หน้าสำเร็จ + เด้งเข้าหน้าหลักใน 3 วิ | 3a |
| `/dashboard` | มื้อถัดไป (นับถอยหลัง) · ไทม์ไลน์วันนี้ · ภาพจากกล้อง · ยาคงเหลือ | 2a |
| `/schedule` | กรอกข้อมูลยา → ปลดล็อกการตั้งตาราง → หน้าสรุป (แก้ไข / ลบ / เติมยา) | 3b |
| `/logs` | ประวัติย้อนหลัง 7/14/30 วัน กรองตามสถานะ | 3d |
| `/reports` | Adherence 7/30 วัน · กราฟรายวัน · บันทึกสำหรับแพทย์ · พิมพ์ PDF | 3e |
| `/profile` | ข้อมูลส่วนตัว · กล่องที่ผูก · ออกจากระบบ | 3f |

## API

| Endpoint | ใช้ทำอะไร |
|---|---|
| `GET /api/health` | ตรวจว่า env / ฐานข้อมูลพร้อมไหม (ดูจำนวนแถวแต่ละตาราง) |
| `GET /api/me` · `PATCH /api/me` | ข้อมูลผู้ใช้ + กล่อง + ยา + ตาราง / แก้ข้อมูลส่วนตัว |
| `POST /api/boxes/verify` | เช็คว่าซีเรียลมีจริงและยังว่าง |
| `POST /api/auth/register` · `/api/auth/login` | ลงทะเบียน (ผูกกล่อง + ส่ง Flex ต้อนรับ) / เข้าสู่ระบบ |
| `PUT` · `POST` · `DELETE /api/medicines` | แก้ข้อมูลยา / เติมยา (บวกเพิ่ม) / ลบยา |
| `PUT` · `DELETE /api/schedules` | บันทึกตารางทั้งชุด (มื้อเดิมอัปเดต ไม่ลบทิ้ง) / ลบตาราง |
| `GET /api/today` | ข้อมูลหน้า Dashboard |
| `GET /api/logs?days=&filter=` | ประวัติ |
| `GET /api/reports?days=7\|30` | รายงาน |
| `POST /api/doses/confirm` | ปุ่ม "ทานยาแล้ว" |
| `POST /api/hardware/upload` | ESP32 เปิดฝา + ส่งภาพ |
| `GET /api/cron/check-schedule` | ทุก 1 นาที — ถึงเวลามื้อยา → สร้าง log + ส่ง LINE |
| `GET /api/cron/check-missed` | ทุก 5 นาที — เลย 30 นาที → missed + เตือนซ้ำ |
| `GET /api/cron/weekly-report` | อาทิตย์ 20:00 — สรุปรายสัปดาห์ |
| `POST /api/line/webhook` | รับ follow / ข้อความจาก LINE |
| `GET /api/line/preview?type=` | ดู Flex JSON ทั้ง 5 แบบโดยไม่ต้องส่งจริง |

## หน้า /schedule ทำงานเป็น 3 จังหวะ

1. **กรอกข้อมูลยาก่อน** — ชื่อยา + จำนวนเม็ด ส่วนตั้งตารางด้านล่างจะจางและกดไม่ได้ (`fieldset disabled`)
2. **ครบแล้วตารางเปิดให้ตั้ง** — เลือกประเภท (ทุกวัน / รายสัปดาห์ / ทุก X วัน) แล้วใส่มื้อยา
3. **กดบันทึกแล้วกลายเป็นหน้าสรุป** — ชื่อยา จำนวนคงเหลือ และตารางที่อ่านเข้าใจง่ายตามประเภทที่เลือก
   (เช่น "ทุกวันจันทร์ · พุธ · ศุกร์" หรือ "ทุก ๆ 2 วัน") พร้อมปุ่ม **แก้ไข** และ **ลบ**

**เติมยา** เป็น popup — ใส่จำนวนที่เติมเพิ่ม (มีปุ่มลัด +10/+20/+30/+60)
ระบบบวกเข้ากับจำนวนที่เหลืออยู่ และบอกล่วงหน้าว่าเติมแล้วจะพอใช้อีกกี่วัน

## ตรรกะที่ใช้ร่วมกันทั้งระบบ

อยู่ใน `lib/` แก้ที่เดียว ทั้ง cron และหน้าเว็บเปลี่ยนตามทันที

- `lib/time.ts` — ทุกอย่างที่เกี่ยวกับเวลาไทย (server อยู่ UTC จึงต้องผ่านไฟล์นี้เสมอ)
- `lib/schedule.ts` — มื้อยาเกิดวันไหน (`occursOn`), มื้อถัดไป (`nextDose`),
  รวมตาราง+log เป็นไทม์ไลน์ (`slotsForDate`), สรุปผล (`summarize`)
- `lib/flex/` — Flex Message 5 แบบตามดีไซน์ 2b

**"ทานเลท" ไม่ได้เก็บใน DB** — `logs.status` มีแค่ `pending / taken / missed`
ระบบคำนวณตอนแสดงผลจาก `actual_time − scheduled_time > 30 นาที` ตามที่ระบุไว้ในไฟล์ดีไซน์

## ลำดับเหตุการณ์ 1 มื้อ

```
cron ทุก 1 นาที → เจอ schedules.time ตรงเวลา
  → insert logs (status = pending)          ← unique index กันสร้างซ้ำ
  → push Flex "แจ้งเตือนมื้อยา"
ESP32 เปิดฝา + ถ่ายภาพ → POST /api/hardware/upload
  → update status = taken, actual_time, image_url
  → หัก medicines.total_pills
ถ้าเลย 30 นาทีแล้วเงียบ → check-missed ตั้ง status = missed + เตือนซ้ำ
```

## ต่อ ESP32

```
POST /api/hardware/upload
Headers: x-device-serial: B-001
         x-device-key: <HARDWARE_DEVICE_KEY>   (ถ้าตั้งไว้)
Body (multipart): image=<jpeg>                  (ไม่บังคับ — กล้องพังก็ยังบันทึกได้)
```

จับคู่กับมื้อที่ใกล้เวลาที่สุดภายใน ±90 นาที ถ้านอกกรอบจะบันทึกเป็นการเปิดฝานอกเวลา
ภาพเก็บใน Storage bucket `dose-photos` (private) path `{user_id}/{log_id}.jpg`
แล้วเขียน `logs.image_url` เป็น signed URL อายุ 7 วัน — **ต้องสร้าง bucket นี้เองใน Supabase ก่อน**

## ตั้ง cron (ยังไม่ได้ตั้งให้)

เลือกทางใดทางหนึ่ง แล้วตั้ง `CRON_SECRET` ใน environment variables ด้วย

1. **Supabase pg_cron** — แก้ URL/secret ใน `supabase/migrations/0002_pg_cron_reminders.sql` แล้วรัน
2. **Vercel Cron** — ใส่ใน `vercel.json` (แพลน Hobby ตั้งได้แค่วันละครั้ง ต้องใช้ Pro ถึงจะทุกนาที)
   ```json
   { "crons": [
     { "path": "/api/cron/check-schedule", "schedule": "* * * * *" },
     { "path": "/api/cron/check-missed",   "schedule": "*/5 * * * *" },
     { "path": "/api/cron/weekly-report",  "schedule": "0 13 * * 0" }
   ] }
   ```
3. **cron ภายนอก** (cron-job.org ฯลฯ) — ยิง URL พร้อม header `Authorization: Bearer <CRON_SECRET>`

## Environment variables

| ตัวแปร | จำเป็น | ใช้ทำอะไร |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | เชื่อม Supabase |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | ส่งข้อความ LINE |
| `NEXT_PUBLIC_LIFF_ID` | ✅ | เปิดในแอป LINE |
| `NEXT_PUBLIC_APP_URL` | ✅ | ปุ่มใน Flex Message (ต้องเป็น https ไม่งั้นปุ่มจะหายไป) |
| `SUPABASE_SERVICE_ROLE_KEY` | แนะนำ | ให้ `/api/*` ข้าม RLS ได้ → เปิด RLS กลับได้อย่างปลอดภัย |
| `LINE_CHANNEL_SECRET` | แนะนำ | ตรวจลายเซ็น webhook |
| `CRON_SECRET` | แนะนำ | กันคนอื่นยิง `/api/cron/*` |
| `HARDWARE_DEVICE_KEY` | แนะนำ | กันคนอื่นยิง `/api/hardware/upload` |
| `MISSED_AFTER_MINUTES` | ไม่ | เลยกี่นาทีถึงนับว่าลืมทาน (ค่าเริ่มต้น 30) |

## ข้อมูล mockup ที่ seed ไว้

- ผู้ใช้ **มะลิ ทิ้งใจ** · เบอร์ 081-555-0192 · เกิด 15 ส.ค. 2510
- กล่อง **B-001** (ผูกแล้ว) · B-002 / B-003 / B-999 ว่างไว้ทดสอบลงทะเบียน
- ยา **Metformin 500** เหลือ 8 เม็ด หมดอายุ 12 ธ.ค. 2570
- ตาราง ทุกวัน 3 มื้อ 08:00 (ก่อนอาหาร) · 12:00 · 18:00 (หลังอาหาร)
- ประวัติ 30 วัน 90 แถว — 7 วันล่าสุดออกมาเป็น **86%** (ตรงเวลา 15 · เลท 3 · ลืม 3) ตรงกับตัวเลขในดีไซน์

ข้อมูลจะค่อย ๆ เก่าลงตามวันที่ผ่านไป — อยากให้ประวัติ 30 วันมาจบที่ "วันนี้" อีกครั้ง
ให้รัน `supabase/migrations/0003_seed_mockup.sql` ซ้ำได้เลย (รันกี่ครั้งก็ได้)

**`users.line_user_id` ยังเป็น `U_MOCK_LINE_USER_ID`** — ข้อความจะยังไม่ถึงมือถือจริง
เปลี่ยนเป็น LINE userId ของตัวเอง (ดูได้จาก LINE Developers Console) แล้วจะได้รับแจ้งเตือนทันที

## เริ่มพัฒนา

```bash
npm install
npm run dev
```

เข้าดูหน้าจอโดยไม่ต้องลงทะเบียนใหม่ — เปิด DevTools แล้วรัน

```js
localStorage.setItem('user_id', 'b2cbf842-d0aa-4dce-81f5-a587327518df');
localStorage.setItem('user_name', 'มะลิ ทิ้งใจ');
localStorage.setItem('box_serial', 'B-001');
```

## ข้อควรระวังในสคีมา (เจอตอนทดสอบ)

`boxes.owner_user_id` ตั้งเป็น `ON DELETE CASCADE` → **ลบผู้ใช้ 1 คน = แถวของกล่องหายไปทั้งใบ**
กล่องเป็นฮาร์ดแวร์ที่เอามาผูกใหม่ได้ ไม่ควรหายตามผู้ใช้ ถ้าเห็นด้วยให้รัน

```sql
alter table public.boxes drop constraint boxes_owner_user_id_fkey;
alter table public.boxes add constraint boxes_owner_user_id_fkey
  foreign key (owner_user_id) references public.users(user_id) on delete set null;
```

## หมายเหตุด้านความปลอดภัย

session ตอนนี้เก็บใน `localStorage` แล้วส่ง `x-user-id` ให้ API — ระดับ prototype เท่านั้น
เพราะยังไม่ได้ใช้ Supabase Auth (ตัวตนมาจาก LINE) ก่อนใช้กับผู้ป่วยจริงควร
ย้ายไป Supabase Auth + ผูก RLS policy กับ `auth.uid()` ตามที่เขียนไว้ท้ายไฟล์ `0001_logs_rls.sql`
