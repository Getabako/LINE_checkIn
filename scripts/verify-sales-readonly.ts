// 本番データ（読み取りのみ）で、売上タブの数え方と RPA 用CSV の数字が一致するかを確かめる
import { getDb, COLLECTIONS } from '../server-lib/db.js';
import { summarizeSales } from '../server-lib/salesCore.js';
import { buildUsageSalesCsv, buildSalesCsv, loadOtherSales } from '../server-lib/salesExport.js';
const ranges = process.argv.slice(2).map((r) => r.split(':'));
let allOk = true;
for (const [from, to] of ranges) {
  const snap = await getDb().collection(COLLECTIONS.CHECKINS).where('date', '>=', from).where('date', '<=', to).get();
  const tab = summarizeSales(snap.docs.map((d) => d.data()), { period: 'daily' }, await loadOtherSales(from, to));
  const csv = await buildUsageSalesCsv(from, to);
  const lines = csv.replace(/^﻿/, '').split('\r\n').map((l) => l.split(','));
  const h = lines[0]; const body = lines.slice(1);
  const iD = h.indexOf('利用日'), iA = h.indexOf('金額（税込）');
  const byDay: Record<string, number> = {};
  for (const r of body) byDay[r[iD]] = (byDay[r[iD]] || 0) + Number(r[iA]);
  const days = new Set([...Object.keys(tab.sales), ...Object.keys(byDay)]);
  let ng = 0;
  for (const d of days) if ((tab.sales[d]?.total || 0) !== (byDay[d] || 0)) ng++;
  const total = body.reduce((s, r) => s + Number(r[iA]), 0);
  const ok = ng === 0 && total === tab.totalAmount && body.length === tab.totalCount;
  if (!ok) allOk = false;
  const pay = (await buildSalesCsv(from, to)).split('\r\n').length - 1;
  console.log(`${from}〜${to}: 売上タブ ${tab.totalCount}件 ${tab.totalAmount}円（うち その他の売上 ${tab.otherCount}件 ${tab.otherAmount}円） / RPA用CSV ${body.length}件 ${total}円 / 日数 ${days.size}（不一致 ${ng}日） / 合計行 ${body.some((r) => r.includes('合計')) ? 'あり' : 'なし'} / 入金明細 ${pay}行 → ${ok ? '一致' : '不一致'}`);
}
process.exit(allOk ? 0 : 1);
