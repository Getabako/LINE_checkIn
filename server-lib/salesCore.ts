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
 * 売上タブの集計。利用日で数える。
 * groupBy: 'location' = 拠点別 / 'facility' = 拠点×施設別 / それ以外は period（'monthly' = 月別、その他 = 日別）
 */
export function summarizeSales(
  checkins: SalesCheckin[],
  opts: { period?: string; groupBy?: string } = {}
): { sales: Record<string, SalesBucket>; totalCount: number; totalAmount: number } {
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
  return {
    sales,
    totalCount: counted.length,
    totalAmount: counted.reduce((s, c) => s + (Number(c.totalPrice) || 0), 0),
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
 * 入っているのは売上に数える予約だけなので、RPA 側で行を除外する必要はない。
 * 同じ期間の 金額（税込）の合計 ＝ 売上タブの合計、同じ日の合計 ＝ 売上タブの日別の金額。
 */
export function buildUsageSalesRows(
  checkins: (SalesCheckin & { id: string })[],
  names: Map<string, string> = new Map()
): string[][] {
  const rows = checkins
    .filter(isSalesCounted)
    .sort((a, b) =>
      `${a.date}|${a.location}|${a.startTime}|${a.id}`.localeCompare(`${b.date}|${b.location}|${b.startTime}|${b.id}`)
    );
  const lines: string[][] = [USAGE_SALES_HEADER];
  for (const c of rows) {
    lines.push([
      c.date || '',
      LOCATION_NAMES[c.location] || c.location || '',
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
  return lines;
}
