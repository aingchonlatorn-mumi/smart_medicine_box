-- ===========================================================================
-- นับเม็ดยาด้วยกล้อง — เก็บผลการประมวลผลภาพไว้ในตารางที่มีอยู่แล้ว
--
-- หลักคิดที่ใช้ตัดสินใจว่าคอลัมน์ไหนควรอยู่ตารางไหน
--   1. หนึ่งมื้อยา = หนึ่งแถวใน logs และการสแกนเกิดครั้งเดียวต่อมื้อ
--      ความสัมพันธ์เป็น 1:1 จึงเป็นคอลัมน์ในตารางเดิมได้ ไม่ต้องแยกตาราง
--   2. เก็บ "สิ่งที่วัดได้" (ก่อน/หลัง) ไม่เก็บ "สิ่งที่ตีความ" (หายไปกี่เม็ด)
--      เหมือนที่ "ทานเลท" ไม่ได้เก็บเป็นสถานะ แต่คำนวณจากเวลาจริงเทียบตาราง
--   3. การสแกนครั้งแรกตอนใส่ยายังไม่มีมื้อ จึงลง logs ไม่ได้
--      (scheduled_time เป็น NOT NULL และแถวปลอมจะทำให้สถิติ adherence เพี้ยน)
--      ผลของมันคือ "ชื่อยาและจำนวนเม็ด" ซึ่งเป็นข้อมูลของ medicines อยู่แล้ว
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) logs — หลักฐานการนับของแต่ละมื้อ
-- ---------------------------------------------------------------------------
-- pills_before  จำนวนที่นับได้ครั้งก่อนหน้า (ยอดตั้งต้นของมื้อนี้)
-- pills_after   จำนวนที่นับได้หลังปิดฝาในมื้อนี้
-- detection     ผลดิบจากโมเดล เช่น จำนวนแยกรายชนิด ค่าที่นับได้แต่ละเฟรม เวอร์ชันโมเดล
--
-- "หยิบไปกี่เม็ด" = pills_before - pills_after จึงไม่เก็บซ้ำ
-- กรณีเปิดกล่องแต่ไม่ได้หยิบยา ทั้งสองค่าจะเท่ากันและ status ยังเป็น pending
-- ซึ่งอธิบายตัวเองได้ในแถวเดียวว่าทำไมระบบไม่บันทึกว่าทานยา

alter table public.logs
  add column if not exists pills_before int,
  add column if not exists pills_after  int,
  add column if not exists detection    jsonb;

comment on column public.logs.pills_before is 'จำนวนเม็ดยาที่นับได้ก่อนมื้อนี้ (ยอดจากการนับครั้งก่อน)';
comment on column public.logs.pills_after  is 'จำนวนเม็ดยาที่นับได้หลังปิดฝาในมื้อนี้';
comment on column public.logs.detection    is 'ผลดิบจากโมเดลตรวจจับ: per_class, frames, model_version';

-- จำนวนเม็ดยาติดลบไม่มีความหมาย
alter table public.logs
  drop constraint if exists logs_pills_nonneg;
alter table public.logs
  add constraint logs_pills_nonneg check (
    (pills_before is null or pills_before >= 0) and
    (pills_after  is null or pills_after  >= 0)
  );


-- ---------------------------------------------------------------------------
-- 2) medicines — ผลการสแกนครั้งแรกและที่มาของจำนวนเม็ด
-- ---------------------------------------------------------------------------
-- count_source     ยอดคงเหลือปัจจุบันมาจากไหน — ผู้ใช้กรอกเอง หรือกล้องนับ
-- last_counted_at  กล้องนับครั้งล่าสุดเมื่อไร (ใช้บอกผู้ใช้ว่าตัวเลขสดแค่ไหน)
-- confirmed        false = กล้องสร้างรายการนี้ไว้ รอผู้ใช้ตรวจสอบก่อนใช้งานจริง
-- detection        ผลดิบของการสแกนครั้งแรก เก็บไว้ตรวจย้อนหลังได้

alter table public.medicines
  add column if not exists count_source    text        not null default 'manual',
  add column if not exists last_counted_at timestamptz,
  add column if not exists confirmed       boolean     not null default true,
  add column if not exists detection       jsonb;

alter table public.medicines
  drop constraint if exists medicines_count_source_valid;
alter table public.medicines
  add constraint medicines_count_source_valid
    check (count_source in ('manual', 'camera'));

comment on column public.medicines.count_source    is 'ที่มาของ total_pills: manual = ผู้ใช้กรอก, camera = กล้องนับ';
comment on column public.medicines.last_counted_at is 'เวลาที่กล้องนับจำนวนเม็ดยาครั้งล่าสุด';
comment on column public.medicines.confirmed       is 'false = รายการที่กล้องสร้างไว้ รอผู้ใช้ยืนยัน';
comment on column public.medicines.detection       is 'ผลดิบจากการสแกนครั้งแรกตอนลงทะเบียนยา';

-- ผู้ใช้หนึ่งคนมียาที่รอการยืนยันได้ครั้งละหนึ่งรายการเท่านั้น
-- กันกรณีเปิดกล่องหลายรอบตอนตั้งค่าแล้วได้รายการค้างซ้อนกันหลายอัน
create unique index if not exists idx_medicines_pending_confirm
  on public.medicines (user_id)
  where confirmed = false;
