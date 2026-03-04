import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
      return null;
    }

    return response.json();
  } catch {
    return null;
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

    // POST: 新規チェックイン作成（決済はcreate-checkoutで処理）
    if (req.method === 'POST') {
      const { facilityType, date, startTime, duration, totalPrice } = req.body;

      if (!facilityType || !date || !startTime || !duration) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!['GYM', 'TRAINING'].includes(facilityType)) {
        return res.status(400).json({ error: 'Invalid facility type' });
      }

      const checkin = await prisma.checkin.create({
        data: {
          userId: user.id,
          facilityType,
          date: new Date(date),
          startTime,
          duration,
          totalPrice: totalPrice || 0,
          status: 'PENDING',
        },
      });

      return res.status(201).json({ checkin });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
