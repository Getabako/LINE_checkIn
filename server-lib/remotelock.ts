// RemoteLock API クライアント
// 推奨API: POST /bookings で予約+カギ発行
// API base: https://api.remotelock-pf.jp (推奨・最新)
//
// デバイス構成:
//   ASP玄関扉          (共用入口)       シリアル: AC000W017827101
//   ASP体育館          (GYM)           シリアル: AC000W017830299
//   ASPトレーニングルーム (TRAINING)     シリアル: AC000W017830548
//   みんなの体育館八橋   (YABASE)        シリアル: AC000W017827205
//
// 複数ドアの扱い（2026-09-16 修正）:
//   同じ時間帯に同じPINで2件目の booking を作ると RemoteLock 側で
//   「PIN has already been taken」となり、201 のまま別PINに差し替えられる
//   （= 玄関は開くのに体育館が開かない事故の原因）。
//   そのため 1台目だけ booking を作り、レスポンスの access_person に対して
//   POST /access_persons/{id}/accesses で 2台目以降のドアを追加する。
//   これで全ドアが同一PINになる。
//
// 開始前マージン:
//   booking の start_margin_sec は API から変更できない（読み取り専用）ため、
//   starts_at 自体を REMOTELOCK_START_MARGIN_MIN 分（既定10分）前倒しして登録する。

const REMOTELOCK_API_BASE = 'https://api.remotelock-pf.jp';

// 予約開始の何分前からPINを有効にするか（ユーザー入れ替えをスムーズにするため）
const START_MARGIN_MIN = (() => {
  const v = Number(process.env.REMOTELOCK_START_MARGIN_MIN ?? '10');
  return Number.isFinite(v) && v >= 0 ? v : 10;
})();

// "yyyy-MM-ddTHH:mm:ss"（JSTローカル・オフセットなし）を分単位でずらす
function shiftLocalDateTime(local: string, deltaMinutes: number): string {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!m || deltaMinutes === 0) return local;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  d.setUTCMinutes(d.getUTCMinutes() + deltaMinutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

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

// 拠点・施設タイプに応じて解錠するデバイスIDのリストを取得
function getDeviceIds(location: string, facilityType: string): string[] {
  const entranceId = process.env.REMOTELOCK_DEVICE_ID_ENTRANCE;
  const gymId = process.env.REMOTELOCK_DEVICE_ID_GYM;
  const trainingId = process.env.REMOTELOCK_DEVICE_ID_TRAINING;
  const yabaseId = process.env.REMOTELOCK_DEVICE_ID_YABASE;

  const deviceIds: string[] = [];

  if (location === 'YABASE') {
    // 八橋体育館はロック1つのみ
    if (yabaseId) deviceIds.push(yabaseId);
  } else {
    // ASP施設: 共用入口 + 施設別ロック
    if (entranceId) deviceIds.push(entranceId);
    if (facilityType === 'GYM' && gymId) {
      deviceIds.push(gymId);
    } else if ((facilityType === 'TRAINING_PRIVATE' || facilityType === 'TRAINING_SHARED') && trainingId) {
      // 貸切・相席ともに同じトレーニングルームのロック
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
  location: string;
  facilityType: string;
  pin?: string; // グループ予約で同一PINを指定する場合
}): Promise<BookingResult> {
  const accessToken = await getAccessToken();
  const deviceIds = getDeviceIds(params.location, params.facilityType);

  if (deviceIds.length === 0) {
    throw new Error('No RemoteLock device IDs configured for this facility type');
  }

  // RemoteLock APIは yyyy-MM-dd'T'HH:mm:ss（タイムゾーンオフセットなし・JSTローカル時刻）のみ受け付ける
  const stripTz = (v: string) => v.replace(/(\+|-)\d{2}:\d{2}$|Z$/, '');
  // 開始はマージン分前倒し（入れ替えをスムーズにする）。終了は予約通り
  const startsAt = shiftLocalDateTime(stripTz(params.startsAt), -START_MARGIN_MIN);
  const endsAt = stripTz(params.endsAt);

  const authHeaders = {
    ...API_HEADERS,
    Authorization: `Bearer ${accessToken}`,
  };

  // 1台目: booking を作成（PINと access_person が発行される）
  const body: Record<string, unknown> = {
    type: 'booking',
    id: params.checkinId,
    attributes: {
      name: params.name,
      device_id: deviceIds[0],
      starts_at: startsAt,
      ends_at: endsAt,
      validation: false,
      ...(params.pin ? { pin: params.pin } : {}),
    },
  };

  const response = await fetch(`${REMOTELOCK_API_BASE}/bookings`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RemoteLock booking failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const attrs = result.data.attributes;
  const pinCode: string = attrs.pin || '';
  const universalAccessKeyUrl: string = attrs.universal_access_key_url || '';
  const accessPersonId: string = attrs.access_person_id || '';
  const bookingIds: string[] = [result.data.id];

  if (!pinCode) {
    throw new Error('RemoteLock: PIN was not generated');
  }

  // 指定PINが使用済みで差し替えられた場合は警告（呼び出し側は返却PINを正として扱う）
  if (params.pin && pinCode !== params.pin) {
    console.warn(
      `RemoteLock: requested PIN ${params.pin} was replaced with ${pinCode} for ${params.checkinId}`,
      JSON.stringify(result.meta ?? null),
    );
  }

  // 2台目以降: 同じ access_person にドアのアクセス権を追加（同一PINで開く）
  const failedDevices: string[] = [];
  for (const deviceId of deviceIds.slice(1)) {
    if (!accessPersonId) {
      failedDevices.push(deviceId);
      continue;
    }
    const accessRes = await fetch(`${REMOTELOCK_API_BASE}/access_persons/${accessPersonId}/accesses`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        attributes: { accessible_id: deviceId, accessible_type: 'lock' },
      }),
    });
    if (!accessRes.ok) {
      const errorText = await accessRes.text();
      console.error(`RemoteLock access add failed for device ${deviceId}: ${accessRes.status} ${errorText}`);
      failedDevices.push(deviceId);
    }
  }

  // 施設側のドアが開かないと利用できないので、失敗は呼び出し側に伝えて管理者通知に乗せる
  if (failedDevices.length > 0) {
    throw new Error(
      `RemoteLock: PIN ${pinCode} was issued for the entrance but adding access to device(s) ${failedDevices.join(', ')} failed`,
    );
  }

  return { pinCode, universalAccessKeyUrl, bookingIds };
}

