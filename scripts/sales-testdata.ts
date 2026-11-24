// 売上集計の確認用テストデータ（2026-11-17〜11-23 の 1 週間・祝日 11/23 を含む）。
// 実際の使われ方を想定して、一般のカード決済・定期団体の請求書払い・キャンセル（返金）・未決済を混ぜてある。
//
//   確認だけ（DB に触らない）:  npx tsx scripts/sales-testdata.ts check
//   本番DBへ入れる:            DATABASE_URL=... npx tsx scripts/sales-testdata.ts seed
//   本番DBから消す:            DATABASE_URL=... npx tsx scripts/sales-testdata.ts remove
//
// 入れたデータは import_source = 'TEST_SALES_2026-11'・is_test_import = true の印が付く。
// 利用日が過去なので、空き枠や鍵には影響しない（鍵は作らない）。予約者名はすべて「【テスト】」で始まる。
import { summarizeSales, buildUsageSalesRows, toExclTax, isSalesCounted } from '../server-lib/salesCore.js';

export const SOURCE = 'TEST_SALES_2026-11';

type U = { id: string; name: string; kana: string };
export const USERS: U[] = [
  { id: 'TESTSALES_U_YAMADA', name: '【テスト】山田 太郎', kana: 'テスト ヤマダ タロウ' },
  { id: 'TESTSALES_U_SATO', name: '【テスト】佐藤 花子', kana: 'テスト サトウ ハナコ' },
  { id: 'TESTSALES_U_SUZUKI', name: '【テスト】鈴木 一郎', kana: 'テスト スズキ イチロウ' },
  { id: 'TESTSALES_U_MINIBASKE', name: '【テスト】秋田ミニバスクラブ', kana: 'テスト アキタミニバスクラブ' },
  { id: 'TESTSALES_U_VOLLEY', name: '【テスト】やばせバレー同好会', kana: 'テスト ヤバセバレードウコウカイ' },
];

type B = {
  n: number; // 連番（予約IDになる）
  user: string;
  location: 'ASP' | 'YABASE';
  facility: 'GYM' | 'TRAINING_PRIVATE' | 'TRAINING_SHARED';
  date: string;
  start: string;
  hours: number;
  price: number; // 請求額（税込）
  original?: number; // 割引前（定期のみ）
  kind: 'card' | 'invoice';
  status?: 'PAID' | 'CANCELLED' | 'PENDING';
  bookedDaysBefore: number; // 何日前に申し込んだか
  refundedDaysBefore?: number; // キャンセルした日（利用日の何日前か）
};

