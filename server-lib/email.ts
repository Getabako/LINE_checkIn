// メール送信ユーティリティ（Resend REST API・追加依存なし）
// RESEND_API_KEY が設定されている場合のみ有効。
// 送信元は RECEIPT_EMAIL_FROM（未設定時は Resend のテスト用 onboarding@resend.dev）。

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmailWithAttachment(params: {
  to: string;
  subject: string;
  html: string;
  attachment?: { filename: string; contentBase64: string };
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  const from = process.env.RECEIPT_EMAIL_FROM || 'onboarding@resend.dev';
  const body: Record<string, unknown> = {
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  };
  if (params.attachment) {
    body.attachments = [
      { filename: params.attachment.filename, content: params.attachment.contentBase64 },
    ];
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Resend API error: ${resp.status} ${text}`);
  }
}
