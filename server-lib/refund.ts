import Stripe from 'stripe';

export interface RefundResult {
  refunded: boolean;
  refundId?: string;
  amount?: number;
  reason?: string; // 返金しなかった理由（返金対象外など）
}

/**
 * 予約キャンセル時の Stripe 自動返金。
 * - Stripe Checkout で支払い済み（paymentId が cs_ で始まる）かつ金額 > 0 の予約のみ対象
 * - 複数日まとめ払いは 1 決済に複数予約がぶら下がるため、その予約の金額（totalPrice）だけ部分返金する
 * - idempotencyKey で同じ予約の二重返金を防ぐ
 * 失敗時は例外を投げる（呼び出し側でキャンセル自体を止める）
 */
export async function refundCheckin(
  checkinId: string,
  checkin: { status?: string; paymentId?: string | null; totalPrice?: number }
): Promise<RefundResult> {
  if (checkin.status !== 'PAID') return { refunded: false, reason: 'not_paid' };
  const paymentId = checkin.paymentId || '';
  if (!paymentId.startsWith('cs_')) return { refunded: false, reason: 'not_stripe' };
  const amount = Number(checkin.totalPrice) || 0;
  if (amount <= 0) return { refunded: false, reason: 'zero_amount' };

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured');

  const stripe = new Stripe(secretKey);
  const session = await stripe.checkout.sessions.retrieve(paymentId);
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) throw new Error(`No payment_intent for session ${paymentId}`);

  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      amount,
      reason: 'requested_by_customer',
      metadata: { checkinId },
    },
    { idempotencyKey: `refund_checkin_${checkinId}` }
  );

  return { refunded: true, refundId: refund.id, amount };
}
