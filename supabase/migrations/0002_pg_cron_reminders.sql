-- ===========================================================================
-- ตัวเลือก: ให้ Supabase เป็นตัวตั้งเวลายิงแจ้งเตือนเอง (ไม่ต้องพึ่ง Vercel Cron)
-- เหมาะกับ Vercel แพลน Hobby ที่ตั้ง cron ได้แค่วันละครั้ง
--
-- ก่อนรัน: ตั้ง CRON_SECRET ใน Vercel → Settings → Environment Variables
--          แล้วแก้ค่า 2 บรรทัดด้านล่างให้ตรงกับของจริง
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- แก้ 2 ค่านี้ก่อนรัน --------------------------------------------------------
-- app_url     = โดเมนที่ deploy ไว้
-- cron_secret = ค่าเดียวกับ CRON_SECRET ใน Vercel
-- ---------------------------------------------------------------------------

-- ถึงเวลามื้อยา → สร้าง log + ส่ง LINE (ทุก 1 นาที)
select cron.schedule(
  'pillbox-check-schedule',
  '* * * * *',
  $$
  select net.http_get(
    url     := 'https://smart-pillbox-rosy.vercel.app/api/cron/check-schedule',
    headers := jsonb_build_object('Authorization', 'Bearer ' || 'ใส่ CRON_SECRET ตรงนี้')
  );
  $$
);

-- เลยเวลา 30 นาทีแล้วยังไม่เปิดฝา → ตั้งเป็น missed + เตือนซ้ำ (ทุก 5 นาที)
select cron.schedule(
  'pillbox-check-missed',
  '*/5 * * * *',
  $$
  select net.http_get(
    url     := 'https://smart-pillbox-rosy.vercel.app/api/cron/check-missed',
    headers := jsonb_build_object('Authorization', 'Bearer ' || 'ใส่ CRON_SECRET ตรงนี้')
  );
  $$
);

-- สรุปรายสัปดาห์ ทุกวันอาทิตย์ 20:00 น. ไทย (= 13:00 UTC)
select cron.schedule(
  'pillbox-weekly-report',
  '0 13 * * 0',
  $$
  select net.http_get(
    url     := 'https://smart-pillbox-rosy.vercel.app/api/cron/weekly-report',
    headers := jsonb_build_object('Authorization', 'Bearer ' || 'ใส่ CRON_SECRET ตรงนี้')
  );
  $$
);

-- ดูงานที่ตั้งไว้ / ยกเลิก
-- select * from cron.job;
-- select cron.unschedule('pillbox-check-schedule');
