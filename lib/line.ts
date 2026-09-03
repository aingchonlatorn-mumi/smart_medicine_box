// lib/line.ts
// - ฝั่ง client: ยืนยัน session ผ่าน LIFF
// - ฝั่ง server: push ข้อความ/Flex ผ่าน LINE Messaging API

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

/* ------------------------------------------------------------------ */
/* Client (LIFF)                                                       */
/* ------------------------------------------------------------------ */

export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

/** อ่านโปรไฟล์ LINE ถ้าเปิดผ่าน LIFF อยู่ (คืน null ถ้าเปิดในเบราว์เซอร์ธรรมดา) */
export async function getLiffProfile(): Promise<LiffProfile | null> {
  if (typeof window === 'undefined') return null;
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) return null;

  try {
    const liff = (await import('@line/liff')).default;
    if (!liff.id) await liff.init({ liffId });
    if (!liff.isLoggedIn()) return null;
    const profile = await liff.getProfile();
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
    };
  } catch (err) {
    console.warn('LIFF profile bypass:', err);
    return null;
  }
}

/**
 * เตรียม session LIFF
 * - บน localhost จะข้าม redirect login เพื่อไม่ให้เจอ 400 Bad Request ตอน dev
 */
export async function ensureLineSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) return false;

  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  try {
    const liff = (await import('@line/liff')).default;
    if (!liff.id) await liff.init({ liffId });

    if (!liff.isLoggedIn()) {
      if (isLocalhost) return true;
      liff.login({ redirectUri: window.location.href });
      return false;
    }

    const profile = await liff.getProfile();
    if (profile?.userId) localStorage.setItem('line_user_id', profile.userId);
    return true;
  } catch (err) {
    console.warn('LIFF session bypass:', err);
    return isLocalhost;
  }
}

/* ------------------------------------------------------------------ */
/* Server (Messaging API)                                              */
/* ------------------------------------------------------------------ */

export interface LinePushResult {
  ok: boolean;
  skipped?: string;
  error?: string;
}

async function push(to: string, messages: unknown[]): Promise<LinePushResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return { ok: false, skipped: 'ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN' };
  // บัญชี mockup ที่ seed ไว้ ยังไม่ใช่ LINE userId จริง → ข้ามไปเงียบ ๆ ไม่ให้ cron ล้ม
  if (!to || !to.startsWith('U')) return { ok: false, skipped: `line_user_id ไม่ถูกต้อง (${to})` };

  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `LINE ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** ส่งข้อความธรรมดา */
export async function sendLinePushMessage(lineUserId: string, text: string): Promise<LinePushResult> {
  return push(lineUserId, [{ type: 'text', text }]);
}

/** ส่ง Flex Message (altText คือข้อความที่โชว์ใน notification) */
export async function sendLineFlex(
  lineUserId: string,
  altText: string,
  contents: unknown,
): Promise<LinePushResult> {
  return push(lineUserId, [{ type: 'flex', altText, contents }]);
}

/** ตอบกลับ webhook ด้วย replyToken */
export async function replyLineMessage(replyToken: string, messages: unknown[]): Promise<LinePushResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return { ok: false, skipped: 'ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN' };

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages }),
    });
    if (!res.ok) return { ok: false, error: `LINE ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
