import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const OUT = process.argv[2];
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

function conv(v) {
  if (v instanceof Timestamp) return { __ts: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(conv);
  if (v && typeof v === 'object' && v.constructor === Object) {
    const o = {}; for (const [k, x] of Object.entries(v)) o[k] = conv(x); return o;
  }
  return v;
}

const cols = await db.listCollections();
const summary = {};
for (const c of cols) {
  const snap = await c.get();
  const docs = snap.docs.map(d => ({ __id: d.id, ...conv(d.data()) }));
  fs.writeFileSync(path.join(OUT, `${c.id}.json`), JSON.stringify(docs, null, 2));
  summary[c.id] = docs.length;
}
console.log(JSON.stringify(summary, null, 2));
