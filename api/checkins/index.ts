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

    // GET: チェックイン一覧 or イベント/スクール取得
    if (req.method === 'GET') {
      const type = req.query.type as string;

      // 公開イベント一覧
      if (type === 'events') {
        const snapshot = await db.collection(COLLECTIONS.EVENTS)
          .where('isActive', '==', true)
          .orderBy('date', 'asc')
          .get();
        const events = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json(events);
      }

      // 公開ス���ール一覧
      if (type === 'schools') {
        const snapshot = await db.collection(COLLECTIONS.SCHOOLS)
          .where('isActive', '==', true)
          .orderBy('createdAt', 'desc')
          .get();
        const schools = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json(schools);
      }
      const { groupId } = req.query;

      // groupIdでフィルタ
      if (groupId && typeof groupId === 'string') {
        const snapshot = await checkinsRef
          .where('userId', '==', userId)
          .where('groupId', '==', groupId)
          .orderBy('date', 'asc')
          .get();

        const checkins = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        return res.status(200).json(checkins);
      }

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

    // POST: イベント/スクール申込み or 新規チェックイン作成
    if (req.method === 'POST') {
      const type = req.query.type as string;

      // イベント申込み
      if (type === 'event-register') {
        const { eventId } = req.body;
        if (!eventId) return res.status(400).json({ error: 'Missing eventId' });

        const eventDoc = await db.collection(COLLECTIONS.EVENTS).doc(eventId).get();
        if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });
        const event = eventDoc.data()!;

        // 定員チェック
        if (event.capacity > 0 && event.currentCount >= event.capacity) {
          return res.status(400).json({ error: '定員に達しています' });
        }

        // 重複チェック
        const existing = await db.collection(COLLECTIONS.EVENT_REGISTRATIONS)
          .where('eventId', '==', eventId)
          .where('lineUserId', '==', profile.userId)
          .limit(1)
          .get();
        if (!existing.empty) {
          return res.status(400).json({ error: '既に申込み済みです' });
        }

        const now = new Date().toISOString();
        const regData = {
          eventId,
          userId,
          lineUserId: profile.userId,
          status: 'REGISTERED',
          paidAmount: event.price || 0,
          createdAt: now,
        };
        const regRef = await db.collection(COLLECTIONS.EVENT_REGISTRATIONS).add(regData);

        // カウントアップ
        const { FieldValue } = await import('firebase-admin/firestore');
        await eventDoc.ref.update({ currentCount: FieldValue.increment(1) });

        return res.status(201).json({ id: regRef.id, ...regData });
      }

      // スクール申込み
      if (type === 'school-register') {
        const { schoolId } = req.body;
        if (!schoolId) return res.status(400).json({ error: 'Missing schoolId' });

        const schoolDoc = await db.collection(COLLECTIONS.SCHOOLS).doc(schoolId).get();
        if (!schoolDoc.exists) return res.status(404).json({ error: 'School not found' });
        const school = schoolDoc.data()!;

        // 定員チェック
        if (school.capacity > 0 && school.currentCount >= school.capacity) {
          return res.status(400).json({ error: '定員に達しています' });
        }

        // 重複チェック
        const existing = await db.collection(COLLECTIONS.SCHOOL_REGISTRATIONS)
          .where('schoolId', '==', schoolId)
          .where('lineUserId', '==', profile.userId)
          .limit(1)
          .get();
        if (!existing.empty) {
          return res.status(400).json({ error: '既に申込み済みです' });
        }

        const now = new Date().toISOString();
        const totalPrice = (school.pricePerSession || 0) * (school.totalSessions || 1);
        const regData = {
          schoolId,
          userId,
          lineUserId: profile.userId,
          status: 'REGISTERED',
          paidAmount: totalPrice,
          createdAt: now,
        };
        const regRef = await db.collection(COLLECTIONS.SCHOOL_REGISTRATIONS).add(regData);

        // カウントアップ
        const { FieldValue } = await import('firebase-admin/firestore');
        await schoolDoc.ref.update({ currentCount: FieldValue.increment(1) });

        return res.status(201).json({ id: regRef.id, ...regData });
      }
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
