import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendLinePushMessage } from '@/lib/line';

export async function GET() {
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // ค้นหา log สถานะ pending ที่เลยเวลาเกิน 15 นาที
  const { data: missedLogs } = await supabase
    .from('logs')
    .select('*, users(*), medicines(*)')
    .eq('status', 'pending')
    .lt('scheduled_time', fifteenMinsAgo);

  if (!missedLogs) return NextResponse.json({ count: 0 });

  for (const log of missedLogs) {
    // 1. เปลี่ยนสถานะเป็น missed
    await supabase.from('logs').update({ status: 'missed' }).eq('id', log.id);

    // 2. ส่งแจ้งเตือนซ้ำให้ผู้ป่วย
    await sendLinePushMessage(
      log.users.line_user_id,
      `⚠️ คุณเลยเวลาทานยา [${log.medicines?.name || 'ตามรอบ'}] เกิน 15 นาทีแล้ว ระบบบันทึกข้ามการทานยาครั้งนี้`
    );

    // 3. แจ้งเตือนไปยัง LINE ผู้ดูแล (Caregiver) หากมี
    if (log.users.caregiver_line_id) {
      await sendLinePushMessage(
        log.users.caregiver_line_id,
        `🚨 แจ้งเตือนผู้ดูแล: คุณ ${log.users.name} ยังไม่ได้ทานยา [${log.medicines?.name}] ตามเวลาที่กำหนด`
      );
    }
  }

  return NextResponse.json({ processed: missedLogs.length });
}
