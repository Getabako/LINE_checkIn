// RemoteLock API クライアント
// 推奨API: POST /bookings で予約+カギ発行
// API base: https://api.remotelock-pf.jp (推奨・最新)
//
// デバイス構成:
//   ASP玄関扉          (共用入口)       シリアル: AC000W017827101
//   ASP体育館          (GYM)           シリアル: AC000W017830299
//   ASPトレーニングルーム (TRAINING)     シリアル: AC000W017830548
//   みんなの体育館八橋   (YABASE)        シリアル: AC000W017827205

const REMOTELOCK_API_BASE = 'https://api.remotelock-pf.jp';

const API_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/vnd.lockstate+json; version=1',
};

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

  // Client Credentials Grant
  const response = await fetch(`${REMOTELOCK_API_BASE}/oauth/token`, {
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
function getDeviceIds(facilityType: string): string[] {
  const entranceId = process.env.REMOTELOCK_DEVICE_ID_ENTRANCE;
  const gymId = process.env.REMOTELOCK_DEVICE_ID_GYM;
  const trainingId = process.env.REMOTELOCK_DEVICE_ID_TRAINING;
  const yabaseId = process.env.REMOTELOCK_DEVICE_ID_YABASE;

  const deviceIds: string[] = [];

  if (facilityType === 'YABASE') {
    // 八橋体育館はロック1つのみ
    if (yabaseId) deviceIds.push(yabaseId);
  } else {
    // ASP施設: 共用入口 + 施設別ロック
    if (entranceId) deviceIds.push(entranceId);
    if (facilityType === 'GYM' && gymId) {
      deviceIds.push(gymId);
    } else if (facilityType === 'TRAINING' && trainingId) {
      deviceIds.push(trainingId);
    }
  }

  return deviceIds;
}

interface BookingResult {
  pinCode: string;
  universalAccessKeyUrl: string;
  bookingIds: string[];
}

export async function createBooking(params: {
  checkinId: string;
  name: string;
  startsAt: string; // ISO8601 (例: "2026-03-04T09:00:00")
  endsAt: string;
  facilityType: string;
}): Promise<BookingResult> {
  const accessToken = await getAccessToken();
  const deviceIds = getDeviceIds(params.facilityType);

  if (deviceIds.length === 0) {
    throw new Error('No RemoteLock device IDs configured for this facility type');
  }

  let pinCode = '';
  let universalAccessKeyUrl = '';
  const bookingIds: string[] = [];

  for (let i = 0; i < deviceIds.length; i++) {
    const deviceId = deviceIds[i];
    const bookingId = deviceIds.length > 1
      ? `${params.checkinId}-${i + 1}`
      : params.checkinId;

    const body: Record<string, unknown> = {
      type: 'booking',
      id: bookingId,
      attributes: {
        name: params.name,
        device_id: deviceId,
        starts_at: params.startsAt,
        ends_at: params.endsAt,
        validation: false,
        // 2台目以降は1台目と同じPINを指定
        ...(i > 0 && pinCode ? { pin: pinCode } : {}),
      },
    };

    const response = await fetch(`${REMOTELOCK_API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        ...API_HEADERS,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // 2台目以降の失敗はログのみ（1台目のPINは有効）
      if (i > 0) {
        console.error(`RemoteLock booking failed for device ${deviceId}: ${response.status} ${errorText}`);
        continue;
      }
      throw new Error(`RemoteLock booking failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    const attrs = result.data.attributes;
    bookingIds.push(result.data.id);

    // 1台目のレスポンスからPINとURLを取得
    if (i === 0) {
      pinCode = attrs.pin || '';
      universalAccessKeyUrl = attrs.universal_access_key_url || '';
    }
  }

  if (!pinCode) {
    throw new Error('RemoteLock: PIN was not generated');
  }

  return { pinCode, universalAccessKeyUrl, bookingIds };
}

// 予約キャンセル
export async function cancelBooking(checkinId: string, deviceCount: number): Promise<void> {
  const accessToken = await getAccessToken();

  const ids = deviceCount > 1
    ? Array.from({ length: deviceCount }, (_, i) => `${checkinId}-${i + 1}`)
    : [checkinId];

  for (const bookingId of ids) {
    try {
      await fetch(`${REMOTELOCK_API_BASE}/bookings/${bookingId}/deactivate`, {
        method: 'PUT',
        headers: {
          ...API_HEADERS,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (error) {
      console.error(`RemoteLock cancel failed for booking ${bookingId}:`, error);
    }
  }
}

// RemoteLockが利用可能かチェック
export function isRemoteLockConfigured(): boolean {
  return !!(
    process.env.REMOTELOCK_CLIENT_ID &&
    process.env.REMOTELOCK_CLIENT_SECRET &&
    (process.env.REMOTELOCK_DEVICE_ID_ENTRANCE ||
     process.env.REMOTELOCK_DEVICE_ID_GYM ||
     process.env.REMOTELOCK_DEVICE_ID_TRAINING ||
     process.env.REMOTELOCK_DEVICE_ID_YABASE)
  );
}
