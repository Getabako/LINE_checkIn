import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { getDb, COLLECTIONS } from '../../server-lib/firebase.js';
import { verifyLiffToken } from '../../server-lib/auth.js';
import { createBooking, isRemoteLockConfigured } from '../../server-lib/remotelock.js';

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

const FACILITY_NAMES: Record<string, string> = {
  GYM: '体育館',
  TRAINING_PRIVATE: 'トレーニングルーム（貸切）',
  TRAINING_SHARED: 'トレーニングルーム（相席）',
};

const LOCATION_NAMES: Record<string, string> = {
  ASP: 'みんなの体育館 ASP',
  YABASE: 'みんなの体育館 やばせ',
};

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getTimeSlot(hour: number): 'DAYTIME' | 'EVENING' {
  return hour < 17 ? 'DAYTIME' : 'EVENING';
}

function calculatePrice(
  location: string,
  facilityType: string,
  date: Date,
  startTime: string,
  duration: number
): number {
  const dayType = isWeekend(date) ? 'WEEKEND' : 'WEEKDAY';
  const startHour = parseInt(startTime.split(':')[0], 10);

  const facilityPrices = PRICE_TABLE[location]?.[facilityType];
  if (!facilityPrices) {
    throw new Error(`No price table for ${location}/${facilityType}`);
  }

  let totalPrice = 0;
  for (let i = 0; i < duration; i++) {
    const currentHour = startHour + i;
    const dayPrices = facilityPrices[dayType];
    if ('ALLDAY' in dayPrices) {
      totalPrice += dayPrices.ALLDAY;
    } else {
      const timeSlot = getTimeSlot(currentHour);
      totalPrice += dayPrices[timeSlot];
    }
  }
  return totalPrice;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await verifyLiffToken(req.headers.authorization);
    if (!profile) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const usersRef = db.collection(COLLECTIONS.USERS);

    // ユーザーを取得または作成
    let userId: string;
    const userSnapshot = await usersRef.where('lineUserId', '==', profile.userId).limit(1).get();

    if (userSnapshot.empty) {
      const now = new Date().toISOString();
      const docRef = await usersRef.add({
        lineUserId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl || null,
        createdAt: now,
        updatedAt: now,
      });
      userId = docRef.id;
    } else {
      userId = userSnapshot.docs[0].id;
    }

    const { location, facilityType, date, startTime, duration, couponCode, skipPayment: clientSkipPayment, skipRemoteLock: clientSkipRemoteLock } = req.body;

    // バリデーション
    if (!location || !facilityType || !date || !startTime || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!VALID_LOCATIONS.includes(location)) {
      return res.status(400).json({ error: 'Invalid location' });
    }

    if (!VALID_FACILITY_TYPES.includes(facilityType)) {
      return res.status(400).json({ error: 'Invalid facility type' });
    }

    if (!PRICE_TABLE[location]?.[facilityType]) {
      return res.status(400).json({ error: `Facility type ${facilityType} is not available at ${location}` });
    }

    const parsedDate = new Date(date);
    let totalPrice = calculatePrice(location, facilityType, parsedDate, startTime, duration);

    // 会員割引の適用
    let memberDiscount = 0;
    let memberTypeName: string | null = null;
    try {
      const membershipSnapshot = await db
        .collection('userMemberships')
        .where('lineUserId', '==', profile.userId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!membershipSnapshot.empty) {
        const membership = membershipSnapshot.docs[0].data();
        const memberTypeDoc = await db.collection('memberTypes').doc(membership.memberTypeId).get();
        if (memberTypeDoc.exists) {
          const memberType = memberTypeDoc.data()!;
          const discountPerHour = memberType.discounts?.[location] || 0;
          if (discountPerHour !== 0) {
            memberDiscount = Math.abs(discountPerHour) * duration;
            memberTypeName = memberType.name;
          }
        }
      }
    } catch (e) {
      console.error('Member discount check error:', e);
    }

    // クーポン割引の適用
    let couponDiscount = 0;
    let couponId: string | null = null;
    if (couponCode) {
      try {
        const couponSnapshot = await db
          .collection('coupons')
          .where('code', '==', couponCode.toUpperCase().trim())
          .where('isActive', '==', true)
          .limit(1)
          .get();

        if (!couponSnapshot.empty) {
          const coupon = couponSnapshot.docs[0].data();
          couponId = couponSnapshot.docs[0].id;
          const priceAfterMember = totalPrice - memberDiscount;

          if (coupon.discountType === 'PERCENTAGE') {
            couponDiscount = Math.floor(priceAfterMember * (coupon.discountValue / 100));
          } else if (coupon.discountType === 'FIXED') {
            couponDiscount = Math.min(coupon.discountValue, priceAfterMember);
          }
        }
      } catch (e) {
        console.error('Coupon validation error:', e);
      }
    }

    const finalPrice = Math.max(0, totalPrice - memberDiscount - couponDiscount);

    // Firestore: Checkin作成 (status: PENDING)
    const now = new Date().toISOString();
    const checkinData = {
      userId,
      location,
      facilityType,
      date,
      startTime,
      duration,
      totalPrice: finalPrice,
      originalPrice: totalPrice,
      memberDiscount,
      memberTypeName,
      couponCode: couponCode || null,
      couponId,
      couponDiscount,
      pinCode: null,
      status: 'PENDING',
      paymentId: null,
      skipRemoteLock: skipRemoteLock || false,
      createdAt: now,
      updatedAt: now,
    };

    const checkinRef = await db.collection(COLLECTIONS.CHECKINS).add(checkinData);
    const checkinId = checkinRef.id;

    // Stripe Checkout Session作成
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const skipPayment = clientSkipPayment || !stripeSecretKey || process.env.SKIP_PAYMENT === 'true';
    const skipRemoteLock = clientSkipRemoteLock || false;

    if (skipPayment) {
      let pinCode: string;
      if (!skipRemoteLock && isRemoteLockConfigured()) {
        try {
          const startHour = parseInt(startTime.split(':')[0], 10);
          const endHour = startHour + duration;
          const dateStr = parsedDate.toISOString().split('T')[0];
          const startsAt = `${dateStr}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
          const endsAt = `${dateStr}T${String(endHour).padStart(2, '0')}:00:00+09:00`;

          const result = await createBooking({
            checkinId,
            name: `Checkin ${checkinId}`,
            startsAt,
            endsAt,
            location,
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

      await checkinRef.update({
        status: 'PAID',
        pinCode,
        updatedAt: new Date().toISOString(),
      });

      // クーポン使用回数を更新（SKIP_PAYMENT時）
      if (couponId) {
        try {
          const { FieldValue } = await import('firebase-admin/firestore');
          await db.collection('coupons').doc(couponId).update({ usedCount: FieldValue.increment(1) });
          await db.collection('couponRedemptions').add({
            couponId,
            userId,
            checkinId,
            discount: couponDiscount,
            createdAt: new Date().toISOString(),
          });
        } catch (e) {
          console.error('Coupon usage update error:', e);
        }
      }

      return res.status(200).json({ checkinId, mode: 'skip' });
    }

    const stripe = new Stripe(stripeSecretKey);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://your-app.vercel.app';

    const locationName = LOCATION_NAMES[location] || location;
    const facilityName = FACILITY_NAMES[facilityType] || facilityType;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: {
              name: `${locationName} ${facilityName} ${duration}時間利用`,
              description: `${parsedDate.toLocaleDateString('ja-JP')} ${startTime}〜`,
            },
            unit_amount: finalPrice,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/api/payments/stripe-callback?session_id={CHECKOUT_SESSION_ID}&checkin_id=${checkinId}`,
      cancel_url: `${baseUrl}/payment?cancelled=true`,
      metadata: { checkinId },
    });

    await checkinRef.update({
      paymentId: session.id,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      checkoutUrl: session.url,
      checkinId,
      mode: 'stripe',
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
