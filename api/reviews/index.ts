import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, COLLECTIONS } from '../../server-lib/firebase.js';
import { verifyLiffToken } from '../../server-lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const profile = await verifyLiffToken(req.headers.authorization);
  if (!profile) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();

  if (req.method === 'POST') {
    try {
      const { checkinId, rating, comment } = req.body;

      if (!checkinId || !rating) {
        return res.status(400).json({ error: 'checkinIdとratingは必須です' });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: '評価は1〜5の範囲で入力してください' });
      }

      // チェックインの存在確認
      const checkinDoc = await db.collection(COLLECTIONS.CHECKINS).doc(checkinId).get();
      if (!checkinDoc.exists) {
        return res.status(404).json({ error: 'チェックイン情報が見つかりません' });
      }

      // 既存レビューチェック
      const existing = await db
        .collection(COLLECTIONS.REVIEWS)
        .where('checkinId', '==', checkinId)
        .where('lineUserId', '==', profile.userId)
        .limit(1)
        .get();

      if (!existing.empty) {
        return res.status(400).json({ error: 'この利用に対するレビューは既に投稿済みです' });
      }

      const now = new Date().toISOString();
      const reviewData = {
        checkinId,
        lineUserId: profile.userId,
        displayName: profile.displayName,
        rating: Number(rating),
        comment: comment?.trim() || '',
        createdAt: now,
      };

      const docRef = await db.collection(COLLECTIONS.REVIEWS).add(reviewData);

      // チェックインにレビュー済みフラグを設定
      await checkinDoc.ref.update({ hasReview: true });

      return res.status(201).json({ id: docRef.id, ...reviewData });
    } catch (error) {
      console.error('Create review error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'GET') {
    try {
      const { checkinId } = req.query;

      if (checkinId) {
        const snapshot = await db
          .collection(COLLECTIONS.REVIEWS)
          .where('checkinId', '==', checkinId)
          .limit(1)
          .get();

        if (snapshot.empty) {
          return res.status(200).json(null);
        }

        return res.status(200).json({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      }

      // ユーザーの全レビュー
      const snapshot = await db
        .collection(COLLECTIONS.REVIEWS)
        .where('lineUserId', '==', profile.userId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      const reviews = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(reviews);
    } catch (error) {
      console.error('Get reviews error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
