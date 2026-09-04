// lib/token.ts — โทเค็นสำหรับลิงก์ที่เปิดนอกแอป (เช่น รายงาน PDF ที่กดจาก LINE)
// เซ็นด้วย HMAC-SHA256 ทำให้ปลอมไม่ได้ และมีวันหมดอายุในตัว
import crypto from 'node:crypto';

const TTL_DAYS = 7;

function secret(): string {
  const value =
    process.env.REPORT_TOKEN_SECRET ||
    process.env.LINE_CHANNEL_SECRET ||
    process.env.CRON_SECRET ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!value) throw new Error('ไม่พบ secret สำหรับเซ็นโทเค็น (ตั้ง REPORT_TOKEN_SECRET)');
  return value;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/** สร้างโทเค็นผูกกับผู้ใช้คนหนึ่ง อายุ 7 วัน */
export function signReportToken(userId: string): string {
  const payload = b64url(Buffer.from(`${userId}.${Date.now() + TTL_DAYS * 86_400_000}`));
  const sig = b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

/** ตรวจโทเค็น คืน user_id ถ้าใช้ได้ คืน null ถ้าปลอมหรือหมดอายุ */
export function verifyReportToken(token: string | null): string | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expected = b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }

  const [userId, expiresAt] = Buffer.from(payload, 'base64url').toString().split('.');
  if (!userId || !expiresAt || Number(expiresAt) < Date.now()) return null;
  return userId;
}
