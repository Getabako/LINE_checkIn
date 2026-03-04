import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { createBooking, isRemoteLockConfigured } from '../lib/remotelock';

const prisma = new PrismaClient();

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

    // チェックイン取得
    const checkin = await prisma.checkin.findUnique({
      where: { id: checkinId },
    });

    if (!checkin) {
      return res.redirect(`${baseUrl}/?error=checkin_not_found`);
    }

    // 既に処理済みの場合は完了ページへ
    if (checkin.status === 'PAID') {
      return res.redirect(`${baseUrl}/complete?checkinId=${checkinId}`);
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

    // PIN発行
    let pinCode: string;

    if (isRemoteLockConfigured()) {
      try {
        // RemoteLock API でPIN発行
        const startHour = parseInt(checkin.startTime.split(':')[0], 10);
        const endHour = startHour + checkin.duration;
        const dateStr = checkin.date.toISOString().split('T')[0];

        const startsAt = `${dateStr}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
        const endsAt = `${dateStr}T${String(endHour).padStart(2, '0')}:00:00+09:00`;

        const result = await createBooking({
          checkinId,
          name: `Checkin ${checkinId}`,
          startsAt,
          endsAt,
          facilityType: checkin.facilityType,
        });
        pinCode = result.pinCode;
      } catch (error) {
        console.error('RemoteLock API error, falling back to random PIN:', error);
        pinCode = generatePinCode();
      }
    } else {
      // RemoteLock未設定時はランダムPIN
      pinCode = generatePinCode();
    }

    // DB更新
    await prisma.checkin.update({
      where: { id: checkinId },
      data: {
        status: 'PAID',
        pinCode,
        paymentId: sessionId,
      },
    });

    // 完了ページへリダイレクト
    return res.redirect(`${baseUrl}/complete?checkinId=${checkinId}`);
  } catch (error) {
    console.error('Stripe callback error:', error);
    return res.redirect(`${baseUrl}/?error=payment_error`);
  }
}
