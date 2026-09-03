-- ===========================================================================
-- ข้อมูล mockup — รันซ้ำได้เรื่อย ๆ เมื่ออยากให้ประวัติ 30 วันมาจบที่ "วันนี้"
-- (ข้อมูลจะค่อย ๆ เก่าลงตามวันที่ผ่านไป รันไฟล์นี้ใหม่แล้วสดเหมือนเดิม)
--
-- ผลลัพธ์: ผู้ใช้ มะลิ ทิ้งใจ · กล่อง B-001 · Metformin 500 เหลือ 8 เม็ด
--          ตารางทุกวัน 3 มื้อ 08:00 / 12:00 / 18:00
--          ประวัติ 30 วัน โดย 7 วันล่าสุดล็อกรูปแบบให้ตรงกับตัวเลขในไฟล์ดีไซน์
-- ===========================================================================

do $$
declare
  v_user_id uuid;
  v_box_id  uuid;
  v_med_id  uuid;
begin
  -- 1) ผู้ใช้ + กล่อง ------------------------------------------------------
  select u.user_id into v_user_id from public.users u order by u.created_at limit 1;
  if v_user_id is null then
    insert into public.users (name, phone, birth_date, line_user_id)
    values ('มะลิ ทิ้งใจ', '0815550192', date '1967-08-15', 'U_MOCK_LINE_USER_ID')
    returning user_id into v_user_id;
  else
    update public.users
       set name = 'มะลิ ทิ้งใจ', phone = '0815550192', birth_date = date '1967-08-15'
     where user_id = v_user_id;
  end if;

  insert into public.boxes (box_serial, status) values
    ('B-001','active'), ('B-002','active'), ('B-003','active'), ('B-999','active')
  on conflict (box_serial) do nothing;

  update public.boxes set owner_user_id = v_user_id, status = 'active'
   where box_serial = 'B-001';
  select box_id into v_box_id from public.boxes where box_serial = 'B-001';

  -- 2) ยา -----------------------------------------------------------------
  select m.medicine_id into v_med_id
    from public.medicines m where m.user_id = v_user_id order by m.created_at limit 1;

  if v_med_id is null then
    insert into public.medicines (user_id, name, total_pills, expire_date)
    values (v_user_id, 'Metformin 500', 8, date '2027-12-12')
    returning medicine_id into v_med_id;
  else
    update public.medicines
       set name = 'Metformin 500', total_pills = 8, expire_date = date '2027-12-12'
     where medicine_id = v_med_id;
  end if;

  -- 3) ตารางทานยา ---------------------------------------------------------
  delete from public.schedules where box_id = v_box_id;
  insert into public.schedules
    (box_id, medicine_id, time, dose_amount, schedule_type, interval_days,
     start_date, active, meal_relation)
  values
    (v_box_id, v_med_id, '08:00', 1, 'daily', 1, current_date - 60, true, 'before'),
    (v_box_id, v_med_id, '12:00', 1, 'daily', 1, current_date - 60, true, 'after'),
    (v_box_id, v_med_id, '18:00', 1, 'daily', 1, current_date - 60, true, 'after');

  -- 4) ประวัติ 30 วันย้อนหลัง ----------------------------------------------
  delete from public.logs where user_id = v_user_id;

  insert into public.logs
    (user_id, box_id, schedule_id, medicine_id, scheduled_time, actual_time, status, image_url)
  with sch as (
    select schedule_id, medicine_id, box_id, "time",
           row_number() over (order by "time")::int as slot
      from public.schedules where box_id = v_box_id
  ),
  grid as (
    select d.d, s.slot, s.schedule_id, s.medicine_id, s.box_id,
           (((current_date - d.d) + s."time") at time zone 'Asia/Bangkok') as sched_ts
      from generate_series(0, 29) as d(d) cross join sch s
  ),
  marked as (
    select g.*,
           case
             when g.sched_ts > now() then 'pending'
             -- 7 วันล่าสุดล็อกรูปแบบไว้ให้ตรงกับตัวเลขในไฟล์ดีไซน์
             when (g.d, g.slot) in ((0,2),(3,3),(5,2)) then 'late'
             when (g.d, g.slot) in ((1,2),(4,3),(6,3)) then 'missed'
             when g.d > 6 and (g.d * 3 + g.slot) % 11 = 0 then 'missed'
             when g.d > 6 and (g.d * 3 + g.slot) % 7  = 0 then 'late'
             else 'ontime'
           end as kind
      from grid g
  )
  select v_user_id, box_id, schedule_id, medicine_id, sched_ts,
         case kind
           when 'pending' then null
           when 'missed'  then null
           when 'late'    then sched_ts + ((34 + ((d * 7 + slot * 13) % 26)) || ' minutes')::interval
           else sched_ts + ((((d * 5 + slot * 3) % 11) - 3) || ' minutes')::interval
         end,
         case kind when 'pending' then 'pending' when 'missed' then 'missed' else 'taken' end,
         case when kind in ('pending','missed') then null else '/medicine1.png' end
    from marked;
end $$;

-- สรุปผล 7 วันล่าสุด
select count(*) filter (where status = 'taken')   as taken,
       count(*) filter (where status = 'missed')  as missed,
       count(*) filter (where status = 'pending') as pending,
       count(*)                                   as total
  from public.logs
 where scheduled_time >= ((current_date - 6)::timestamp at time zone 'Asia/Bangkok');
