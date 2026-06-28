// 予約・キャンセル完了時のLINEプッシュ通知ユーティリティ
// 通知文は Firestore settings/notificationTemplates で管理者が編集可能。
// LINE未設定時や失敗時は決済フローを止めないよう、例外は内部で握りつぶす。
import { getDb, COLLECTIONS } from './firebase.js';
import { isLineConfigured, sendTextMessage } from './line.js';

const SETTINGS_COLLECTION = 'settings';
const TEMPLATES_DOC = 'notificationTemplates';

const LOCATION_NAMES: Record<string, string> = {
  ASP: 'みんなの体育館 ASP',
  YABASE: 'みんなの体育館 やばせ',
};
const FACILITY_NAMES: Record<string, string> = {
  GYM: '体育館',
  TRAINING_PRIVATE: 'トレーニングルーム（貸切）',
  TRAINING_SHARED: 'トレーニングルーム（相席）',
};

export interface NotificationTemplates {
  bookingComplete: string;
  bookingCancelled: string;
  eventComplete: string;
  enabled: boolean;
}

export const DEFAULT_TEMPLATES: NotificationTemplates = {
  enabled: true,
  bookingComplete:
    'ご予約ありがとうございます。\n\n' +
    '【ご予約内容】\n' +
    '施設：{location} {facility}\n' +
    '日時：{date} {time}\n' +
    '料金：¥{price}\n' +
    '解錠コード：{pin}\n\n' +
    'ご利用当日は上記コードで解錠してください。',
  bookingCancelled:
    'ご予約をキャンセルしました。\n\n' +
    '【キャンセル内容】\n' +
    '施設：{location} {facility}\n' +
    '日時：{date} {time}\n\n' +
    'またのご利用をお待ちしております。',
  eventComplete:
    'イベントのお申し込みが完了しました。\n\n' +
    '【お申し込み内容】\n' +
    'イベント：{title}\n' +
    '日時：{date} {time}\n\n' +
    'ご参加をお待ちしております。',
};

// テンプレート取得（デフォルトとマージ）
export async function getNotificationTemplates(): Promise<NotificationTemplates> {
  try {
    const db = getDb();
    const doc = await db.collection(SETTINGS_COLLECTION).doc(TEMPLATES_DOC).get();
    if (!doc.exists) return DEFAULT_TEMPLATES;
    const data = doc.data() || {};
    return { ...DEFAULT_TEMPLATES, ...data } as NotificationTemplates;
  } catch (e) {
    console.error('getNotificationTemplates error:', e);
    return DEFAULT_TEMPLATES;
  }
}

// テンプレート保存（管理者）
export async function saveNotificationTemplates(
  patch: Partial<NotificationTemplates>
): Promise<NotificationTemplates> {
  const db = getDb();
  const merged = { ...(await getNotificationTemplates()), ...patch };
  await db
    .collection(SETTINGS_COLLECTION)
    .doc(TEMPLATES_DOC)
    .set({ ...merged, updatedAt: new Date().toISOString() }, { merge: true });
  return merged;
}

// {key} 形式のプレースホルダを置換
function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : ''
  );
}

// userId（Firestore users ドキュメントID）から lineUserId を解決
async function resolveLineUserId(userId?: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.USERS).doc(userId).get();
    if (!snap.exists) return null;
    const lineUserId = snap.data()?.lineUserId;
    return typeof lineUserId === 'string' && lineUserId ? lineUserId : null;
  } catch {
    return null;
  }
}

function formatTime(startTime?: string, duration?: number): string {
  if (!startTime) return '';
  const [h, m] = startTime.split(':').map((v) => Number(v));
  const total = h * 60 + (m || 0) + Math.round((duration || 0) * 60);
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${startTime}〜${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

// 予約完了通知（冪等：notified フラグが立っていれば送らない）
export async function notifyBookingComplete(checkinId: string): Promise<void> {
  if (!isLineConfigured()) return;
  try {
    const db = getDb();
    const ref = db.collection(COLLECTIONS.CHECKINS).doc(checkinId);
    const snap = await ref.get();
    if (!snap.exists) return;
    const c = snap.data()!;
    if (c.notified) return;

    const templates = await getNotificationTemplates();
    if (!templates.enabled) {
      await ref.update({ notified: true });
      return;
    }
    const lineUserId = await resolveLineUserId(c.userId);
    if (!lineUserId) {
      await ref.update({ notified: true });
      return;
    }
    const text = render(templates.bookingComplete, {
      location: LOCATION_NAMES[c.location] || c.location || '',
      facility: FACILITY_NAMES[c.facilityType] || c.facilityType || '',
      date: c.date || '',
      time: formatTime(c.startTime, c.duration),
      price: (c.totalPrice || 0).toLocaleString(),
      pin: c.pinCode || '',
    });
    await sendTextMessage(lineUserId, text);
    await ref.update({ notified: true });
  } catch (e) {
    console.error('notifyBookingComplete error:', e);
  }
}

// キャンセル完了通知
export async function notifyBookingCancelled(checkinData: {
  userId?: string | null;
  location?: string;
  facilityType?: string;
  date?: string;
  startTime?: string;
  duration?: number;
}): Promise<void> {
  if (!isLineConfigured()) return;
  try {
    const templates = await getNotificationTemplates();
    if (!templates.enabled) return;
    const lineUserId = await resolveLineUserId(checkinData.userId);
    if (!lineUserId) return;
    const text = render(templates.bookingCancelled, {
      location: LOCATION_NAMES[checkinData.location || ''] || checkinData.location || '',
      facility: FACILITY_NAMES[checkinData.facilityType || ''] || checkinData.facilityType || '',
      date: checkinData.date || '',
      time: formatTime(checkinData.startTime, checkinData.duration),
    });
    await sendTextMessage(lineUserId, text);
  } catch (e) {
    console.error('notifyBookingCancelled error:', e);
  }
}

// イベント予約完了通知
export async function notifyEventComplete(
  lineUserId: string | null | undefined,
  vars: { title?: string; date?: string; time?: string }
): Promise<void> {
  if (!isLineConfigured() || !lineUserId) return;
  try {
    const templates = await getNotificationTemplates();
    if (!templates.enabled) return;
    const text = render(templates.eventComplete, {
      title: vars.title || '',
      date: vars.date || '',
      time: vars.time || '',
    });
    await sendTextMessage(lineUserId, text);
  } catch (e) {
    console.error('notifyEventComplete error:', e);
  }
}
