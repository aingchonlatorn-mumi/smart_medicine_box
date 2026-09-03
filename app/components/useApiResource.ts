'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session';

/**
 * โหลดข้อมูลจาก /api/* พร้อมสถานะ loading / error และปุ่มโหลดใหม่
 * ตั้ง state ใน callback ของ promise เท่านั้น (ไม่ตั้งตรง ๆ ในตัว effect)
 */
export function useApiResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    apiFetch<T>(path)
      .then((result) => {
        if (!alive) return;
        setData(result);
        setError('');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, reload, setError };
}
