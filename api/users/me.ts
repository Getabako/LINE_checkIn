import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// LINEアクセストークンからユーザー情報を取得
async function getLineProfile(accessToken: string) {
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get LINE profile');
  }

  return response.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const accessToken = authHeader.split(' ')[1];

    // 開発用モックトークン
    let lineUserId: string;
    let displayName: string;
    let pictureUrl: string | undefined;

    if (accessToken === 'mock-access-token-for-development') {
      lineUserId = 'U_dev_user_12345';
      displayName = '開発ユーザー';
      pictureUrl = undefined;
    } else {
      const profile = await getLineProfile(accessToken);
      lineUserId = profile.userId;
      displayName = profile.displayName;
      pictureUrl = profile.pictureUrl;
    }

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
