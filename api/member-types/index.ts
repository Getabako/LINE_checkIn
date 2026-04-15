import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, COLLECTIONS } from '../lib/firebase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = getDb();
    const snapshot = await db
      .collection(COLLECTIONS.MEMBER_TYPES)
      .where('isActive', '==', true)
      .orderBy('sortOrder', 'asc')
      .get();

    const memberTypes = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json(memberTypes);
  } catch (error) {
    console.error('Get member types error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
