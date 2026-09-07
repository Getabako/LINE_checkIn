/**
 * server-lib/db.ts の Firestore 互換レイヤを実 DB に対して一通り叩く。
 *
 *   npx tsc server-lib/db.ts --outDir dist-smoke --module nodenext \
 *     --moduleResolution nodenext --target es2022 --skipLibCheck --esModuleInterop
 *   node --env-file=.env scripts/smoke-db.mjs
 *   rm -rf dist-smoke
 *
 * 一時的にクーポン等を作って最後に消すので、本番 DB に向けても副作用は残らない。
 */
import { getDb, COLLECTIONS, FieldValue } from '../dist-smoke/db.js';

const db = getDb();
const ok = (label, cond, extra = '') => console.log(`${cond ? 'OK  ' : 'FAIL'} ${label} ${extra}`);

// 1. where + limit
const u = await db.collection(COLLECTIONS.USERS)
  .where('lineUserId', '==', 'U3e40385c0590008a256cd96f049c8ca6').limit(1).get();
ok('users where lineUserId', !u.empty, u.docs[0]?.data().displayName);

// 2. 全件取得 + 型
const all = await db.collection(COLLECTIONS.CHECKINS).get();
const c = all.docs[0].data();
ok('checkins count 81', all.size === 81, all.size);
ok('数値が number', typeof c.totalPrice === 'number', typeof c.totalPrice);
ok('createdAt が ISO 文字列', typeof c.createdAt === 'string' && c.createdAt.endsWith('Z'), c.createdAt);
ok('date は YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(c.date), c.date);

// 3. 範囲クエリ
const range = await db.collection(COLLECTIONS.CHECKINS)
  .where('date', '>=', '2026-07-01').where('date', '<=', '2026-07-31').get();
ok('date 範囲クエリ', range.size > 0, `${range.size}件`);

// 4. orderBy desc
const ordered = await db.collection(COLLECTIONS.CHECKINS).orderBy('createdAt', 'desc').limit(3).get();
const ts = ordered.docs.map((d) => d.data().createdAt);
ok('orderBy createdAt desc', ts[0] >= ts[1] && ts[1] >= ts[2], ts.join(' > '));

// 5. doc().get()
const one = await db.collection(COLLECTIONS.CHECKINS).doc(all.docs[0].id).get();
ok('doc get exists', one.exists && one.id === all.docs[0].id);
const missing = await db.collection(COLLECTIONS.CHECKINS).doc('does-not-exist').get();
ok('存在しない doc', !missing.exists && missing.data() === undefined);

// 6. add / update / increment / delete
const ref = await db.collection(COLLECTIONS.COUPONS).add({
  code: '__SMOKE__', description: 'smoke test', discountType: 'FIXED', discountValue: 100,
  isActive: true, usedCount: 0, createdAt: new Date().toISOString(), unknownField: { a: 1 },
});
ok('add が 20 文字 ID', ref.id.length === 20, ref.id);
await ref.update({ usedCount: FieldValue.increment(3) });
await ref.update({ description: '更新後' });
const after = (await ref.get()).data();
ok('increment', after.usedCount === 3, after.usedCount);
ok('update', after.description === '更新後');
ok('未知フィールドは extra に退避して復元', JSON.stringify(after.unknownField) === '{"a":1}', JSON.stringify(after.unknownField));

// 7. batch
const b = db.batch();
const r2 = db.collection(COLLECTIONS.COUPONS).doc();
b.set(r2, { code: '__SMOKE2__', isActive: true, usedCount: 0 });
b.update(ref, { isActive: false });
await b.commit();
ok('batch set', (await r2.get()).exists);
ok('batch update', (await ref.get()).data().isActive === false);

// 8. where で null / boolean
const inactive = await db.collection(COLLECTIONS.COUPONS).where('isActive', '==', false).get();
ok('boolean where', inactive.size >= 1, `${inactive.size}件`);

// 9. settings（jsonb 丸ごと）
const s = await db.collection('settings').doc('facilityProfiles').get();
ok('settings 読み取り', s.exists && !!s.data().ASP);
await db.collection('settings').doc('__smoke__').set({ a: 1, b: { c: 2 } });
await db.collection('settings').doc('__smoke__').set({ a: 9 }, { merge: true });
const sm = (await db.collection('settings').doc('__smoke__').get()).data();
ok('settings merge', sm.a === 9 && sm.b.c === 2, JSON.stringify(sm));

// 後片付け
const bd = db.batch();
bd.delete(ref); bd.delete(r2); bd.delete(db.collection('settings').doc('__smoke__'));
await bd.commit();
ok('batch delete', !(await ref.get()).exists && !(await r2.get()).exists);

process.exit(0);
