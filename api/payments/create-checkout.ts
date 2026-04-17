import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import crypto from 'crypto';
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

    const { location, facilityType, date, dates, startTime, duration, couponCode, skipPayment: clientSkipPayment, skipRemoteLock: clientSkipRemoteLock, recurring } = req.body;

    // 定期予約の場合、日付を自動計算
    let resolvedDates: string[] | null = null;
    if (recurring && date) {
      const { type: recurringType, count: recurringCount } = recurring as { type: 'WEEKLY' | 'BIWEEKLY'; count: number };
      const baseDate = new Date(date);
      const interval = recurringType === 'BIWEEKLY' ? 14 : 7;
      resolvedDates = [];
      for (let i = 0; i < recurringCount; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + interval * i);
        resolvedDates.push(d.toISOString().split('T')[0]);
      }
    } else if (dates && Array.isArray(dates) && dates.length > 0) {
      resolvedDates = dates as string[];
    }

    // バリデーション
    if (!location || !facilityType || (!date && !resolvedDates) || !startTime || !duration) {
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

    // 複数日 or 単一日の処理
    const allDates = resolvedDates || [date];
    const isMultiDate = allDates.length > 1;
    const groupId = isMultiDate ? crypto.randomUUID() : null;

    // 重複チェック（体育館・貸切トレは同時間帯1組のみ、相席トレは定員内OK）
    // 複合インデックス回避のため date のみでクエリし、他条件はメモリ側でフィルタ
    const SHARED_CAPACITY = 10;
    const newStart = parseInt(startTime.split(':')[0], 10);
    const newEnd = newStart + duration;

    for (const d of allDates) {
      const existingSnapshot = await db.collection(COLLECTIONS.CHECKINS)
        .where('date', '==', d)
        .get();

      const overlapping = existingSnapshot.docs.filter((doc) => {
        const ex = doc.data();
        if (ex.location !== location) return false;
        if (ex.facilityType !== facilityType) return false;
        if (ex.status !== 'PENDING' && ex.status !== 'PAID') return false;
        const exStart = parseInt(ex.startTime.split(':')[0], 10);
        const exEnd = exStart + (ex.duration || 0);
        return newStart < exEnd && exStart < newEnd;
      });

      if (facilityType === 'TRAINING_SHARED') {
        if (overlapping.length >= SHARED_CAPACITY) {
          return res.status(409).json({ error: `${d} ${startTime}〜は定員に達しています` });
        }
      } else {
        if (overlapping.length > 0) {
          return res.status(409).json({ error: `${d} ${startTime}〜は既に予約されています` });
        }
      }
    }

    // 各日の料金を計算
    let grandTotalPrice = 0;
    const perDatePrices: { date: string; price: number }[] = [];
    for (const d of allDates) {
      const parsedDate = new Date(d);
      const price = calculatePrice(location, facilityType, parsedDate, startTime, duration);
      perDatePrices.push({ date: d, price });
      grandTotalPrice += price;
    }

    // 会員割引の適用（全日分合算）
    let memberDiscountPerDay = 0;
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
            memberDiscountPerDay = Math.abs(discountPerHour) * duration;
            memberTypeName = memberType.name;
          }
        }
      }
    } catch (e) {
      console.error('Member discount check error:', e);
    }

    const totalMemberDiscount = memberDiscountPerDay * allDates.length;

    // クーポン割引の適用（合計金額に対して1回）
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
          const priceAfterMember = grandTotalPrice - totalMemberDiscount;

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

    const finalPrice = Math.max(0, grandTotalPrice - totalMemberDiscount - couponDiscount);

    // スキップフラグ
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const skipPayment = clientSkipPayment || !stripeSecretKey || process.env.SKIP_PAYMENT === 'true';
    const skipRemoteLock = clientSkipRemoteLock || false;

    // Firestore: 各日付のCheckin作成 (status: PENDING)
    const now = new Date().toISOString();
    const checkinIds: string[] = [];

    // クーポン割引を日数で按分
    const couponDiscountPerDay = allDates.length > 0 ? Math.floor(couponDiscount / allDates.length) : 0;
    const couponDiscountRemainder = couponDiscount - couponDiscountPerDay * allDates.length;

    for (let i = 0; i < allDates.length; i++) {
      const d = allDates[i];
      const dayPrice = perDatePrices[i].price;
      const dayCouponDiscount = couponDiscountPerDay + (i === 0 ? couponDiscountRemainder : 0);
      const dayFinalPrice = Math.max(0, dayPrice - memberDiscountPerDay - dayCouponDiscount);

      const checkinData = {
        userId,
        location,
        facilityType,
        date: d,
        startTime,
        duration,
        totalPrice: dayFinalPrice,
        originalPrice: dayPrice,
        memberDiscount: memberDiscountPerDay,
        memberTypeName,
        couponCode: couponCode || null,
        couponId,
        couponDiscount: dayCouponDiscount,
        pinCode: null,
        status: 'PENDING',
        paymentId: null,
        skipRemoteLock,
        groupId,
        recurringType: recurring?.type || null,
        createdAt: now,
        updatedAt: now,
      };

      const checkinRef = await db.collection(COLLECTIONS.CHECKINS).add(checkinData);
      checkinIds.push(checkinRef.id);
    }

    const primaryCheckinId = checkinIds[0];

    if (skipPayment) {
      // 各日付のcheckinにPINを発行（グループ内は同一PINを使用）
      let groupPinCode: string | null = null;

      for (let i = 0; i < checkinIds.length; i++) {
        const cId = checkinIds[i];
        const d = allDates[i];
        let pinCode: string;

        if (!skipRemoteLock && isRemoteLockConfigured()) {
          try {
            const startHour = parseInt(startTime.split(':')[0], 10);
            const endHour = startHour + duration;
            const parsedDate = new Date(d);
            const dateStr = parsedDate.toISOString().split('T')[0];
            const startsAt = `${dateStr}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
            const endsAt = `${dateStr}T${String(endHour).padStart(2, '0')}:00:00+09:00`;

            const result = await createBooking({
              checkinId: cId,
              name: `Checkin ${cId}`,
              startsAt,
              endsAt,
              location,
              facilityType,
              pin: groupPinCode || undefined,
            });
            pinCode = result.pinCode;
          } catch (error) {
            console.error('RemoteLock API error, falling back to random PIN:', error);
            pinCode = groupPinCode || Math.floor(1000 + Math.random() * 9000).toString();
          }
        } else {
          pinCode = groupPinCode || Math.floor(1000 + Math.random() * 9000).toString();
        }

        // グループ内は最初のPINを共有
        if (!groupPinCode && isMultiDate) {
          groupPinCode = pinCode;
        }

        await db.collection(COLLECTIONS.CHECKINS).doc(cId).update({
          status: 'PAID',
          pinCode,
          updatedAt: new Date().toISOString(),
        });
      }

      // クーポン使用回数を更新（SKIP_PAYMENT時）
      if (couponId) {
        try {
          const { FieldValue } = await import('firebase-admin/firestore');
          await db.collection('coupons').doc(couponId).update({ usedCount: FieldValue.increment(1) });
          await db.collection('couponRedemptions').add({
            couponId,
            userId,
            checkinId: primaryCheckinId,
            discount: couponDiscount,
            createdAt: new Date().toISOString(),
          });
        } catch (e) {
          console.error('Coupon usage update error:', e);
        }
      }

      return res.status(200).json({
        checkinId: primaryCheckinId,
        checkinIds,
        groupId,
        mode: 'skip',
      });
    }

    const stripe = new Stripe(stripeSecretKey);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://your-app.vercel.app';

    const locationName = LOCATION_NAMES[location] || location;
    const facilityName = FACILITY_NAMES[facilityType] || facilityType;

    const productName = isMultiDate
      ? `${locationName} ${facilityName} ${duration}時間利用 × ${allDates.length}日`
      : `${locationName} ${facilityName} ${duration}時間利用`;
    const parsedFirstDate = new Date(allDates[0]);
    const productDesc = isMultiDate
      ? `${parsedFirstDate.toLocaleDateString('ja-JP')} 他${allDates.length - 1}日 ${startTime}〜`
      : `${parsedFirstDate.toLocaleDateString('ja-JP')} ${startTime}〜`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'paypay'] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: {
              name: productName,
              description: productDesc,
            },
            unit_amount: finalPrice,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/api/payments/stripe-callback?session_id={CHECKOUT_SESSION_ID}&checkin_id=${primaryCheckinId}`,
      cancel_url: `${baseUrl}/payment?cancelled=true`,
      metadata: {
        checkinId: primaryCheckinId,
        checkinIds: checkinIds.join(','),
        groupId: groupId || '',
      },
    });

    // 全checkinにpaymentIdを設定
    for (const cId of checkinIds) {
      await db.collection(COLLECTIONS.CHECKINS).doc(cId).update({
        paymentId: session.id,
        updatedAt: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      checkoutUrl: session.url,
      checkinId: primaryCheckinId,
      checkinIds,
      groupId,
      mode: 'stripe',
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
