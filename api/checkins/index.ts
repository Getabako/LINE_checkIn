import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 料金表
const PRICE_TABLE = {
  GYM: {
    WEEKDAY: { DAYTIME: 2750, EVENING: 2200 },
    WEEKEND: { DAYTIME: 2750, EVENING: 2750 },
  },
  TRAINING: {
    WEEKDAY: { ALLDAY: 2200 },
    WEEKEND: { ALLDAY: 2200 },
  },
} as const;

// 4桁暗証番号を生成
function generatePinCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// 曜日判定
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// 時間帯判定
function getTimeSlot(hour: number): 'DAYTIME' | 'EVENING' {
  return hour < 17 ? 'DAYTIME' : 'EVENING';
}

// 料金計算
function calculatePrice(
  facilityType: 'GYM' | 'TRAINING',
  date: Date,
  startTime: string,
  duration: number
): number {
  const dayType = isWeekend(date) ? 'WEEKEND' : 'WEEKDAY';
  const startHour = parseInt(startTime.split(':')[0], 10);

  let totalPrice = 0;

  for (let i = 0; i < duration; i++) {
    const currentHour = startHour + i;
    let price: number;

    if (facilityType === 'TRAINING') {
      price = PRICE_TABLE.TRAINING[dayType].ALLDAY;
    } else {
      const timeSlot = getTimeSlot(currentHour);
      price = PRICE_TABLE.GYM[dayType][timeSlot];
    }

    totalPrice += price;
  }

  return totalPrice;
}

interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

// LINEアクセストークンからユーザー情報を取得
async function verifyLiffToken(authHeader: string | undefined): Promise<LiffProfile | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const accessToken = authHeader.substring(7);

  // 開発環境のみモックトークンを許可
  if (process.env.NODE_ENV !== 'production' && accessToken === 'mock-access-token-for-development') {
    return { userId: 'U_dev_user_12345', displayName: '開発ユーザー' };
  }

  try {
    const response = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return null;  // 認証失敗時はnullを返す（フォールバックしない）
    }

    return response.json();
  } catch {
    return null;  // 認証失敗時はnullを返す（フォールバックしない）
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // LIFF トークン検証
    const profile = await verifyLiffToken(req.headers.authorization);
    if (!profile) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ユーザーを取得または作成
    let user = await prisma.user.findUnique({
      where: { lineUserId: profile.userId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          lineUserId: profile.userId,
          displayName: profile.displayName,
        },
      });
    }

    // GET: チェックイン一覧取得
    if (req.method === 'GET') {
      const checkins = await prisma.checkin.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json(checkins);
    }

    // POST: 新規チェックイン作成
    if (req.method === 'POST') {
      const { facilityType, date, startTime, duration } = req.body;

      // バリデーション
      if (!facilityType || !date || !startTime || !duration) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!['GYM', 'TRAINING'].includes(facilityType)) {
        return res.status(400).json({ error: 'Invalid facility type' });
      }

      const parsedDate = new Date(date);
      const totalPrice = calculatePrice(facilityType, parsedDate, startTime, duration);

      // 決済スキップモード: SKIP_PAYMENT=true または LINE_PAY_CHANNEL_ID未設定の場合
      const skipPayment = process.env.SKIP_PAYMENT === 'true' || !process.env.LINE_PAY_CHANNEL_ID;

      const pinCode = skipPayment ? generatePinCode() : null;
      const status = skipPayment ? 'PAID' : 'PENDING';

      const checkin = await prisma.checkin.create({
        data: {
          userId: user.id,
          facilityType,
          date: parsedDate,
          startTime,
          duration,
          totalPrice,
          pinCode,
          status,
        },
      });

      // LINE Pay決済URLを返す（決済スキップモードでない場合）
      let paymentUrl: string | null = null;

      if (!skipPayment && process.env.LINE_PAY_CHANNEL_ID) {
        // LINE Pay Request API を呼び出す
        const linePayResponse = await requestLinePay({
          checkinId: checkin.id,
          amount: totalPrice,
          productName: `${facilityType === 'GYM' ? '体育館' : 'トレーニングジム'} ${duration}時間利用`,
        });
        paymentUrl = linePayResponse.paymentUrl;

        // 決済IDを保存
        await prisma.checkin.update({
          where: { id: checkin.id },
          data: { paymentId: linePayResponse.transactionId },
        });
      }

      return res.status(201).json({
        checkin,
        paymentUrl,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// LINE Pay決済リクエスト
async function requestLinePay(params: {
  checkinId: string;
  amount: number;
  productName: string;
}) {
  const channelId = process.env.LINE_PAY_CHANNEL_ID!;
  const channelSecret = process.env.LINE_PAY_CHANNEL_SECRET!;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://your-app.vercel.app';
  const isSandbox = process.env.LINE_PAY_SANDBOX === 'true';

  const apiUrl = isSandbox
    ? 'https://sandbox-api-pay.line.me/v3/payments/request'
    : 'https://api-pay.line.me/v3/payments/request';

  const body = {
    amount: params.amount,
    currency: 'JPY',
    orderId: params.checkinId,
    packages: [
      {
        id: 'gym-checkin',
        amount: params.amount,
        name: params.productName,
        products: [
          {
            name: params.productName,
            quantity: 1,
            price: params.amount,
          },
        ],
      },
    ],
    redirectUrls: {
      confirmUrl: `${baseUrl}/api/payments/confirm`,
      cancelUrl: `${baseUrl}/payment?cancelled=true`,
    },
  };

  const nonce = Date.now().toString();
  const signature = await createSignature(channelSecret, `/v3/payments/request${JSON.stringify(body)}${nonce}`);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-LINE-ChannelId': channelId,
      'X-LINE-Authorization-Nonce': nonce,
      'X-LINE-Authorization': signature,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.returnCode !== '0000') {
    throw new Error(`LINE Pay error: ${data.returnMessage}`);
  }

  return {
    transactionId: data.info.transactionId,
    paymentUrl: data.info.paymentUrl.web,
  };
}

// HMAC-SHA256署名を作成
async function createSignature(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
