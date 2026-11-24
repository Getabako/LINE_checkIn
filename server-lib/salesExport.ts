// RPA 向け 日次売上CSV。
// LINE ログイン不要の専用URL（推測不能なトークン付き）を開くだけで、指定日（既定: 前日）の
// 売上明細を CSV でダウンロードできる。トークンは管理画面で確認・再発行する。
//
// 数え方は 2 通り:
//   既定（利用日）   … 利用日がその日の予約を数える。管理画面の売上タブ（日別）と同じ数字になる
//   basis=payment … お金が動いた日で数える（オンライン決済の入金と返金の明細）。入金の突き合わせ用
import crypto from 'node:crypto';
import { getDb, COLLECTIONS } from './db.js';
import { buildUsageSalesRows, LOCATION_NAMES, FACILITY_NAMES } from './salesCore.js';

const SETTINGS_DOC = 'salesExport';

export async function getSalesExportToken(): Promise<string> {
  const db = getDb();
  const doc = await db.collection('settings').doc(SETTINGS_DOC).get();
  const token = doc.exists ? (doc.data()?.token as string | undefined) : undefined;
  if (token) return token;
  return regenerateSalesExportToken();
}

export async function regenerateSalesExportToken(): Promise<string> {
  const token = crypto.randomBytes(24).toString('hex');
  await getDb()
    .collection('settings')
    .doc(SETTINGS_DOC)
    .set({ token, updatedAt: new Date().toISOString() }, { merge: false });
  return token;
}

/** 定数時間比較でトークン検証 */
export async function verifySalesExportToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const doc = await getDb().collection('settings').doc(SETTINGS_DOC).get();
  const saved = doc.exists ? (doc.data()?.token as string | undefined) : undefined;
  if (!saved) return false;
  const a = Buffer.from(saved);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** 日本時間の「昨日」を YYYY-MM-DD で */
export function yesterdayJst(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** ISO(UTC) → 日本時間 "YYYY-MM-DD HH:mm" */
function toJst(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 期間指定の上限（日数）。RPA の設定ミスで全期間を引かないように */
export const SALES_CSV_MAX_DAYS = 366;

/** 予約者名（会員の氏名。無ければ LINE の表示名） */
async function loadUserNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return names;
  const us = await getDb().collection(COLLECTIONS.USERS).where('id', 'in', ids).get();
  for (const u of us.docs) names.set(u.id, (u.data().name as string) || (u.data().displayName as string) || '');
  return names;
}

// Excel で文字化けしないよう BOM 付き
const toCsv = (lines: (string | number)[][]): string =>
  '\uFEFF' + lines.map((l) => l.map(csvEscape).join(',')).join('\r\n');

/**
 * 利用日で数える売上CSV（既定）。指定期間（両端の日を含む）に利用日がある予約のうち、
 * 売上に数えるもの（予約完了）だけを 1 行ずつ出す。請求書払いの定期利用も含む。合計行は付けない。
 * 管理画面の売上タブと同じ決まり（salesCore）で数えるので、同じ日・同じ期間なら金額が一致する。
 */
export async function buildUsageSalesCsv(from: string, to: string): Promise<string> {
  const snap = await getDb()
    .collection(COLLECTIONS.CHECKINS)
    .where('date', '>=', from)
    .where('date', '<=', to)
    .get();
  const checkins = snap.docs.map((d) => ({ ...d.data(), id: d.id })) as (Record<string, any> & { id: string })[];
  const names = await loadUserNames(checkins.map((c) => c.userId));
  return toCsv(buildUsageSalesRows(checkins, names));
}

/**
 * お金が動いた日で数える明細CSV（basis=payment）。
 * 指定期間（日本時間・両端の日を含む）に発生した 決済（＋）と 返金（－）を出す。合計行は付けない。
 * 請求書払い（定期）や無料予約はオンライン決済がないので含めない。
 */
export async function buildSalesCsv(from: string, to: string): Promise<string> {
  const db = getDb();
  // 日本時間 from の 0:00 〜 to の 24:00 を UTC に
  const start = new Date(`${from}T00:00:00+09:00`).toISOString();
  const end = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();

  // 決済: 申込日時が対象日のもの（即時決済のため申込日＝決済日）
  const createdSnap = await db
    .collection(COLLECTIONS.CHECKINS)
    .where('createdAt', '>=', start)
    .where('createdAt', '<', end)
    .get();
  const refundSnap = await db
    .collection(COLLECTIONS.CHECKINS)
    .where('refundedAt', '>=', start)
    .where('refundedAt', '<', end)
    .get();

  type Row = { at: string; kind: string; c: Record<string, any>; id: string; amount: number };
  const rows: Row[] = [];
  const isOnlinePaid = (c: Record<string, any>) =>
    typeof c.paymentId === 'string' && c.paymentId.startsWith('cs_') && (c.status === 'PAID' || c.status === 'USED' || c.status === 'CANCELLED');

  for (const d of createdSnap.docs) {
    const c = d.data();
    if (!isOnlinePaid(c)) continue;
    rows.push({ at: c.createdAt, kind: '決済', c, id: d.id, amount: Number(c.totalPrice) || 0 });
  }
  for (const d of refundSnap.docs) {
    const c = d.data();
    rows.push({ at: c.refundedAt, kind: '返金', c, id: d.id, amount: -(Number(c.refundAmount) || 0) });
  }
  rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const names = await loadUserNames(rows.map((r) => r.c.userId));

  const header = ['日時', '区分', '金額（税込）', '拠点', '施設', '利用日', '開始時刻', '利用時間', '予約者', '会員区分', '予約ID'];
  const lines = [header];
  for (const r of rows) {
    lines.push([
      toJst(r.at),
      r.kind,
      String(r.amount),
      LOCATION_NAMES[r.c.location] || r.c.location || '',
      FACILITY_NAMES[r.c.facilityType] || r.c.facilityType || '',
      r.c.date || '',
      r.c.startTime || '',
      r.c.duration ? `${r.c.duration}時間` : '',
      names.get(r.c.userId) || '',
      r.c.memberTypeName || '一般',
      r.id,
    ]);
  }
  return toCsv(lines);
}
