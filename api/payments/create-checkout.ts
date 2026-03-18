import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { createBooking, isRemoteLockConfigured } from '../lib/remotelock';

const prisma = new PrismaClient();

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

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getTimeSlot(hour: number): 'DAYTIME' | 'EVENING' {
  return hour < 17 ? 'DAYTIME' : 'EVENING';
}

function calculatePrice(
  facilityType: 'GYM' | 'TRAINING',
  date: Date,
  startTime: string,
  duration: number
): number {
  const dayType = isWeekend(date) ? 'WEEKEND' : 'WEEKDAY';
  const startHour = parseInt(startTime.split(':')[0], 10);

  let totalPrice = 0;
  for (let i = 0; i < duration; i++) {
    const currentHour = startHour + i;
    if (facilityType === 'TRAINING') {
      totalPrice += PRICE_TABLE.TRAINING[dayType].ALLDAY;
    } else {
      const timeSlot = getTimeSlot(currentHour);
      totalPrice += PRICE_TABLE.GYM[dayType][timeSlot];
    }
  }
  return totalPrice;
}

interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

async function verifyLiffToken(authHeader: string | undefined): Promise<LiffProfile | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const accessToken = authHeader.substring(7);

  if (process.env.NODE_ENV !== 'production' && accessToken === 'mock-access-token-for-development') {
    return { userId: 'U_dev_user_12345', displayName: '開発ユーザー' };
  }

  try {
    const response = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // LIFF トークン検証
    const profile = await verifyLiffToken(req.headers.authorization);
    if (!profile) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ユーザーを取得または作成
    let user = await prisma.user.findUnique({
      where: { lineUserId: profile.userId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          lineUserId: profile.userId,
          displayName: profile.displayName,
        },
      });
    }

    const { facilityType, date, startTime, duration } = req.body;

    // バリデーション
    if (!facilityType || !date || !startTime || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['GYM', 'TRAINING'].includes(facilityType)) {
      return res.status(400).json({ error: 'Invalid facility type' });
    }

    const parsedDate = new Date(date);
    const totalPrice = calculatePrice(facilityType, parsedDate, startTime, duration);

    // DB: Checkin作成 (status: PENDING)
    const checkin = await prisma.checkin.create({
      data: {
        userId: user.id,
        facilityType,
        date: parsedDate,
        startTime,
        duration,
        totalPrice,
        status: 'PENDING',
      },
    });

    // Stripe Checkout Session作成
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const skipPayment = !stripeSecretKey || process.env.SKIP_PAYMENT === 'true';
    if (skipPayment) {
      // 決済スキップ: RemoteLock APIでPIN発行（設定済みの場合）
      let pinCode: string;
      if (isRemoteLockConfigured()) {
        try {
          const startHour = parseInt(startTime.split(':')[0], 10);
          const endHour = startHour + duration;
          const dateStr = parsedDate.toISOString().split('T')[0];
          const startsAt = `${dateStr}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
          const endsAt = `${dateStr}T${String(endHour).padStart(2, '0')}:00:00+09:00`;

          const result = await createBooking({
            checkinId: checkin.id,
            name: `Checkin ${checkin.id}`,
            startsAt,
            endsAt,
            facilityType,
          });
          pinCode = result.pinCode;
        } catch (error) {
          console.error('RemoteLock API error, falling back to random PIN:', error);
          pinCode = Math.floor(1000 + Math.random() * 9000).toString();
        }
      } else {
        pinCode = Math.floor(1000 + Math.random() * 9000).toString();
      }
      await prisma.checkin.update({
        where: { id: checkin.id },
        data: { status: 'PAID', pinCode },
      });
      return res.status(200).json({
        checkinId: checkin.id,
        mode: 'skip',
      });
    }

    const stripe = new Stripe(stripeSecretKey);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://your-app.vercel.app';

    const facilityName = facilityType === 'GYM' ? '体育館' : 'トレーニングジム';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: {
              name: `${facilityName} ${duration}時間利用`,
              description: `${parsedDate.toLocaleDateString('ja-JP')} ${startTime}〜`,
            },
            unit_amount: totalPrice,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/api/payments/stripe-callback?session_id={CHECKOUT_SESSION_ID}&checkin_id=${checkin.id}`,
      cancel_url: `${baseUrl}/payment?cancelled=true`,
      metadata: {
        checkinId: checkin.id,
      },
    });

    // Stripe Session IDをpaymentIdに保存
    await prisma.checkin.update({
      where: { id: checkin.id },
      data: { paymentId: session.id },
    });

    return res.status(200).json({
      checkoutUrl: session.url,
      checkinId: checkin.id,
      mode: 'stripe',
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
