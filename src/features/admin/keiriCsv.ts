// 経理用CSV出力（先方の売上集計表フォーマットに合わせて生成）
// 参照: 体育館売上集計表_YYYY年M月_revXX.xlsx
//   - 一般利用明細（拠点別）
//   - 定期利用明細（拠点別・団体名グルーピング）
//   - 月次サマリー
// 自作システムのため Labora CSV → Excel の手動変換は不要。
// 予約データから直接この形式を出力する。
import { isHoliday as isJpHoliday } from '@holiday-jp/holiday_jp';
import { Checkin, LocationId } from '../../lib/api';
import { getLocationName } from '../../lib/locations';

// getCheckins が返す拡張フィールド（displayName 等）込みの型
export type KeiriCheckin = Checkin & {
  displayName?: string;
  isInvoicePayment?: boolean;
};

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// 平日 昼/夜 の境界（ASP・やばせ共通で 17:00）
const DAY_NIGHT_BOUNDARY = 17;

// 税込 → 税抜（消費税10%）
const toExcl = (taxIncluded: number): number => Math.round((taxIncluded || 0) / 1.1);

// 定期（年間契約／S-01等）の会員区分かどうか
const RECURRING_PATTERNS = ['S-01', 'S01', 'TR-00', 'TR00', 'TR-01', 'TR01', '定期'];
export const isRecurringMember = (memberTypeName?: string | null): boolean => {
  if (!memberTypeName) return false;
  const name = memberTypeName.toUpperCase();
  return RECURRING_PATTERNS.some((p) => name.includes(p.toUpperCase()));
};

// 予約内容ラベル
const facilityLabel = (facilityType: string): string => {
  switch (facilityType) {
    case 'GYM':
      return '体育館予約';
    case 'TRAINING_PRIVATE':
      return 'トレーニングルーム（貸切）予約';
    case 'TRAINING_SHARED':
      return 'トレーニングルーム（相席）予約';
    default:
      return facilityType;
  }
};

// ASP一般明細の「区分」列
const facilityCategory = (facilityType: string): string =>
  facilityType === 'GYM' ? '体育館' : 'トレーニングルーム';

// 予約ステータス → 日本語
const statusLabel = (status: string): string => {
  switch (status) {
    case 'PAID':
      return '予約完了';
    case 'CANCELLED':
      return 'キャンセル';
    case 'PENDING':
      return '未決済';
    default:
      return status;
  }
};

// 利用時間を 平昼/平夜/土/日/祝 に時間単位で振り分け（祝日は曜日より優先）
interface HourBuckets {
  weekdayDay: number; // 平昼
  weekdayNight: number; // 平夜
  sat: number; // 土
  sun: number; // 日
  holiday: number; // 祝
  total: number; // 合計
}
const splitHours = (dateStr: string, startTime: string, duration: number): HourBuckets => {
  const b: HourBuckets = { weekdayDay: 0, weekdayNight: 0, sat: 0, sun: 0, holiday: 0, total: 0 };
  if (!startTime || !duration) return b;
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  const dow = d.getDay();
  const holiday = isJpHoliday(d);
  const [hStr, mStr] = startTime.split(':');
  let cur = Number(hStr) + (Number(mStr || '0') / 60);
  let remaining = duration;
  // 1時間（または時境界）刻みで振り分け
  while (remaining > 1e-9) {
    const step = Math.min(1 - (cur - Math.floor(cur)) || 1, remaining);
    const hourOfDay = Math.floor(cur);
    if (holiday) b.holiday += step;
    else if (dow === 6) b.sat += step;
    else if (dow === 0) b.sun += step;
    else if (hourOfDay >= DAY_NIGHT_BOUNDARY) b.weekdayNight += step;
    else b.weekdayDay += step;
    cur += step;
    remaining -= step;
  }
  b.total = b.weekdayDay + b.weekdayNight + b.sat + b.sun + b.holiday;
  return b;
};

// 数値セル：0 は空欄（Excelの見た目に合わせる）
const numCell = (n: number): string | number => (n > 0 ? Math.round(n * 100) / 100 : '');

// 終了時刻を算出
const endTimeOf = (startTime: string, duration: number): string => {
  if (!startTime) return '';
  const [h, m] = startTime.split(':').map((v) => Number(v));
  const totalMin = h * 60 + (m || 0) + Math.round(duration * 60);
  const eh = Math.floor(totalMin / 60);
  const em = totalMin % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
};

