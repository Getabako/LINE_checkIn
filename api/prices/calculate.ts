import type { VercelRequest, VercelResponse } from '@vercel/node';

// 拠点別料金表
const PRICE_TABLE: Record<string, Record<string, Record<string, Record<string, number>>>> = {
  ASP: {
    GYM: {
      WEEKDAY: { DAYTIME: 2200, EVENING: 2750 },
      WEEKEND: { DAYTIME: 2750, EVENING: 2750 },
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
      WEEKDAY: { DAYTIME: 1650, EVENING: 2200 },
      WEEKEND: { DAYTIME: 2200, EVENING: 2200 },
    },
  },
};

const VALID_LOCATIONS = ['ASP', 'YABASE'];
const VALID_FACILITY_TYPES = ['GYM', 'TRAINING_PRIVATE', 'TRAINING_SHARED'];

// 曜日判定
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// 時間帯判定
function getTimeSlot(hour: number): 'DAYTIME' | 'EVENING' {
  return hour < 17 ? 'DAYTIME' : 'EVENING';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { location, facilityType, date, startTime, duration } = req.body;

    // バリデーション
    if (!facilityType || !date || !startTime || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const loc = location || 'ASP';
    if (!VALID_LOCATIONS.includes(loc)) {
      return res.status(400).json({ error: 'Invalid location' });
    }

    if (!VALID_FACILITY_TYPES.includes(facilityType)) {
      return res.status(400).json({ error: 'Invalid facility type' });
    }

    const facilityPrices = PRICE_TABLE[loc]?.[facilityType];
    if (!facilityPrices) {
      return res.status(400).json({ error: `Facility type ${facilityType} is not available at ${loc}` });
    }

    const parsedDate = new Date(date);
    const dayType = isWeekend(parsedDate) ? 'WEEKEND' : 'WEEKDAY';
    const startHour = parseInt(startTime.split(':')[0], 10);

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

    return res.status(200).json({ totalPrice, breakdown });
  } catch (error) {
    console.error('Price calculation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
