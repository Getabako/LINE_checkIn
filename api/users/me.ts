import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, COLLECTIONS } from '../lib/firebase.js';
import { verifyLiffToken } from '../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const profile = await verifyLiffToken(req.headers.authorization);
    if (!profile) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb();
    const usersRef = db.collection(COLLECTIONS.USERS);

    // lineUserIdでユーザーを検索
    const snapshot = await usersRef.where('lineUserId', '==', profile.userId).limit(1).get();

    let userData;
    if (snapshot.empty) {
      // 新規作成
      const now = new Date().toISOString();
      userData = {
        lineUserId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl || null,
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await usersRef.add(userData);
      userData = { id: docRef.id, ...userData };
    } else {
      // 既存ユーザーのプロフィール更新
      const doc = snapshot.docs[0];
      const updateData = {
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl || null,
        updatedAt: new Date().toISOString(),
      };
      await doc.ref.update(updateData);
      userData = { id: doc.id, ...doc.data(), ...updateData };
    }

    return res.status(200).json(userData);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
