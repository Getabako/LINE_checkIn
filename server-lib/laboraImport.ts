// LaBOLA（旧予約システム）の予約CSVを取り込み、ミニアプリの予約として登録する。
// あわせて、取り込んだ団体（LINE未連携）と本人の LINE アカウントを手動で紐づける処理。
//
// 取り込みの決まり:
//   - 対象は「予約完了」かつ fromDate 以降の利用日のみ（それ以前は LaBOLA 側で完結）
//   - 何度取り込んでも二重登録しない（拠点＋LaBOLA予約番号で突き合わせ）
//   - 再取り込み時、LaBOLA 側でキャンセル・削除になった予約はミニアプリ側も取り消す
//   - 決済は発生させない（定期=請求書払い、LaBOLA でカード決済済みの一般予約はそのまま支払い済み扱い）
//   - 鍵は lockState='PENDING' で予約だけ作り、lockQueue がまとめて発行する
import * as holidayJpModule from '@holiday-jp/holiday_jp';
import { getDb, COLLECTIONS } from './db.js';
import { loadPriceTable } from './prices.js';
import { releaseLockFor, type CheckinDoc } from './lockQueue.js';
import { isLineConfigured, sendTextMessage } from './line.js';

// CommonJSパッケージのため、Vercel ESMランタイムでは default 経由で参照する
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const holidayJp: any = (holidayJpModule as any).default ?? holidayJpModule;

export interface LaboraReservationRow {
  reservationNo: string;
  content: string;       // 予約内容（体育館予約 / トレーニングルーム（貸切プラン） など）
  date: string;          // 2027/01/13
  startTime: string;     // 09:00
  endTime: string;       // 11:00
  status: string;        // 予約完了 / キャンセル / 削除
  paymentMethod: string; // クレジットカード / 空（請求書）
  amount: string;
  customerType: string;  // S-01 / 通常会員 ...
  customerNumber: string;
  name: string;
  kana: string;
  teamName: string;
  email: string;
  phone: string;
  mobile: string;
}

export interface LaboraImportResult {
  total: number;
  processed: number;
  hasMore: boolean;
  created: number;
  unchanged: number;
  changed: number;
  cancelled: number;
  outOfRange: number;
  ignored: number;
  usersCreated: number;
  conflicts: string[];
  errors: string[];
}

const LOCATIONS = ['ASP', 'YABASE'];
const LOCATION_NAMES: Record<string, string> = { ASP: 'ASP', YABASE: 'やばせ' };

const decodeEntities = (s: string) =>
  (s || '')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

