import { NextResponse } from 'next/server';
import { jsonError, loadContext, loadSlots, userIdFrom } from '@/lib/api';
import { addDays, bangkokToday } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** ประวัติการทานยาย้อนหลัง — ?days=14&filter=all|taken|missed */
export async function GET(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  try {
    const params = new URL(req.url).searchParams;
    const days = Math.min(90, Math.max(1, Number(params.get('days') || 14)));
    const filter = params.get('filter') || 'all';

    const context = await loadContext(userId);
    if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้', 404);

    const today = bangkokToday();
    let slots = await loadSlots(context, addDays(today, -(days - 1)), today);

    if (filter === 'taken') slots = slots.filter((s) => s.state === 'taken' || s.state === 'late');
    if (filter === 'missed') slots = slots.filter((s) => s.state === 'missed');

    return NextResponse.json({ slots, medicine: context.medicine });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'โหลดประวัติไม่สำเร็จ', 500);
  }
}
