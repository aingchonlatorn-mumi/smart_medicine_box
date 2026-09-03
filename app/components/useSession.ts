'use client';

import { useSyncExternalStore } from 'react';
import { getSession, type StoredSession } from '@/lib/session';

// localStorage เป็น external store — อ่านผ่าน useSyncExternalStore จะไม่ชนกับ SSR
// และไม่ต้อง setState ใน effect
let cachedKey = '';
let cachedValue: StoredSession | null = null;

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function getSnapshot(): StoredSession | null {
  const key = ['user_id', 'user_name', 'box_serial']
    .map((k) => localStorage.getItem(k) ?? '')
    .join('|');
  if (key !== cachedKey) {
    cachedKey = key;
    cachedValue = getSession();
  }
  return cachedValue;
}

/** session ปัจจุบัน — คืน null ตอน render ฝั่ง server และตอนยังไม่ล็อกอิน */
export function useSession(): StoredSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
