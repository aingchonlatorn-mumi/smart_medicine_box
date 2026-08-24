'use client';

import { useEffect, useState } from 'react';
import { Plus, Minus, Clock, Loader2, AlertCircle, Edit3, Trash2, Pill } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ensureLineSession } from '@/lib/line';

interface DoseItem {
  time: string;
  doseAmount: number;
}

export default function SchedulePage() {
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [medicine, setMedicine] = useState<any | null>(null);
  
  const [userId, setUserId] = useState<string | null>(null);
  const [boxId, setBoxId] = useState<string | null>(null);

  const [medicineName, setMedicineName] = useState('');
  const [totalPills, setTotalPills] = useState(30);
  const [expireDate, setExpireDate] = useState('');

  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly' | 'interval'>('daily');
  const [intervalDays, setIntervalDays] = useState(1);
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon', 'Wed', 'Fri']);
  
  const [doses, setDoses] = useState<DoseItem[]>([
    { time: '08:00', doseAmount: 1 }
  ]);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const daysList = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  useEffect(() => {
    initScheduleData();
  }, []);

  const initScheduleData = async () => {
    setLoading(true);
    try {
      const loggedIn = await ensureLineSession();
      if (!loggedIn) return;

      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        const currentUserId = data.user?.user_id;
        const currentBoxId = data.box?.box_id;

        setUserId(currentUserId);
        setBoxId(currentBoxId);

        if (currentUserId) {
          await fetchBoxMedicineData(currentUserId);
        }
      }
    } catch (err) {
      console.error('Init schedule error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBoxMedicineData = async (currentUserId: string) => {
    const { data, error } = await supabase
      .from('medicines')
      .select(`*, schedules (*)`)
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setMedicine(data);
    } else {
      setMedicine(null);
    }
  };

  const handleAddDose = () => {
    setDoses((prev) => [...prev, { time: '12:00', doseAmount: 1 }]);
  };

  const handleRemoveDose = (index: number) => {
    if (doses.length === 1) return alert('ต้องมีอย่างน้อย 1 มื้อทานยา');
    setDoses((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDoseChange = (index: number, field: keyof DoseItem, value: any) => {
    setDoses((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleOpenForm = () => {
    if (medicine) {
      setMedicineName(medicine.name || '');
      setTotalPills(medicine.total_pills || 30);
      setExpireDate(medicine.expire_date || '');

      const schList = medicine.schedules || [];
      if (schList.length > 0) {
        const firstSch = schList[0];
        setScheduleType(firstSch.schedule_type || 'daily');
        setIntervalDays(firstSch.interval_days || 1);
        setSelectedDays(firstSch.day_of_week || ['Mon', 'Wed', 'Fri']);

        const loadedDoses: DoseItem[] = schList.map((s: any) => ({
          time: s.time ? s.time.slice(0, 5) : '08:00',
          doseAmount: s.dose_amount || 1,
        }));
        setDoses(loadedDoses);
      } else {
        setDoses([{ time: '08:00', doseAmount: 1 }]);
      }
    } else {
      setMedicineName('');
      setTotalPills(30);
      setExpireDate('');
      setScheduleType('daily');
      setIntervalDays(1);
      setSelectedDays(['Mon', 'Wed', 'Fri']);
      setDoses([{ time: '08:00', doseAmount: 1 }]);
    }

    setErrorMessage('');
    setIsEditing(true);
  };

  const handleSubmit = async () => {
    setErrorMessage('');
    if (!medicineName.trim()) {
      setErrorMessage('กรุณาระบุชื่อยา');
      return;
    }
    if (!userId) {
      setErrorMessage('ไม่พบข้อมูลผู้ใช้');
      return;
    }

    if (scheduleType === 'weekly' && selectedDays.length === 0) {
      setErrorMessage('กรุณาเลือกอย่างน้อย 1 วันสำหรับการทานยาแบบรายสัปดาห์');
      return;
    }

    setSaving(true);

    try {
      let medId = medicine?.medicine_id;

      if (medId) {
        const { error: medErr } = await supabase
          .from('medicines')
          .update({
            name: medicineName.trim(),
            total_pills: Number(totalPills),
            expire_date: expireDate || null,
          })
          .eq('medicine_id', medId);

        if (medErr) throw medErr;
        await supabase.from('schedules').delete().eq('medicine_id', medId);
      } else {
        const { data: medData, error: medErr } = await supabase
          .from('medicines')
          .insert({
            user_id: userId,
            name: medicineName.trim(),
            total_pills: Number(totalPills),
            expire_date: expireDate || null,
          })
          .select()
          .single();

        if (medErr) throw medErr;
        medId = medData.medicine_id;
      }

      const schedulePayloads = doses.map((d) => {
        const payload: any = {
          box_id: boxId,
          medicine_id: medId,
          time: `${d.time}:00`,
          dose_amount: Number(d.doseAmount),
          schedule_type: scheduleType,
          active: true,
        };

        if (scheduleType === 'weekly') {
          payload.day_of_week = selectedDays;
          payload.interval_days = 1;
        } else if (scheduleType === 'interval') {
          payload.interval_days = Number(intervalDays);
          payload.day_of_week = null;
        } else {
          payload.interval_days = 1;
          payload.day_of_week = null;
        }
        return payload;
      });

      const { error: schError } = await supabase.from('schedules').insert(schedulePayloads);
      if (schError) throw schError;

      alert('บันทึกข้อมูลยาในกล่องเรียบร้อยแล้ว!');
      setIsEditing(false);
      if (userId) fetchBoxMedicineData(userId);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!medicine?.medicine_id) return;
    if (!confirm('คุณต้องการลบยาออกจากกล่องใช่หรือไม่?')) return;
    setLoading(true);
    await supabase.from('medicines').delete().eq('medicine_id', medicine.medicine_id);
    if (userId) fetchBoxMedicineData(userId);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto py-24 flex flex-col items-center justify-center gap-2 text-slate-400 font-['Kanit']">
        <Loader2 size={32} className="animate-spin text-indigo-600" />
        <span className="text-xs">กำลังโหลดข้อมูลยาในกล่อง...</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-5 font-['Kanit'] px-1 pb-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-bold text-slate-900">จัดการยาในกล่อง</h1>
          <p className="text-xs text-slate-400 font-light">ตั้งค่าข้อมูลยาประจำกล่องและมื้อเวลาทานยา</p>
        </div>
      </div>

      {!isEditing && (
        <>
          {!medicine ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-8 flex flex-col items-center justify-center text-center gap-4 my-4 shadow-sm">
              <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Pill size={32} />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-bold text-base text-slate-800">ยังไม่มียาในกล่องนี้</h3>
                <p className="text-xs text-slate-400 font-light">เพิ่มยาและกำหนดมื้อเวลาทานสำหรับกล่องนี้</p>
              </div>
              <button
                onClick={handleOpenForm}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 mt-2"
              >
                <Plus size={18} /> เพิ่มยาในกล่อง
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-indigo-600 tracking-wider uppercase">Active Drug in Box</span>
                  <h3 className="font-bold text-xl text-slate-800">{medicine.name}</h3>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={handleOpenForm} className="p-2 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-xl transition-all border border-slate-100">
                    <Edit3 size={16} />
                  </button>
                  <button onClick={handleDelete} className="p-2 bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-xl transition-all border border-slate-100">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                <span className="text-[11px] font-bold text-slate-500">มื้อเวลาทานยา (ทั้งหมด {medicine.schedules?.length || 0} มื้อ):</span>
                <div className="grid grid-cols-2 gap-2">
                  {medicine.schedules?.map((s: any, idx: number) => (
                    <div key={s.schedule_id || idx} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-indigo-600" />
                        <span className="font-bold text-xs text-slate-800">{s.time?.slice(0, 5)} น.</span>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-600">{s.dose_amount} เม็ด</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center text-xs text-slate-500 pt-1 border-t border-slate-50">
                <span>คงเหลือในกล่อง: <b className="text-slate-800">{medicine.total_pills} เม็ด</b></span>
                <div className="flex items-center gap-1">
                  <span>ความถี่:</span>
                  <b className="text-indigo-600">
                    {(() => {
                      const firstSch = medicine.schedules?.[0];
                      if (!firstSch) return 'ทุกวัน';
                      const type = firstSch.schedule_type;
                      if (type === 'weekly') {
                        const days = Array.isArray(firstSch.day_of_week) ? firstSch.day_of_week.join(', ') : firstSch.day_of_week || '-';
                        return `รายสัปดาห์ (${days})`;
                      }
                      if (type === 'interval') return `ทุกๆ ${firstSch.interval_days || 1} วัน`;
                      return 'ทุกวัน';
                    })()}
                  </b>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {isEditing && (
        <div className="flex flex-col gap-5">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs p-3 rounded-xl flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
            <h2 className="font-bold text-xs text-slate-800 uppercase tracking-wider">1. ข้อมูลยาประจำกล่อง</h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">ชื่อยา *</label>
              <input
                type="text"
                value={medicineName}
                onChange={(e) => setMedicineName(e.target.value)}
                placeholder="เช่น Paracetamol 500mg"
                className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-600 focus:bg-white transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">จำนวนบรรจุ (เม็ด)</label>
                <input
                  type="number"
                  min="1"
                  value={totalPills}
                  onChange={(e) => setTotalPills(Number(e.target.value))}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-600 focus:bg-white transition-all"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">วันหมดอายุ</label>
                <input
                  type="date"
                  value={expireDate}
                  onChange={(e) => setExpireDate(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-600 focus:bg-white transition-all"
                />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-4 shadow-sm">
            <h2 className="font-bold text-xs text-slate-800 uppercase tracking-wider">2. ตั้งค่าความถี่และมื้อเวลาทาน</h2>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600">ความถี่ในการทาน</label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                {(['daily', 'weekly', 'interval'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setScheduleType(type)}
                    className={`py-1.5 text-xs font-bold rounded-lg capitalize transition-all ${
                      scheduleType === type ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {type === 'daily' ? 'ทุกวัน' : type === 'weekly' ? 'รายสัปดาห์' : 'ทุก X วัน'}
                  </button>
                ))}
              </div>
            </div>

            {scheduleType === 'weekly' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600">เลือกวันที่ต้องทาน</label>
                <div className="grid grid-cols-7 gap-1">
                  {daysList.map((day) => {
                    const isSelected = selectedDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`py-2 text-[11px] font-bold rounded-xl transition-all ${
                          isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {scheduleType === 'interval' && (
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-700">ทานเว้นระยะทุกๆ (วัน)</span>
                <input
                  type="number"
                  min="1"
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(Number(e.target.value))}
                  className="w-16 h-8 text-center bg-white border border-slate-200 rounded-lg text-xs font-bold text-indigo-600 focus:outline-none"
                />
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-700">รายการมื้อเวลาทานยา</label>
                <button type="button" onClick={handleAddDose} className="text-xs text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                  <Plus size={14} /> เพิ่มมื้อยา
                </button>
              </div>

              {doses.map((dose, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 items-center">
                  <div className="col-span-5 flex items-center bg-white border border-slate-200 rounded-lg px-2 h-9">
                    <Clock size={14} className="text-indigo-600 mr-1.5 shrink-0" />
                    <input
                      type="time"
                      value={dose.time}
                      onChange={(e) => handleDoseChange(index, 'time', e.target.value)}
                      className="w-full bg-transparent text-xs font-bold text-slate-800 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-5 flex items-center justify-between bg-white border border-slate-200 rounded-lg px-1.5 h-9">
                    <button
                      type="button"
                      onClick={() => handleDoseChange(index, 'doseAmount', Math.max(1, dose.doseAmount - 1))}
                      className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-slate-600 active:scale-95"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="font-bold text-xs text-slate-800">{dose.doseAmount} เม็ด</span>
                    <button
                      type="button"
                      onClick={() => handleDoseChange(index, 'doseAmount', dose.doseAmount + 1)}
                      className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white active:scale-95"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button type="button" onClick={() => handleRemoveDose(index)} className="p-1.5 text-slate-400 hover:text-rose-600 transition-all">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => setIsEditing(false)} className="w-1/3 h-12 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-xl transition-all">
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="w-2/3 h-12 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : 'บันทึกข้อมูลยาในกล่อง'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}