// lib/session.ts — session ฝั่ง client (prototype: เก็บใน localStorage)
// ตัวตนจริงมาจาก LINE (LIFF) ยังไม่ได้ใช้ Supabase Auth
// route handler อ่านผู้ใช้จาก header x-user-id ที่ส่งไปจาก apiFetch()

export interface StoredSession {
  userId: string;
  name: string;
  boxSerial: string;
  lineUserId?: string;
}

const KEYS = {
  userId: 'user_id',
  name: 'user_name',
  boxSerial: 'box_serial',
  lineUserId: 'line_user_id',
} as const;

export function getSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  const userId = localStorage.getItem(KEYS.userId);
  if (!userId) return null;
  return {
    userId,
    name: localStorage.getItem(KEYS.name) || 'ผู้ใช้งาน',
    boxSerial: localStorage.getItem(KEYS.boxSerial) || '',
    lineUserId: localStorage.getItem(KEYS.lineUserId) || undefined,
  };
}

export function saveSession(session: StoredSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEYS.userId, session.userId);
  localStorage.setItem(KEYS.name, session.name);
  localStorage.setItem(KEYS.boxSerial, session.boxSerial);
  if (session.lineUserId) localStorage.setItem(KEYS.lineUserId, session.lineUserId);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  for (const key of Object.values(KEYS)) localStorage.removeItem(key);
}

/** เรียก /api/* พร้อมแนบตัวตนผู้ใช้ */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { 'x-user-id': session.userId } : {}),
      ...(init.headers || {}),
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `เรียก ${path} ไม่สำเร็จ (${res.status})`);
  return body as T;
}
