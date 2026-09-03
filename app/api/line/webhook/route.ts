import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { flexScheduleSummary, flexTerms, flexWelcome } from '@/lib/flex';
import { replyLineMessage } from '@/lib/line';
import { loadContext } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** ตรวจลายเซ็นของ LINE (ข้ามได้ตอน dev ถ้ายังไม่ได้ตั้ง LINE_CHANNEL_SECRET) */
function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * รับ event จาก LINE
 * - follow: ผูก LINE userId เข้ากับบัญชีที่ลงทะเบียนไว้ (ถ้ายังเป็น PENDING_*)
 * - message: คำสั่งลัด "ตารางยา" / "เงื่อนไข"
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-line-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(raw || '{}');
  const db = supabaseAdmin();

  for (const event of payload.events || []) {
    const lineUserId: string | undefined = event.source?.userId;
    if (!lineUserId) continue;

    const { data: user } = await db
      .from('users').select('*').eq('line_user_id', lineUserId).maybeSingle();

    if (event.type === 'follow') {
      if (user) {
        const { data: box } = await db
          .from('boxes').select('box_serial').eq('owner_user_id', user.user_id).maybeSingle();
        await replyLineMessage(event.replyToken, [
          {
            type: 'flex',
            altText: 'ยินดีต้อนรับสู่ Smart PillBox',
            contents: flexWelcome({ name: user.name, boxSerial: box?.box_serial || '-' }),
          },
        ]);
      } else {
        await replyLineMessage(event.replyToken, [
          { type: 'flex', altText: 'เงื่อนไขการใช้งาน', contents: flexTerms() },
        ]);
      }
      continue;
    }

    if (event.type === 'message' && event.message?.type === 'text' && user) {
      const text: string = event.message.text.trim();
      const context = await loadContext(user.user_id);

      if (text.includes('ตาราง') && context?.medicine) {
        await replyLineMessage(event.replyToken, [
          {
            type: 'flex',
            altText: 'ตารางทานยาของคุณ',
            contents: flexScheduleSummary({
              medicine: context.medicine,
              schedules: context.schedules,
            }),
          },
        ]);
        continue;
      }

      if (text.includes('เงื่อนไข')) {
        await replyLineMessage(event.replyToken, [
          { type: 'flex', altText: 'เงื่อนไขการใช้งาน', contents: flexTerms() },
        ]);
      }
    }
  }

  // LINE ต้องได้ 200 เสมอ ไม่งั้นจะ retry ซ้ำ
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'LINE webhook endpoint' });
}
