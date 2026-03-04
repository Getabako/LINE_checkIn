// RemoteLock API クライアント
// OAuth Client Credentials フローでトークン取得 + ゲストアクセスPIN発行
//
// デバイス構成（みんなの体育館ASP）:
//   ASP玄関扉          (共用入口)       シリアル: AC000W017827101
//   ASP体育館          (GYM)           シリアル: AC000W017830299
//   ASPトレーニングルーム (TRAINING)     シリアル: AC000W017830548
//   みんなの体育館八橋   (別拠点)        シリアル: AC000W017827205

const REMOTELOCK_TOKEN_URL = 'https://connect.remotelock.jp/oauth/token';
const REMOTELOCK_API_BASE = 'https://api.remotelock.jp';

// トークンキャッシュ
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.REMOTELOCK_CLIENT_ID;
  const clientSecret = process.env.REMOTELOCK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('RemoteLock credentials not configured');
  }

  // キャッシュが有効ならそのまま返す（5分のマージン）
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.accessToken;
  }

  const response = await fetch(REMOTELOCK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RemoteLock OAuth failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

// 施設タイプに応じて解錠するデバイスIDのリストを取得
// GYM → 玄関扉 + 体育館、TRAINING → 玄関扉 + トレーニングルーム
function getDeviceIds(facilityType: string): string[] {
  const entranceId = process.env.REMOTELOCK_DEVICE_ID_ENTRANCE;
  const gymId = process.env.REMOTELOCK_DEVICE_ID_GYM;
  const trainingId = process.env.REMOTELOCK_DEVICE_ID_TRAINING;

  const deviceIds: string[] = [];

  // 共用入口は常に追加
  if (entranceId) {
    deviceIds.push(entranceId);
  }

  // 施設タイプに応じたデバイスを追加
  if (facilityType === 'GYM' && gymId) {
    deviceIds.push(gymId);
  } else if (facilityType === 'TRAINING' && trainingId) {
    deviceIds.push(trainingId);
  }

  // 個別設定がない場合、レガシーの単一デバイスIDにフォールバック
  if (deviceIds.length === 0 && process.env.REMOTELOCK_DEVICE_ID) {
    deviceIds.push(process.env.REMOTELOCK_DEVICE_ID);
  }

  return deviceIds;
}

interface GuestAccessResult {
  pinCode: string;
  accessPersonId: string;
}

export async function createGuestAccess(params: {
  name: string;
  startsAt: string; // ISO8601
  endsAt: string;   // ISO8601
  facilityType: string; // GYM or TRAINING
}): Promise<GuestAccessResult> {
  const accessToken = await getAccessToken();
  const deviceIds = getDeviceIds(params.facilityType);

  if (deviceIds.length === 0) {
    throw new Error('No RemoteLock device IDs configured for this facility type');
  }

  // 1. access_guest 作成（PIN自動生成）
  const createResponse = await fetch(`${REMOTELOCK_API_BASE}/access_persons`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      type: 'access_guest',
      attributes: {
        name: params.name,
        starts_at: params.startsAt,
        ends_at: params.endsAt,
        generate_pin: true,
      },
    }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`RemoteLock create guest failed: ${createResponse.status} ${errorText}`);
  }

  const guestData = await createResponse.json();
  const accessPersonId = guestData.data.id;
  const pinCode = guestData.data.attributes.pin;

  // 2. 各デバイスへのアクセス権を付与（玄関 + 施設）
  for (const deviceId of deviceIds) {
    try {
      const accessResponse = await fetch(`${REMOTELOCK_API_BASE}/access_persons/${accessPersonId}/accesses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          attributes: {
            accessible_id: deviceId,
            accessible_type: 'lock',
          },
        }),
      });

      if (!accessResponse.ok) {
        const errorText = await accessResponse.text();
        console.error(`RemoteLock access grant failed for device ${deviceId}: ${accessResponse.status} ${errorText}`);
      }
    } catch (error) {
      console.error(`RemoteLock access grant error for device ${deviceId}:`, error);
    }
  }

  return { pinCode, accessPersonId };
}

// RemoteLockが利用可能かチェック
export function isRemoteLockConfigured(): boolean {
  return !!(
    process.env.REMOTELOCK_CLIENT_ID &&
    process.env.REMOTELOCK_CLIENT_SECRET &&
    (process.env.REMOTELOCK_DEVICE_ID_ENTRANCE ||
     process.env.REMOTELOCK_DEVICE_ID_GYM ||
     process.env.REMOTELOCK_DEVICE_ID_TRAINING ||
     process.env.REMOTELOCK_DEVICE_ID)
  );
}
