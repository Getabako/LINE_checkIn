// スマートロック（RemoteLock）の鍵をあとからまとめて登録する仕組み。
//
// 背景:
//   定期利用の一括登録（LaBOLA からの移行・管理画面の繰り返し登録）は 1 回で数十〜数百件になる。
//   1 件ごとに RemoteLock を呼ぶと 1 リクエストで終わらないため、予約は先に作って
//   lockState='PENDING' を付け、registerPendingLocks() を時間の許す範囲で繰り返し呼ぶ。
//
// 暗証番号の決め方:
//   - 同じ pinGroup（= 同じ団体の定期予約）は全日程で同じ暗証番号にする
//     （最初の 1 件で RemoteLock が発行した番号を、以降の予約で指定する）
//   - 同じ団体が同じ日に連続・同時で使う枠（例: 体育館 17-19 と 19-21、体育館とトレーニングルーム同時）は
//     1 つの鍵にまとめる。RemoteLock は同じ時間帯に同じ暗証番号の鍵を 2 つ作れず、
//     勝手に別の番号へ差し替えるため（10 分前から有効にしているので連続枠でも重なる）
//   - それでも RemoteLock が別の番号を返した場合は、その予約に返された番号を正として保存する
import { getDb, COLLECTIONS } from './db.js';
import { createBooking, cancelBooking, isRemoteLockConfigured } from './remotelock.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CheckinDoc = Record<string, any> & { id: string };

const isActive = (c: CheckinDoc) => c.status === 'PAID' || c.status === 'PENDING';
const startHour = (c: CheckinDoc) => parseInt(String(c.startTime).split(':')[0], 10);
const endHour = (c: CheckinDoc) => startHour(c) + Number(c.duration || 0);
const pad = (n: number) => String(n).padStart(2, '0');

function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** target と「同じ日・同じ拠点で、時間が重なるか連続している」予約のまとまりを返す（target を含む） */
export function clusterOf(target: CheckinDoc, candidates: CheckinDoc[]): CheckinDoc[] {
  const pool = candidates.filter(
    (c) => c.id !== target.id && c.date === target.date && c.location === target.location,
  );
  const cluster: CheckinDoc[] = [target];
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = pool.length - 1; i >= 0; i--) {
      const c = pool[i];
      const touches = cluster.some((m) => startHour(c) <= endHour(m) && startHour(m) <= endHour(c));
      if (touches) {
        cluster.push(c);
        pool.splice(i, 1);
        grew = true;
      }
    }
  }
  return cluster.sort((a, b) => startHour(a) - startHour(b));
}

export interface LockQueueResult {
  registered: number;   // 鍵を登録できた予約の数
  failed: number;       // 登録に失敗した予約の数
  pinChanged: number;   // 団体共通の番号が使えず、別の番号になった予約の数
  remaining: number;    // まだ登録待ちの予約の数
  configured: boolean;  // RemoteLock の設定があるか
}

/**
 * 登録待ちの予約に鍵を発行する。budgetMs を超えたら途中で返す（remaining > 0 なら続きを呼ぶ）。
 * priorityIds に含まれる予約を先に処理する。
 */
