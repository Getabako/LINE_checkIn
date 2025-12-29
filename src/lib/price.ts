import { FacilityType } from './api';

// 料金表（スポット利用のみ）
export const PRICE_TABLE = {
  GYM: {
    WEEKDAY: {
      DAYTIME: 2750,   // 07:00-17:00
      EVENING: 2200,   // 17:00-21:00
    },
    WEEKEND: {
      DAYTIME: 2750,   // 07:00-17:00
      EVENING: 2750,   // 17:00-21:00
    },
  },
  TRAINING: {
    WEEKDAY: {
      ALLDAY: 2200,    // 07:00-21:00
    },
    WEEKEND: {
      ALLDAY: 2200,    // 07:00-21:00
    },
  },
} as const;

// 施設情報
export const FACILITIES = [
  {
    id: 'GYM',
    name: '体育館',
    description: 'バスケットボール・バレーボール等',
    iconName: 'basketball' as const,
    operatingHours: '07:00 - 21:00',
  },
  {
    id: 'TRAINING',
    name: 'トレーニングジム',
    description: 'ウェイトトレーニング・有酸素運動',
    iconName: 'dumbbell' as const,
    operatingHours: '07:00 - 21:00',
  },
] as const;

// 利用可能時間枠
export const TIME_SLOTS = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
  '19:00', '20:00',
] as const;

// 利用時間オプション（時間単位）
export const DURATION_OPTIONS = [1, 2, 3, 4] as const;

// 曜日判定
export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

// 時間帯判定（17時を境界）
export const getTimeSlot = (hour: number): 'DAYTIME' | 'EVENING' => {
  return hour < 17 ? 'DAYTIME' : 'EVENING';
};

// 料金計算
export const calculatePrice = (
  facilityType: FacilityType,
  date: Date,
  startTime: string,
  duration: number
): { totalPrice: number; breakdown: { hour: number; price: number }[] } => {
  const isWeekendDay = isWeekend(date);
  const dayType = isWeekendDay ? 'WEEKEND' : 'WEEKDAY';
  const startHour = parseInt(startTime.split(':')[0], 10);

  const breakdown: { hour: number; price: number }[] = [];
  let totalPrice = 0;

  for (let i = 0; i < duration; i++) {
    const currentHour = startHour + i;
    let price: number;

    if (facilityType === 'TRAINING') {
      price = PRICE_TABLE.TRAINING[dayType].ALLDAY;
    } else {
      const timeSlot = getTimeSlot(currentHour);
      price = PRICE_TABLE.GYM[dayType][timeSlot];
    }

    breakdown.push({ hour: currentHour, price });
    totalPrice += price;
  }

  return { totalPrice, breakdown };
};

// 終了時間計算
export const calculateEndTime = (startTime: string, duration: number): string => {
  const startHour = parseInt(startTime.split(':')[0], 10);
  const endHour = startHour + duration;
  return `${endHour.toString().padStart(2, '0')}:00`;
};

// 利用可能な終了時間かチェック（21:00まで）
export const isValidEndTime = (startTime: string, duration: number): boolean => {
  const startHour = parseInt(startTime.split(':')[0], 10);
  const endHour = startHour + duration;
  return endHour <= 21;
};

// 選択可能な利用時間を取得
export const getAvailableDurations = (startTime: string): number[] => {
  return DURATION_OPTIONS.filter(d => isValidEndTime(startTime, d));
};
