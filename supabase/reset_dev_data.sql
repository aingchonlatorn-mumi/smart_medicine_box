-- reset_dev_data.sql — ล้างข้อมูลทดสอบทั้งหมดแล้วตั้งต้นใหม่
--
-- ไฟล์นี้ตั้งใจไม่ให้อยู่ในโฟลเดอร์ migrations เพราะเป็นคำสั่งลบข้อมูล
-- ถ้าอยู่ในนั้นจะถูกรันซ้ำทุกครั้งที่ deploy แล้วข้อมูลจริงจะหายไปด้วย
--
-- สิ่งที่ไม่ถูกลบ
--   medicine_catalog  รายการยา 6 ชนิดที่ระบบรองรับ
--   ไฟล์ภาพในบักเก็ต  ลบเฉพาะแถวอ้างอิงในฐานข้อมูล ไฟล์ยังอยู่
--
-- หลังรันไฟล์นี้ กล่องทุกใบจะกลับเป็นสถานะยังไม่ผูกกับผู้ใช้และยังไม่มีคีย์
-- บอร์ดที่เคยผูกไว้จะถูกปฏิเสธในครั้งถัดไป แล้วล้าง NVS ขอคีย์ใหม่เองอัตโนมัติ

begin;

delete from public.log_images;
delete from public.device_events;
delete from public.logs;
delete from public.schedules;
delete from public.medicines;
delete from public.boxes;
delete from public.users;

-- ตั้งกล่องใหม่ให้พร้อมลงทะเบียน ยังไม่ผูกกับผู้ใช้คนใด
insert into public.boxes (box_serial, status) values
  ('B-001', 'active'),   -- กล่องต้นแบบที่ใช้งานจริง
  ('B-002', 'active'),   -- สำรองสำหรับการทดลอง
  ('B-003', 'active');

commit;
