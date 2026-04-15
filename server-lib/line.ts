// LINE Messaging API ユーティリティ
// LINE_CHANNEL_ACCESS_TOKEN が設定されている場合に利用可能

const LINE_API_BASE = 'https://api.line.me/v2/bot';

export function isLineConfigured(): boolean {
  return !!process.env.LINE_CHANNEL_ACCESS_TOKEN;
}

export async function sendPushMessage(
  lineUserId: string,
  messages: Array<{ type: string; text?: string; [key: string]: unknown }>
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  }

  const response = await fetch(`${LINE_API_BASE}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`LINE API error: ${response.status} ${JSON.stringify(error)}`);
  }
}

export async function sendTextMessage(lineUserId: string, text: string): Promise<void> {
  await sendPushMessage(lineUserId, [{ type: 'text', text }]);
}
