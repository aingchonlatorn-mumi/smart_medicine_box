import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendLinePushMessage } from '@/lib/line';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const deviceId = formData.get('device_id') as string;
    const imageFile = formData.get('image') as File | null;

    if (!deviceId || !imageFile) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 1. ค้นหา User จาก device_id
    const { data: user } = await supabase.from('users').select('*').eq('device_id', deviceId).single();
    if (!user) return NextResponse.json({ error: 'Device not found' }, { status: 404 });

    // 2. อัปโหลดรูปถ่ายเข้า Supabase Storage
    const fileName = `${deviceId}_${Date.now()}.jpg`;
    const { error: storageErr } = await supabase.storage
      .from('pill-images')
      .upload(fileName, imageFile, { contentType: 'image/jpeg' });

    if (storageErr) throw storageErr;

    const { data: publicUrlData } = supabase.storage.from('pill-images').getPublicUrl(fileName);
    const imageUrl = publicUrlData.publicUrl;

    // 3. ค้นหา Log ที่รออยู่ (Pending log)
    const { data: pendingLog } = await supabase
      .from('logs')
      .select('*, medicines(*)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (pendingLog) {
      // 4. อัปเดต Log เป็น taken
      await supabase
        .from('logs')
        .update({
          status: 'taken',
          actual_time: new Date().toISOString(),
          image_url: imageUrl,
          detected_pill_taken: true,
        })
        .eq('id', pendingLog.id);

      // 5. ตัดจำนวนยาคงเหลือ
      if (pendingLog.medicine_id && pendingLog.medicines) {
        const newRemaining = Math.max(0, pendingLog.medicines.remaining_pills - 1);
        await supabase
          .from('medicines')
          .update({ remaining_pills: newRemaining })
          .eq('id', pendingLog.medicine_id);
      }

      // 6. ส่งข้อความยืนยันทาง LINE
      await sendLinePushMessage(user.line_user_id, 'บันทึกการทานยาเรียบร้อยแล้วครับ! ✅');
    }

    return NextResponse.json({ success: true, imageUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
