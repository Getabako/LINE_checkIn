import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 4桁暗証番号を生成
function generatePinCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transactionId, orderId } = req.query;

    if (!transactionId || !orderId) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    // チェックインを取得
    const checkin = await prisma.checkin.findUnique({
      where: { id: orderId as string },
    });

    if (!checkin) {
      return res.status(404).json({ error: 'Checkin not found' });
    }

    if (checkin.status !== 'PENDING') {
      // 既に処理済みの場合は完了ページへリダイレクト
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://your-app.vercel.app';
      return res.redirect(`${baseUrl}/complete?checkinId=${checkin.id}`);
    }

    // LINE Pay Confirm API を呼び出す
    const channelId = process.env.LINE_PAY_CHANNEL_ID!;
    const channelSecret = process.env.LINE_PAY_CHANNEL_SECRET!;
    const isSandbox = process.env.LINE_PAY_SANDBOX === 'true';

    const apiUrl = isSandbox
      ? `https://sandbox-api-pay.line.me/v3/payments/requests/${transactionId}/confirm`
      : `https://api-pay.line.me/v3/payments/requests/${transactionId}/confirm`;

    const body = {
      amount: checkin.totalPrice,
      currency: 'JPY',
    };

    const nonce = Date.now().toString();
    const signature = await createSignature(
      channelSecret,
      `/v3/payments/requests/${transactionId}/confirm${JSON.stringify(body)}${nonce}`
    );

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
      console.error('LINE Pay confirm error:', data);
      return res.status(400).json({ error: 'Payment confirmation failed' });
    }

    // 決済成功：暗証番号を発行してステータス更新
    const pinCode = generatePinCode();

    await prisma.checkin.update({
      where: { id: checkin.id },
      data: {
        status: 'PAID',
        pinCode,
        paymentId: transactionId as string,
      },
    });

    // 完了ページへリダイレクト
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://your-app.vercel.app';
    return res.redirect(`${baseUrl}/complete?checkinId=${checkin.id}`);
  } catch (error) {
    console.error('Payment confirm error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
