import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, COLLECTIONS } from '../../server-lib/db.js';
import { verifyLiffToken } from '../../server-lib/auth.js';

/** アプリから申し込める月額プラン（会員区分のうち、月額があり「アプリで申込みを受け付ける」がオンのもの） */
const isSelfSignupPlan = (t: Record<string, any>): boolean =>
  t.isActive !== false && Number(t.monthlyFee) > 0 && t.selfSignup === true;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const profile = await verifyLiffToken(req.headers.authorization);
  if (!profile) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();

  const findActiveMembership = async () => {
    const snapshot = await db
      .collection(COLLECTIONS.USER_MEMBERSHIPS)
      .where('lineUserId', '==', profile.userId)
      .where('isActive', '==', true)
      .limit(1)
      .get();
    return snapshot.empty ? null : snapshot.docs[0];
  };

  if (req.method === 'GET') {
    try {
      // アプリから申し込める月額プラン
      const typesSnap = await db.collection(COLLECTIONS.MEMBER_TYPES).get();
      const plans = typesSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }))
        .filter(isSelfSignupPlan)
        .sort((a: any, b: any) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

      // ユーザーのアクティブな会員情報を取得
      const doc = await findActiveMembership();
      if (!doc) {
        return res.status(200).json({ membership: null, plans });
      }

      const membershipData = doc.data();
      const membership = { id: doc.id, ...membershipData };

      // 会員種別の詳細を取得
      const memberTypeDoc = await db
        .collection(COLLECTIONS.MEMBER_TYPES)
        .doc(membershipData.memberTypeId as string)
        .get();

      return res.status(200).json({
        membership: {
          ...membership,
          memberType: memberTypeDoc.exists
            ? { id: memberTypeDoc.id, ...memberTypeDoc.data() }
            : null,
        },
        plans,
      });
    } catch (error) {
      console.error('Get membership error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // 月額プランの申込み（カード決済の画面へ）／カードの変更
  if (req.method === 'POST') {
    try {
      const billing = await import('../../server-lib/billing.js');
      const stripe = billing.getStripe();
      if (!stripe || billing.isPaymentSkipped()) {
        return res.status(400).json({ error: 'カード決済の設定ができていないため、申し込めません' });
      }
      const action = String(req.body?.action || '');
      const base = billing.baseUrl();

      const usersSnap = await db.collection(COLLECTIONS.USERS).where('lineUserId', '==', profile.userId).limit(1).get();
      let userId: string;
      let user: Record<string, any> = {};
      if (usersSnap.empty) {
        const now = new Date().toISOString();
        const ref = await db.collection(COLLECTIONS.USERS).add({
          lineUserId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl || null,
          createdAt: now,
          updatedAt: now,
        });
        userId = ref.id;
      } else {
        userId = usersSnap.docs[0].id;
        user = usersSnap.docs[0].data();
      }

      if (action === 'subscribe') {
        const memberTypeId = String(req.body?.memberTypeId || '');
        const typeDoc = memberTypeId ? await db.collection(COLLECTIONS.MEMBER_TYPES).doc(memberTypeId).get() : null;
        if (!typeDoc || !typeDoc.exists || !isSelfSignupPlan(typeDoc.data() as Record<string, any>)) {
          return res.status(400).json({ error: 'このプランは、いまアプリから申し込めません' });
        }
        const memberType = typeDoc.data() as Record<string, any>;
        const current = await findActiveMembership();
        if (current && (current.data() as Record<string, any>).stripeSubscriptionId) {
          return res.status(400).json({ error: 'すでに月額会員です' });
        }

        // Stripe の顧客（カードの持ち主）。2 回目以降は同じ顧客を使う
        let customerId = user.stripeCustomerId as string | undefined;
        if (!customerId) {
          const customer = await stripe.customers.create({
            name: user.name || user.displayName || profile.displayName || undefined,
            email: user.email || undefined,
            metadata: { userId, lineUserId: profile.userId },
          });
          customerId = customer.id;
          await db.collection(COLLECTIONS.USERS).doc(userId).update({ stripeCustomerId: customerId });
        }

        const meta = { kind: 'membership', memberTypeId, userId, lineUserId: profile.userId };
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer: customerId,
          line_items: [
            {
              price_data: {
                currency: 'jpy',
                product_data: { name: `みんなの体育館 ${memberType.name || '月額会員'}（月額）` },
                unit_amount: Math.round(Number(memberType.monthlyFee)),
                recurring: { interval: 'month' },
              },
              quantity: 1,
            },
          ],
          subscription_data: { metadata: meta },
          metadata: meta,
          success_url: `${base}/api/payments/stripe-callback?kind=membership&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/reservations?membership=cancelled`,
        });
        return res.status(200).json({ checkoutUrl: session.url });
      }

      // カードの変更（Stripe のカード変更ページへ）
      if (action === 'portal') {
        const customerId = user.stripeCustomerId as string | undefined;
        if (!customerId) return res.status(400).json({ error: '登録されているカードがありません' });
        const params = { customer: customerId, return_url: `${base}/reservations` };
        try {
          const portal = await stripe.billingPortal.sessions.create(params);
          return res.status(200).json({ url: portal.url });
        } catch {
          // カード変更ページの設定がまだ無いときは、カードの変更だけできる設定を作ってからやり直す
          const configuration = await stripe.billingPortal.configurations.create({
            business_profile: { headline: 'みんなの体育館 月額会員のお支払い方法' },
            features: {
              payment_method_update: { enabled: true },
              invoice_history: { enabled: true },
            },
          });
          const portal = await stripe.billingPortal.sessions.create({ ...params, configuration: configuration.id });
          return res.status(200).json({ url: portal.url });
        }
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (error) {
      console.error('Membership POST error:', error);
      return res.status(500).json({ error: '手続きに失敗しました。時間をおいてもう一度お試しください' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
