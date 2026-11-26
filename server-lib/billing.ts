// 施設予約以外のオンライン決済（イベント参加費・月額会員の登録料／更新料）の共通処理。
// どちらも Stripe で決済し、決済された日（日本時間）の売上として「その他の売上」に自動で 1 行入れる。
// スタッフの入力は要らない。売上タブ・経理用CSV・RPA用CSV は「その他の売上」を読むので、全部に同じ金額で出る。
//
// 決済完了は「決済後の戻り先（stripe-callback）」と「Stripe からの通知（stripe-webhook）」の両方から呼ばれる。
// どちらが先に来ても、2 回来ても、売上・申込み・会員が二重にならないように、行の ID を決済の ID から決めている。
import Stripe from 'stripe';
import { getDb, COLLECTIONS, FieldValue, sql } from './db.js';
import { sendTextMessage, isLineConfigured } from './line.js';
import { getAllAdminUserIds } from './auth.js';

export const ONLINE_PAY_METHOD = 'オンライン決済';

/** イベント申込みの決済待ちで席を押さえておく時間（分）。Stripe の決済画面の有効期限と同じ */
export const EVENT_HOLD_MINUTES = 30;

/** 日本時間の日付 YYYY-MM-DD */
export const jstDate = (d: Date = new Date()): string =>
  new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const getStripe = (): Stripe | null => {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
};

/** 開発用の決済スキップ中か（本番では false） */
export const isPaymentSkipped = (): boolean => !process.env.STRIPE_SECRET_KEY || process.env.SKIP_PAYMENT === 'true';

export const baseUrl = (): string => process.env.NEXT_PUBLIC_BASE_URL || 'https://gym-checkin.vercel.app';

async function userName(userId?: string | null): Promise<string> {
  if (!userId) return '';
  const u = await getDb().collection(COLLECTIONS.USERS).doc(userId).get();
  if (!u.exists) return '';
  const d = u.data() as { name?: string; displayName?: string };
  return d.name || d.displayName || '';
}

async function notifyAdmins(text: string): Promise<void> {
  try {
    if (!isLineConfigured()) return;
    const ids = await getAllAdminUserIds();
    await Promise.all(ids.map((id) => sendTextMessage(id, text).catch((e) => console.error('admin notify failed:', e))));
  } catch (e) {
    console.error('notifyAdmins error:', e);
  }
}

/**
 * オンライン決済の売上を「その他の売上」に 1 行入れる。同じ ID が既にあれば何もしない。
 * date は決済された日（日本時間）。
 */
