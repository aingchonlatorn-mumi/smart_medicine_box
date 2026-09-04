import { loadContext, loadSlots } from '@/lib/api';
import { summarize, type DoseSlot } from '@/lib/schedule';
import { addDays, bangkokToday, thaiDate, thaiDayMonth, timeOf, DOW_TH } from '@/lib/time';
import { verifyReportToken } from '@/lib/token';

export const dynamic = 'force-dynamic';

/** ต้องมีข้อมูลอย่างน้อยกี่วันถึงจะสรุปสถิติได้ */
const MIN_DAYS = 3;

const ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPE[c]);

function page(title: string, body: string, autoPrint = false): Response {
  return new Response(
    `<!doctype html>
<html lang="th"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --brand:#4f46e5;
          --ok:#047857; --late:#b45309; --miss:#be123c; }
  * { box-sizing:border-box; }
  body { margin:0; background:#f1f5f9; color:var(--ink);
         font-family:'Sarabun',system-ui,sans-serif; font-size:15px; line-height:1.7; }
  .sheet { max-width:820px; margin:0 auto; background:#fff; padding:34px 38px 46px;
           min-height:100vh; }
  h1 { font-size:24px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:14px; margin:0; }
  .who { display:flex; flex-wrap:wrap; gap:6px 26px; margin:18px 0 22px;
         padding:14px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line);
         font-size:14px; }
  .who b { font-weight:600; }
  .who span { color:var(--muted); }
  .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
  .kpi { border:1px solid var(--line); border-radius:8px; padding:12px 14px; }
  .kpi .v { font-size:26px; font-weight:700; font-variant-numeric:tabular-nums; line-height:1.2; }
  .kpi .l { font-size:13px; color:var(--muted); }
  h2 { font-size:16px; margin:26px 0 10px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th { text-align:left; font-weight:600; color:var(--muted); font-size:13px;
       border-bottom:1px solid var(--line); padding:7px 8px 7px 0; }
  td { padding:8px 8px 8px 0; border-bottom:1px solid var(--line);
       font-variant-numeric:tabular-nums; }
  td.state { font-weight:600; }
  .ok{color:var(--ok)} .late{color:var(--late)} .miss{color:var(--miss)} .pend{color:var(--muted)}
  .bars { display:flex; gap:4px; }
  .bars i { flex:1; height:10px; border-radius:99px; display:block; }
  .note { margin-top:28px; padding-top:14px; border-top:1px solid var(--line);
          font-size:12.5px; color:var(--muted); }
  .btn { position:sticky; bottom:16px; display:block; width:100%; margin-top:26px;
         padding:15px; border:0; border-radius:10px; background:var(--brand); color:#fff;
         font:600 17px 'Sarabun',sans-serif; cursor:pointer; }
  .warn { border-left:4px solid var(--late); background:#fffbeb; padding:16px 18px;
          border-radius:0 8px 8px 0; }
  @media print {
    body { background:#fff; }
    .sheet { max-width:none; padding:0; min-height:auto; }
    .btn { display:none; }
    tr, .kpi { page-break-inside:avoid; }
  }
</style></head>
<body><div class="sheet">${body}</div>
${autoPrint ? '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),600));</script>' : ''}
</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

/**
 * รายงานสำหรับพิมพ์ไปพบแพทย์ — เปิดจากปุ่มใน LINE ได้เลย
 *   /api/reports/pdf?days=30&token=...
 * ใช้โทเค็นแทน session เพราะเปิดในเบราว์เซอร์นอกแอป
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const userId = verifyReportToken(params.get('token'));

  if (!userId) {
    return page('ลิงก์ไม่ถูกต้อง', `
      <h1>ลิงก์หมดอายุแล้ว</h1>
      <p class="sub">ลิงก์รายงานมีอายุ 7 วัน กรุณากดปุ่ม "รายงาน" ในเมนู LINE อีกครั้งเพื่อรับลิงก์ใหม่</p>`);
  }

  const days = Number(params.get('days')) === 30 ? 30 : 7;
  const context = await loadContext(userId);
  if (!context) return page('ไม่พบข้อมูล', '<h1>ไม่พบข้อมูลผู้ใช้</h1>');

  const today = bangkokToday();
  const slots = await loadSlots(context, addDays(today, -(days - 1)), today);

  // ต้องมีข้อมูลจริงอย่างน้อย 3 วันถึงจะสรุปสถิติได้
  const daysWithData = new Set(
    slots.filter((s) => s.state !== 'pending').map((s) => s.date),
  ).size;

  if (daysWithData < MIN_DAYS) {
    return page('ข้อมูลยังไม่พอ', `
      <h1>ยังสรุปรายงานไม่ได้</h1>
      <p class="sub">ช่วง ${days} วันล่าสุด</p>
      <div class="who"><b>${esc(context.user.name)}</b>
        <span>กล่อง ${esc(context.box?.box_serial ?? '-')}</span></div>
      <div class="warn">
        <b>ระบบต้องการข้อมูลการทานยาอย่างน้อย ${MIN_DAYS} วันเพื่อประมวลผลสถิติ</b><br>
        ตอนนี้มีข้อมูล ${daysWithData} วัน — ใช้งานต่ออีกสักระยะแล้วเปิดรายงานใหม่อีกครั้ง
      </div>`);
  }

  const stat = summarize(slots);
  const byDate = new Map<string, DoseSlot[]>();
  for (const slot of slots) {
    const bucket = byDate.get(slot.date);
    if (bucket) bucket.push(slot);
    else byDate.set(slot.date, [slot]);
  }

  const stateClass: Record<DoseSlot['state'], string> = {
    taken: 'ok', late: 'late', missed: 'miss', pending: 'pend',
  };
  const stateLabel: Record<DoseSlot['state'], string> = {
    taken: 'ตรงเวลา', late: 'ทานเลท', missed: 'ลืมทาน', pending: 'ยังไม่ถึงเวลา',
  };
  const barColor: Record<DoseSlot['state'], string> = {
    taken: '#059669', late: '#f59e0b', missed: '#e11d48', pending: '#e2e8f0',
  };

  const rows = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => {
      const ordered = [...items].sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
      const dow = DOW_TH[new Date(`${date}T00:00:00Z`).getUTCDay()];
      return `<tr>
        <td style="white-space:nowrap">${esc(thaiDayMonth(date))} <span style="color:#94a3b8">(${esc(dow)})</span></td>
        <td><div class="bars">${ordered
          .map((s) => `<i style="background:${barColor[s.state]}"></i>`)
          .join('')}</div></td>
        <td>${ordered
          .map((s) => `${s.time}${s.actual_time ? ` → ${timeOf(s.actual_time)}` : ''}`)
          .join(' · ')}</td>
        <td class="state">${ordered
          .map((s) => `<span class="${stateClass[s.state]}">${stateLabel[s.state]}</span>`)
          .join('<span style="color:#cbd5e1"> · </span>')}</td>
      </tr>`;
    })
    .join('');

  return page(
    `รายงานการทานยา ${days} วัน`,
    `<h1>รายงานการทานยา</h1>
     <p class="sub">ช่วง ${esc(thaiDate(addDays(today, -(days - 1))))} ถึง ${esc(thaiDate(today))} (${days} วัน)</p>

     <div class="who">
       <b>${esc(context.user.name)}</b>
       <span>กล่อง ${esc(context.box?.box_serial ?? '-')}</span>
       <span>ยา ${esc(context.medicine?.name ?? '-')}</span>
       <span>ออกรายงาน ${esc(thaiDate(today))}</span>
     </div>

     <div class="grid">
       <div class="kpi"><div class="v">${stat.adherence}%</div><div class="l">ทานตามกำหนด</div></div>
       <div class="kpi"><div class="v ok" style="color:var(--ok)">${stat.onTime}</div><div class="l">ตรงเวลา</div></div>
       <div class="kpi"><div class="v" style="color:var(--late)">${stat.late}</div><div class="l">ทานเลท</div></div>
       <div class="kpi"><div class="v" style="color:var(--miss)">${stat.missed}</div><div class="l">ลืมทาน</div></div>
     </div>

     <h2>บันทึกรายวัน</h2>
     <table>
       <thead><tr><th>วันที่</th><th style="width:22%">มื้อ</th><th>เวลา (กำหนด → จริง)</th><th>ผล</th></tr></thead>
       <tbody>${rows}</tbody>
     </table>

     <p class="note">
       เกณฑ์: ทานหลังเวลาที่กำหนดเกิน 30 นาที นับเป็น "ทานเลท" · ไม่พบการเปิดฝากล่องภายใน 30 นาที นับเป็น "ลืมทาน"<br>
       รายงานนี้สร้างจากบันทึกการเปิดกล่องยาอัตโนมัติ ใช้ประกอบการพิจารณาของแพทย์
     </p>

     <button class="btn" onclick="window.print()">สั่งพิมพ์ / บันทึกเป็น PDF</button>`,
    params.get('print') === '1',
  );
}
