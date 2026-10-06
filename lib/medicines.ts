// lib/medicines.ts — รายการยาที่ระบบรองรับ
//
// ระบบนี้ยืนยันการทานยาด้วยการนับเม็ดยาจากภาพ จึงรู้จักยาได้เฉพาะชนิดที่
// อยู่ในชุดข้อมูลที่ใช้ฝึกโมเดลเท่านั้น การปล่อยให้ผู้ใช้พิมพ์ชื่อยาอะไรก็ได้
// จะทำให้ระบบรับปากในสิ่งที่ทำไม่ได้ — ลงทะเบียนยาที่โมเดลไม่รู้จักไว้
// แล้วทุกครั้งที่เปิดกล่องจะนับไม่ได้ กลายเป็น unverified ตลอด
//
// ค่า modelClass ต้องตรงกับชื่อคลาสใน data.yaml ของชุดข้อมูลทุกตัวอักษร
// ถ้าเทรนโมเดลใหม่แล้วชื่อคลาสเปลี่ยน ต้องแก้ที่นี่และรันไมเกรชันเพิ่ม
// ไฟล์นี้กับตาราง medicine_catalog ในฐานข้อมูลต้องมีเนื้อหาตรงกันเสมอ

export interface MedicineType {
  /** รหัสที่ใช้เก็บในฐานข้อมูล */
  code: string;
  /** ชื่อคลาสที่โมเดลคืนกลับมา */
  modelClass: string;
  nameTh: string;
  nameEn: string;
  /** คำอธิบายสั้น ๆ ไว้ช่วยผู้ใช้เลือกให้ถูกชนิด */
  description: string;
}

export const MEDICINE_TYPES: MedicineType[] = [
  {
    code: 'amoxicillin',
    modelClass: 'Amoxicillin',
    nameTh: 'อะม็อกซิซิลลิน',
    nameEn: 'Amoxicillin',
    description: 'ยาปฏิชีวนะกลุ่มเพนิซิลลิน ชนิดแคปซูล',
  },
  {
    code: 'andrographis',
    modelClass: 'Andrographis Paniculata',
    nameTh: 'ฟ้าทะลายโจร',
    nameEn: 'Andrographis Paniculata',
    description: 'ยาสมุนไพร ชนิดแคปซูล',
  },
  {
    code: 'curcuma',
    modelClass: 'Curcuma longa',
    nameTh: 'ขมิ้นชัน',
    nameEn: 'Curcuma longa',
    description: 'ยาสมุนไพร ชนิดแคปซูล',
  },
  {
    code: 'ferrous_fumarate',
    modelClass: 'Ferrous Fumarate',
    nameTh: 'เฟอร์รัสฟูมาเรต',
    nameEn: 'Ferrous Fumarate',
    description: 'ยาเสริมธาตุเหล็ก ชนิดเม็ด',
  },
  {
    code: 'guaifenesin',
    modelClass: 'Glyceryl guaiacolate',
    nameTh: 'ไกวเฟนิซิน',
    nameEn: 'Glyceryl guaiacolate',
    description: 'ยาขับเสมหะ ชนิดเม็ด',
  },
  {
    code: 'moxipharm',
    modelClass: 'Moxipharm',
    nameTh: 'ม็อกซิฟาร์ม',
    nameEn: 'Moxipharm',
    description: 'ยาปฏิชีวนะ ชนิดแคปซูล',
  },
];

/**
 * คลาสที่โมเดลคืนมาได้แต่ไม่ใช่ยา
 * ติดมาจากการตีกรอบผิดพลาดตอนเตรียมชุดข้อมูล ต้องทิ้งก่อนนำผลไปใช้
 */
export const IGNORED_MODEL_CLASSES = ['medicineeeeeee'];

const BY_CODE = new Map(MEDICINE_TYPES.map((m) => [m.code, m]));
const BY_MODEL_CLASS = new Map(MEDICINE_TYPES.map((m) => [normalize(m.modelClass), m]));

/** ตัดช่องว่างซ้ำและตัวพิมพ์ออก เพื่อให้เทียบชื่อได้แม้พิมพ์ต่างกันเล็กน้อย */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function medicineByCode(code: string | null | undefined): MedicineType | null {
  return code ? BY_CODE.get(code) ?? null : null;
}

/**
 * แปลงชื่อคลาสจากโมเดลเป็นรายการยาที่ระบบรู้จัก
 * คืน null เมื่อเป็นคลาสที่ไม่รองรับ ผู้เรียกต้องถือว่า "ยังไม่รู้ว่าเป็นยาอะไร"
 * ไม่ใช่ "ไม่มียา"
 */
export function medicineByModelClass(modelClass: string | null | undefined): MedicineType | null {
  if (!modelClass) return null;
  return BY_MODEL_CLASS.get(normalize(modelClass)) ?? null;
}

export function isSupportedModelClass(modelClass: string): boolean {
  return BY_MODEL_CLASS.has(normalize(modelClass));
}

/** ชื่อที่ใช้แสดงบนหน้าจอและในข้อความแจ้งเตือน */
export function medicineLabel(type: MedicineType): string {
  return `${type.nameTh} (${type.nameEn})`;
}
