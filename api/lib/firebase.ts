import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let app: App;

function getApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set');
  }

  const serviceAccount = JSON.parse(
    Buffer.from(serviceAccountKey, 'base64').toString('utf-8')
  );

  app = initializeApp({
    credential: cert(serviceAccount),
  });

  return app;
}

export function getDb(): Firestore {
  const firebaseApp = getApp();
  return getFirestore(firebaseApp);
}

// コレクション名
export const COLLECTIONS = {
  USERS: 'users',
  CHECKINS: 'checkins',
  COUPONS: 'coupons',
  COUPON_REDEMPTIONS: 'couponRedemptions',
  MEMBER_TYPES: 'memberTypes',
  USER_MEMBERSHIPS: 'userMemberships',
  REVIEWS: 'reviews',
} as const;