const dowLabel = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  return WEEKDAY_LABELS[d.getDay()];
};
const holidayCell = (dateStr: string): string =>
  isJpHoliday(new Date(`${dateStr}T00:00:00+09:00`)) ? '祝' : '';

export interface KeiriFile {
  filename: string;
  rows: (string | number)[][];
}

type Row = (string | number)[];

// 対象期間の年月ラベル（from の月を採用）
const periodLabel = (from: string): string => {
  const [yy, mm] = from.split('-');
  return `${Number(yy)}年${Number(mm)}月`;
};

// 一般利用明細
export const buildGeneralDetail = (
  checkins: KeiriCheckin[],
  location: LocationId,
  from: string
): KeiriFile => {
  const isAsp = location === 'ASP';
  const label = periodLabel(from);
  const locName = getLocationName(location);
  const title = isAsp
    ? `${locName}　一般利用明細（体育館・トレーニングルーム）　${label}`
    : `${locName}　一般利用明細　${label}`;
  const header: Row = isAsp
    ? ['日付', '曜日', '祝日', '区分', '予約ステータス', '予約内容', '名前', '開始', '終了', '平昼(h)', '平夜(h)', '土(h)', '日(h)', '祝(h)', '合計(h)', '合計金額(税抜)', '備考']
    : ['日付', '曜日', '祝日', '予約ステータス', '予約内容', '名前', '開始', '終了', '平昼(h)', '平夜(h)', '土(h)', '日(h)', '祝(h)', '合計(h)', '合計金額(税抜)', '備考'];

  const items = checkins
    .filter((c) => c.location === location && !isRecurringMember(c.memberTypeName))
    .filter((c) => c.status === 'PAID' || c.status === 'CANCELLED')
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  const rows: Row[] = [[title], header];
  let sumExcl = 0;
  for (const c of items) {
    const paid = c.status === 'PAID';
    const buckets = paid ? splitHours(c.date, c.startTime, c.duration) : { weekdayDay: 0, weekdayNight: 0, sat: 0, sun: 0, holiday: 0, total: 0 };
    const amountExcl = paid ? toExcl(c.totalPrice) : 0;
    sumExcl += amountExcl;
    const note = c.isInvoicePayment ? '請求書払い' : '';
    const common: Row = [
      statusLabel(c.status),
      facilityLabel(c.facilityType),
      c.displayName || '',
      c.startTime || '',
      endTimeOf(c.startTime, c.duration),
      numCell(buckets.weekdayDay),
      numCell(buckets.weekdayNight),
      numCell(buckets.sat),
      numCell(buckets.sun),
      numCell(buckets.holiday),
      numCell(buckets.total),
      paid ? amountExcl : 0,
      note,
    ];
    const head: Row = isAsp
      ? [c.date, dowLabel(c.date), holidayCell(c.date), facilityCategory(c.facilityType)]
      : [c.date, dowLabel(c.date), holidayCell(c.date)];
    rows.push([...head, ...common]);
  }
  // 合計行
  const totalCols = isAsp ? 15 : 14; // 合計金額列の手前までの列数
  const totalRow: Row = new Array(totalCols).fill('');
  totalRow[0] = '合計';
  totalRow.push(sumExcl, '');
  rows.push(totalRow);

  return { filename: `${location}_一般明細_${label}.csv`, rows };
};

