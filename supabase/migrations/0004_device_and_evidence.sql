-- ===========================================================================
-- รองรับฮาร์ดแวร์จริง: ยืนยันตัวตนอุปกรณ์ + เก็บหลักฐานการเปิดกล่อง
--
-- หลักคิด 3 ข้อที่ใช้ตัดสินใจทุกบรรทัดในไฟล์นี้
--   1. ตัวระบุ (identity) ต้องแยกจาก ตัวยืนยัน (authentication)
--   2. ตัวตนของกล่องต้องไม่ผูกกับชิ้นส่วนที่เปลี่ยนได้ (บอร์ดพังแล้วเปลี่ยนได้)
--   3. เก็บ "สิ่งที่วัดได้" แยกจาก "สิ่งที่อนุมาน" — เหมือนที่ทำกับ "ทานเลท"
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) กล่องยา — เพิ่มตัวตนของอุปกรณ์ โดยไม่แตะ box_serial ที่คนใช้
-- ---------------------------------------------------------------------------
-- box_serial  (B-001)  = ตัวตนของ "กล่อง" พิมพ์ติดข้างกล่อง ผู้ป่วยกรอกตอนลงทะเบียน
-- device_mac           = ตัวตนของ "บอร์ด" ที่อยู่ในกล่องใบนั้นตอนนี้
-- device_key_hash      = ตัวยืนยันว่าบอร์ดเป็นตัวจริง (MAC ไม่ใช่ความลับ ดักฟัง WiFi ก็เห็น)
--
-- แยกกันแบบนี้ทำให้เปลี่ยนบอร์ดที่พังได้โดยประวัติการทานยาไม่ขาดตอน

alter table public.boxes
  add column if not exists device_mac       text,
  add column if not exists device_key_hash  text,
  add column if not exists device_bound_at  timestamptz,
  add column if not exists last_seen_at     timestamptz,
  add column if not exists firmware_version text;

-- เก็บ MAC รูปแบบเดียวเสมอ: ตัวพิมพ์ใหญ่ 12 ตัว ไม่มีเครื่องหมายคั่น (AABBCCDDEEFF)
-- กันปัญหา 'a0:b7:65' กับ 'A0-B7-65' กลายเป็นคนละค่า
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'boxes_device_mac_format') then
    alter table public.boxes
      add constraint boxes_device_mac_format
      check (device_mac is null or device_mac ~ '^[0-9A-F]{12}$');
  end if;
end $$;

-- บอร์ดหนึ่งตัวอยู่ในกล่องได้ใบเดียว
create unique index if not exists idx_boxes_device_mac
  on public.boxes (device_mac) where device_mac is not null;

-- หากล่องจากบอร์ดที่ยิงเข้ามาให้เร็ว
create index if not exists idx_boxes_last_seen on public.boxes (last_seen_at desc);


-- ---------------------------------------------------------------------------
-- 2) แก้บั๊ก: ลบผู้ใช้แล้วกล่องหายทั้งใบ
-- ---------------------------------------------------------------------------
-- ของเดิมเป็น ON DELETE CASCADE ทำให้ลบผู้ใช้ 1 คน แถวของกล่องหายไปด้วย
-- ทั้งที่กล่องเป็นฮาร์ดแวร์ที่ยังอยู่และเอากลับมาผูกกับคนใหม่ได้
-- (เจอตอนทดสอบจริง กล่อง B-002 หายไปจากระบบ)

alter table public.boxes drop constraint if exists boxes_owner_user_id_fkey;
alter table public.boxes
  add constraint boxes_owner_user_id_fkey
  foreign key (owner_user_id) references public.users(user_id) on delete set null;


-- ---------------------------------------------------------------------------
-- 3) มื้อยา — เพิ่ม "หลักฐาน" ไม่เพิ่ม "สถานะ"
-- ---------------------------------------------------------------------------
-- ตั้งใจไม่เพิ่ม status = 'opened_unconfirmed' เพราะนั่นคือการตีความ ไม่ใช่ข้อเท็จจริง
-- เก็บสิ่งที่วัดได้จริงไว้ แล้วให้ฝั่งแสดงผลตีความเอง เกณฑ์เปลี่ยนเมื่อไรก็ตีความใหม่ได้ทั้งหมด
--
--   เปิดกล่องแล้วแต่ยังไม่ยืนยัน  =  status='pending'
--                                  and lid_opened_at is not null
--                                  and hand_detected is not true

