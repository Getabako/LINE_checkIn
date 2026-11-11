// RPA 向け 日次売上CSV。
// LINE ログイン不要の専用URL（推測不能なトークン付き）を開くだけで、指定日（既定: 前日）の
// 決済・返金の明細を CSV でダウンロードできる。トークンは管理画面で確認・再発行する。
import crypto from 'node:crypto';
import { getDb, COLLECTIONS } from './db.js';

const SETTINGS_DOC = 'salesExport';

const LOCATION_NAMES: Record<string, string> = {
  ASP: 'みんなの体育館 ASP',
  YABASE: 'みんなの体育館 やばせ',
};
const FACILITY_NAMES: Record<string, string> = {
  GYM: '体育館',
  TRAINING_PRIVATE: 'トレーニングルーム（貸切）',
  TRAINING_SHARED: 'トレーニングルーム（相席）',
};

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

/**
 * 指定日（日本時間）に発生した 決済（＋）と 返金（－）の明細CSV。
 * 請求書払い（定期）や無料予約はオンライン決済がないので含めない。
 */
export async function buildDailySalesCsv(date: string): Promise<string> {
  const db = getDb();
  // 日本時間 date の 0:00〜24:00 を UTC に
  const start = new Date(`${date}T00:00:00+09:00`).toISOString();
  const end = new Date(new Date(`${date}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();

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

  // 予約者名
  const userIds = Array.from(new Set(rows.map((r) => r.c.userId).filter(Boolean)));
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const us = await db.collection(COLLECTIONS.USERS).where('id', 'in', userIds).get();
    for (const u of us.docs) names.set(u.id, (u.data().name as string) || (u.data().displayName as string) || '');
  }

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
  const total = rows.reduce((s, r) => s + r.amount, 0);
  lines.push(['合計', '', String(total), '', '', '', '', '', '', '', '']);

  // Excel で文字化けしないよう BOM 付き
  return '﻿' + lines.map((l) => l.map(csvEscape).join(',')).join('\r\n');
}
