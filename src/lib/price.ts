import { FacilityType, LocationId, MemberType, DiscountType } from './api';
import { isHoliday as isJpHoliday } from '@holiday-jp/holiday_jp';

// 施設タイプ別に有効な割引設定を取得（体育館=GYM / ジム=TRAINING_*）
export const getEffectiveDiscount = (
  memberType: MemberType,
  facilityType: FacilityType,
): { type: DiscountType; value: number } => {
  const isGym = facilityType === 'GYM';
  // STUDENT等: 月額契約でジム利用無料
  if (!isGym && memberType.monthlyCoversTraining) {
    return { type: 'FREE', value: 0 };
  }
  const t = isGym ? memberType.gymDiscountType : memberType.trainingDiscountType;
  const v = isGym ? memberType.gymDiscountValue : memberType.trainingDiscountValue;
  if (t) return { type: t, value: Number(v) || 0 };
  // 後方互換: 旧フィールド
  if (memberType.discountType) {
    return { type: memberType.discountType, value: Number(memberType.discountValue) || 0 };
  }
  return { type: 'NONE', value: 0 };
};

export const calcMemberDiscount = (
  memberType: MemberType,
  facilityType: FacilityType,
  dayBase: number,
  duration: number,
): number => {
  const { type, value } = getEffectiveDiscount(memberType, facilityType);
  if (type === 'FREE') return dayBase;
  if (type === 'PERCENTAGE') return Math.floor(dayBase * (value / 100));
  if (type === 'FIXED_PER_HOUR') return Math.min(dayBase, Math.abs(value) * duration);
  return 0;
};

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
  return isJpHoliday(date);
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
