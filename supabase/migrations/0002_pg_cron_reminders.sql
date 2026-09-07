-- ===========================================================================
-- ตั้งให้ Supabase เป็นตัวจับเวลายิงแจ้งเตือนเอง (ไม่ต้องพึ่ง Vercel Cron
-- ซึ่งแพลน Hobby ตั้งได้แค่วันละครั้ง)
--
-- extension เปิดไว้ให้แล้ว: pg_cron 1.6.4, pg_net 0.20.4
--
-- ก่อนรัน: แทนที่ __CRON_SECRET__ ด้วยค่าเดียวกับ CRON_SECRET ใน .env.local
--          และตั้งค่าเดียวกันนี้ใน Vercel → Settings → Environment Variables
--
-- หมายเหตุ: pg_cron ทำงานตามเวลา UTC ของฐานข้อมูล
--           อาทิตย์ 20:00 น. ไทย = 13:00 UTC
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ล้างงานเดิมก่อน ให้รันไฟล์นี้ซ้ำได้
select cron.unschedule(jobname) from cron.job
 where jobname in ('pillbox-check-schedule', 'pillbox-check-missed', 'pillbox-weekly-report');

-- ถึงเวลามื้อยา → สร้าง log + ส่ง Flex แจ้งเตือน (ทุก 1 นาที)
select cron.schedule('pillbox-check-schedule', '* * * * *', $job$
  select net.http_get(
    url := 'https://smart-pillbox-rosy.vercel.app/api/cron/check-schedule',
    headers := jsonb_build_object('Authorization', 'Bearer __CRON_SECRET__'),
    timeout_milliseconds := 20000);
$job$);

-- เลย 30 นาทีแล้วยังไม่เปิดฝา → ตั้งเป็น missed + เตือนซ้ำ (ทุก 5 นาที)
select cron.schedule('pillbox-check-missed', '*/5 * * * *', $job$
  select net.http_get(
    url := 'https://smart-pillbox-rosy.vercel.app/api/cron/check-missed',
    headers := jsonb_build_object('Authorization', 'Bearer __CRON_SECRET__'),
    timeout_milliseconds := 20000);
$job$);

-- สรุปรายสัปดาห์ อาทิตย์ 20:00 น. ไทย
select cron.schedule('pillbox-weekly-report', '0 13 * * 0', $job$
  select net.http_get(
    url := 'https://smart-pillbox-rosy.vercel.app/api/cron/weekly-report',
    headers := jsonb_build_object('Authorization', 'Bearer __CRON_SECRET__'),
    timeout_milliseconds := 30000);
$job$);


-- ===========================================================================
-- คำสั่งที่ใช้บ่อยหลังติดตั้ง
-- ===========================================================================
-- ดูงานที่ตั้งไว้
--   select jobid, jobname, schedule, active from cron.job order by jobname;
--
-- ดูผลการรัน 20 ครั้งล่าสุด (ควรเป็น succeeded ทั้งหมด)
--   select j.jobname, d.status, d.start_time at time zone 'Asia/Bangkok' as เวลาไทย,
--          d.return_message
--     from cron.job_run_details d join cron.job j using (jobid)
--    order by d.start_time desc limit 20;
--
-- ดูผลตอบกลับจากเซิร์ฟเวอร์ (pg_net เก็บแยก)
--   select id, status_code, left(content, 300) as ผลลัพธ์, created
--     from net._http_response order by created desc limit 10;
--
-- หยุดชั่วคราว / เปิดใหม่
--   update cron.job set active = false where jobname like 'pillbox-%';
--   update cron.job set active = true  where jobname like 'pillbox-%';
--
-- ลบทิ้ง
--   select cron.unschedule(jobname) from cron.job where jobname like 'pillbox-%';
