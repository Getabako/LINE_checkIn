import type { VercelRequest, VercelResponse } from '@vercel/node';

// 料金表
const PRICE_TABLE = {
  GYM: {
    WEEKDAY: { DAYTIME: 2750, EVENING: 2200 },
    WEEKEND: { DAYTIME: 2750, EVENING: 2750 },
  },
  TRAINING: {
    WEEKDAY: { ALLDAY: 2200 },
    WEEKEND: { ALLDAY: 2200 },
  },
} as const;

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
    const { facilityType, date, startTime, duration } = req.body;

    // バリデーション
    if (!facilityType || !date || !startTime || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['GYM', 'TRAINING'].includes(facilityType)) {
      return res.status(400).json({ error: 'Invalid facility type' });
    }

    const parsedDate = new Date(date);
    const dayType = isWeekend(parsedDate) ? 'WEEKEND' : 'WEEKDAY';
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

    return res.status(200).json({ totalPrice, breakdown });
  } catch (error) {
    console.error('Price calculation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
