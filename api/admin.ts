import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, COLLECTIONS } from '../server-lib/firebase.js';
import { verifyLiffToken } from '../server-lib/auth.js';

// 管理者LINE UserIDリスト
function getAdminUserIds(): string[] {
  const ids = process.env.ADMIN_LINE_USER_IDS || '';
  return ids.split(',').map((id) => id.trim()).filter(Boolean);
}

async function verifyAdmin(req: VercelRequest): Promise<{ userId: string; lineUserId: string } | null> {
  const profile = await verifyLiffToken(req.headers.authorization);
  if (!profile) return null;

  const adminIds = getAdminUserIds();
  if (adminIds.length > 0 && !adminIds.includes(profile.userId)) {
    return null;
  }

  // ユーザーID取得
  const db = getDb();
  const userSnapshot = await db.collection(COLLECTIONS.USERS)
    .where('lineUserId', '==', profile.userId)
    .limit(1)
    .get();

  if (userSnapshot.empty) return null;
  return { userId: userSnapshot.docs[0].id, lineUserId: profile.userId };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const admin = await verifyAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const db = getDb();
    const action = req.query.action as string;

    if (!action) {
      return res.status(400).json({ error: 'Missing action parameter' });
    }

    // ============ イベント管理 ============
    if (action === 'createEvent' && req.method === 'POST') {
      const { title, description, location, facilityType, date, startTime, endTime, capacity, price, imageUrl } = req.body;
      if (!title || !date || !startTime || !endTime) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const now = new Date().toISOString();
      const eventData = {
        title,
        description: description || '',
        location: location || 'ASP',
        facilityType: facilityType || 'GYM',
        date,
        startTime,
        endTime,
        capacity: capacity || 0,
        currentCount: 0,
        price: price || 0,
        imageUrl: imageUrl || null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await db.collection(COLLECTIONS.EVENTS).add(eventData);
      return res.status(201).json({ id: ref.id, ...eventData });
    }

    if (action === 'updateEvent' && req.method === 'PUT') {
      const { eventId, ...updates } = req.body;
      if (!eventId) return res.status(400).json({ error: 'Missing eventId' });
      updates.updatedAt = new Date().toISOString();
      await db.collection(COLLECTIONS.EVENTS).doc(eventId).update(updates);
      return res.status(200).json({ message: 'Updated' });
    }

    if (action === 'deleteEvent' && req.method === 'DELETE') {
      const eventId = req.query.eventId as string;
      if (!eventId) return res.status(400).json({ error: 'Missing eventId' });
      await db.collection(COLLECTIONS.EVENTS).doc(eventId).delete();
      return res.status(200).json({ message: 'Deleted' });
    }

    if (action === 'events' && req.method === 'GET') {
      const snapshot = await db.collection(COLLECTIONS.EVENTS)
        .orderBy('date', 'desc')
        .get();
      const events = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(events);
    }

    // ============ スクール管理 ============
    if (action === 'createSchool' && req.method === 'POST') {
      const { title, description, location, facilityType, dayOfWeek, startTime, endTime, capacity, pricePerSession, totalSessions, instructor, startDate, endDate } = req.body;
      if (!title || !dayOfWeek || !startTime || !endTime) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const now = new Date().toISOString();
      const schoolData = {
        title,
        description: description || '',
        location: location || 'ASP',
        facilityType: facilityType || 'GYM',
        dayOfWeek,
        startTime,
        endTime,
        capacity: capacity || 0,
        currentCount: 0,
        pricePerSession: pricePerSession || 0,
        totalSessions: totalSessions || 0,
        instructor: instructor || null,
        startDate: startDate || null,
        endDate: endDate || null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await db.collection(COLLECTIONS.SCHOOLS).add(schoolData);
      return res.status(201).json({ id: ref.id, ...schoolData });
    }

    if (action === 'updateSchool' && req.method === 'PUT') {
      const { schoolId, ...updates } = req.body;
      if (!schoolId) return res.status(400).json({ error: 'Missing schoolId' });
      updates.updatedAt = new Date().toISOString();
      await db.collection(COLLECTIONS.SCHOOLS).doc(schoolId).update(updates);
      return res.status(200).json({ message: 'Updated' });
    }

    if (action === 'deleteSchool' && req.method === 'DELETE') {
      const schoolId = req.query.schoolId as string;
      if (!schoolId) return res.status(400).json({ error: 'Missing schoolId' });
      await db.collection(COLLECTIONS.SCHOOLS).doc(schoolId).delete();
      return res.status(200).json({ message: 'Deleted' });
    }

    if (action === 'schools' && req.method === 'GET') {
      const snapshot = await db.collection(COLLECTIONS.SCHOOLS)
        .orderBy('createdAt', 'desc')
        .get();
      const schools = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(schools);
    }

    // ============ 売上集計 (Phase 4) ============
    if (action === 'sales' && req.method === 'GET') {
      const period = req.query.period as string || 'daily';
      const from = req.query.from as string;
      const to = req.query.to as string;
      const year = req.query.year as string;
      const groupBy = req.query.groupBy as string;

      let query = db.collection(COLLECTIONS.CHECKINS)
        .where('status', '==', 'PAID') as FirebaseFirestore.Query;

      if (from) {
        query = query.where('date', '>=', from);
      }
      if (to) {
        query = query.where('date', '<=', to);
      }
      if (year && !from) {
        query = query.where('date', '>=', `${year}-01-01`).where('date', '<=', `${year}-12-31`);
      }

      const snapshot = await query.get();
      const checkins = snapshot.docs.map((doc) => doc.data());

      // 集計
      const sales: Record<string, { count: number; total: number }> = {};

      for (const c of checkins) {
        let key: string;
        if (groupBy === 'location') {
          key = c.location || 'UNKNOWN';
        } else if (groupBy === 'facility') {
          key = `${c.location}_${c.facilityType}`;
        } else if (period === 'monthly') {
          key = c.date?.substring(0, 7) || 'UNKNOWN';
        } else {
          key = c.date || 'UNKNOWN';
        }

        if (!sales[key]) {
          sales[key] = { count: 0, total: 0 };
        }
        sales[key].count++;
        sales[key].total += c.totalPrice || 0;
      }

      const totalCount = checkins.length;
      const totalAmount = checkins.reduce((sum, c) => sum + (c.totalPrice || 0), 0);

      return res.status(200).json({
        period,
        groupBy: groupBy || period,
        sales,
        totalCount,
        totalAmount,
      });
    }

    // ============ 領収書生成 (Phase 5) ============
    if (action === 'receipt' && req.method === 'POST') {
      const { checkinId } = req.body;
      if (!checkinId) return res.status(400).json({ error: 'Missing checkinId' });

      const checkinDoc = await db.collection(COLLECTIONS.CHECKINS).doc(checkinId).get();
      if (!checkinDoc.exists) return res.status(404).json({ error: 'Checkin not found' });

      const checkin = checkinDoc.data()!;
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(checkin.userId).get();
      const user = userDoc.exists ? userDoc.data()! : { displayName: '利用者' };

      try {
        const { generateReceipt } = await import('../server-lib/pdf.js');
        const pdfBase64 = await generateReceipt(
          { id: checkinId, ...checkin },
          { displayName: user.displayName }
        );
        return res.status(200).json({ pdf: pdfBase64 });
      } catch (e) {
        console.error('Receipt generation error:', e);
        return res.status(500).json({ error: 'Failed to generate receipt' });
      }
    }

    // ============ 予約一覧（カレンダー用） ============
    if (action === 'checkins' && req.method === 'GET') {
      const from = req.query.from as string;
      const to = req.query.to as string;

      // 複合インデックス回避のため date 範囲のみでクエリし、status はメモリ側でフィルタ
      let query = db.collection(COLLECTIONS.CHECKINS) as FirebaseFirestore.Query;
      if (from) query = query.where('date', '>=', from);
      if (to) query = query.where('date', '<=', to);

      const snapshot = await query.get();
      const allCheckins = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Array<Record<string, unknown>>;

      const checkins = allCheckins.filter((c) =>
        c.status === 'PENDING' || c.status === 'PAID'
      );

      // ユーザー名を付与
      const userIds = [...new Set(checkins.map((c) => c.userId as string).filter(Boolean))];
      const userDocs = await Promise.all(
        userIds.map((id) => db.collection(COLLECTIONS.USERS).doc(id).get())
      );
      const userMap = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));

      const enriched = checkins.map((c) => ({
        ...c,
        displayName: userMap.get(c.userId as string)?.displayName || '不明',
      }));

      return res.status(200).json(enriched);
    }

    // ============ 登録一覧 ============
    if (action === 'eventRegistrations' && req.method === 'GET') {
      const eventId = req.query.eventId as string;
      if (!eventId) return res.status(400).json({ error: 'Missing eventId' });
      const snapshot = await db.collection(COLLECTIONS.EVENT_REGISTRATIONS)
        .where('eventId', '==', eventId)
        .orderBy('createdAt', 'desc')
        .get();
      const regs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(regs);
    }

    if (action === 'schoolRegistrations' && req.method === 'GET') {
      const schoolId = req.query.schoolId as string;
      if (!schoolId) return res.status(400).json({ error: 'Missing schoolId' });
      const snapshot = await db.collection(COLLECTIONS.SCHOOL_REGISTRATIONS)
        .where('schoolId', '==', schoolId)
        .orderBy('createdAt', 'desc')
        .get();
      const regs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(regs);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
