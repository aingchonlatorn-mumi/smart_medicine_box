// lib/line.ts

/**
 * Client-side: ยืนยัน Session LIFF
 * - ทำการ Init LIFF
 * - ตรวจสอบการ Login (หากรันบน localhost จะ Bypass เพื่อป้องกัน 400 Bad Request)
 * - ดึง idToken ส่งไปให้ /api/auth/line เพื่อสร้าง Session/Cookie
 */
export async function ensureLineSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) {
    console.error("Missing NEXT_PUBLIC_LIFF_ID");
    return false;
  }

  try {
    const liff = (await import("@line/liff")).default;
    await liff.init({ liffId });

    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    // กรณีที่ยังไม่ได้ Login ผ่าน LINE
    if (!liff.isLoggedIn()) {
      if (isLocalhost) {
        console.warn("Running on Localhost: Bypassing LIFF redirect login to prevent 400 Bad Request.");
        return true;
      }
      
      liff.login({ redirectUri: window.location.href });
      return false;
    }

    // ดึง ID Token จาก LIFF
    const idToken = liff.getIDToken();
    if (!idToken) {
      if (isLocalhost) return true;
      return false;
    }

    // ส่ง idToken ไปสร้าง/ยืนยัน Session ที่ Backend API
    const res = await fetch("/api/auth/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      credentials: "include",
    });

    return res.ok;
  } catch (err) {
    console.error("LIFF Session Error:", err);
    return false;
  }
}

/**
 * Server-side: ยิง Push Notification หาผู้ใช้ผ่าน Line Messaging API
 */
export async function sendLinePushMessage(lineUserId: string, messageText: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text: messageText }],
    }),
  });

  if (!res.ok) {
    const errorData = await res.json();
    console.error("LINE Push Error Detail:", errorData);
  }
  return res;
}