export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

export async function verifyLiffToken(authHeader: string | undefined): Promise<LiffProfile | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const accessToken = authHeader.substring(7);

  // 開発環境のみモックトークンを許可
  if (process.env.NODE_ENV !== 'production' && accessToken === 'mock-access-token-for-development') {
    return { userId: 'U_dev_user_12345', displayName: '開発ユーザー' };
  }

  try {
    const response = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

/** 管理者の LINE userId 一覧（環境変数 ADMIN_LINE_USER_IDS、カンマ区切り） */
export function getAdminUserIds(): string[] {
  return (process.env.ADMIN_LINE_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/** 管理者判定。ADMIN_LINE_USER_IDS が未設定のときは誰も管理者にしない（安全側） */
export function isAdminUserId(lineUserId: string | undefined | null): boolean {
  if (!lineUserId) return false;
  return getAdminUserIds().includes(lineUserId);
}

// ---------------------------------------------------------------- 管理画面で編集する管理者
// 環境変数の管理者（初期管理者・削除不可）に加え、settings/adminUsers に保存した管理者を合算する。
const ADMIN_SETTINGS_DOC = 'adminUsers';

export interface AdminUsersSetting {
  lineUserIds: string[];
  updatedAt?: string;
}

/** 管理画面で追加された管理者の LINE userId 一覧 */
export async function getDashboardAdminUserIds(): Promise<string[]> {
  try {
    const { getDb } = await import('./db.js');
    const doc = await getDb().collection('settings').doc(ADMIN_SETTINGS_DOC).get();
    if (!doc.exists) return [];
    const ids = (doc.data()?.lineUserIds as unknown) ?? [];
    return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string' && !!v) : [];
  } catch (e) {
    console.error('getDashboardAdminUserIds error:', e);
    return [];
  }
}

export async function saveDashboardAdminUserIds(ids: string[]): Promise<string[]> {
  const { getDb } = await import('./db.js');
  const unique = Array.from(new Set(ids.filter(Boolean)));
  await getDb()
    .collection('settings')
    .doc(ADMIN_SETTINGS_DOC)
    .set({ lineUserIds: unique, updatedAt: new Date().toISOString() }, { merge: false });
  return unique;
}

/** 環境変数＋管理画面の管理者すべて */
export async function getAllAdminUserIds(): Promise<string[]> {
  const dashboard = await getDashboardAdminUserIds();
  return Array.from(new Set([...getAdminUserIds(), ...dashboard]));
}

/** 管理者判定（環境変数＋管理画面の管理者） */
export async function isAdmin(lineUserId: string | undefined | null): Promise<boolean> {
  if (!lineUserId) return false;
  if (isAdminUserId(lineUserId)) return true;
  return (await getDashboardAdminUserIds()).includes(lineUserId);
}