// 定期利用明細（団体名でグルーピング）
export const buildRecurringDetail = (
  checkins: KeiriCheckin[],
  location: LocationId,
  from: string
): KeiriFile => {
  const label = periodLabel(from);
  const locName = getLocationName(location);
  const title = `${locName}　年間定期利用明細　${label}`;
  const header: Row = ['日付', '曜日', '祝日', '団体名', '予約ステータス', '予約内容', '開始', '終了', '平昼(h)', '平夜(h)', '土(h)', '日(h)', '祝(h)', '合計(h)', '通常利用料(税抜)', '割引額(税抜)', '請求額(税抜)', '備考'];

  const items = checkins
    .filter((c) => c.location === location && isRecurringMember(c.memberTypeName))
    .filter((c) => c.status === 'PAID' || c.status === 'CANCELLED');

  // 団体名（displayName）でグループ化
  const groups = new Map<string, KeiriCheckin[]>();
  for (const c of items) {
    const g = c.displayName || '（団体名なし）';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(c);
  }

  const rows: Row[] = [[title], header];
  let grandBilled = 0;
  for (const groupName of Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'ja'))) {
    const list = groups.get(groupName)!.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    rows.push([`▶ ${groupName}`]);
    let groupBilled = 0;
    for (const c of list) {
      const paid = c.status === 'PAID';
      const buckets = paid ? splitHours(c.date, c.startTime, c.duration) : { weekdayDay: 0, weekdayNight: 0, sat: 0, sun: 0, holiday: 0, total: 0 };
      const normalExcl = paid ? toExcl(c.originalPrice ?? c.totalPrice) : 0;
      const discountExcl = paid ? toExcl((c.memberDiscount ?? 0) + (c.couponDiscount ?? 0)) : 0;
      const billedExcl = paid ? toExcl(c.totalPrice) : 0;
      groupBilled += billedExcl;
      rows.push([
        c.date,
        dowLabel(c.date),
        holidayCell(c.date),
        groupName,
        statusLabel(c.status),
        facilityLabel(c.facilityType),
        c.startTime || '',
        endTimeOf(c.startTime, c.duration),
        numCell(buckets.weekdayDay),
        numCell(buckets.weekdayNight),
        numCell(buckets.sat),
        numCell(buckets.sun),
        numCell(buckets.holiday),
        numCell(buckets.total),
        paid ? normalExcl : 0,
        paid ? discountExcl : 0,
        paid ? billedExcl : 0,
        c.isInvoicePayment ? '請求書払い' : '',
      ]);
    }
    // 団体小計
    const subtotal: Row = new Array(16).fill('');
    subtotal[3] = `${groupName} 小計`;
    subtotal.push(groupBilled, '');
    rows.push(subtotal);
    grandBilled += groupBilled;
  }
  // 総合計
  const grand: Row = new Array(16).fill('');
  grand[3] = '合計';
  grand.push(grandBilled, '');
  rows.push(grand);

  return { filename: `${location}_定期明細_${label}.csv`, rows };
};

// 月次サマリー
export const buildMonthlySummary = (checkins: KeiriCheckin[], from: string): KeiriFile => {
  const label = periodLabel(from);
  const paidOnly = checkins.filter((c) => c.status === 'PAID');
  const sumExcl = (pred: (c: KeiriCheckin) => boolean): number =>
    paidOnly.filter(pred).reduce((s, c) => s + toExcl(c.totalPrice), 0);

  const yabaseGeneral = sumExcl((c) => c.location === 'YABASE' && !isRecurringMember(c.memberTypeName));
  const yabaseRecurring = sumExcl((c) => c.location === 'YABASE' && isRecurringMember(c.memberTypeName));
  const aspGymGeneral = sumExcl((c) => c.location === 'ASP' && c.facilityType === 'GYM' && !isRecurringMember(c.memberTypeName));
  const aspTrainGeneral = sumExcl((c) => c.location === 'ASP' && c.facilityType !== 'GYM' && !isRecurringMember(c.memberTypeName));
  const aspRecurring = sumExcl((c) => c.location === 'ASP' && isRecurringMember(c.memberTypeName));

  const yabaseTotal = yabaseGeneral + yabaseRecurring;
  const aspTotal = aspGymGeneral + aspTrainGeneral + aspRecurring;
  const grand = yabaseTotal + aspTotal;

  // 自作システムでは予約日＝決済日（即時キャプチャ）のため、予約売上＝入金予定額で差異は発生しない
  const note = '予約日＝決済日（即時決済）のため差異なし';
  const rows: Row[] = [
    [`${label}　月次売上集計サマリー`],
    ['区分', '予約売上(税抜)', '入金予定額(税抜)', '差異(予定額－予約)', '差異理由'],
    ['① みんなの体育館やばせ 一般利用', yabaseGeneral, yabaseGeneral, 0, note],
    ['② みんなの体育館やばせ 年間定期利用', yabaseRecurring, yabaseRecurring, 0, note],
    ['③ みんなの体育館ASP 一般利用（体育館）', aspGymGeneral, aspGymGeneral, 0, note],
    ['④ みんなの体育館ASP 一般利用（トレーニングルーム）', aspTrainGeneral, aspTrainGeneral, 0, note],
    ['⑤ みんなの体育館ASP 年間定期利用', aspRecurring, aspRecurring, 0, note],
    ['みんなの体育館やばせ 合計', yabaseTotal, yabaseTotal, 0, ''],
    ['みんなの体育館ASP 合計', aspTotal, aspTotal, 0, ''],
    ['みんなの体育館 総合計', grand, grand, 0, ''],
    [],
    ['※ 自作システムのため Labora CSV の手動変換は不要。予約データから直接集計しています。'],
    ['※ イベント・登録料/更新料は別管理のため本表には含みません。'],
  ];
  return { filename: `月次サマリー_${label}.csv`, rows };
};