export async function recordOnlineSale(s: {
  id: string;
  date: string;
  location: string;
  category: 'EVENT_FEE' | 'REGISTRATION_FEE' | 'RENEWAL_FEE';
  amount: number;
  memo: string;
  sourceRef: string;
}): Promise<boolean> {
  if (!(s.amount > 0)) return false;
  const ref = getDb().collection(COLLECTIONS.OTHER_SALES).doc(s.id);
  if ((await ref.get()).exists) return false;
  const now = new Date().toISOString();
  await ref.set({
    date: s.date,
    location: s.location,
    category: s.category,
    amount: s.amount,
    payMethod: ONLINE_PAY_METHOD,
    memo: s.memo.slice(0, 200),
    source: 'STRIPE',
    sourceRef: s.sourceRef,
    createdBy: 'system',
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

// ------------------------------------------------- イベントの申込み

/** イベントの申込みで使う表・売上の種別 */
const REG = {
  table: 'event_registrations',
  parentTable: 'events',
  fk: 'event_id',
  fkField: 'eventId',
  coll: COLLECTIONS.EVENT_REGISTRATIONS,
  parentColl: COLLECTIONS.EVENTS,
  category: 'EVENT_FEE',
  prefix: 'ev',
  label: 'イベント',
} as const;

/** 決済の metadata.kind がイベントの申込みか */
export const isRegKind = (k: unknown): k is 'event' => k === 'event';

/** 決済待ちのまま時間が過ぎた申込みを消して、押さえていた席を戻す */
export async function releaseStaleHolds(parentId: string): Promise<void> {
  const r = REG;
  const limit = new Date(Date.now() - (EVENT_HOLD_MINUTES + 5) * 60 * 1000).toISOString();
  const snap = await getDb().collection(r.coll).where(r.fkField, '==', parentId).where('status', '==', 'PENDING').get();
  for (const d of snap.docs) {
    const created = (d.data() as { createdAt?: string }).createdAt || '';
    if (created && new Date(created).toISOString() < limit) await releaseHold(d.id);
  }
}

/** 決済待ちの申込み 1 件を取り消し、席を戻す（決済済みのものには何もしない） */
export async function releaseHold(registrationId: string): Promise<boolean> {
  const r = REG;
  const { rows } = await sql<{ pid: string }>(
    `delete from ${r.table} where id = $1 and status = 'PENDING' returning ${r.fk} as pid`,
    [registrationId]
  );
  if (rows.length === 0) return false;
  await sql(`update ${r.parentTable} set current_count = greatest(coalesce(current_count, 0) - 1, 0) where id = $1`, [
    rows[0].pid,
  ]);
  return true;
}


/**
 * イベント参加費の決済完了。申込みを確定し、決済日の売上に入れ、本人に LINE で知らせる。
 * 戻り値: 確定できた（または確定済み）なら イベントの ID
 */
export async function completeRegistration(
  session: Stripe.Checkout.Session
): Promise<{ parentId: string } | null> {
  const meta = session.metadata || {};
  const kind = meta.kind;
  const registrationId = meta.registrationId;
  const parentId = meta.eventId;
  if (!isRegKind(kind) || !registrationId || !parentId) return null;
  if (session.payment_status !== 'paid') return null;
  const r = REG;

  const db = getDb();
  const regRef = db.collection(r.coll).doc(registrationId);
  const paidAt = new Date();
  const amount = session.amount_total || 0;

  // 決済待ち → 確定 への切り替えは 1 回だけ成功する
  const claimed = await sql(
    `update ${r.table} set status = 'REGISTERED', paid_amount = $2 where id = $1 and status = 'PENDING' returning id`,
    [registrationId, amount]
  );
  let firstTime = claimed.rows.length > 0;
  if (!firstTime) {
    const existing = await regRef.get();
    if (!existing.exists) {
      // 席の押さえが時間切れで消えたあとに決済が通った場合。支払い済みなので申込みを作り直す
      await regRef.set({
        [r.fkField]: parentId,
        userId: meta.userId || null,
        lineUserId: meta.lineUserId || null,
        status: 'REGISTERED',
        paidAmount: amount,
        createdAt: paidAt.toISOString(),
      });
      await db.collection(r.parentColl).doc(parentId).update({ currentCount: FieldValue.increment(1) });
      firstTime = true;
    }
  }
  if (firstTime) {
    await regRef.update({ paymentId: session.id, paidAt: paidAt.toISOString(), holdUntil: null });
  }

  const parentDoc = await db.collection(r.parentColl).doc(parentId).get();
  const parent = (parentDoc.exists ? parentDoc.data() : {}) as Record<string, any>;
  const name = await userName(meta.userId);
  await recordOnlineSale({
    id: `${r.prefix}_${registrationId}`,
    date: jstDate(paidAt),
    location: parent.location || 'ASP',
    category: r.category,
    amount,
    memo: [parent.title || r.label, name].filter(Boolean).join('／'),
    sourceRef: session.id,
  });

  if (firstTime) {
    try {
      const { notifyEventComplete } = await import('./notify.js');
      await notifyEventComplete(meta.lineUserId, {
        title: parent.title,
        date: parent.date,
        time: parent.startTime && parent.endTime ? `${parent.startTime}〜${parent.endTime}` : parent.startTime,
      });
    } catch (e) {
      console.error('registration notify error:', e);
    }
  }
  return { parentId };
}

/**
 * 本人がキャンセルできるか。施設予約と同じ決まり:
 * 開催日の前日まで、または申込みから 1 時間以内。
 */
export function canCancelRegistration(
  parent: Record<string, any>,
  reg: Record<string, any>,
  now: Date = new Date()
): boolean {
  if (reg.status !== 'REGISTERED') return false;
  const day = parent.date;
  if (day && /^\d{4}-\d{2}-\d{2}/.test(String(day))) {
    if (now < new Date(`${String(day).slice(0, 10)}T00:00:00+09:00`)) return true;
  }
  const applied = reg.paidAt || reg.createdAt;
  return !!applied && now.getTime() - new Date(applied).getTime() <= 60 * 60 * 1000;
}

export class CancelError extends Error {}

/**
 * 申込みのキャンセル。カード・PayPay で支払った分は全額を自動で返金し、
 * 返金した日の売上にマイナスの行を入れる（決済日の売上はそのまま残す）。席を 1 つ戻す。
 * 返金に失敗したときは例外を投げ、キャンセルもしない（やり直せるようにする）。
 */
export async function cancelRegistration(
  parentId: string,
  lineUserId: string
): Promise<{ refunded: boolean; refundAmount: number }> {
  const r = REG;
  const db = getDb();
  const snap = await db.collection(r.coll).where(r.fkField, '==', parentId).where('lineUserId', '==', lineUserId).get();
  const regDoc = snap.docs.find((d) => (d.data() as { status?: string }).status === 'REGISTERED');
  if (!regDoc) throw new CancelError('申込みが見つかりません');
  const reg = regDoc.data() as Record<string, any>;
  const parentDoc = await db.collection(r.parentColl).doc(parentId).get();
  const parent = (parentDoc.exists ? parentDoc.data() : {}) as Record<string, any>;
  if (!canCancelRegistration(parent, reg)) {
    throw new CancelError('キャンセル期限を過ぎています（前日まで／お申込みから1時間以内は可能です）');
  }

  const amount = Math.round(Number(reg.paidAmount) || 0);
  const paymentId = typeof reg.paymentId === 'string' ? reg.paymentId : '';
  let refundId: string | null = null;
  if (amount > 0 && paymentId.startsWith('cs_')) {
    const stripe = getStripe();
    if (!stripe) throw new Error('Stripe not configured');
    const session = await stripe.checkout.sessions.retrieve(paymentId);
    const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!pi) throw new Error(`No payment_intent for session ${paymentId}`);
    const refund = await stripe.refunds.create(
      { payment_intent: pi, amount, reason: 'requested_by_customer', metadata: { kind: 'event', registrationId: regDoc.id } },
      { idempotencyKey: `refund_${r.prefix}_${regDoc.id}` }
    );
    refundId = refund.id;
  }

  // 確定 → キャンセル への切り替えは 1 回だけ成功する（二重押しで席や売上を二重に戻さない）
  const claimed = await sql(`update ${r.table} set status = 'CANCELLED' where id = $1 and status = 'REGISTERED' returning id`, [
    regDoc.id,
  ]);
  if (claimed.rows.length === 0) return { refunded: !!refundId, refundAmount: refundId ? amount : 0 };
  const now = new Date();
  await regDoc.ref.update({
    cancelledAt: now.toISOString(),
    ...(refundId ? { refundId, refundAmount: amount, refundedAt: now.toISOString() } : {}),
  });
  await sql(`update ${r.parentTable} set current_count = greatest(coalesce(current_count, 0) - 1, 0) where id = $1`, [
    parentId,
  ]);

  if (refundId) {
    const name = await userName(reg.userId);
    const ref = db.collection(COLLECTIONS.OTHER_SALES).doc(`${r.prefix}rf_${regDoc.id}`);
    if (!(await ref.get()).exists) {
      await ref.set({
        date: jstDate(now),
        location: parent.location || 'ASP',
        category: r.category,
        amount: -amount,
        payMethod: ONLINE_PAY_METHOD,
        memo: ['キャンセル返金', parent.title || r.label, name].filter(Boolean).join('／').slice(0, 200),
        source: 'STRIPE',
        sourceRef: refundId,
        createdBy: 'system',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    }
  }

  if (isLineConfigured()) {
    await sendTextMessage(
      lineUserId,
      `${r.label}「${parent.title || ''}」の申込みをキャンセルしました。` +
        (refundId
          ? `\n${amount.toLocaleString()}円を返金しました（カード会社・PayPay への反映まで数日かかる場合があります）。`
          : '')
    ).catch((e) => console.error('cancel notify failed:', e));
  }
  return { refunded: !!refundId, refundAmount: refundId ? amount : 0 };
}

// ---------------------------------------------------------------- 月額会員

/** 月額会員の売上を計上する拠点。会員区分に salesLocation があればそれ、無ければ ASP */
const membershipSalesLocation = (memberType: Record<string, any>): string =>
  memberType.salesLocation === 'YABASE' ? 'YABASE' : 'ASP';

const subscriptionIdOfInvoice = (invoice: any): string | null => {
  const s = invoice?.parent?.subscription_details?.subscription ?? invoice?.subscription ?? null;
  return typeof s === 'string' ? s : s?.id || null;
};

const periodEndOf = (sub: any): string | null => {
  const sec = sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end;
  return sec ? jstDate(new Date(sec * 1000)) : null;
};

/** 会員 1 件（Stripe の定期課金つき）を、定期課金の ID から探す */
async function findMembershipBySubscription(subscriptionId: string) {
  const ref = getDb().collection(COLLECTIONS.USER_MEMBERSHIPS).doc(`sub_${subscriptionId}`);
  const doc = await ref.get();
  return { ref, doc };
}

/**
 * 月額の請求が支払われた（初回＝登録料、2 回目以降＝更新料）。
 * 決済された日の売上に入れ、会員を有効にして次回更新日を書き換える。
 */
export async function handleInvoicePaid(stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = subscriptionIdOfInvoice(invoice);
  if (!subscriptionId) return;
  const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as any;
  const meta = (sub.metadata || {}) as Record<string, string>;
  if (meta.kind !== 'membership' || !meta.memberTypeId) return;

  const db = getDb();
  const typeDoc = await db.collection(COLLECTIONS.MEMBER_TYPES).doc(meta.memberTypeId).get();
  const memberType = (typeDoc.exists ? typeDoc.data() : {}) as Record<string, any>;
  const name = await userName(meta.userId);
  const paidSec = (invoice as any).status_transitions?.paid_at;
  const paidAt = paidSec ? new Date(paidSec * 1000) : new Date();
  const isFirst = (invoice as any).billing_reason === 'subscription_create';

  await recordOnlineSale({
    id: `inv_${invoice.id}`,
    date: jstDate(paidAt),
    location: membershipSalesLocation(memberType),
    category: isFirst ? 'REGISTRATION_FEE' : 'RENEWAL_FEE',
    amount: (invoice as any).amount_paid || 0,
    memo: [memberType.name || '月額会員', name].filter(Boolean).join('／'),
    sourceRef: invoice.id || '',
  });

  const now = new Date().toISOString();
  const { ref, doc } = await findMembershipBySubscription(subscriptionId);
  const live = sub.status === 'active' || sub.status === 'trialing';
  // 最初の 1 回だけ行を作る（戻り処理と通知が同時に来ても、会員の作成と案内は 1 回）
  const created = doc.exists
    ? false
    : (
        await sql(
          `insert into user_memberships (id, is_active, created_at) values ($1, false, now()) on conflict (id) do nothing returning id`,
          [`sub_${subscriptionId}`]
        )
      ).rows.length > 0;
  if (created) {
    // ほかに有効な会員区分があれば外す（1 人 1 区分）
    if (meta.lineUserId) {
      const others = await db
        .collection(COLLECTIONS.USER_MEMBERSHIPS)
        .where('lineUserId', '==', meta.lineUserId)
        .where('isActive', '==', true)
        .get();
      for (const o of others.docs) {
        if (o.id !== `sub_${subscriptionId}`) await o.ref.update({ isActive: false, updatedAt: now });
      }
    }
    await ref.update({
      userId: meta.userId || null,
      lineUserId: meta.lineUserId || null,
      displayName: name || null,
      memberTypeId: meta.memberTypeId,
      startDate: jstDate(new Date((sub.start_date || Date.now() / 1000) * 1000)),
      endDate: null,
      isActive: live,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
      currentPeriodEnd: periodEndOf(sub),
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      createdAt: now,
      updatedAt: now,
    });
    if (meta.lineUserId && isLineConfigured()) {
      await sendTextMessage(
        meta.lineUserId,
        `${memberType.name || '月額会員'}のお申し込みが完了しました。\n月額 ${Number((invoice as any).amount_paid || 0).toLocaleString()}円（税込）を、毎月の更新日に登録のカードで自動決済します。\n次回更新日：${periodEndOf(sub) || '-'}\n解約はアプリの「マイ予約」からいつでもできます。`
      ).catch((e) => console.error('membership notify failed:', e));
    }
  } else {
    await ref.update({
      isActive: live,
      currentPeriodEnd: periodEndOf(sub),
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      paymentFailedAt: null,
      updatedAt: now,
    });
  }
}

/** 定期課金の状態が変わった（解約予約・再開・終了） */
export async function handleSubscriptionChanged(sub: Stripe.Subscription, deleted: boolean): Promise<void> {
  const s = sub as any;
  if (s.metadata?.kind !== 'membership') return;
  const { ref, doc } = await findMembershipBySubscription(sub.id);
  if (!doc.exists) return;
  const now = new Date().toISOString();
  const ended = deleted || ['canceled', 'unpaid', 'incomplete_expired'].includes(s.status);
  if (ended) {
    if ((doc.data() as { isActive?: boolean }).isActive === false) return;
    await ref.update({ isActive: false, withdrawnAt: now, endDate: jstDate(), updatedAt: now });
    const lineUserId = s.metadata?.lineUserId;
    if (lineUserId && isLineConfigured()) {
      await sendTextMessage(lineUserId, '月額会員の契約が終了しました。ご利用ありがとうございました。').catch((e) =>
        console.error('membership end notify failed:', e)
      );
    }
    return;
  }
  await ref.update({
    currentPeriodEnd: periodEndOf(s),
    cancelAtPeriodEnd: !!s.cancel_at_period_end,
    updatedAt: now,
  });
}

/** 月額の更新でカード決済ができなかった。本人と管理者に知らせる（Stripe が数日おきに自動で再決済する） */
export async function handleInvoicePaymentFailed(stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = subscriptionIdOfInvoice(invoice);
  if (!subscriptionId) return;
  const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as any;
  const meta = (sub.metadata || {}) as Record<string, string>;
  if (meta.kind !== 'membership') return;
  // 初回の決済失敗は申込み自体が成立していないので知らせない
  if ((invoice as any).billing_reason === 'subscription_create') return;
  const { ref, doc } = await findMembershipBySubscription(subscriptionId);
  if (doc.exists) await ref.update({ paymentFailedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const name = await userName(meta.userId);
  if (meta.lineUserId && isLineConfigured()) {
    await sendTextMessage(
      meta.lineUserId,
      '月額会員の更新で、登録のカードで決済ができませんでした。\n数日後に自動でもう一度決済します。カードの有効期限や利用枠をご確認ください。\nカードの変更はアプリの「マイ予約」→「カードを変更する」からできます。'
    ).catch((e) => console.error('payment failed notify error:', e));
  }
  await notifyAdmins(
    `【お知らせ】月額会員の更新でカード決済ができませんでした。\n会員：${name || '-'}\nStripe が自動で再決済します。再決済もできなかった場合は、契約が自動で終了します。`
  );
}

/**
 * 会員の定期課金を止める。
 * atPeriodEnd = true: 次回更新日で終了（それまでは会員のまま・追加の請求なし）
 * atPeriodEnd = false: すぐに終了（管理者が会員区分を外したとき）
 */
export async function cancelMembershipSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void> {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');
  const { ref, doc } = await findMembershipBySubscription(subscriptionId);
  if (atPeriodEnd) {
    const sub = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    if (doc.exists) {
      await ref.update({
        cancelAtPeriodEnd: true,
        currentPeriodEnd: periodEndOf(sub),
        updatedAt: new Date().toISOString(),
      });
    }
  } else {
    try {
      await stripe.subscriptions.cancel(subscriptionId);
    } catch (e) {
      // 既に終了している定期課金は無視する
      if (!(e instanceof Stripe.errors.StripeInvalidRequestError)) throw e;
    }
  }
}
