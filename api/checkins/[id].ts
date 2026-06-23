import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, COLLECTIONS } from '../../server-lib/firebase.js';
import { verifyLiffToken } from '../../server-lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid checkin ID' });
    }

    const profile = await verifyLiffToken(req.headers.authorization);
    if (!profile) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();

    // ユーザーを取得
    const usersSnapshot = await db.collection(COLLECTIONS.USERS)
      .where('lineUserId', '==', profile.userId)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = usersSnapshot.docs[0].id;

    // チェックイン取得
    const checkinDoc = await db.collection(COLLECTIONS.CHECKINS).doc(id).get();

    if (!checkinDoc.exists) {
      return res.status(404).json({ error: 'Checkin not found' });
    }

    const checkinData = checkinDoc.data()!;

    // 自分のチェックインか確認
    if (checkinData.userId !== userId) {
      return res.status(404).json({ error: 'Checkin not found' });
    }

    // GET: チェックイン詳細取得
    if (req.method === 'GET') {
      const formatParam = req.query.format as string;

      // 領収書PDF取得
      if (formatParam === 'receipt') {
        if (checkinData.status !== 'PAID') {
          return res.status(400).json({ error: '決済済みのチェックインのみ領収書を発行できます' });
        }
        try {
          const { generateReceipt } = await import('../../server-lib/pdf.js');
          const userDoc = await db.collection(COLLECTIONS.USERS).doc(checkinData.userId).get();
          const user = userDoc.exists ? userDoc.data()! : { displayName: '利用者' };
          // 宛名（任意）。指定が無ければ利用者の表示名を使用
          const recipientName =
            typeof req.query.recipient === 'string' && req.query.recipient.trim()
              ? req.query.recipient.trim()
              : undefined;
          const pdf = await generateReceipt(
            { id, ...checkinData },
            { displayName: user.displayName },
            recipientName
          );
          return res.status(200).json({ pdf });
        } catch (e) {
          console.error('Receipt generation error:', e);
          return res.status(500).json({ error: 'Failed to generate receipt' });
        }
      }

      return res.status(200).json({ id: checkinDoc.id, ...checkinData });
    }

    // DELETE: チェックインキャンセル
    if (req.method === 'DELETE') {
      // キャンセル可能かチェック
      // 条件A: 利用日の前日まで（日本時間JST=UTC+9で利用日0:00より前）
      // 条件B: 申込から1時間以内なら、いつでもキャンセル可能（誤予約の救済）
      const now = new Date();
      const startOfUsageDayJst = new Date(`${checkinData.date}T00:00:00+09:00`);
      const beforeUsageDay = now < startOfUsageDayJst;

      const createdAt = checkinData.createdAt ? new Date(checkinData.createdAt) : null;
      const withinGracePeriod = createdAt
        ? now.getTime() - createdAt.getTime() <= 60 * 60 * 1000
        : false;

      if (!beforeUsageDay && !withinGracePeriod) {
        return res.status(400).json({
          error: 'キャンセル期限を過ぎています（前日まで／お申込みから1時間以内は可能です）',
        });
      }

      await checkinDoc.ref.update({
        status: 'CANCELLED',
        updatedAt: new Date().toISOString(),
      });

      return res.status(200).json({ message: 'Cancelled successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
