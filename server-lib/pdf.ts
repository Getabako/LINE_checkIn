import { PDFDocument, rgb, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const LOCATION_NAMES: Record<string, string> = {
  ASP: 'みんなの体育館 ASP',
  YABASE: 'みんなの体育館 やばせ',
};

const FACILITY_NAMES: Record<string, string> = {
  GYM: '体育館',
  TRAINING_PRIVATE: 'トレーニングルーム（貸切）',
  TRAINING_SHARED: 'トレーニングルーム（相席）',
};

const LOCATION_ADDRESSES: Record<string, string> = {
  ASP: '秋田県秋田市八橋大畑1丁目3-20',
  YABASE: '秋田県秋田市八橋南2丁目8-2',
};

interface CheckinData {
  id: string;
  location?: string;
  facilityType?: string;
  date?: string;
  startTime?: string;
  duration?: number;
  totalPrice?: number;
  originalPrice?: number;
  memberDiscount?: number;
  couponDiscount?: number;
  createdAt?: string;
}

interface UserData {
  displayName: string;
}

// 日本語フォントを読み込む（Vercel/ローカル両対応で複数パスを試行）
function loadJapaneseFont(): Buffer {
  const candidates = [
    path.join(process.cwd(), 'server-lib/fonts/NotoSansJP-Regular.ttf'),
    fileURLToPath(new URL('./fonts/NotoSansJP-Regular.ttf', import.meta.url)),
  ];
  for (const p of candidates) {
    try {
      return readFileSync(p);
    } catch {
      // 次の候補へ
    }
  }
  throw new Error('Japanese font file not found');
}

export async function generateReceipt(
  checkin: CheckinData,
  user: UserData,
  recipientName?: string
): Promise<string> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = loadJapaneseFont();
  // 注意: subset:true は pdf-lib の CJK サブセット不具合で文字が欠落するため、
  // フォント全体を埋め込む（日本語が確実にレンダリングされる）
  const font = await doc.embedFont(fontBytes, { subset: false });

  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  const ink = rgb(0.1, 0.1, 0.1);
  const sub = rgb(0.45, 0.45, 0.45);

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    size: number,
    color = ink
  ) => {
    page.drawText(text, { x, y: yPos, size, font, color });
  };

  // 右寄せ描画（金額用）
  const drawRight = (
    text: string,
    rightX: number,
    yPos: number,
    size: number,
    color = ink
  ) => {
    const w = (font as PDFFont).widthOfTextAtSize(text, size);
    page.drawText(text, { x: rightX - w, y: yPos, size, font, color });
  };

  const drawLine = (yPos: number) => {
    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: width - margin, y: yPos },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
  };

  // タイトル
  drawText('領 収 書', margin, y, 26);
  y -= 38;
  drawLine(y);
  y -= 24;

  // 発行日・領収書番号
  const issueDate = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  drawText(`発行日: ${issueDate}`, margin, y, 10, sub);
  drawRight(`No. ${checkin.id?.substring(0, 8) || 'N/A'}`, width - margin, y, 10, sub);
  y -= 30;

  // 宛名（編集された宛名を優先、無ければ利用者名）
  const recipient = (recipientName && recipientName.trim()) || user.displayName || '利用者';
  drawText(`${recipient}　様`, margin, y, 16);
  y -= 28;

  // 金額（大きく強調）
  const total = checkin.totalPrice || 0;
  drawText('金額', margin, y, 11, sub);
  drawText(`¥${total.toLocaleString()}-`, margin + 50, y - 4, 22);
  y -= 24;
  drawText('（消費税込）', margin + 50, y, 9, sub);
  y -= 22;
  // 但し書き：「利用施設名（利用年月日）ご利用分として」
  const tadashiLocation = LOCATION_NAMES[checkin.location || ''] || checkin.location || '';
  const tadashiFacility = FACILITY_NAMES[checkin.facilityType || ''] || checkin.facilityType || '';
  const tadashiFacilityFull = `${tadashiLocation} ${tadashiFacility}`.trim();
  const tadashiDate = checkin.date
    ? (() => {
        const [yy, mm, dd] = String(checkin.date).split('-');
        return `${Number(yy)}年${Number(mm)}月${Number(dd)}日`;
      })()
    : '';
  drawText(`但し、${tadashiFacilityFull}（${tadashiDate}）ご利用分として`, margin, y, 11);
  y -= 24;
  drawLine(y);
  y -= 26;

  // 利用内容
  drawText('ご利用内容', margin, y, 13);
  y -= 24;

  const locationName = LOCATION_NAMES[checkin.location || ''] || checkin.location || '';
  const facilityName = FACILITY_NAMES[checkin.facilityType || ''] || checkin.facilityType || '';
  const startHour = Number(checkin.startTime?.split(':')[0] || 0);
  const endHour = startHour + (checkin.duration || 0);
  const timeStr = `${checkin.startTime || ''} 〜 ${String(endHour).padStart(2, '0')}:00（${checkin.duration || 0}時間）`;

  const details: [string, string][] = [
    ['拠点', locationName],
    ['施設', facilityName],
    ['利用日', checkin.date || ''],
    ['利用時間', timeStr],
  ];

  for (const [label, value] of details) {
    drawText(label, margin + 10, y, 10, sub);
    drawText(value, margin + 110, y, 10);
    y -= 20;
  }

  y -= 10;
  drawLine(y);
  y -= 26;

  // 料金内訳
  drawText('料金内訳', margin, y, 13);
  y -= 24;

  const priceLines: [string, string][] = [
    ['施設利用料', `¥${(checkin.originalPrice || checkin.totalPrice || 0).toLocaleString()}`],
  ];
  if (checkin.memberDiscount && checkin.memberDiscount > 0) {
    priceLines.push(['会員割引', `-¥${checkin.memberDiscount.toLocaleString()}`]);
  }
  if (checkin.couponDiscount && checkin.couponDiscount > 0) {
    priceLines.push(['クーポン割引', `-¥${checkin.couponDiscount.toLocaleString()}`]);
  }

  for (const [label, value] of priceLines) {
    drawText(label, margin + 10, y, 10, sub);
    drawRight(value, width - margin, y, 10);
    y -= 20;
  }

  y -= 5;
  drawLine(y);
  y -= 26;

  // 合計
  drawText('合計', margin + 10, y, 14);
  drawRight(`¥${total.toLocaleString()}`, width - margin, y, 18);
  y -= 44;

  drawLine(y);
  y -= 28;

  // 発行元（運営会社）
  const issuerAddress = LOCATION_ADDRESSES[checkin.location || ''] || '秋田県秋田市';
  drawText('発行元', margin, y, 10, sub);
  y -= 19;
  drawText('株式会社Local Power', margin, y, 12);
  y -= 17;
  drawText('代表取締役　寺田 耕也', margin, y, 9, sub);
  y -= 15;
  drawText(`${locationName}　${issuerAddress}`, margin, y, 9, sub);

  // フッタ注記
  drawText(
    'この領収書は電子的に発行されており、署名・押印がなくても有効です。',
    margin,
    margin + 10,
    8,
    sub
  );

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes).toString('base64');
}
