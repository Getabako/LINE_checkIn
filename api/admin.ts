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
    const action = req.query.action as string;
    if (!action) {
      return res.status(400).json({ error: 'Missing action parameter' });
    }

    const db = getDb();

    // ============ お知らせ公開取得（認証不要） ============
    if (action === 'announcementsPublic' && req.method === 'GET') {
      const location = req.query.location as string | undefined;
      const today = new Date().toISOString().substring(0, 10);
      const snapshot = await db.collection(COLLECTIONS.ANNOUNCEMENTS).get();
      const items = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as {
          id: string;
          isActive?: boolean;
          startDate?: string | null;
          endDate?: string | null;
          location?: string | null;
          priority?: string;
          createdAt?: string;
        }))
        .filter((a) => a.isActive !== false)
        .filter((a) => !a.startDate || a.startDate <= today)
        .filter((a) => !a.endDate || a.endDate >= today)
        .filter((a) => !location || !a.location || a.location === location)
        .sort((a, b) => {
          const order = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
          const ap = order[a.priority || 'info'] ?? 9;
          const bp = order[b.priority || 'info'] ?? 9;
          if (ap !== bp) return ap - bp;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
      return res.status(200).json(items);
    }

    const admin = await verifyAdmin(req);
    if (!admin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
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
      const snapshot = await db.collection(COLLECTIONS.EVENTS).get();
      const events = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; date?: string }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
      const snapshot = await db.collection(COLLECTIONS.SCHOOLS).get();
      const schools = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; createdAt?: string }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json(schools);
    }

    // ============ 売上集計 (Phase 4) ============
    if (action === 'sales' && req.method === 'GET') {
      const period = req.query.period as string || 'daily';
      const from = req.query.from as string;
      const to = req.query.to as string;
      const year = req.query.year as string;
      const groupBy = req.query.groupBy as string;

      // 複合インデックス回避のため date 範囲のみでクエリし status はメモリでフィルタ
      let query = db.collection(COLLECTIONS.CHECKINS) as FirebaseFirestore.Query;
      const effectiveFrom = from || (year ? `${year}-01-01` : '');
      const effectiveTo = to || (year ? `${year}-12-31` : '');
      if (effectiveFrom) query = query.where('date', '>=', effectiveFrom);
      if (effectiveTo) query = query.where('date', '<=', effectiveTo);

      const snapshot = await query.get();
      const checkins = snapshot.docs
        .map((doc) => doc.data())
        .filter((c) => c.status === 'PAID');

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

    // ============ 予約作成（管理者） ============
    if (action === 'createCheckin' && req.method === 'POST') {
      const { location, facilityType, date, startTime, duration, totalPrice, userId, displayName, skipRemoteLock } = req.body;
      if (!location || !facilityType || !date || !startTime || !duration) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // 重複チェック（TRAINING_SHARED は定員 10 まで OK）
      const SHARED_CAPACITY = 10;
      const newStart = parseInt(String(startTime).split(':')[0], 10);
      const newEnd = newStart + Number(duration);
      const existingSnapshot = await db.collection(COLLECTIONS.CHECKINS)
        .where('date', '==', date)
        .get();
      const overlapping = existingSnapshot.docs.filter((doc) => {
        const ex = doc.data();
        if (ex.location !== location) return false;
        if (ex.facilityType !== facilityType) return false;
        if (ex.status !== 'PENDING' && ex.status !== 'PAID') return false;
        const exStart = parseInt(String(ex.startTime).split(':')[0], 10);
        const exEnd = exStart + (ex.duration || 0);
        return newStart < exEnd && exStart < newEnd;
      });
      if (facilityType === 'TRAINING_SHARED') {
        if (overlapping.length >= SHARED_CAPACITY) {
          return res.status(409).json({ error: `${date} ${startTime}〜は定員に達しています` });
        }
      } else {
        if (overlapping.length > 0) {
          return res.status(409).json({ error: `${date} ${startTime}〜は既に予約されています` });
        }
      }

      // ユーザー解決（未指定なら管理者自身の userId を使う）
      let targetUserId: string = userId || admin.userId;
      if (!userId && displayName) {
        // displayName が指定されている場合、マッチするユーザーを探す
        const userSnap = await db.collection(COLLECTIONS.USERS)
          .where('displayName', '==', displayName)
          .limit(1)
          .get();
        if (!userSnap.empty) targetUserId = userSnap.docs[0].id;
      }

      // PIN コード生成（RemoteLock は管理者予約ではスキップ推奨）
      let pinCode: string = Math.floor(1000 + Math.random() * 9000).toString();
      if (!skipRemoteLock) {
        try {
          const { createBooking, isRemoteLockConfigured } = await import('../server-lib/remotelock.js');
          if (isRemoteLockConfigured()) {
            const startHour = newStart;
            const endHour = startHour + Number(duration);
            const startsAt = `${date}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
            const endsAt = `${date}T${String(endHour).padStart(2, '0')}:00:00+09:00`;
            const now2 = new Date().toISOString();
            // 仮ID付きで先に作成してから update する戦略だと煩雑なので、ID なしで name を付ける
            const result = await createBooking({
              checkinId: `admin-${now2}`,
              name: `AdminCheckin ${date} ${startTime}`,
              startsAt,
              endsAt,
              location,
              facilityType,
            });
            pinCode = result.pinCode;
          }
        } catch (e) {
          console.error('RemoteLock error (admin createCheckin):', e);
        }
      }

      const now = new Date().toISOString();
      const checkinData = {
        userId: targetUserId,
        location,
        facilityType,
        date,
        startTime,
        duration: Number(duration),
        totalPrice: Number(totalPrice) || 0,
        originalPrice: Number(totalPrice) || 0,
        memberDiscount: 0,
        memberTypeName: null,
        couponCode: null,
        couponId: null,
        couponDiscount: 0,
        pinCode,
        status: 'PAID',
        paymentId: null,
        skipRemoteLock: skipRemoteLock || false,
        groupId: null,
        recurringType: null,
        createdByAdmin: true,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await db.collection(COLLECTIONS.CHECKINS).add(checkinData);
      return res.status(201).json({ id: ref.id, ...checkinData });
    }

    // ============ 予約削除（管理者） ============
    if (action === 'deleteCheckin' && req.method === 'DELETE') {
      const checkinId = req.query.checkinId as string;
      if (!checkinId) return res.status(400).json({ error: 'Missing checkinId' });
      await db.collection(COLLECTIONS.CHECKINS).doc(checkinId).delete();
      return res.status(200).json({ message: 'Deleted' });
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
        .get();
      const regs = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; createdAt?: string }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json(regs);
    }

    if (action === 'schoolRegistrations' && req.method === 'GET') {
      const schoolId = req.query.schoolId as string;
      if (!schoolId) return res.status(400).json({ error: 'Missing schoolId' });
      const snapshot = await db.collection(COLLECTIONS.SCHOOL_REGISTRATIONS)
        .where('schoolId', '==', schoolId)
        .get();
      const regs = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; createdAt?: string }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json(regs);
    }

    // ============ 会員種別マスタ ============
    if (action === 'memberTypes' && req.method === 'GET') {
      const snapshot = await db.collection(COLLECTIONS.MEMBER_TYPES).get();
      const items = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; sortOrder?: number }))
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
      return res.status(200).json(items);
    }

    if (action === 'createMemberType' && req.method === 'POST') {
      const { code, name, description, discountType, discountValue, monthlyFee, sortOrder, isActive } = req.body;
      if (!code || !name) return res.status(400).json({ error: 'Missing code or name' });
      const now = new Date().toISOString();
      const data = {
        code,
        name,
        description: description || '',
        discountType: discountType || 'NONE',
        discountValue: Number(discountValue) || 0,
        monthlyFee: Number(monthlyFee) || 0,
        sortOrder: Number(sortOrder) || 0,
        isActive: isActive !== false,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await db.collection(COLLECTIONS.MEMBER_TYPES).add(data);
      return res.status(201).json({ id: ref.id, ...data });
    }

    if (action === 'updateMemberType' && req.method === 'PUT') {
      const { memberTypeId, ...updates } = req.body;
      if (!memberTypeId) return res.status(400).json({ error: 'Missing memberTypeId' });
      updates.updatedAt = new Date().toISOString();
      await db.collection(COLLECTIONS.MEMBER_TYPES).doc(memberTypeId).update(updates);
      return res.status(200).json({ message: 'Updated' });
    }

    if (action === 'deleteMemberType' && req.method === 'DELETE') {
      const memberTypeId = req.query.memberTypeId as string;
      if (!memberTypeId) return res.status(400).json({ error: 'Missing memberTypeId' });
      await db.collection(COLLECTIONS.MEMBER_TYPES).doc(memberTypeId).delete();
      return res.status(200).json({ message: 'Deleted' });
    }

    // ============ ユーザー検索（会員付与用） ============
    if (action === 'users' && req.method === 'GET') {
      const search = ((req.query.search as string) || '').trim();
      const snapshot = await db.collection(COLLECTIONS.USERS).limit(500).get();
      let users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; lineUserId: string; displayName: string }));
      if (search) {
        const q = search.toLowerCase();
        users = users.filter((u) =>
          (u.displayName || '').toLowerCase().includes(q) ||
          (u.lineUserId || '').toLowerCase().includes(q)
        );
      }
      users = users.slice(0, 100);
      return res.status(200).json(users);
    }

    // ============ ユーザー会員区分の管理 ============
    if (action === 'memberships' && req.method === 'GET') {
      const snapshot = await db.collection(COLLECTIONS.USER_MEMBERSHIPS)
        .where('isActive', '==', true)
        .get();
      const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Array<{ id: string; memberTypeId: string; createdAt?: string }>;

      // memberType と user を join
      const typeIds = [...new Set(items.map((i) => i.memberTypeId))];
      const typeDocs = await Promise.all(typeIds.map((id) => db.collection(COLLECTIONS.MEMBER_TYPES).doc(id).get()));
      const typeMap = new Map(typeDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));

      const enriched = items
        .map((m) => ({
          ...m,
          memberTypeName: (typeMap.get(m.memberTypeId) as { name?: string } | undefined)?.name || '',
        }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json(enriched);
    }

    if (action === 'assignMembership' && req.method === 'POST') {
      const { lineUserId, userId, displayName, memberTypeId, startDate, endDate } = req.body;
      if (!lineUserId || !memberTypeId) return res.status(400).json({ error: 'Missing lineUserId or memberTypeId' });

      // 既存のアクティブ会員を非アクティブ化（1ユーザー1会員）
      const existing = await db.collection(COLLECTIONS.USER_MEMBERSHIPS)
        .where('lineUserId', '==', lineUserId)
        .where('isActive', '==', true)
        .get();
      const batch = db.batch();
      existing.docs.forEach((d) => batch.update(d.ref, { isActive: false, updatedAt: new Date().toISOString() }));
      await batch.commit();

      const now = new Date().toISOString();
      const data = {
        lineUserId,
        userId: userId || null,
        displayName: displayName || null,
        memberTypeId,
        startDate: startDate || null,
        endDate: endDate || null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await db.collection(COLLECTIONS.USER_MEMBERSHIPS).add(data);
      return res.status(201).json({ id: ref.id, ...data });
    }

    if (action === 'revokeMembership' && req.method === 'DELETE') {
      const membershipId = req.query.membershipId as string;
      if (!membershipId) return res.status(400).json({ error: 'Missing membershipId' });
      await db.collection(COLLECTIONS.USER_MEMBERSHIPS).doc(membershipId).update({
        isActive: false,
        updatedAt: new Date().toISOString(),
      });
      return res.status(200).json({ message: 'Revoked' });
    }

    // ============ お知らせ管理 ============
    if (action === 'announcements' && req.method === 'GET') {
      const snapshot = await db.collection(COLLECTIONS.ANNOUNCEMENTS).get();
      const items = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as { id: string; createdAt?: string }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json(items);
    }

    if (action === 'createAnnouncement' && req.method === 'POST') {
      const { title, body, location, priority, startDate, endDate, isActive } = req.body;
      if (!title || !body) return res.status(400).json({ error: 'Missing title or body' });
      const now = new Date().toISOString();
      const data = {
        title,
        body,
        location: location || null,
        priority: priority || 'info',
        startDate: startDate || null,
        endDate: endDate || null,
        isActive: isActive !== false,
        createdAt: now,
        updatedAt: now,
      };
      const ref = await db.collection(COLLECTIONS.ANNOUNCEMENTS).add(data);
      return res.status(201).json({ id: ref.id, ...data });
    }

    if (action === 'updateAnnouncement' && req.method === 'PUT') {
      const { announcementId, ...updates } = req.body;
      if (!announcementId) return res.status(400).json({ error: 'Missing announcementId' });
      updates.updatedAt = new Date().toISOString();
      await db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(announcementId).update(updates);
      return res.status(200).json({ message: 'Updated' });
    }

    if (action === 'deleteAnnouncement' && req.method === 'DELETE') {
      const announcementId = req.query.announcementId as string;
      if (!announcementId) return res.status(400).json({ error: 'Missing announcementId' });
      await db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(announcementId).delete();
      return res.status(200).json({ message: 'Deleted' });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
