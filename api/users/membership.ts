import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, COLLECTIONS } from '../lib/firebase.js';
import { verifyLiffToken } from '../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const profile = await verifyLiffToken(req.headers.authorization);
  if (!profile) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();

  if (req.method === 'GET') {
    try {
      // ユーザーのアクティブな会員情報を取得
      const snapshot = await db
        .collection(COLLECTIONS.USER_MEMBERSHIPS)
        .where('lineUserId', '==', profile.userId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.status(200).json({ membership: null });
      }

      const membershipData = snapshot.docs[0].data();
      const membership = { id: snapshot.docs[0].id, ...membershipData };

      // 会員種別の詳細を取得
      const memberTypeDoc = await db
        .collection(COLLECTIONS.MEMBER_TYPES)
        .doc(membershipData.memberTypeId as string)
        .get();

      return res.status(200).json({
        membership: {
          ...membership,
          memberType: memberTypeDoc.exists
            ? { id: memberTypeDoc.id, ...memberTypeDoc.data() }
            : null,
        },
      });
    } catch (error) {
      console.error('Get membership error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
