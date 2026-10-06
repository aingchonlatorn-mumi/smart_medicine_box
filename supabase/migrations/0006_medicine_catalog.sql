-- 0006_medicine_catalog.sql
-- จำกัดให้ระบบรู้จักเฉพาะยาที่โมเดลจำแนกได้
--
-- เหตุผล: ระบบยืนยันการทานยาด้วยการนับเม็ดยาจากภาพ ถ้าผู้ใช้ลงทะเบียนยา
-- ที่โมเดลไม่เคยเห็น ระบบจะนับไม่ได้ทุกครั้งที่เปิดกล่อง และตกไปใช้เกณฑ์เดิม
-- คือ "เปิดฝาตรงเวลา = ทานแล้ว" ซึ่งเป็นสิ่งที่งานนี้ตั้งใจแก้ตั้งแต่ต้น
-- จึงบังคับตั้งแต่ชั้นฐานข้อมูลว่ายาในระบบต้องเป็นหนึ่งใน 6 ชนิดนี้เท่านั้น
--
-- ตารางนี้ต้องมีเนื้อหาตรงกับ MEDICINE_TYPES ใน lib/medicines.ts เสมอ

create table if not exists public.medicine_catalog (
  code        text primary key,
  model_class text not null unique,   -- ชื่อคลาสที่โมเดลคืนมา ตรงกับ data.yaml
  name_th     text not null,
  name_en     text not null,
  description text,
  sort_order  int  not null default 0
);

insert into public.medicine_catalog (code, model_class, name_th, name_en, description, sort_order)
values
  ('amoxicillin',      'Amoxicillin',             'อะม็อกซิซิลลิน', 'Amoxicillin',             'ยาปฏิชีวนะกลุ่มเพนิซิลลิน ชนิดแคปซูล', 1),
  ('andrographis',     'Andrographis Paniculata', 'ฟ้าทะลายโจร',    'Andrographis Paniculata', 'ยาสมุนไพร ชนิดแคปซูล',                  2),
  ('curcuma',          'Curcuma longa',           'ขมิ้นชัน',        'Curcuma longa',           'ยาสมุนไพร ชนิดแคปซูล',                  3),
  ('ferrous_fumarate', 'Ferrous Fumarate',        'เฟอร์รัสฟูมาเรต', 'Ferrous Fumarate',        'ยาเสริมธาตุเหล็ก ชนิดเม็ด',             4),
  ('guaifenesin',      'Glyceryl guaiacolate',    'ไกวเฟนิซิน',     'Glyceryl guaiacolate',    'ยาขับเสมหะ ชนิดเม็ด',                   5),
  ('moxipharm',        'Moxipharm',               'ม็อกซิฟาร์ม',     'Moxipharm',               'ยาปฏิชีวนะ ชนิดแคปซูล',                 6)
on conflict (code) do update
  set model_class = excluded.model_class,
      name_th     = excluded.name_th,
      name_en     = excluded.name_en,
      description = excluded.description,
      sort_order  = excluded.sort_order;

alter table public.medicines
  add column if not exists code text references public.medicine_catalog(code);

-- เทียบจากชื่อที่บันทึกไว้เดิม ทั้งชื่อคลาสของโมเดลและชื่อภาษาอังกฤษ
update public.medicines m
   set code = c.code
  from public.medicine_catalog c
 where m.code is null
   and lower(trim(m.name)) in (lower(c.model_class), lower(c.name_en), lower(c.name_th));

-- ข้อมูลตัวอย่างชุดเดิมใช้ยาที่ไม่อยู่ในรายการ (Metformin 500) ซึ่งโมเดลจำแนกไม่ได้
-- ย้ายไปเป็นยาที่รองรับ เพื่อให้บัญชีสาธิตยังเดินครบทั้งสายได้
update public.medicines
   set code = 'amoxicillin'
 where code is null;

update public.medicines m
   set name = c.name_th
  from public.medicine_catalog c
 where m.code = c.code
   and m.name <> c.name_th;

-- ระหว่างสแกนครั้งแรก โมเดลอาจยังระบุชนิดยาไม่ได้ (เช่น เจอยาที่ไม่อยู่ใน 6 ชนิด)
-- แถวที่รอผู้ใช้ยืนยันจึงปล่อยให้ code ว่างได้ แต่ห้ามยืนยันจนกว่าจะเลือกชนิดยา
alter table public.medicines
  drop constraint if exists medicines_confirmed_requires_code;

alter table public.medicines
  add constraint medicines_confirmed_requires_code
  check (confirmed = false or code is not null);

create index if not exists idx_medicines_code on public.medicines (code);
