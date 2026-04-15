import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, COLLECTIONS } from '../../server-lib/firebase.js';
import { verifyLiffToken } from '../../server-lib/auth.js';

const VALID_LOCATIONS = ['ASP', 'YABASE'];
const VALID_FACILITY_TYPES = ['GYM', 'TRAINING_PRIVATE', 'TRAINING_SHARED'];

// lineUserIdからユーザーを取得または作成し、ドキュメントIDを返す
async function getOrCreateUser(profile: { userId: string; displayName: string; pictureUrl?: string }): Promise<string> {
  const db = getDb();
  const usersRef = db.collection(COLLECTIONS.USERS);
  const snapshot = await usersRef.where('lineUserId', '==', profile.userId).limit(1).get();

  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }

  const now = new Date().toISOString();
  const docRef = await usersRef.add({
    lineUserId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl || null,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const profile = await verifyLiffToken(req.headers.authorization);
    if (!profile) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await getOrCreateUser(profile);
    const db = getDb();
    const checkinsRef = db.collection(COLLECTIONS.CHECKINS);

    // GET: チェックイン一覧取得
    if (req.method === 'GET') {
      const snapshot = await checkinsRef
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

      const checkins = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return res.status(200).json(checkins);
    }

    // POST: 新規チェックイン作成
    if (req.method === 'POST') {
      const { location, facilityType, date, startTime, duration, totalPrice } = req.body;

      if (!facilityType || !date || !startTime || !duration) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const loc = location || 'ASP';
      if (!VALID_LOCATIONS.includes(loc)) {
        return res.status(400).json({ error: 'Invalid location' });
      }

      if (!VALID_FACILITY_TYPES.includes(facilityType)) {
        return res.status(400).json({ error: 'Invalid facility type' });
      }

      const now = new Date().toISOString();
      const checkinData = {
        userId,
        location: loc,
        facilityType,
        date,
        startTime,
        duration,
        totalPrice: totalPrice || 0,
        pinCode: null,
        status: 'PENDING',
        paymentId: null,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await checkinsRef.add(checkinData);

      return res.status(201).json({
        checkin: { id: docRef.id, ...checkinData },
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
