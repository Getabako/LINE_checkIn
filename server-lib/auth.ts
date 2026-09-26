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
