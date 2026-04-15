import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, COLLECTIONS } from '../../server-lib/firebase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, location, totalPrice } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'クーポンコードを入力してください' });
    }

    const db = getDb();
    const snapshot = await db
      .collection(COLLECTIONS.COUPONS)
      .where('code', '==', code.toUpperCase().trim())
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({
        valid: false,
        message: 'クーポンコードが無効です',
      });
    }

    const coupon = snapshot.docs[0].data();
    const now = new Date();

    // 有効期限チェック
    if (coupon.validFrom && new Date(coupon.validFrom) > now) {
      return res.status(200).json({
        valid: false,
        message: 'このクーポンはまだ利用開始前です',
      });
    }

    if (coupon.validUntil && new Date(coupon.validUntil) < now) {
      return res.status(200).json({
        valid: false,
        message: 'このクーポンの有効期限が切れています',
      });
    }

    // 使用回数チェック
    if (coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses) {
      return res.status(200).json({
        valid: false,
        message: 'このクーポンの使用回数上限に達しました',
      });
    }

    // 拠点制限チェック
    if (coupon.locationFilter && location && coupon.locationFilter !== location) {
      return res.status(200).json({
        valid: false,
        message: `このクーポンは${coupon.locationFilter === 'ASP' ? 'ASP' : 'やばせ'}限定です`,
      });
    }

    // 割引計算
    let discount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discount = Math.floor((totalPrice || 0) * (coupon.discountValue / 100));
    } else if (coupon.discountType === 'FIXED') {
      discount = coupon.discountValue;
    }

    discount = Math.min(discount, totalPrice || 0);

    return res.status(200).json({
      valid: true,
      couponId: snapshot.docs[0].id,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discount,
      discountedPrice: (totalPrice || 0) - discount,
      message: coupon.discountType === 'PERCENTAGE'
        ? `${coupon.discountValue}%割引が適用されます`
        : `¥${coupon.discountValue.toLocaleString()}割引が適用されます`,
    });
  } catch (error) {
    console.error('Coupon validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