// 予約キャンセル
export async function cancelBooking(checkinId: string, deviceCount: number): Promise<void> {
  const accessToken = await getAccessToken();

  // 現行は booking 1件（id = checkinId）。旧方式（`${checkinId}-N`）で作られた予約も念のため対象にする
  const ids = [checkinId];
  if (deviceCount > 1) {
    for (let i = 0; i < deviceCount; i++) ids.push(`${checkinId}-${i + 1}`);
  }

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

// ============================================================
// スタッフ入館（業者・清掃のシルバー人材など、予約と無関係に決まった曜日・時間帯だけ開くPIN）
//
// 仕組み:
//   1. POST /schedules (access_schedule) で曜日別の時間帯（例: 月水金 09:00〜11:00）を作る
//   2. POST /access_persons (access_guest) で有効期間付きのゲストを作り PIN を自動発行
//   3. POST /access_persons/{id}/accesses で対象ドアをスケジュール付きで紐づける
// 取り消しは PUT /access_persons/{id}/deactivate（履歴が残る）＋スケジュール削除。
// ============================================================

export type StaffDoor = 'ENTRANCE' | 'GYM' | 'TRAINING' | 'YABASE';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const STAFF_DOOR_DEVICE_ENV: Record<StaffDoor, string> = {
  ENTRANCE: 'REMOTELOCK_DEVICE_ID_ENTRANCE',
  GYM: 'REMOTELOCK_DEVICE_ID_GYM',
  TRAINING: 'REMOTELOCK_DEVICE_ID_TRAINING',
  YABASE: 'REMOTELOCK_DEVICE_ID_YABASE',
};

function staffDoorDeviceId(door: StaffDoor): string | undefined {
  return process.env[STAFF_DOOR_DEVICE_ENV[door]];
}

async function rlFetch(path: string, init: RequestInit): Promise<Response> {
  const accessToken = await getAccessToken();
  return fetch(`${REMOTELOCK_API_BASE}${path}`, {
    ...init,
    headers: { ...API_HEADERS, Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
}

export interface StaffAccessResult {
  pinCode: string;
  accessPersonId: string;
  scheduleId: string;
}

export async function createStaffAccess(params: {
  name: string;
  doors: StaffDoor[];
  startDate: string; // yyyy-MM-dd（JST）
  endDate: string;   // yyyy-MM-dd（JST・この日の終わりまで有効）
  days: Weekday[];
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}): Promise<StaffAccessResult> {
  const deviceIds = params.doors.map((d) => staffDoorDeviceId(d)).filter((v): v is string => !!v);
  if (deviceIds.length === 0) throw new Error('対象ドアのデバイスIDが設定されていません');
  if (params.days.length === 0) throw new Error('曜日を1つ以上選んでください');

  // 1. 曜日別スケジュール
  const scheduleAttrs: Record<string, unknown> = { name: `staff ${params.name} ${params.startDate}` };
  for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as Weekday[]) {
    scheduleAttrs[d] = params.days.includes(d)
      ? [{ start_time: params.startTime, end_time: params.endTime }]
      : [];
  }
  const schedRes = await rlFetch('/schedules', {
    method: 'POST',
    body: JSON.stringify({ type: 'access_schedule', attributes: scheduleAttrs }),
  });
  if (!schedRes.ok) throw new Error(`RemoteLock schedule failed: ${schedRes.status} ${await schedRes.text()}`);
  const scheduleId: string = (await schedRes.json()).data.id;

  // 2. 期間付きゲスト（PIN自動発行）。日時はタイムゾーンなしのJSTローカル
  const guestRes = await rlFetch('/access_persons', {
    method: 'POST',
    body: JSON.stringify({
      type: 'access_guest',
      attributes: {
        name: params.name,
        generate_pin: true,
        starts_at: `${params.startDate}T00:00:00`,
        ends_at: `${params.endDate}T23:59:59`,
      },
    }),
  });
  if (!guestRes.ok) {
    await rlFetch(`/schedules/${scheduleId}`, { method: 'DELETE' }).catch(() => undefined);
    throw new Error(`RemoteLock access_guest failed: ${guestRes.status} ${await guestRes.text()}`);
  }
  const guest = await guestRes.json();
  const accessPersonId: string = guest.data.id;
  const pinCode: string = guest.data.attributes?.pin || '';
  if (!pinCode) throw new Error('RemoteLock: PIN was not generated for staff access');

  // 3. ドアをスケジュール付きで紐づけ
  const failed: string[] = [];
  for (const deviceId of deviceIds) {
    const res = await rlFetch(`/access_persons/${accessPersonId}/accesses`, {
      method: 'POST',
      body: JSON.stringify({
        attributes: { accessible_id: deviceId, accessible_type: 'lock', access_schedule_id: scheduleId },
      }),
    });
    if (!res.ok) {
      console.error(`RemoteLock staff access add failed for ${deviceId}: ${res.status} ${await res.text()}`);
      failed.push(deviceId);
    }
  }
  if (failed.length > 0) {
    await deactivateStaffAccess(accessPersonId, scheduleId);
    throw new Error(`RemoteLock: ドアの紐づけに失敗しました (${failed.join(', ')})`);
  }

  return { pinCode, accessPersonId, scheduleId };
}

export async function deactivateStaffAccess(accessPersonId: string, scheduleId?: string | null): Promise<void> {
  try {
    const res = await rlFetch(`/access_persons/${accessPersonId}/deactivate`, { method: 'PUT' });
    if (!res.ok) console.error(`RemoteLock staff deactivate failed: ${res.status} ${await res.text()}`);
  } catch (e) {
    console.error('RemoteLock staff deactivate error:', e);
  }
  if (scheduleId) {
    try {
      await rlFetch(`/schedules/${scheduleId}`, { method: 'DELETE' });
    } catch (e) {
      console.error('RemoteLock schedule delete error:', e);
    }
  }
}
