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
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid checkin ID' });
    }

    // LIFF トークン検証
    const profile = await verifyLiffToken(req.headers.authorization);
    if (!profile) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
