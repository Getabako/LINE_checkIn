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
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
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
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // LIFF トークン検証
    const profile = await verifyLiffToken(req.headers.authorization);
    if (!profile) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const lineUserId = profile.userId;
    const displayName = profile.displayName;
    const pictureUrl = profile.pictureUrl;

    // ユーザーを取得または作成
    let user = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          lineUserId,
          displayName,
          pictureUrl,
        },
      });
    } else {
      // プロフィール情報を更新
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          displayName,
          pictureUrl,
        },
      });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
