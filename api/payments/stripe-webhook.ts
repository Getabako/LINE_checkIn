import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { getDb, COLLECTIONS, FieldValue } from '../../server-lib/db.js';
import { createBooking, isRemoteLockConfigured } from '../../server-lib/remotelock.js';

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

    // ---- 施設予約以外の決済（イベント参加費・月額会員の登録料／更新料） ----
    {
      const billing = await import('../../server-lib/billing.js');
      const obj = event.data.object as any;
      const kind = obj?.metadata?.kind as string | undefined;
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        if (kind === 'event') {
          await billing.completeEventRegistration(obj as Stripe.Checkout.Session);
          return res.status(200).json({ received: true });
        }
        // 月額会員の申込みは、続けて届く invoice.paid で会員の有効化と売上計上を行う
        if (kind === 'membership') return res.status(200).json({ received: true });
      }
      if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
        if (kind === 'event' && obj.metadata?.registrationId) {
          await billing.releaseEventHold(obj.metadata.registrationId);
        }
        return res.status(200).json({ received: true });
      }
      if (event.type === 'invoice.paid') {
        await billing.handleInvoicePaid(stripe, obj as Stripe.Invoice);
        return res.status(200).json({ received: true });
      }
      if (event.type === 'invoice.payment_failed') {
        await billing.handleInvoicePaymentFailed(stripe, obj as Stripe.Invoice);
        return res.status(200).json({ received: true });
      }
      if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        await billing.handleSubscriptionChanged(
          obj as Stripe.Subscription,
          event.type === 'customer.subscription.deleted'
        );
        return res.status(200).json({ received: true });
      }
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const checkinId = session.metadata?.checkinId;

      if (!checkinId) {
        console.error('Webhook: Missing checkinId in metadata');
        return res.status(200).json({ received: true });
      }

      const db = getDb();
      const checkinDoc = await db.collection(COLLECTIONS.CHECKINS).doc(checkinId).get();

      if (!checkinDoc.exists) {
        console.error(`Webhook: Checkin ${checkinId} not found`);
        return res.status(200).json({ received: true });
      }

      const checkin = checkinDoc.data()!;

      // 既にPAID済みならスキップ
      if (checkin.status === 'PAID') {
        return res.status(200).json({ received: true, already_processed: true });
      }

      // PIN発行
      let pinCode: string;
      let remoteLockError: string | null = null;

      if (isRemoteLockConfigured()) {
        try {
          const startHour = parseInt(checkin.startTime.split(':')[0], 10);
          const endHour = startHour + checkin.duration;
          const parsedDate = new Date(checkin.date);
          const dateStr = parsedDate.toISOString().split('T')[0];

          const startsAt = `${dateStr}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
          const endsAt = `${dateStr}T${String(endHour).padStart(2, '0')}:00:00+09:00`;

          const result = await createBooking({
            checkinId,
            name: `Checkin ${checkinId}`,
            startsAt,
            endsAt,
            location: checkin.location,
            facilityType: checkin.facilityType,
          });
          pinCode = result.pinCode;
        } catch (error) {
          console.error('RemoteLock API error in webhook:', error);
          pinCode = generatePinCode();
          remoteLockError = error instanceof Error ? error.message : String(error);
        }
      } else {
        pinCode = generatePinCode();
      }

      await checkinDoc.ref.update({
        status: 'PAID',
        pinCode,
        paymentId: session.id,
        updatedAt: new Date().toISOString(),
        ...(remoteLockError ? { remoteLockFailed: true, remoteLockError } : {}),
      });
      if (remoteLockError) {
        const { notifyAdminRemoteLockFailure } = await import('../../server-lib/notify.js');
        await notifyAdminRemoteLockFailure({
          checkinId,
          location: checkin.location,
          facilityType: checkin.facilityType,
          date: checkin.date,
          startTime: checkin.startTime,
          duration: checkin.duration,
          pinCode,
          error: remoteLockError,
          source: 'stripe-webhook',
        });
      }

      // クーポン使用回数を更新
      if (checkin.couponId) {
        try {
          const couponRef = db.collection('coupons').doc(checkin.couponId);
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

      // 予約完了をLINEで通知（冪等）
      try {
        const { notifyBookingComplete } = await import('../../server-lib/notify.js');
        await notifyBookingComplete(checkinId);
      } catch (e) {
        console.error('notify error (webhook):', e);
      }

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
