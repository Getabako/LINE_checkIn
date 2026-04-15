import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const LOCATION_NAMES: Record<string, string> = {
  ASP: 'みんなの体育館 ASP',
  YABASE: 'みんなの体育館 やばせ',
};

const FACILITY_NAMES: Record<string, string> = {
  GYM: '体育館',
  TRAINING_PRIVATE: 'トレーニングルーム（貸切）',
  TRAINING_SHARED: 'トレーニングルーム（相席）',
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

export async function generateReceipt(
  checkin: CheckinData,
  user: UserData
): Promise<string> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  const drawText = (text: string, x: number, yPos: number, size: number, bold = false) => {
    page.drawText(text, {
      x,
      y: yPos,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
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
  drawText('RECEIPT', margin, y, 28, true);
  // 領収書 (ASCII representation)
  drawText('Receipt / Ryoshusho', margin, y - 30, 10);
  y -= 60;

  drawLine(y);
  y -= 25;

  // 発行日
  const issueDate = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  drawText(`Issue Date: ${issueDate}`, margin, y, 10);
  drawText(`No. ${checkin.id?.substring(0, 8) || 'N/A'}`, width - margin - 120, y, 10);
  y -= 25;

  // 宛名
  drawText(`To: ${user.displayName}`, margin, y, 12, true);
  y -= 30;

  drawLine(y);
  y -= 25;

  // 利用内容
  drawText('Details', margin, y, 14, true);
  y -= 25;

  const locationName = LOCATION_NAMES[checkin.location || ''] || checkin.location || '';
  const facilityName = FACILITY_NAMES[checkin.facilityType || ''] || checkin.facilityType || '';

  const details = [
    ['Location', locationName],
    ['Facility', facilityName],
    ['Date', checkin.date || ''],
    ['Time', `${checkin.startTime || ''} - ${Number(checkin.startTime?.split(':')[0] || 0) + (checkin.duration || 0)}:00 (${checkin.duration || 0}h)`],
  ];

  for (const [label, value] of details) {
    drawText(`${label}:`, margin + 10, y, 10);
    drawText(value, margin + 120, y, 10, true);
    y -= 20;
  }

  y -= 10;
  drawLine(y);
  y -= 25;

  // 料金内訳
  drawText('Amount', margin, y, 14, true);
  y -= 25;

  const priceLines: [string, string][] = [
    ['Subtotal', `JPY ${(checkin.originalPrice || checkin.totalPrice || 0).toLocaleString()}`],
  ];

  if (checkin.memberDiscount && checkin.memberDiscount > 0) {
    priceLines.push(['Member Discount', `-JPY ${checkin.memberDiscount.toLocaleString()}`]);
  }
  if (checkin.couponDiscount && checkin.couponDiscount > 0) {
    priceLines.push(['Coupon Discount', `-JPY ${checkin.couponDiscount.toLocaleString()}`]);
  }

  for (const [label, value] of priceLines) {
    drawText(label, margin + 10, y, 10);
    drawText(value, width - margin - 120, y, 10);
    y -= 20;
  }

  y -= 5;
  drawLine(y);
  y -= 25;

  // 合計
  drawText('Total', margin + 10, y, 14, true);
  drawText(`JPY ${(checkin.totalPrice || 0).toLocaleString()}`, width - margin - 150, y, 18, true);
  y -= 40;

  drawLine(y);
  y -= 30;

  // 発行元
  drawText('Issued by:', margin, y, 10);
  y -= 18;
  drawText('if(juku) / Minna no Taiikukan', margin, y, 10, true);
  y -= 18;
  drawText('Akita City, Akita Prefecture', margin, y, 9);
  y -= 30;

  // フッタ注記
  page.drawText('This receipt is electronically generated and valid without signature.', {
    x: margin,
    y: margin + 10,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes).toString('base64');
}
