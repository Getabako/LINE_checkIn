import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, COLLECTIONS, FieldValue } from '../../server-lib/db.js';
import { verifyLiffToken } from '../../server-lib/auth.js';
import { createLogger } from '../../server-lib/logger.js';

const log = createLogger('api.checkins');

const VALID_LOCATIONS = ['ASP', 'YABASE'];
const VALID_FACILITY_TYPES = ['GYM', 'TRAINING_PRIVATE', 'TRAINING_SHARED'];

// lineUserIdからユーザーを取得または作成し、ドキュメントIDを返す
async function getOrCreateUser(profile: { userId: string; displayName: string; pictureUrl?: string }): Promise<string> {
  const db = getDb();
  const usersRef = db.collection(COLLECTIONS.USERS);
  const snapshot = await usersRef.where('lineUserId', '==', profile.userId).limit(1).get();

  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }

  const now = new Date().toISOString();
  const docRef = await usersRef.add({
    lineUserId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl || null,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

/** 一覧に「自分が申込み済みか」「いまキャンセルできるか」を付ける */
async function withMyRegistration<T extends { id: string }>(
  kind: 'event' | 'school',
  items: T[],
  lineUserId: string
): Promise<(T & { registered: boolean; canCancel: boolean })[]> {
  const { canCancelRegistration } = await import('../../server-lib/billing.js');
  const fkField = kind === 'event' ? 'eventId' : 'schoolId';
  const mine = await getDb()
    .collection(kind === 'event' ? COLLECTIONS.EVENT_REGISTRATIONS : COLLECTIONS.SCHOOL_REGISTRATIONS)
    .where('lineUserId', '==', lineUserId)
    .get();
  const regs = new Map<string, Record<string, any>>();
  for (const d of mine.docs) {
    const r = d.data() as Record<string, any>;
    if (r.status === 'REGISTERED') regs.set(r[fkField], r);
  }
  return items.map((it) => {
    const reg = regs.get(it.id);
    return { ...it, registered: !!reg, canCancel: !!reg && canCancelRegistration(kind, it, reg) };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  log.debug('request.in', { method: req.method, query: req.query });
  try {
    const profile = await verifyLiffToken(req.headers.authorization);
    if (!profile) {
      log.warn('unauthorized', { method: req.method });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await getOrCreateUser(profile);
    const db = getDb();
    const checkinsRef = db.collection(COLLECTIONS.CHECKINS);

    // GET: チェックイン一覧 or イベント/スクール取得 or 空き状況
    if (req.method === 'GET') {
      const type = req.query.type as string;

      // 空き状況チェック
      if (type === 'availability') {
        const { location: loc, facilityType: ft, dates: datesParam, startTime: st, duration: dur } = req.query;
        if (!loc || !ft || !datesParam) {
          return res.status(400).json({ error: 'Missing location, facilityType, dates' });
        }

        const dateList = (datesParam as string).split(',');
        const SHARED_CAPACITY = 10;

        const result: Record<string, { status: 'available' | 'few' | 'full'; count: number; capacity: number }> = {};

        for (const d of dateList) {
          const existingSnapshot = await db.collection(COLLECTIONS.CHECKINS)
            .where('date', '==', d)
            .get();

          // 指定された時間帯に重なる予約を数える
          const parsedStartTime = st ? parseInt((st as string).split(':')[0], 10) : 7;
          const parsedDuration = dur ? parseInt(dur as string, 10) : 1;
          const newEnd = parsedStartTime + parsedDuration;

          const sameFacilityDocs = existingSnapshot.docs.filter((doc) => {
            const ex = doc.data();
            if (ex.location !== loc) return false;
            if (ex.facilityType !== ft) return false;
            if (ex.status !== 'PENDING' && ex.status !== 'PAID') return false;
            return true;
          });

          const capacity = ft === 'TRAINING_SHARED' ? SHARED_CAPACITY : 1;
          let status: 'available' | 'few' | 'full';
          let count = 0;

          if (!st) {
            // 時間未指定：日全体で埋まっているかを判定（終日埋まっているときのみ full）
            // 営業時間: ASP 08:00-21:00 / やばせ 07:00-21:00
            const OPEN_HOUR = loc === 'ASP' ? 8 : 7;
            const CLOSE_HOUR = 21;
            const totalHours = CLOSE_HOUR - OPEN_HOUR;

            if (ft === 'TRAINING_SHARED') {
              // 共有: 時間別の最大同時利用数を見る
              const hourCounts: number[] = new Array(totalHours).fill(0);
              for (const doc of sameFacilityDocs) {
                const ex = doc.data();
                const exStart = parseInt(ex.startTime.split(':')[0], 10);
                const exEnd = exStart + (ex.duration || 0);
                for (let h = Math.max(exStart, OPEN_HOUR); h < Math.min(exEnd, CLOSE_HOUR); h++) {
                  hourCounts[h - OPEN_HOUR]++;
                }
              }
              const maxConcurrent = Math.max(0, ...hourCounts);
              count = maxConcurrent;
              if (maxConcurrent >= capacity) status = 'full';
              else if (maxConcurrent >= capacity * 0.7) status = 'few';
              else status = 'available';
            } else {
              // 定員1: 占有時間が営業時間をカバーし切っているかを見る
              const occupied: boolean[] = new Array(totalHours).fill(false);
              for (const doc of sameFacilityDocs) {
                const ex = doc.data();
                const exStart = parseInt(ex.startTime.split(':')[0], 10);
                const exEnd = exStart + (ex.duration || 0);
                for (let h = Math.max(exStart, OPEN_HOUR); h < Math.min(exEnd, CLOSE_HOUR); h++) {
                  occupied[h - OPEN_HOUR] = true;
                }
              }
              const occupiedHours = occupied.filter(Boolean).length;
              count = sameFacilityDocs.length;
              if (occupiedHours >= totalHours) status = 'full';
              else if (occupiedHours > 0) status = 'few';
              else status = 'available';
            }
          } else {
            // 時間指定あり：指定時間帯に重なる予約数を判定
            const overlapping = sameFacilityDocs.filter((doc) => {
              const ex = doc.data();
              const exStart = parseInt(ex.startTime.split(':')[0], 10);
              const exEnd = exStart + (ex.duration || 0);
              return parsedStartTime < exEnd && exStart < newEnd;
            });
            count = overlapping.length;
            if (count >= capacity) status = 'full';
            else if (ft === 'TRAINING_SHARED' && count >= capacity * 0.7) status = 'few';
            else status = 'available';
          }

          result[d] = { status, count, capacity };
        }

        return res.status(200).json(result);
      }

      // 週間タイムテーブル（時間帯別の空き状況）
      if (type === 'timetable') {
        const { location: loc, facilityType: ft, dates: datesParam } = req.query;
        if (!loc || !ft || !datesParam) {
          return res.status(400).json({ error: 'Missing location, facilityType, dates' });
        }
        const dateList = (datesParam as string).split(',').filter(Boolean);
        const OPEN_HOUR = loc === 'ASP' ? 8 : 7;
        const CLOSE_HOUR = 21;

        // 7日分を並列取得（逐次だと遅いため）
        const snaps = await Promise.all(
          dateList.map((d) => db.collection(COLLECTIONS.CHECKINS).where('date', '==', d).get())
        );
        const out: Record<string, Record<number, number>> = {};
        dateList.forEach((d, i) => {
          const hours: Record<number, number> = {};
          for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) hours[h] = 0;
          for (const doc of snaps[i].docs) {
            const ex = doc.data();
            if (ex.location !== loc || ex.facilityType !== ft) continue;
            if (ex.status !== 'PENDING' && ex.status !== 'PAID') continue;
            const exStart = parseInt(String(ex.startTime).split(':')[0], 10);
            const exEnd = exStart + (ex.duration || 0);
            for (let h = Math.max(exStart, OPEN_HOUR); h < Math.min(exEnd, CLOSE_HOUR); h++) {
              hours[h] = (hours[h] || 0) + 1;
            }
          }
          out[d] = hours;
        });
        return res.status(200).json({ openHour: OPEN_HOUR, closeHour: CLOSE_HOUR, timetable: out });
      }

      // 公開イベント一覧
      if (type === 'events') {
        // 複合インデックス回避のため isActive のみで取得しメモリでソート
        const snapshot = await db.collection(COLLECTIONS.EVENTS)
          .where('isActive', '==', true)
          .get();
        const events = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; date?: string }))
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        return res.status(200).json(await withMyRegistration('event', events, profile.userId));
      }

      // 公開スクール一覧
      if (type === 'schools') {
        const snapshot = await db.collection(COLLECTIONS.SCHOOLS)
          .where('isActive', '==', true)
          .get();
        const schools = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; createdAt?: string }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        return res.status(200).json(await withMyRegistration('school', schools, profile.userId));
      }
      const { groupId } = req.query;

      // groupIdでフィルタ
      if (groupId && typeof groupId === 'string') {
        // 複合インデックス回避のため userId のみで取得しメモリで絞り込み＆ソート
        const snapshot = await checkinsRef
          .where('userId', '==', userId)
          .get();

        const checkins = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; groupId?: string; date?: string }))
          .filter((c) => c.groupId === groupId)
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        return res.status(200).json(checkins);
      }

      const snapshot = await checkinsRef
        .where('userId', '==', userId)
        .get();

      const checkins = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; createdAt?: string }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      return res.status(200).json(checkins);
    }

    // POST: イベント/スクール申込み or 新規チェックイン作成
    if (req.method === 'POST') {
      const type = req.query.type as string;

      // イベント／スクールの申込み（料金があるものは、申込み時にカード・PayPay で決済する）
      if (type === 'event-register' || type === 'school-register') {
        const kind = type === 'event-register' ? 'event' : 'school';
        const parentId = (kind === 'event' ? req.body.eventId : req.body.schoolId) as string | undefined;
        if (!parentId) return res.status(400).json({ error: kind === 'event' ? 'Missing eventId' : 'Missing schoolId' });
        const fkField = kind === 'event' ? 'eventId' : 'schoolId';
        const parentColl = kind === 'event' ? COLLECTIONS.EVENTS : COLLECTIONS.SCHOOLS;
        const regColl = kind === 'event' ? COLLECTIONS.EVENT_REGISTRATIONS : COLLECTIONS.SCHOOL_REGISTRATIONS;

        const billing = await import('../../server-lib/billing.js');
        // 決済待ちのまま時間が過ぎた申込みの席を戻してから、定員を見る
        await billing.releaseStaleHolds(kind, parentId);

        const parentDoc = await db.collection(parentColl).doc(parentId).get();
        if (!parentDoc.exists) return res.status(404).json({ error: kind === 'event' ? 'Event not found' : 'School not found' });
        const parent = parentDoc.data()!;
        if (parent.isActive === false) return res.status(400).json({ error: '受付を終了しました' });

        // 重複チェック（決済待ちのまま戻ってきた場合は、前の申込みを取り消してやり直す。キャンセル済みは申込み直せる）
        const existing = await db.collection(regColl)
          .where(fkField, '==', parentId)
          .where('lineUserId', '==', profile.userId)
          .get();
        for (const d of existing.docs) {
          const st = (d.data() as { status?: string }).status;
          if (st === 'PENDING') await billing.releaseHold(kind, d.id);
          else if (st !== 'CANCELLED') return res.status(400).json({ error: '既に申込み済みです' });
        }

        // 定員チェック（取り消した分を反映するため読み直す）
        const fresh = (await parentDoc.ref.get()).data()!;
        if (fresh.capacity > 0 && (fresh.currentCount || 0) >= fresh.capacity) {
          return res.status(400).json({ error: '定員に達しています' });
        }

        const now = new Date().toISOString();
        // イベントは参加費、スクールは全回分の受講料をまとめて支払う
        const price = Math.round(
          kind === 'event'
            ? Number(parent.price) || 0
            : (Number(parent.pricePerSession) || 0) * (Number(parent.totalSessions) || 1)
        );

        // 無料（または開発用の決済スキップ中）は、その場で申込み完了
        if (price <= 0 || billing.isPaymentSkipped()) {
          const regData = {
            [fkField]: parentId,
            userId,
            lineUserId: profile.userId,
            status: 'REGISTERED',
            paidAmount: 0,
            createdAt: now,
          };
          const regRef = await db.collection(regColl).add(regData);
          await parentDoc.ref.update({ currentCount: FieldValue.increment(1) });
          return res.status(201).json({ id: regRef.id, ...regData });
        }

        // 決済が終わるまで席を押さえ（決済待ち）、決済完了で申込み確定＋売上に計上する
        const stripe = billing.getStripe()!;
        const holdUntil = new Date(Date.now() + billing.EVENT_HOLD_MINUTES * 60 * 1000);
        const regData = {
          [fkField]: parentId,
          userId,
          lineUserId: profile.userId,
          status: 'PENDING',
          paidAmount: 0,
          holdUntil: holdUntil.toISOString(),
          createdAt: now,
        };
        const regRef = await db.collection(regColl).add(regData);
        await parentDoc.ref.update({ currentCount: FieldValue.increment(1) });
        try {
          const base = billing.baseUrl();
          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            // payment_method_types を省略し、Stripe で有効な決済方法（カード・PayPay）を出す
            line_items: [
              {
                price_data: {
                  currency: 'jpy',
                  product_data:
                    kind === 'event'
                      ? {
                          name: `イベント参加費 ${parent.title || ''}`.trim(),
                          description:
                            `${parent.date || ''} ${parent.startTime || ''}〜${parent.endTime || ''}`.trim() || undefined,
                        }
                      : {
                          name: `スクール受講料 ${parent.title || ''}`.trim(),
                          description: `全${parent.totalSessions || 1}回分 ${parent.startTime || ''}〜${parent.endTime || ''}`.trim(),
                        },
                  unit_amount: price,
                },
                quantity: 1,
              },
            ],
            expires_at: Math.floor(holdUntil.getTime() / 1000) + 60,
            success_url: `${base}/api/payments/stripe-callback?kind=${kind}&session_id={CHECKOUT_SESSION_ID}&parent_id=${parentId}`,
            cancel_url: `${base}/${kind === 'event' ? 'events' : 'schools'}/${parentId}?payment=cancelled`,
            metadata: { kind, registrationId: regRef.id, [fkField]: parentId, userId, lineUserId: profile.userId },
          });
          await regRef.update({ paymentId: session.id });
          return res.status(200).json({ id: regRef.id, ...regData, checkoutUrl: session.url });
        } catch (e) {
          await billing.releaseHold(kind, regRef.id);
          throw e;
        }
      }

      // イベント／スクールの申込みキャンセル（支払い済みの分は自動で全額返金）
      if (type === 'event-cancel' || type === 'school-cancel') {
        const kind = type === 'event-cancel' ? 'event' : 'school';
        const parentId = (kind === 'event' ? req.body.eventId : req.body.schoolId) as string | undefined;
        if (!parentId) return res.status(400).json({ error: 'Missing id' });
        const billing = await import('../../server-lib/billing.js');
        try {
          const result = await billing.cancelRegistration(kind, parentId, profile.userId);
          return res.status(200).json({ message: 'Cancelled successfully', ...result });
        } catch (e) {
          if (e instanceof billing.CancelError) return res.status(400).json({ error: e.message });
          log.error('registration.cancel.fail', { message: String(e) });
          return res.status(500).json({
            error: '返金処理に失敗したため、キャンセルできませんでした。時間をおいて再度お試しいただくか、施設までお問い合わせください',
          });
        }
      }
      const { location, facilityType, date, startTime, duration, totalPrice } = req.body;

      if (!facilityType || !date || !startTime || !duration) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const loc = location || 'ASP';
      if (!VALID_LOCATIONS.includes(loc)) {
        return res.status(400).json({ error: 'Invalid location' });
      }

      if (!VALID_FACILITY_TYPES.includes(facilityType)) {
        return res.status(400).json({ error: 'Invalid facility type' });
      }

      const now = new Date().toISOString();
      const checkinData = {
        userId,
        location: loc,
        facilityType,
        date,
        startTime,
        duration,
        totalPrice: totalPrice || 0,
        pinCode: null,
        status: 'PENDING',
        paymentId: null,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await checkinsRef.add(checkinData);
      log.op('checkin.create', {
        checkinId: docRef.id,
        userId,
        location: loc,
        facilityType,
        date,
        startTime,
        duration,
      });

      return res.status(201).json({
        checkin: { id: docRef.id, ...checkinData },
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    log.error('handler.fail', { message: String(error) });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
