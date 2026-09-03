-- ===========================================================================
-- ⚠️ ต้องรันไฟล์นี้ 1 ครั้ง ไม่งั้นหน้า Logs / Reports จะว่างเปล่า
--    Supabase → SQL Editor → วางทั้งไฟล์ → Run
-- ---------------------------------------------------------------------------
-- ปัญหา: ตาราง logs เปิด RLS ไว้แต่ไม่มี policy สักอัน
--        → anon key (ที่หน้าเว็บใช้) อ่านไม่ได้เลยแม้แต่แถวเดียว
--        ทั้งที่ในฐานข้อมูลมีข้อมูล mockup 90 แถว
--
-- วิธีที่เลือกไว้: ปิด RLS ตาราง logs ให้เหมือน medicines / schedules
--                (โหมดทดลองเท่านั้น — ดูหัวข้อ "ก่อนใช้กับข้อมูลจริง" ด้านล่าง)
-- ===========================================================================

alter table public.logs disable row level security;

-- ตรวจผลลัพธ์
select relname as table_name, relrowsecurity as rls_enabled
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('users', 'boxes', 'medicines', 'schedules', 'logs')
 order by relname;


-- ===========================================================================
-- ก่อนใช้กับข้อมูลจริง — เลือกทางใดทางหนึ่ง
-- ===========================================================================
-- ตอนนี้ medicines / schedules / logs ปิด RLS อยู่ = ใครก็ตามที่มี anon key
-- (ซึ่งฝังอยู่ในหน้าเว็บ เปิด DevTools ก็เห็น) อ่านและแก้ข้อมูลผู้ป่วยได้ทุกคน
--
-- ทางที่ 1 (ง่ายสุด) — ใช้ service role key
--   1. Supabase → Project Settings → API → คัดลอก service_role key
--   2. ใส่ใน .env.local และ Vercel เป็น SUPABASE_SERVICE_ROLE_KEY
--   3. รัน SQL ด้านล่าง (route handler ฝั่ง server ข้าม RLS ได้อยู่แล้ว
--      ส่วน anon key ในเบราว์เซอร์จะอ่านอะไรไม่ได้เลย)
--
-- alter table public.users     enable row level security;
-- alter table public.boxes     enable row level security;
-- alter table public.medicines enable row level security;
-- alter table public.schedules enable row level security;
-- alter table public.logs      enable row level security;
-- drop policy if exists "Allow public read access on boxes" on public.boxes;
-- drop policy if exists "Allow public select on boxes"      on public.boxes;
-- drop policy if exists "Allow public update to boxes"      on public.boxes;
-- drop policy if exists "Allow public insert to users"      on public.users;
-- drop policy if exists "Allow public select to users"      on public.users;
--
-- ทางที่ 2 (ระยะยาว) — ย้ายไป Supabase Auth แล้วผูก policy กับ auth.uid()
--
-- create policy own_logs  on public.logs  for all using (user_id = auth.uid());
-- create policy own_boxes on public.boxes for all using (owner_user_id = auth.uid());
-- create policy own_schedules on public.schedules for all using (
--   exists (select 1 from public.boxes b
--            where b.box_id = schedules.box_id and b.owner_user_id = auth.uid()));
