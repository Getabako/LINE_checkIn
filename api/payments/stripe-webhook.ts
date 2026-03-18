import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { createBooking, isRemoteLockConfigured } from '../lib/remotelock.js';

const prisma = new PrismaClient();

function generatePinCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Vercelでraw bodyを受け取るための設定
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'] as string;

    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const checkinId = session.metadata?.checkinId;

      if (!checkinId) {
        console.error('Webhook: Missing checkinId in metadata');
        return res.status(200).json({ received: true });
      }

      // チェックイン取得
      const checkin = await prisma.checkin.findUnique({
        where: { id: checkinId },
      });

      if (!checkin) {
        console.error(`Webhook: Checkin ${checkinId} not found`);
        return res.status(200).json({ received: true });
      }

      // 既にPAID済みならスキップ（callbackで処理済み）
      if (checkin.status === 'PAID') {
        return res.status(200).json({ received: true, already_processed: true });
      }

      // PIN発行
      let pinCode: string;

      if (isRemoteLockConfigured()) {
        try {
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
          console.error('RemoteLock API error in webhook:', error);
          pinCode = generatePinCode();
        }
      } else {
        pinCode = generatePinCode();
      }

      // DB更新
      await prisma.checkin.update({
        where: { id: checkinId },
        data: {
          status: 'PAID',
          pinCode,
          paymentId: session.id,
        },
      });

      console.log(`Webhook: Checkin ${checkinId} processed successfully`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
