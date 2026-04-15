import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, COLLECTIONS } from '../lib/firebase.js';
import { verifyLiffToken } from '../lib/auth.js';

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
      return res.status(200).json({ id: checkinDoc.id, ...checkinData });
    }

    // DELETE: チェックインキャンセル
    if (req.method === 'DELETE') {
      // キャンセル可能かチェック（利用開始1時間前まで）
      const now = new Date();
      const startDateTime = new Date(checkinData.date);
      const [hours, minutes] = checkinData.startTime.split(':').map(Number);
      startDateTime.setHours(hours, minutes, 0, 0);

      const oneHourBefore = new Date(startDateTime.getTime() - 60 * 60 * 1000);

      if (now > oneHourBefore) {
        return res.status(400).json({ error: 'キャンセル期限を過ぎています（利用開始1時間前まで）' });
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