alter table public.logs
  add column if not exists lid_opened_at    timestamptz,  -- เปิดฝาเมื่อไร
  add column if not exists lid_open_seconds int,          -- เปิดค้างไว้กี่วินาที
  add column if not exists hand_detected    boolean,      -- null = ยังไม่ได้ประมวลผล
  add column if not exists confirmed_by     text;

-- ใครเป็นคนยืนยันว่าทานแล้ว — ใช้ตอบคำถามอาจารย์ว่าเชื่อถือได้แค่ไหน
--   device    = กล่องตรวจเจอเอง (น่าเชื่อถือที่สุด)
--   patient   = ผู้ป่วยกดยืนยันเองในแอป/LINE
--   caregiver = ผู้ดูแลกดแทน (เผื่ออนาคต)
--   system    = ระบบเดาให้ เช่น cron ปรับเป็น missed
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'logs_confirmed_by_check') then
    alter table public.logs
      add constraint logs_confirmed_by_check
      check (confirmed_by is null
             or confirmed_by in ('device', 'patient', 'caregiver', 'system'));
  end if;
end $$;

create index if not exists idx_logs_lid_opened on public.logs (lid_opened_at)
  where lid_opened_at is not null;


-- ---------------------------------------------------------------------------
-- 4) ภาพหลายเฟรมต่อหนึ่งมื้อ
-- ---------------------------------------------------------------------------
-- ถ่ายเฟรมเดียวตอนเปิดฝาพลาดบ่อย (มืด เบลอ มือเข้ามาไม่ตรงจังหวะ)
-- จึงถ่ายเป็นชุดตลอดช่วงที่ฝาเปิด และเก็บผลวิเคราะห์รายเฟรมไว้ด้วย
-- เพื่อรายงานความแม่นยำของการตรวจจับได้ในภายหลัง (ขอบเขตข้อ 4)
--
-- logs.image_url ยังใช้ต่อ = ภาพตัวแทนที่เอาไปโชว์ใน LINE และหน้า Dashboard

create table if not exists public.log_images (
  image_id      uuid primary key default gen_random_uuid(),
  log_id        uuid not null references public.logs(log_id) on delete cascade,
  box_id        uuid references public.boxes(box_id) on delete set null,
  image_url     text not null,
  storage_path  text,                    -- path ใน bucket เผื่อต้องออก signed URL ใหม่
  sequence      int  not null default 0, -- ลำดับเฟรมในชุด 0,1,2,...
  captured_at   timestamptz not null default now(),
  hand_detected boolean,                 -- ผลตรวจของเฟรมนี้
  detection     jsonb,                   -- ผลดิบจากโมเดล เช่น confidence, กรอบที่เจอ
  created_at    timestamptz default now()
);

create index if not exists idx_log_images_log on public.log_images (log_id, sequence);


-- ---------------------------------------------------------------------------
-- 5) ประวัติการเข้าถึงกล่องยา (ขอบเขตข้อ 5)
-- ---------------------------------------------------------------------------
-- แยกจากตาราง logs โดยตั้งใจ เพราะเป็นคนละเรื่องกัน
--   logs          = "มื้อยา" ตามตารางที่ตั้งไว้ ผลคือทาน/ไม่ทาน
--   device_events = "สิ่งที่อุปกรณ์เห็น" เปิดฝาตอนตี 3 ก็ต้องบันทึก แม้ไม่ตรงมื้อไหน
--
-- ถ้าเอาการเปิดฝานอกเวลาไปยัดใน logs ตัวเลข adherence จะเพี้ยนทันที

create table if not exists public.device_events (
  event_id         uuid primary key default gen_random_uuid(),
  box_id           uuid not null references public.boxes(box_id) on delete cascade,
  event_type       text not null,
  occurred_at      timestamptz not null default now(),
  lid_open_seconds int,
  log_id           uuid references public.logs(log_id) on delete set null,
  detail           jsonb,
  created_at       timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'device_events_type_check') then
    alter table public.device_events
      add constraint device_events_type_check
      check (event_type in ('lid_open', 'lid_close', 'boot', 'heartbeat', 'error'));
  end if;
end $$;

create index if not exists idx_device_events_box_time
  on public.device_events (box_id, occurred_at desc);


-- ---------------------------------------------------------------------------
-- 6) ตรวจผลลัพธ์
-- ---------------------------------------------------------------------------
select table_name, count(*) as จำนวนคอลัมน์
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('boxes', 'logs', 'log_images', 'device_events')
 group by table_name
 order by table_name;