export async function registerPendingLocks(opts: {
  budgetMs?: number;
  priorityIds?: string[];
  retryFailed?: boolean;
  onFailure?: (c: CheckinDoc, pinCode: string, error: unknown) => Promise<void>;
} = {}): Promise<LockQueueResult> {
  const budgetMs = opts.budgetMs ?? 20000;
  const started = Date.now();
  const db = getDb();
  const col = db.collection(COLLECTIONS.CHECKINS);
  const configured = isRemoteLockConfigured();
  const today = todayJst();
  const result: LockQueueResult = { registered: 0, failed: 0, pinChanged: 0, remaining: 0, configured };

  if (opts.retryFailed) {
    const failedSnap = await col.where('lockState', '==', 'FAILED').get();
    for (const d of failedSnap.docs) {
      const c = d.data();
      if (isActive({ id: d.id, ...c }) && c.date >= today) await d.ref.update({ lockState: 'PENDING' });
    }
  }

  const snap = await col.where('lockState', '==', 'PENDING').get();
  const all: CheckinDoc[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // 終わった日・取り消し済みの予約は鍵を作らない
  const pending: CheckinDoc[] = [];
  for (const c of all) {
    if (!isActive(c) || c.date < today) {
      await col.doc(c.id).update({ lockState: 'SKIPPED' });
    } else {
      pending.push(c);
    }
  }
  const priority = new Set(opts.priorityIds ?? []);
  pending.sort((a, b) => {
    const pa = priority.has(a.id) ? 0 : 1;
    const pb = priority.has(b.id) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);
  });

  // pinGroup ごとの予約一覧（この実行中は使い回し、登録結果をその場で反映する）
  const groupCache = new Map<string, CheckinDoc[]>();
  const loadGroup = async (c: CheckinDoc): Promise<CheckinDoc[]> => {
    if (!c.pinGroup) return [c];
    const cached = groupCache.get(c.pinGroup);
    if (cached) return cached;
    const gs = await col.where('pinGroup', '==', c.pinGroup).get();
    const list: CheckinDoc[] = gs.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isActive);
    groupCache.set(c.pinGroup, list);
    return list;
  };

  const handled = new Set<string>();
  let processedPending = 0;

  for (const p of pending) {
    if (handled.has(p.id)) continue;
    if (Date.now() - started > budgetMs) break;

    const group = await loadGroup(p);
    const self = group.find((g) => g.id === p.id) ?? p;
    const cluster = p.pinGroup ? clusterOf(self, group) : [self];

    // 団体共通の暗証番号（登録済みの予約でいちばん多く使われている番号）
    const counts = new Map<string, number>();
    for (const g of group) {
      if (g.lockState === 'DONE' && g.pinCode && !g.remoteLockFailed) {
        counts.set(g.pinCode, (counts.get(g.pinCode) || 0) + 1);
      }
    }
    const groupPin = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const first = cluster[0];
    const from = Math.min(...cluster.map(startHour));
    const to = Math.max(...cluster.map(endHour));
    const facilityTypes = [...new Set(cluster.map((c) => c.facilityType as string))];
    const now = new Date().toISOString();

    let pinCode = '';
    let bookingId: string | null = null;
    let error: unknown = null;

    if (!configured) {
      // RemoteLock 未設定の環境（開発など）では番号だけ割り当てる
      pinCode = groupPin || Math.floor(1000 + Math.random() * 9000).toString();
    } else {
      try {
        // まとまりの中に登録済みの鍵があれば、作り直す前に無効化する（後から隣の枠が追加された場合）
        const oldIds = [...new Set(
          cluster.filter((c) => c.lockState === 'DONE').map((c) => (c.remoteLockBookingId as string) || c.id),
        )];
        for (const oldId of oldIds) await cancelBooking(oldId, 0);

        // RemoteLock 側の鍵ID。初回は予約IDそのまま。作り直し・再試行のときは同じIDを使い回さない
        const seq = Math.max(0, ...cluster.map((c) => Number(c.lockSeq) || 0));
        bookingId = oldIds.length > 0 || seq > 0 ? `${first.id}-r${seq}-${Date.now().toString(36)}` : first.id;
        const label = String(first.lockLabel || first.displayName || 'Checkin').slice(0, 40);
        const booking = await createBooking({
          checkinId: bookingId,
          name: `${label} ${first.date} ${pad(from)}:00`,
          startsAt: `${first.date}T${pad(from)}:00:00`,
          endsAt: `${first.date}T${pad(to)}:00:00`,
          location: first.location,
          facilityType: first.facilityType,
          facilityTypes,
          pin: groupPin,
        });
        pinCode = booking.pinCode;
      } catch (e) {
        error = e;
        console.error('registerPendingLocks: RemoteLock error', first.id, e);
        // 玄関だけ鍵ができて施設側のドア追加に失敗した場合など、中途半端な鍵を残さない
        if (bookingId) await cancelBooking(bookingId, 0).catch(() => undefined);
      }
    }

    for (const c of cluster) {
      handled.add(c.id);
      const wasPending = c.lockState === 'PENDING';
      if (error) {
        const fallbackPin = c.pinCode || groupPin || '';
        const patch = {
          lockState: 'FAILED',
          lockSeq: (Number(c.lockSeq) || 0) + 1,
          remoteLockFailed: true,
          remoteLockError: (error instanceof Error ? error.message : String(error)).slice(0, 300),
          pinCode: fallbackPin,
          updatedAt: now,
        };
        await col.doc(c.id).update(patch);
        Object.assign(c, patch);
        result.failed++;
      } else {
        const patch = {
          lockState: 'DONE',
          remoteLockFailed: false,
          remoteLockError: null,
          remoteLockBookingId: bookingId,
          pinCode,
          updatedAt: now,
        };
        await col.doc(c.id).update(patch);
        Object.assign(c, patch);
        result.registered++;
        if (groupPin && pinCode !== groupPin) result.pinChanged++;
      }
      if (wasPending) processedPending++;
    }
    if (error && opts.onFailure) {
      await opts.onFailure(first, first.pinCode || '', error).catch((e) => console.error('onFailure error:', e));
    }
  }

  result.remaining = Math.max(0, pending.length - processedPending);
  return result;
}

/**
 * 予約の取り消し・削除時に鍵を無効化する。
 * 同じ鍵をほかの有効な予約と共有している場合（連続枠をまとめた鍵）は残す。
 */
export async function releaseLockFor(c: CheckinDoc): Promise<void> {
  if (c.skipRemoteLock || !isRemoteLockConfigured()) return;
  if (c.lockState && c.lockState !== 'DONE') return; // まだ鍵を作っていない
  const bookingId: string = c.remoteLockBookingId || c.id;
  if (c.remoteLockBookingId) {
    const shared = await getDb()
      .collection(COLLECTIONS.CHECKINS)
      .where('remoteLockBookingId', '==', bookingId)
      .get();
    const others = shared.docs.filter((d) => d.id !== c.id && isActive({ id: d.id, ...d.data() }));
    if (others.length > 0) return;
  }
  await cancelBooking(bookingId, 0);
}
