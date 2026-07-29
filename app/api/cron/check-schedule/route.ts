import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendLinePushMessage } from '@/lib/line';

export async function GET() {
  try {
    // 1. ดึงเวลาปัจจุบันของไทย (UTC+7)
    const now = new Date();
    const thTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const currentTime = thTime.toISOString().substring(11, 16); // รูปแบบ "18:45"

    // 2. ดึง Schedules ที่ active อยู่
    const { data: matchedSchedules, error: fetchError } = await supabase
      .from('schedules')
      .select('*, users!inner(*), medicines!inner(*)')
      .eq('active', true);

    if (fetchError || !matchedSchedules) {
      return NextResponse.json({ error: fetchError?.message || 'No schedules' }, { status: 500 });
    }

    const results = [];

    for (const sch of matchedSchedules) {
      // ตัดวินาทีออกจาก time ใน DB เช่น "18:45:00" -> "18:45"
      const schTime = sch.time.substring(0, 5);

      // 3. เทียบเวลา: ส่งเฉพาะรายการที่เวลาตรงกับปัจจุบันเท่านั้น
      if (schTime === currentTime) {
        const userObj = Array.isArray(sch.users) ? sch.users[0] : sch.users;
        const medObj = Array.isArray(sch.medicines) ? sch.medicines[0] : sch.medicines;

        const targetLineId = userObj?.line_user_id;
        const medName = medObj?.name || 'ยาประจำตัว';

        if (!targetLineId) continue;

        // บันทึก Log
        await supabase.from('logs').insert([
          {
            user_id: sch.user_id,
            schedule_id: sch.id,
            medicine_id: sch.medicine_id,
            scheduled_time: new Date().toISOString(),
            status: 'pending',
          },
        ]);

        // ส่ง LINE เตือน
        const msg = `⏰ ถึงเวลากินยา [${medName}] จำนวน ${sch.dose_amount} เม็ดแล้วครับ!`;
        await sendLinePushMessage(targetLineId, msg);

        results.push({ schedule_id: sch.id, status: 'sent', time: currentTime });
      }
    }

    return NextResponse.json({ success: true, currentTimeTH: currentTime, triggered: results });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}