const S01 = 'S-01（定期）';
// 料金: ASP 体育館 平日昼2,200／平日夜・土日祝2,750、トレーニング貸切2,200、相席550／人
//       やばせ 体育館 平日昼1,650／平日夜・土日祝2,200。定期（S-01）は 1 時間あたり 275 円引き
export const BOOKINGS: B[] = [
  // 11/17（火）
  { n: 1, user: 'YAMADA', location: 'ASP', facility: 'GYM', date: '2026-11-17', start: '10:00', hours: 2, price: 4400, kind: 'card', bookedDaysBefore: 5 },
  { n: 2, user: 'SATO', location: 'YABASE', facility: 'GYM', date: '2026-11-17', start: '13:00', hours: 1, price: 1650, kind: 'card', bookedDaysBefore: 0 },
  { n: 3, user: 'MINIBASKE', location: 'ASP', facility: 'GYM', date: '2026-11-17', start: '18:00', hours: 2, price: 4950, original: 5500, kind: 'invoice', bookedDaysBefore: 30 },
  // 11/18（水）
  { n: 4, user: 'SUZUKI', location: 'ASP', facility: 'TRAINING_PRIVATE', date: '2026-11-18', start: '09:00', hours: 1, price: 2200, kind: 'card', bookedDaysBefore: 2 },
  { n: 5, user: 'VOLLEY', location: 'YABASE', facility: 'GYM', date: '2026-11-18', start: '19:00', hours: 2, price: 3850, original: 4400, kind: 'invoice', bookedDaysBefore: 30 },
  { n: 6, user: 'YAMADA', location: 'YABASE', facility: 'GYM', date: '2026-11-18', start: '15:00', hours: 2, price: 3300, kind: 'card', status: 'CANCELLED', bookedDaysBefore: 6, refundedDaysBefore: 1 },
  // 11/19（木）昼夜またぎ（16:00〜18:00 = 昼1h 2,200 + 夜1h 2,750）
  { n: 7, user: 'SATO', location: 'ASP', facility: 'GYM', date: '2026-11-19', start: '16:00', hours: 2, price: 4950, kind: 'card', bookedDaysBefore: 3 },
  { n: 8, user: 'SUZUKI', location: 'ASP', facility: 'TRAINING_SHARED', date: '2026-11-19', start: '11:00', hours: 1, price: 550, kind: 'card', bookedDaysBefore: 0 },
  { n: 9, user: 'MINIBASKE', location: 'ASP', facility: 'GYM', date: '2026-11-19', start: '18:00', hours: 2, price: 4950, original: 5500, kind: 'invoice', bookedDaysBefore: 30 },
  // 11/20（金）
  { n: 10, user: 'YAMADA', location: 'YABASE', facility: 'GYM', date: '2026-11-20', start: '18:00', hours: 3, price: 6600, kind: 'card', bookedDaysBefore: 10 },
  { n: 11, user: 'SATO', location: 'ASP', facility: 'GYM', date: '2026-11-20', start: '13:00', hours: 1, price: 2200, kind: 'card', status: 'PENDING', bookedDaysBefore: 1 },
  { n: 12, user: 'VOLLEY', location: 'YABASE', facility: 'GYM', date: '2026-11-20', start: '19:00', hours: 2, price: 3850, original: 4400, kind: 'invoice', bookedDaysBefore: 30 },
  // 11/21（土）
  { n: 13, user: 'SUZUKI', location: 'ASP', facility: 'GYM', date: '2026-11-21', start: '09:00', hours: 3, price: 8250, kind: 'card', bookedDaysBefore: 14 },
  { n: 14, user: 'YAMADA', location: 'ASP', facility: 'TRAINING_PRIVATE', date: '2026-11-21', start: '14:00', hours: 2, price: 4400, kind: 'card', bookedDaysBefore: 1 },
  { n: 15, user: 'SATO', location: 'YABASE', facility: 'GYM', date: '2026-11-21', start: '10:00', hours: 2, price: 4400, kind: 'card', bookedDaysBefore: 4 },
  { n: 16, user: 'MINIBASKE', location: 'ASP', facility: 'GYM', date: '2026-11-21', start: '13:00', hours: 2, price: 4950, original: 5500, kind: 'invoice', bookedDaysBefore: 30 },
  // 11/22（日）
  { n: 17, user: 'YAMADA', location: 'YABASE', facility: 'GYM', date: '2026-11-22', start: '09:00', hours: 2, price: 4400, kind: 'card', bookedDaysBefore: 7 },
  { n: 18, user: 'SUZUKI', location: 'ASP', facility: 'GYM', date: '2026-11-22', start: '15:00', hours: 2, price: 5500, kind: 'card', status: 'CANCELLED', bookedDaysBefore: 8, refundedDaysBefore: 3 },
  { n: 19, user: 'VOLLEY', location: 'YABASE', facility: 'GYM', date: '2026-11-22', start: '13:00', hours: 3, price: 5775, original: 6600, kind: 'invoice', bookedDaysBefore: 30 },
  // 11/23（月・祝 勤労感謝の日）祝日は土日料金
  { n: 20, user: 'SATO', location: 'ASP', facility: 'GYM', date: '2026-11-23', start: '10:00', hours: 2, price: 5500, kind: 'card', bookedDaysBefore: 2 },
  { n: 21, user: 'SUZUKI', location: 'YABASE', facility: 'GYM', date: '2026-11-23', start: '14:00', hours: 1, price: 2200, kind: 'card', bookedDaysBefore: 0 },
  { n: 22, user: 'YAMADA', location: 'ASP', facility: 'TRAINING_SHARED', date: '2026-11-23', start: '16:00', hours: 1, price: 550, kind: 'card', bookedDaysBefore: 1 },
];

const iso = (date: string, hhmm: string, minusDays = 0): string =>
  new Date(new Date(`${date}T${hhmm}:00+09:00`).getTime() - minusDays * 86400000).toISOString();

/** DB に入れる形（アプリの予約データと同じ項目名） */
export function toCheckins(): (Record<string, any> & { id: string })[] {
  return BOOKINGS.map((b) => {
    const id = `TESTSALES_${String(b.n).padStart(3, '0')}`;
    const createdAt = iso(b.date, '09:30', b.bookedDaysBefore || 0.02);
    const c: Record<string, any> & { id: string } = {
      id,
      userId: `TESTSALES_U_${b.user}`,
      location: b.location,
      facilityType: b.facility,
      date: b.date,
      startTime: b.start,
      duration: b.hours,
      totalPrice: b.price,
      originalPrice: b.original ?? b.price,
      memberDiscount: b.original ? b.original - b.price : 0,
      couponDiscount: 0,
      memberTypeName: b.kind === 'invoice' ? S01 : null,
      paymentId: b.kind === 'card' ? `cs_test_TESTDATA_${String(b.n).padStart(3, '0')}` : null,
      paymentMethod: b.kind === 'invoice' ? 'INVOICE' : null,
      isInvoicePayment: b.kind === 'invoice',
      createdByAdmin: b.kind === 'invoice',
      skipRemoteLock: true, // 鍵は作らない
      notified: true, // 通知は送らない
      status: b.status || 'PAID',
      isTestImport: true,
      importSource: SOURCE,
      createdAt,
      updatedAt: createdAt,
    };
    if (b.status === 'CANCELLED' && b.refundedDaysBefore != null) {
      c.refundAmount = b.price;
      c.refundedAt = iso(b.date, '11:00', b.refundedDaysBefore);
      c.refundId = `re_test_TESTDATA_${String(b.n).padStart(3, '0')}`;
      c.updatedAt = c.refundedAt;
    }
    return c;
  });
}

