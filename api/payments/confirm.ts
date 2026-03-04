import type { VercelRequest, VercelResponse } from '@vercel/node';

// LINE Pay confirm endpoint - deprecated, replaced by Stripe
// Keeping as redirect to home for backwards compatibility
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://your-app.vercel.app';
  return res.redirect(`${baseUrl}/`);
}
