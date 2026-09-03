import { NextResponse } from 'next/server';
import { hasServiceRole, supabaseAdmin } from '@/lib/supabase-server';
import { bangkokParts } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** ตรวจสุขภาพระบบ — ใช้ดูว่า env / RLS / ข้อมูล พร้อมหรือยัง */
export async function GET() {
  const clock = bangkokParts();
  const checks: Record<string, unknown> = {
    bangkok_now: `${clock.date} ${clock.time}`,
    service_role_key: hasServiceRole,
    line_token: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    app_url: process.env.NEXT_PUBLIC_APP_URL || null,
    cron_secret: Boolean(process.env.CRON_SECRET),
  };

  try {
    const db = supabaseAdmin();
    for (const table of ['users', 'boxes', 'medicines', 'schedules', 'logs']) {
      const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
      checks[table] = error ? `error: ${error.message}` : count;
    }
  } catch (err) {
    checks.database = err instanceof Error ? err.message : 'เชื่อมต่อฐานข้อมูลไม่ได้';
  }

  return NextResponse.json(checks);
}