const normPhone = (s: string): string =>
  (s || '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, '');

const normName = (s: string): string => decodeEntities(s).replace(/[\s\u3000]/g, '');

function facilityTypeOf(content: string): string | null {
  const c = content || '';
  if (c.includes('トレーニング')) return c.includes('相席') ? 'TRAINING_SHARED' : 'TRAINING_PRIVATE';
  if (c.includes('体育館')) return 'GYM';
  return null;
}

// LaBOLA顧客タイプ → 会員種別コード（顧客CSV取り込みと同じ対応）
function memberCodeOf(customerType: string): string {
  const v = (customerType || '').trim();
  if (v === 'S-01') return 'S-01';
  if (v === 'TR-00' || v === 'T-00') return 'TR-00';
  if (v === 'TR-01' || v === 'T-01') return 'TR-01';
  if (v === 'その他') return 'OTHER';
  if (v === '学生会員') return 'STUDENT';
  return 'GENERAL';
}

const isActive = (c: CheckinDoc) => c.status === 'PAID' || c.status === 'PENDING';
const hourOf = (t: string) => parseInt(String(t).split(':')[0], 10);

interface MemberTypeDoc {
  id: string;
  code?: string;
  name?: string;
  gymDiscountType?: string;
  gymDiscountValue?: number;
  trainingDiscountType?: string;
  trainingDiscountValue?: number;
  monthlyCoversTraining?: boolean;
}

/** 料金表＋会員区分の割引から、アプリで予約した場合と同じ金額を出す */
function computePrice(
  table: Awaited<ReturnType<typeof loadPriceTable>>,
  location: string,
  facilityType: string,
  date: string,
  start: number,
  duration: number,
  memberType: MemberTypeDoc | undefined,
): { original: number; total: number } {
  const prices = table[location]?.[facilityType];
  if (!prices) return { original: 0, total: 0 };
  const d = new Date(`${date}T00:00:00+09:00`);
  const jstDay = new Date(d.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
  const weekend = jstDay === 0 || jstDay === 6 || holidayJp.isHoliday(new Date(`${date}T12:00:00+09:00`));
  const day = prices[weekend ? 'WEEKEND' : 'WEEKDAY'];
  let original = 0;
  for (let i = 0; i < duration; i++) {
    original += 'ALLDAY' in day ? day.ALLDAY : day[start + i < 17 ? 'DAYTIME' : 'EVENING'];
  }
  // 割引の決まりは決済時（api/payments/create-checkout.ts）と同じ
  let discount = 0;
  if (memberType) {
    const isGym = facilityType === 'GYM';
    const type = !isGym && memberType.monthlyCoversTraining
      ? 'FREE'
      : (isGym ? memberType.gymDiscountType : memberType.trainingDiscountType);
    const value = Number(isGym ? memberType.gymDiscountValue : memberType.trainingDiscountValue) || 0;
    if (type === 'FREE') discount = original;
    else if (type === 'PERCENTAGE') discount = Math.floor(original * (value / 100));
    else if (type === 'FIXED_PER_HOUR') discount = Math.min(original, Math.abs(value) * duration);
  }
  return { original, total: Math.max(0, original - discount) };
}

export async function importLaboraReservations(params: {
  location: string;
  fromDate: string; // yyyy-MM-dd
  rows: LaboraReservationRow[];
  offset: number;
  limit: number;
}): Promise<LaboraImportResult> {
  const { location, fromDate, rows } = params;
  if (!LOCATIONS.includes(location)) throw new Error('拠点の指定が正しくありません');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) throw new Error('開始日の指定が正しくありません');

  const db = getDb();
  const checkinsCol = db.collection(COLLECTIONS.CHECKINS);
  const usersCol = db.collection(COLLECTIONS.USERS);
  const source = `labora:${location}`;
  const now = new Date().toISOString();

  const target = rows.slice(params.offset, params.offset + params.limit);
  const result: LaboraImportResult = {
    total: rows.length,
    processed: params.offset + target.length,
    hasMore: params.offset + target.length < rows.length,
    created: 0, unchanged: 0, changed: 0, cancelled: 0, outOfRange: 0, ignored: 0, usersCreated: 0,
    conflicts: [], errors: [],
  };

  // ---- 事前読み込み
  const [futureSnap, usersSnap, typesSnap, memSnap, priceTable] = await Promise.all([
    checkinsCol.where('date', '>=', fromDate).get(),
    usersCol.get(),
    db.collection(COLLECTIONS.MEMBER_TYPES).get(),
    db.collection(COLLECTIONS.USER_MEMBERSHIPS).where('isActive', '==', true).get(),
    loadPriceTable(),
  ]);
  const future: CheckinDoc[] = futureSnap.docs.map((d): CheckinDoc => ({ id: d.id, ...d.data() }));
  const imported = new Map<string, CheckinDoc>();
  for (const c of future) {
    if (c.importSource === source && c.laboraReservationNo) imported.set(String(c.laboraReservationNo), c);
  }
  const users: CheckinDoc[] = usersSnap.docs
    .map((d): CheckinDoc => ({ id: d.id, ...d.data() }))
    .filter((u) => !u.deletedAt);
  const typeByCode = new Map<string, MemberTypeDoc>();
  typesSnap.docs.forEach((d) => {
    const t = { id: d.id, ...d.data() } as MemberTypeDoc;
    if (t.code) typeByCode.set(t.code, t);
  });
  const hasMembership = new Set<string>();
  memSnap.docs.forEach((d) => {
    const m = d.data();
    if (m.userId) hasMembership.add(m.userId);
    if (m.lineUserId) hasMembership.add(m.lineUserId);
  });

  const resolveUser = async (row: LaboraReservationRow): Promise<CheckinDoc> => {
    const key = `${location}:${row.customerNumber}`;
    const phone = normPhone(row.mobile || row.phone);
    const team = decodeEntities(row.teamName) || decodeEntities(row.name);
    const phonesOf = (u: CheckinDoc) => [normPhone(u.phone), normPhone(u.mobile)].filter(Boolean);

    // 1) 以前の取り込みで同じ LaBOLA 顧客として登録済み
    let user = users.find((u) => Array.isArray(u.laboraKeys) && u.laboraKeys.includes(key));
    // 2) 電話番号と団体名（表示名）が一致。電話番号だけでは別団体が同じ担当者のことがあるので使わない
    if (!user && phone) {
      user = users.find((u) => phonesOf(u).includes(phone) && normName(u.displayName) === normName(team));
    }
    // 3) 会員番号・電話番号・氏名がすべて一致（顧客CSVで取り込み済みの本人）
    if (!user && phone && row.customerNumber) {
      user = users.find(
        (u) => u.customerNumber === row.customerNumber && phonesOf(u).includes(phone) && normName(u.name) === normName(row.name),
      );
    }
    if (user) {
      if (!Array.isArray(user.laboraKeys) || !user.laboraKeys.includes(key)) {
        user.laboraKeys = [...(Array.isArray(user.laboraKeys) ? user.laboraKeys : []), key];
        await usersCol.doc(user.id).update({ laboraKeys: user.laboraKeys, updatedAt: now });
      }
      return user;
    }
    const data = {
      displayName: team,
      name: decodeEntities(row.name),
      kana: decodeEntities(row.kana),
      phone: row.phone || '',
      mobile: row.mobile || '',
      email: row.email || '',
      customerNumber: row.customerNumber || '',
      customerType: row.customerType || '',
      isImported: true,
      importSource: source,
      laboraKeys: [key],
      keepDisplayName: true,
      lineUserId: null,
      pictureUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await usersCol.add(data);
    const created: CheckinDoc = { id: ref.id, ...data };
    users.push(created);
    result.usersCreated++;
    return created;
  };

  for (const row of target) {
    const no = String(row.reservationNo || '').trim();
    try {
      if (!no) { result.ignored++; continue; }
      const date = String(row.date || '').trim().replace(/\//g, '-');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`日付の形式が読めません（${row.date}）`);
      if (date < fromDate) { result.outOfRange++; continue; }

      const existing = imported.get(no);
      const active = (row.status || '').trim() === '予約完了';

      if (!active) {
        if (existing && isActive(existing)) {
          await releaseLockFor(existing).catch((e) => console.error('releaseLockFor error:', e));
          await checkinsCol.doc(existing.id).update({ status: 'CANCELLED', cancelledAt: now, updatedAt: now });
          existing.status = 'CANCELLED';
          result.cancelled++;
        } else {
          result.ignored++;
        }
        continue;
      }

      const facilityType = facilityTypeOf(row.content);
      if (!facilityType) throw new Error(`予約内容「${row.content}」の施設が判別できません`);
      if (location === 'YABASE' && facilityType !== 'GYM') throw new Error('やばせにトレーニングルームの予約があります（拠点の選択を確認してください）');
      const start = hourOf(row.startTime);
      const duration = hourOf(row.endTime) - start;
      if (!Number.isFinite(start) || !(duration > 0)) throw new Error(`時間が読めません（${row.startTime}〜${row.endTime}）`);
      const startTime = `${String(start).padStart(2, '0')}:00`;

      const team = decodeEntities(row.teamName) || decodeEntities(row.name);
      const label = `${date} ${startTime} ${team}`;

      // ほかの予約（アプリから入った予約など）と重なっていないか
      const overlapping = future.find(
        (c) =>
          c.id !== existing?.id &&
          isActive(c) &&
          c.location === location &&
          c.facilityType === facilityType &&
          c.date === date &&
          start < hourOf(c.startTime) + Number(c.duration || 0) &&
          hourOf(c.startTime) < start + duration,
      );
      if (overlapping) {
        result.conflicts.push(label);
        continue;
      }

      if (existing && isActive(existing)) {
        const same =
          existing.date === date && existing.startTime === startTime &&
          Number(existing.duration) === duration && existing.facilityType === facilityType;
        if (same) { result.unchanged++; continue; }
        // LaBOLA 側で日時が変更された予約: 鍵を作り直す
        await releaseLockFor(existing).catch((e) => console.error('releaseLockFor error:', e));
        const patch = {
          date, startTime, duration, facilityType,
          lockState: 'PENDING', lockSeq: (Number(existing.lockSeq) || 0) + 1,
          remoteLockBookingId: null, pinCode: '', updatedAt: now,
        };
        await checkinsCol.doc(existing.id).update(patch);
        Object.assign(existing, patch);
        result.changed++;
        continue;
      }

      const user = await resolveUser(row);
      const code = memberCodeOf(row.customerType);
      const memberType = code === 'GENERAL' ? undefined : typeByCode.get(code);

      // 会員区分が付いていなければ付与（割引料金・定期扱いのため）
      if (memberType && !hasMembership.has(user.id) && !(user.lineUserId && hasMembership.has(user.lineUserId))) {
        await db.collection(COLLECTIONS.USER_MEMBERSHIPS).add({
          lineUserId: user.lineUserId || null,
          userId: user.id,
          displayName: user.displayName || team,
          memberTypeId: memberType.id,
          startDate: null,
          endDate: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        hasMembership.add(user.id);
      }

      const paidByCard = (row.paymentMethod || '').includes('クレジット');
      const price = computePrice(priceTable, location, facilityType, date, start, duration, memberType);
      const cardAmount = Number(String(row.amount || '').replace(/[^0-9]/g, '')) || 0;
      const totalPrice = paidByCard && cardAmount > 0 ? cardAmount : price.total;

      const data = {
        userId: user.id,
        location,
        facilityType,
        date,
        startTime,
        duration,
        totalPrice,
        originalPrice: paidByCard && cardAmount > 0 ? cardAmount : price.original,
        memberDiscount: paidByCard ? 0 : Math.max(0, price.original - price.total),
        memberTypeName: memberType?.name || null,
        couponCode: null,
        couponId: null,
        couponDiscount: 0,
        pinCode: '',
        status: 'PAID',
        paymentId: null,
        isInvoicePayment: !paidByCard,
        paymentMethod: paidByCard ? 'LABOLA_CARD' : 'INVOICE',
        skipRemoteLock: false,
        groupId: `labora-${location}-${row.customerNumber}`,
        recurringType: null,
        createdByAdmin: true,
        notified: true, // 1件ごとの予約完了通知は送らない（紐づけ時にまとめて案内する）
        importSource: source,
        laboraReservationNo: no,
        laboraPaymentMethod: row.paymentMethod || '',
        lockState: 'PENDING',
        pinGroup: `labora:${location}:${row.customerNumber}`,
        lockLabel: team,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await checkinsCol.add(data);
      const created: CheckinDoc = { id: ref.id, ...data };
      future.push(created);
      imported.set(no, created);
      result.created++;
    } catch (e) {
      result.errors.push(`予約番号 ${no || '(なし)'}: ${(e as Error).message}`);
    }
  }

  result.conflicts = result.conflicts.slice(0, 50);
  result.errors = result.errors.slice(0, 50);
  return result;
}

/** 取り込んだ予約の団体別まとめ（暗証番号・件数・LINE連携の有無）。管理画面の確認用 */
export async function summarizeLaboraImport(): Promise<Array<{
  userId: string; displayName: string; location: string; linked: boolean;
  count: number; firstDate: string; lastDate: string; pins: string[]; pending: number; failed: number;
}>> {
  const db = getDb();
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const snap = await db.collection(COLLECTIONS.CHECKINS).where('date', '>=', today).get();
  const list: CheckinDoc[] = snap.docs
    .map((d): CheckinDoc => ({ id: d.id, ...d.data() }))
    .filter((c) => typeof c.importSource === 'string' && c.importSource.startsWith('labora:') && isActive(c));
  const groups = new Map<string, CheckinDoc[]>();
  for (const c of list) {
    const k = `${c.userId}|${c.location}`;
    groups.set(k, [...(groups.get(k) || []), c]);
  }
  const userIds = [...new Set(list.map((c) => c.userId as string))];
  const userDocs = await Promise.all(userIds.map((id) => db.collection(COLLECTIONS.USERS).doc(id).get()));
  const userMap = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()!]));
  return [...groups.entries()]
    .map(([k, cs]) => {
      const [userId, location] = k.split('|');
      const dates = cs.map((c) => c.date as string).sort();
      const u = userMap.get(userId);
      return {
        userId,
        displayName: (u?.displayName as string) || '(名前なし)',
        location,
        linked: !!u?.lineUserId,
        count: cs.length,
        firstDate: dates[0],
        lastDate: dates[dates.length - 1],
        pins: [...new Set(cs.filter((c) => c.lockState === 'DONE' && c.pinCode).map((c) => c.pinCode as string))],
        pending: cs.filter((c) => c.lockState === 'PENDING').length,
        failed: cs.filter((c) => c.lockState === 'FAILED').length,
      };
    })
    .sort((a, b) => `${a.location}${a.displayName}`.localeCompare(`${b.location}${b.displayName}`));
}

// ---------------------------------------------------------------- LINE 紐づけ

const MOVE_BY_USER_ID = [
  COLLECTIONS.CHECKINS,
  COLLECTIONS.USER_MEMBERSHIPS,
  COLLECTIONS.EVENT_REGISTRATIONS,
  COLLECTIONS.SCHOOL_REGISTRATIONS,
  COLLECTIONS.COUPON_REDEMPTIONS,
  COLLECTIONS.REVIEWS,
];

/**
 * LINE未連携の団体（importedUserId）を、本人の LINE アカウント（lineUserDocId）に紐づける。
 * 団体側のユーザーを残し、LINE 側で作られていたユーザーの予約などは団体側へ寄せる。
 * 相手がすでに別の団体と紐づいている場合（1人が2拠点・2団体を担当）は、その団体へまとめる。
 */
export async function linkLineAccount(importedUserId: string, lineUserDocId: string): Promise<{ userId: string; notified: boolean }> {
  if (importedUserId === lineUserDocId) throw new Error('同じユーザーです');
  const db = getDb();
  const usersCol = db.collection(COLLECTIONS.USERS);
  const [impDoc, lineDoc] = await Promise.all([usersCol.doc(importedUserId).get(), usersCol.doc(lineUserDocId).get()]);
  if (!impDoc.exists || !lineDoc.exists) throw new Error('ユーザーが見つかりません');
  const imp = impDoc.data()!;
  const line = lineDoc.data()!;
  if (imp.lineUserId) throw new Error('この会員はすでに LINE と連携済みです');
  if (!line.lineUserId) throw new Error('選んだ相手は LINE アカウントではありません');
  const lineUserId: string = line.lineUserId;
  const now = new Date().toISOString();

  // 残す側（survivor）と、寄せて消す側（absorbed）
  const lineIsTeam = !!line.isImported;
  const survivorId = lineIsTeam ? lineUserDocId : importedUserId;
  const absorbedId = lineIsTeam ? importedUserId : lineUserDocId;

  for (const table of MOVE_BY_USER_ID) {
    const snap = await db.collection(table).where('userId', '==', absorbedId).get();
    for (const d of snap.docs) await d.ref.update({ userId: survivorId, updatedAt: now });
  }

  // 会員区分: 団体側（取り込み側）の区分を優先し、LINE 側に付いていた区分は外す
  const memCol = db.collection(COLLECTIONS.USER_MEMBERSHIPS);
  const [byUser, byLine] = await Promise.all([
    memCol.where('userId', '==', survivorId).where('isActive', '==', true).get(),
    memCol.where('lineUserId', '==', lineUserId).where('isActive', '==', true).get(),
  ]);
  const seen = new Map<string, Record<string, unknown>>();
  for (const d of [...byUser.docs, ...byLine.docs]) seen.set(d.id, d.data());
  const entries = [...seen.entries()];
  // 残す1件: もともと LINE と結びついていなかった（= 団体として取り込んだ）区分を優先
  const keep = entries.find(([, m]) => !m.lineUserId) ?? entries[0];
  for (const [id, m] of entries) {
    if (keep && id === keep[0]) await memCol.doc(id).update({ lineUserId, userId: survivorId, updatedAt: now });
    else if (m.isActive) await memCol.doc(id).update({ isActive: false, updatedAt: now });
  }

  if (lineIsTeam) {
    const keys = [...new Set([...(line.laboraKeys || []), ...(imp.laboraKeys || [])])];
    await usersCol.doc(survivorId).update({ laboraKeys: keys, updatedAt: now });
  } else {
    await usersCol.doc(survivorId).update({
      lineUserId,
      pictureUrl: line.pictureUrl || null,
      lineDisplayName: line.displayName || '',
      keepDisplayName: true,
      linkedAt: now,
      updatedAt: now,
    });
  }
  await usersCol.doc(absorbedId).update({
    lineUserId: null,
    deletedAt: now,
    mergedInto: survivorId,
    ...(lineIsTeam ? {} : { mergedLineUserId: lineUserId }),
    updatedAt: now,
  });

  const notified = await notifyLinked(survivorId, lineUserId, imp.displayName || imp.name || '');
  return { userId: survivorId, notified };
}

/** 紐づけの取り消し（別の人に紐づけてしまったとき用）。予約と会員区分は団体側に残る */
export async function unlinkLineAccount(userId: string): Promise<void> {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.USERS).doc(userId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error('ユーザーが見つかりません');
  const u = doc.data()!;
  if (!u.isImported) throw new Error('取り込んだ会員ではないため、連携を外せません');
  if (!u.lineUserId) throw new Error('LINE と連携していません');
  const now = new Date().toISOString();
  const mem = await db.collection(COLLECTIONS.USER_MEMBERSHIPS).where('userId', '==', userId).get();
  for (const d of mem.docs) await d.ref.update({ lineUserId: null, updatedAt: now });
  await ref.update({ lineUserId: null, pictureUrl: null, lineDisplayName: null, linkedAt: null, updatedAt: now });
}

/** 紐づけ完了を本人の LINE に案内（今後の予約件数と暗証番号） */
async function notifyLinked(userId: string, lineUserId: string, teamName: string): Promise<boolean> {
  if (!isLineConfigured()) return false;
  try {
    const db = getDb();
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const snap = await db.collection(COLLECTIONS.CHECKINS).where('userId', '==', userId).get();
    const upcoming: CheckinDoc[] = snap.docs
      .map((d): CheckinDoc => ({ id: d.id, ...d.data() }))
      .filter((c) => isActive(c) && c.date >= today)
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
    const lines = [`${teamName ? `${teamName} 様の` : ''}ご予約と LINE を連携しました。`];
    if (upcoming.length > 0) {
      const pinsOf = (list: CheckinDoc[]) => [...new Set(list.map((c) => c.pinCode as string).filter(Boolean))];
      const pins = pinsOf(upcoming);
      const locations = [...new Set(upcoming.map((c) => c.location as string))];
      const perLocation = locations.map((loc) => ({ loc, pins: pinsOf(upcoming.filter((c) => c.location === loc)) }));
      lines.push('', `今後のご予約：${upcoming.length}件（${upcoming[0].date}〜${upcoming[upcoming.length - 1].date}）`);
      if (pins.length === 0) {
        lines.push('解錠コードは準備ができ次第「マイ予約」に表示されます。');
      } else if (pins.length === 1) {
        lines.push(`解錠コード：${pins[0]}（全日程共通）`);
      } else if (perLocation.every((p) => p.pins.length === 1)) {
        // 拠点ごとに1つずつ（2拠点を利用している団体）
        for (const p of perLocation) lines.push(`解錠コード（${LOCATION_NAMES[p.loc] || p.loc}）：${p.pins[0]}`);
      } else {
        lines.push('解錠コードはご予約によって異なります。「マイ予約」で日ごとにご確認ください。');
      }
    }
    lines.push('', 'ご予約の一覧と解錠コードは、ミニアプリの「マイ予約」からいつでも確認できます。');
    await sendTextMessage(lineUserId, lines.join('\n'));
    return true;
  } catch (e) {
    console.error('notifyLinked error:', e);
    return false;
  }
}
