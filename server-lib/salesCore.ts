// 売上の数え方の決まりを 1 か所にまとめたもの（DB には触らない）。
// 管理画面の「売上」タブ（日別・月別）と、RPA 用の売上CSV は、必ずここを通して同じ予約を同じ金額で数える。
// どちらか片方だけ条件を変えると数字が合わなくなるので、条件を足すときはこのファイルを直す。

export type SalesCheckin = Record<string, any>;

/** 売上に数える予約か。予約完了（PAID）だけを数え、キャンセル・未決済は数えない */
export const isSalesCounted = (c: SalesCheckin): boolean => c.status === 'PAID';

/** 税込 → 税抜（消費税10%・1件ごとに四捨五入）。経理用CSVと同じ計算 */
export const toExclTax = (taxIncluded: unknown): number => Math.round((Number(taxIncluded) || 0) / 1.1);

/** 支払方法の表示名 */
export const paymentLabel = (c: SalesCheckin): string => {
  if (c.isInvoicePayment || c.paymentMethod === 'INVOICE') return '請求書払い';
  if (typeof c.paymentId === 'string' && c.paymentId.startsWith('cs_')) return 'オンライン決済';
  if (!(Number(c.totalPrice) > 0)) return '無料';
  return '管理者登録';
};

export interface SalesBucket {
  count: number;
  total: number;
}

/**
 * 施設予約以外の売上（イベント参加費・登録料・更新料・月会費など）。
 * 本システムでは決済していないので、管理画面の売上タブでスタッフが入力する。
 * 入力した日付（date）の売上として、売上タブ・経理用CSV・RPA 用CSV の全部に同じ金額で出す。
 */
export interface OtherSale {
  id: string;
  date: string; // 計上日 YYYY-MM-DD
  location: string; // ASP / YABASE
  category: string; // OTHER_SALE_CATEGORIES のキー
  amount: number; // 税込
  payMethod?: string; // 現金 / 振込 / その他
  memo?: string;
}

export const OTHER_SALE_CATEGORIES: Record<string, string> = {
  EVENT_FEE: 'イベント参加費',
  REGISTRATION_FEE: '登録料',
  RENEWAL_FEE: '更新料',
  MONTHLY_FEE: '月会費',
  OTHER: 'その他',
};
export const OTHER_SALE_PAY_METHODS = ['現金', '振込', 'その他'];
export const otherSaleCategoryName = (key: string): string => OTHER_SALE_CATEGORIES[key] || key || 'その他';

/**
 * 売上タブの集計。利用日で数える。
 * groupBy: 'location' = 拠点別 / 'facility' = 拠点×施設別 / それ以外は period（'monthly' = 月別、その他 = 日別）
 */
export function summarizeSales(
  checkins: SalesCheckin[],
  opts: { period?: string; groupBy?: string } = {},
  otherSales: OtherSale[] = []
): {
  sales: Record<string, SalesBucket>;
  totalCount: number;
  totalAmount: number;
  otherCount: number;
  otherAmount: number;
} {
  const counted = checkins.filter(isSalesCounted);
  const sales: Record<string, SalesBucket> = {};
  for (const c of counted) {
    let key: string;
    if (opts.groupBy === 'location') key = c.location || 'UNKNOWN';
    else if (opts.groupBy === 'facility') key = `${c.location}_${c.facilityType}`;
    else if (opts.period === 'monthly') key = (c.date as string | undefined)?.substring(0, 7) || 'UNKNOWN';
    else key = c.date || 'UNKNOWN';
    if (!sales[key]) sales[key] = { count: 0, total: 0 };
    sales[key].count++;
    sales[key].total += Number(c.totalPrice) || 0;
  }
  // その他の売上（イベント参加費など）も同じ区切りに足す
  let otherAmount = 0;
  for (const o of otherSales) {
    let key: string;
    if (opts.groupBy === 'location') key = o.location || 'UNKNOWN';
    else if (opts.groupBy === 'facility') key = `${o.location}_OTHER`;
    else if (opts.period === 'monthly') key = (o.date || '').substring(0, 7) || 'UNKNOWN';
    else key = o.date || 'UNKNOWN';
    if (!sales[key]) sales[key] = { count: 0, total: 0 };
    sales[key].count++;
    sales[key].total += Number(o.amount) || 0;
    otherAmount += Number(o.amount) || 0;
  }
  return {
    sales,
    totalCount: counted.length + otherSales.length,
    totalAmount: counted.reduce((s, c) => s + (Number(c.totalPrice) || 0), 0) + otherAmount,
    otherCount: otherSales.length,
    otherAmount,
  };
}

