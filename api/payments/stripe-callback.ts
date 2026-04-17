import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { getDb, COLLECTIONS } from '../../server-lib/firebase.js';
import { createBooking, isRemoteLockConfigured } from '../../server-lib/remotelock.js';

function generatePinCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://your-app.vercel.app';

  try {
    const { session_id, checkin_id } = req.query;

    if (!session_id || !checkin_id) {
      return res.redirect(`${baseUrl}/?error=missing_params`);
    }

    const sessionId = session_id as string;
    const checkinId = checkin_id as string;

    const db = getDb();
    const checkinDoc = await db.collection(COLLECTIONS.CHECKINS).doc(checkinId).get();

    if (!checkinDoc.exists) {
      return res.redirect(`${baseUrl}/?error=checkin_not_found`);
    }

    const checkin = checkinDoc.data()!;

    // 既に処理済みの場合は完了ページへ
    if (checkin.status === 'PAID') {
      const groupParam = checkin.groupId ? `&groupId=${checkin.groupId}` : '';
      return res.redirect(`${baseUrl}/complete?checkinId=${checkinId}${groupParam}`);
    }

    // Stripe Session検証
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.redirect(`${baseUrl}/?error=stripe_not_configured`);
    }

    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.redirect(`${baseUrl}/payment?cancelled=true`);
    }

    // 複数日予約: metadataからcheckinIdsを取得
    const checkinIdsStr = session.metadata?.checkinIds || checkinId;
    const allCheckinIds = checkinIdsStr.split(',').filter(Boolean);

    // 各checkinにPINを発行（グループ内は同一PINを使用）
    const isMultiDate = allCheckinIds.length > 1;
    let groupPinCode: string | null = null;

    for (const cId of allCheckinIds) {
      const cDoc = await db.collection(COLLECTIONS.CHECKINS).doc(cId).get();
      if (!cDoc.exists) continue;
      const cData = cDoc.data()!;
      if (cData.status === 'PAID') continue;

      let pinCode: string;

      if (!cData.skipRemoteLock && isRemoteLockConfigured()) {
        try {
          const startHour = parseInt(cData.startTime.split(':')[0], 10);
          const endHour = startHour + cData.duration;
          const parsedDate = new Date(cData.date);
          const dateStr = parsedDate.toISOString().split('T')[0];

          const startsAt = `${dateStr}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
          const endsAt = `${dateStr}T${String(endHour).padStart(2, '0')}:00:00+09:00`;

          const result = await createBooking({
            checkinId: cId,
            name: `Checkin ${cId}`,
            startsAt,
            endsAt,
            location: cData.location,
            facilityType: cData.facilityType,
            pin: groupPinCode || undefined,
          });
          pinCode = result.pinCode;
        } catch (error) {
          console.error('RemoteLock API error, falling back to random PIN:', error);
          pinCode = groupPinCode || generatePinCode();
        }
      } else {
        pinCode = groupPinCode || generatePinCode();
      }

      // グループ内は最初のPINを共有
      if (!groupPinCode && isMultiDate) {
        groupPinCode = pinCode;
      }

      await cDoc.ref.update({
        status: 'PAID',
        pinCode,
        paymentId: sessionId,
        updatedAt: new Date().toISOString(),
      });
    }

    // クーポン使用回数を更新（1回のみ）
    if (checkin.couponId) {
      try {
        const couponRef = db.collection('coupons').doc(checkin.couponId);
        const { FieldValue } = await import('firebase-admin/firestore');
        await couponRef.update({ usedCount: FieldValue.increment(1) });

        await db.collection('couponRedemptions').add({
          couponId: checkin.couponId,
          userId: checkin.userId,
          checkinId,
          discount: checkin.couponDiscount || 0,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Coupon usage update error:', e);
      }
    }

    const groupParam = checkin.groupId ? `&groupId=${checkin.groupId}` : '';
    return res.redirect(`${baseUrl}/complete?checkinId=${checkinId}${groupParam}`);
  } catch (error) {
    console.error('Stripe callback error:', error);
    return res.redirect(`${baseUrl}/?error=payment_error`);
  }
}
