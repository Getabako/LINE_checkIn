import { FacilityType, LocationId } from './api';
import * as holidayJp from '@holiday-jp/holiday_jp';

// 拠点別料金表（税込）
export const PRICE_TABLE: Record<LocationId, Record<string, Record<string, Record<string, number>>>> = {
  ASP: {
    GYM: {
      WEEKDAY: {
        DAYTIME: 2200,   // 08:00-17:00
        EVENING: 2750,   // 17:00-21:00
      },
      WEEKEND: {
        DAYTIME: 2750,
        EVENING: 2750,
      },
    },
    TRAINING_PRIVATE: {
      WEEKDAY: { ALLDAY: 2200 },
      WEEKEND: { ALLDAY: 2200 },
    },
    TRAINING_SHARED: {
      WEEKDAY: { ALLDAY: 550 },
      WEEKEND: { ALLDAY: 550 },
    },
  },
  YABASE: {
    GYM: {
      WEEKDAY: {
        DAYTIME: 1650,   // 07:00-17:00
        EVENING: 2200,   // 17:00-21:00
      },
      WEEKEND: {
        DAYTIME: 2200,
        EVENING: 2200,
      },
    },
  },
};

// 拠点別の利用可能時間枠
export const LOCATION_TIME_SLOTS: Record<LocationId, string[]> = {
  ASP: [
    '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
    '19:00', '20:00',
  ],
  YABASE: [
    '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
    '19:00', '20:00',
  ],
};

// デフォルト時間枠（後方互換）
export const TIME_SLOTS = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
  '19:00', '20:00',
] as const;

// 利用時間オプション（時間単位）
export const DURATION_OPTIONS = [1, 2, 3, 4] as const;

// 曜日判定（土日 + 日本の祝日を WEEKEND 扱い）
export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  if (day === 0 || day === 6) return true;
  return holidayJp.isHoliday(date);
};

// 時間帯判定（17時を境界）
export const getTimeSlot = (hour: number): 'DAYTIME' | 'EVENING' => {
  return hour < 17 ? 'DAYTIME' : 'EVENING';
};

// 料金計算（拠点対応）
export const calculatePrice = (
  location: LocationId,
  facilityType: FacilityType,
  date: Date,
  startTime: string,
  duration: number
): { totalPrice: number; breakdown: { hour: number; price: number }[] } => {
  const isWeekendDay = isWeekend(date);
  const dayType = isWeekendDay ? 'WEEKEND' : 'WEEKDAY';
  const startHour = parseInt(startTime.split(':')[0], 10);

  const locationPrices = PRICE_TABLE[location];
  const facilityPrices = locationPrices?.[facilityType];

  if (!facilityPrices) {
    throw new Error(`No price table for ${location}/${facilityType}`);
  }

  const breakdown: { hour: number; price: number }[] = [];
  let totalPrice = 0;

  for (let i = 0; i < duration; i++) {
    const currentHour = startHour + i;
    let price: number;

    const dayPrices = facilityPrices[dayType];
    if ('ALLDAY' in dayPrices) {
      price = dayPrices.ALLDAY;
    } else {
      const timeSlot = getTimeSlot(currentHour);
      price = dayPrices[timeSlot];
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