export const LOCATION_NAMES: Record<string, string> = {
  ASP: 'みんなの体育館 ASP',
  YABASE: 'みんなの体育館 やばせ',
};
export const FACILITY_NAMES: Record<string, string> = {
  GYM: '体育館',
  TRAINING_PRIVATE: 'トレーニングルーム（貸切）',
  TRAINING_SHARED: 'トレーニングルーム（相席）',
};

export const USAGE_SALES_HEADER = [
  '利用日',
  '拠点',
  '売上種別',
  '施設',
  '開始時刻',
  '利用時間',
  '予約者',
  '会員区分',
  '支払方法',
  '金額（税込）',
  '金額（税抜）',
  '予約ID',
];

/**
 * RPA 用の売上CSV（利用日で数える版）の行。見出し行を含み、合計行は付けない。
 * 入っているのは売上に数えるものだけなので、RPA 側で行を除外する必要はない。
 * 「売上種別」は 施設利用（予約）か、その他の売上の種別（イベント参加費・登録料・更新料・月会費・その他）。
 * その他の売上は「利用日」に計上日、「予約者」にメモが入り、施設・開始時刻・利用時間・会員区分は空。
 * 同じ期間の 金額（税込）の合計 ＝ 売上タブの合計、同じ日の合計 ＝ 売上タブの日別の金額。
 */
export function buildUsageSalesRows(
  checkins: (SalesCheckin & { id: string })[],
  names: Map<string, string> = new Map(),
  otherSales: OtherSale[] = []
): string[][] {
  const rows = checkins
    .filter(isSalesCounted)
    .sort((a, b) =>
      `${a.date}|${a.location}|${a.startTime}|${a.id}`.localeCompare(`${b.date}|${b.location}|${b.startTime}|${b.id}`)
    );
  const body: string[][] = [];
  for (const c of rows) {
    body.push([
      c.date || '',
      LOCATION_NAMES[c.location] || c.location || '',
      '施設利用',
      FACILITY_NAMES[c.facilityType] || c.facilityType || '',
      c.startTime || '',
      c.duration ? `${c.duration}時間` : '',
      names.get(c.userId) || c.displayName || '',
      c.memberTypeName || '一般',
      paymentLabel(c),
      String(Number(c.totalPrice) || 0),
      String(toExclTax(c.totalPrice)),
      c.id,
    ]);
  }
  const others = [...otherSales].sort((a, b) =>
    `${a.date}|${a.location}|${a.category}|${a.id}`.localeCompare(`${b.date}|${b.location}|${b.category}|${b.id}`)
  );
  for (const o of others) {
    body.push([
      o.date || '',
      LOCATION_NAMES[o.location] || o.location || '',
      otherSaleCategoryName(o.category),
      '',
      '',
      '',
      o.memo || '',
      '',
      o.payMethod || '',
      String(Number(o.amount) || 0),
      String(toExclTax(o.amount)),
      o.id,
    ]);
  }
  // 日付順（同じ日は 施設利用 → その他の売上）。sort は安定なので上の並びを保つ
  body.sort((a, b) => a[0].localeCompare(b[0]));
  return [USAGE_SALES_HEADER, ...body];
}
