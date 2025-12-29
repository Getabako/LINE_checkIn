import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// LINEプロフィール取得
async function getLineProfile(accessToken: string) {
  if (accessToken === 'mock-access-token-for-development') {
    return { userId: 'U_dev_user_12345', displayName: '開発ユーザー' };
  }

  const response = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error('Failed to get LINE profile');
  return response.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid checkin ID' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const accessToken = authHeader.split(' ')[1];
    const profile = await getLineProfile(accessToken);

    // ユーザーを取得
    const user = await prisma.user.findUnique({
      where: { lineUserId: profile.userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // GET: チェックイン詳細取得
    if (req.method === 'GET') {
      const checkin = await prisma.checkin.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!checkin) {
        return res.status(404).json({ error: 'Checkin not found' });
      }

      return res.status(200).json(checkin);
    }

    // DELETE: チェックインキャンセル
    if (req.method === 'DELETE') {
      const checkin = await prisma.checkin.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!checkin) {
        return res.status(404).json({ error: 'Checkin not found' });
      }

      // キャンセル可能かチェック（利用開始1時間前まで）
      const now = new Date();
      const startDateTime = new Date(checkin.date);
      const [hours, minutes] = checkin.startTime.split(':').map(Number);
      startDateTime.setHours(hours, minutes, 0, 0);

      const oneHourBefore = new Date(startDateTime.getTime() - 60 * 60 * 1000);

      if (now > oneHourBefore) {
        return res.status(400).json({ error: 'キャンセル期限を過ぎています（利用開始1時間前まで）' });
      }

      // ステータスを更新
      await prisma.checkin.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // TODO: LINE Pay返金処理

      return res.status(200).json({ message: 'Cancelled successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