/** 売上タブの数字と RPA 用CSVの数字が、日ごと・期間合計とも一致するかを確かめる */
function check(): boolean {
  const checkins = toCheckins();
  const names = new Map(USERS.map((u) => [u.id, u.name]));
  const tab = summarizeSales(checkins, { period: 'daily' });
  const rows = buildUsageSalesRows(checkins, names);
  const [header, ...body] = rows;
  const iDate = header.indexOf('利用日');
  const iIncl = header.indexOf('金額（税込）');
  const iExcl = header.indexOf('金額（税抜）');
  const csvByDay: Record<string, { count: number; total: number; excl: number }> = {};
  for (const r of body) {
    const d = (csvByDay[r[iDate]] ||= { count: 0, total: 0, excl: 0 });
    d.count++;
    d.total += Number(r[iIncl]);
    d.excl += Number(r[iExcl]);
  }
  let ok = true;
  console.log('利用日       売上タブ(件/税込)   RPA用CSV(件/税込/税抜)   一致');
  for (const day of Array.from(new Set([...Object.keys(tab.sales), ...Object.keys(csvByDay)])).sort()) {
    const a = tab.sales[day] || { count: 0, total: 0 };
    const b = csvByDay[day] || { count: 0, total: 0, excl: 0 };
    const same = a.count === b.count && a.total === b.total;
    if (!same) ok = false;
    console.log(`${day}   ${String(a.count).padStart(2)}件 ${String(a.total).padStart(7)}円   ${String(b.count).padStart(2)}件 ${String(b.total).padStart(7)}円 ${String(b.excl).padStart(7)}円   ${same ? 'OK' : 'NG'}`);
  }
  const csvTotal = body.reduce((s, r) => s + Number(r[iIncl]), 0);
  const csvExcl = body.reduce((s, r) => s + Number(r[iExcl]), 0);
  const expectExcl = checkins.filter(isSalesCounted).reduce((s, c) => s + toExclTax(c.totalPrice), 0);
  console.log(`期間合計     ${tab.totalCount}件 ${tab.totalAmount}円   ${body.length}件 ${csvTotal}円 ${csvExcl}円`);
  if (tab.totalCount !== body.length || tab.totalAmount !== csvTotal || csvExcl !== expectExcl) ok = false;
  const hasTotalRow = body.some((r) => r.some((v) => v === '合計'));
  const excluded = checkins.filter((c) => !isSalesCounted(c)).map((c) => c.id);
  const leaked = body.filter((r) => excluded.includes(r[r.length - 1]));
  console.log(`合計行: ${hasTotalRow ? 'あり(NG)' : 'なし'} ／ キャンセル・未決済 ${excluded.length}件のうちCSVに出た件数: ${leaked.length}`);
  if (hasTotalRow || leaked.length) ok = false;
  console.log(ok ? '結果: すべて一致' : '結果: 不一致あり');
  return ok;
}

async function main() {
  const mode = process.argv[2] || 'check';
  if (mode === 'check') {
    process.exit(check() ? 0 : 1);
  }
  const { getDb, COLLECTIONS } = await import('../server-lib/db.js');
  const db = getDb();
  const now = new Date().toISOString();
  if (mode === 'seed') {
    if (!check()) throw new Error('確認に失敗したので入れません');
    for (const u of USERS) {
      await db.collection(COLLECTIONS.USERS).doc(u.id).set({
        displayName: u.name, name: u.name, kana: u.kana,
        isImported: true, importSource: SOURCE, createdAt: now, updatedAt: now,
      });
    }
    for (const c of toCheckins()) {
      const { id, ...data } = c;
      await db.collection(COLLECTIONS.CHECKINS).doc(id).set(data);
    }
    console.log(`入れました: 予約 ${BOOKINGS.length} 件・利用者 ${USERS.length} 件（印: ${SOURCE}）`);
  } else if (mode === 'remove') {
    const cs = await db.collection(COLLECTIONS.CHECKINS).where('importSource', '==', SOURCE).get();
    for (const d of cs.docs) if (d.id.startsWith('TESTSALES_')) await d.ref.delete();
    const us = await db.collection(COLLECTIONS.USERS).where('importSource', '==', SOURCE).get();
    for (const d of us.docs) if (d.id.startsWith('TESTSALES_U_')) await d.ref.delete();
    console.log(`消しました: 予約 ${cs.docs.length} 件・利用者 ${us.docs.length} 件`);
  } else {
    throw new Error('check / seed / remove のどれかを指定してください');
  }
  process.exit(0);
}

if (process.argv[1]?.endsWith("sales-testdata.ts")) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
