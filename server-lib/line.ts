// LINE Messaging API ユーティリティ
//
// 送信元チャネルは2系統をサポートし、Labora併用のまま段階移行できる：
// 1. プライマリ: LINE_MESSAGING_CHANNEL_ID + LINE_MESSAGING_CHANNEL_SECRET
//    （やばせ＝先方プロバイダーのチャネル。ステートレストークンを都度発行するので
//      Laboraが使う長期チャネルアクセストークンを無効化しない）
// 2. フォールバック: LINE_CHANNEL_ACCESS_TOKEN（if(塾)チャネルの長期トークン）
//    プライマリ未設定時、またはプライマリで届かないユーザー
//    （旧プロバイダーの userId → 400 invalid user）に対して使用。

const LINE_API_BASE = 'https://api.line.me/v2/bot';
const TOKEN_ENDPOINT = 'https://api.line.me/oauth2/v3/token';

export function isLineConfigured(): boolean {
  return (
    !!process.env.LINE_CHANNEL_ACCESS_TOKEN ||
    (!!process.env.LINE_MESSAGING_CHANNEL_ID && !!process.env.LINE_MESSAGING_CHANNEL_SECRET)
  );
}

// ステートレストークンのキャッシュ（有効期限15分 → 10分で再発行）
let statelessToken: { token: string; expiresAt: number } | null = null;

// プライマリチャネルのステートレスアクセストークンを発行
// （client_credentials。何度発行しても既存の長期トークンには影響しない）
async function getStatelessToken(): Promise<string | null> {
  const channelId = process.env.LINE_MESSAGING_CHANNEL_ID;
  const channelSecret = process.env.LINE_MESSAGING_CHANNEL_SECRET;
  if (!channelId || !channelSecret) return null;

  if (statelessToken && Date.now() < statelessToken.expiresAt) {
    return statelessToken.token;
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });
  if (!response.ok) {
    const error = await response.text().catch(() => '');
    throw new Error(`LINE token error: ${response.status} ${error}`);
  }
  const data = (await response.json()) as { access_token: string };
  statelessToken = { token: data.access_token, expiresAt: Date.now() + 10 * 60 * 1000 };
  return statelessToken.token;
}

async function pushWithToken(
  token: string,
  lineUserId: string,
  messages: Array<{ type: string; text?: string; [key: string]: unknown }>
): Promise<Response> {
  return fetch(`${LINE_API_BASE}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: lineUserId, messages }),
  });
}

export async function sendPushMessage(
  lineUserId: string,
  messages: Array<{ type: string; text?: string; [key: string]: unknown }>
): Promise<void> {
  const legacyToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const primaryToken = await getStatelessToken().catch((e) => {
    console.error('LINE stateless token error:', e);
    return null;
  });

  if (!primaryToken && !legacyToken) {
    throw new Error('LINE messaging channel is not configured');
  }

  if (primaryToken) {
    const response = await pushWithToken(primaryToken, lineUserId, messages);
    if (response.ok) return;
    const error = await response.json().catch(() => ({}));
    // 400 = 旧プロバイダーの userId でこのチャネルからは届かない場合など。
    // フォールバックチャネルがあればそちらで再送する。
    if (response.status === 400 && legacyToken) {
      console.warn(`LINE primary push failed (${JSON.stringify(error)}), falling back to legacy channel`);
    } else {
      throw new Error(`LINE API error: ${response.status} ${JSON.stringify(error)}`);
    }
  }

  const response = await pushWithToken(legacyToken!, lineUserId, messages);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`LINE API error: ${response.status} ${JSON.stringify(error)}`);
  }
}

export async function sendTextMessage(lineUserId: string, text: string): Promise<void> {
  await sendPushMessage(lineUserId, [{ type: 'text', text }]);
}
