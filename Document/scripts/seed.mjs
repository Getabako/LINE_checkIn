#!/usr/bin/env node
// Firestore 初期データ投入スクリプト
//
// 使い方:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json node Document/scripts/seed.mjs memberTypes
//   FIREBASE_SERVICE_ACCOUNT_KEY=<base64> node Document/scripts/seed.mjs coupons
//
// 対象:
//   memberTypes    会員種別マスタ
//   coupons        クーポンサンプル
//   announcements  お知らせサンプル

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function log(level, msg, payload) {
  const line = {
    ts: new Date().toISOString(),
    level,
    scope: 'seed',
    msg,
    ...(payload || {}),
  };
  console.log(JSON.stringify(line));
}

function resolveCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const json = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      'base64'
    ).toString('utf-8');
    return cert(JSON.parse(json));
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // firebase-admin が自動で読む
    return undefined;
  }
  throw new Error(
    'FIREBASE_SERVICE_ACCOUNT_KEY または GOOGLE_APPLICATION_CREDENTIALS を設定してください'
  );
}

function initApp() {
  if (getApps().length > 0) return;
  const credential = resolveCredential();
  initializeApp(credential ? { credential } : {});
}

async function loadJson(filename) {
  const full = path.join(__dirname, '..', 'master-data', filename);
  return JSON.parse(await fs.readFile(full, 'utf-8'));
}

async function seed(collection, filename, keyField = 'code') {
  initApp();
  const db = getFirestore();
  const items = await loadJson(filename);
  log('info', '[OPERATION] seed.start', { collection, count: items.length });

  for (const item of items) {
    const now = new Date().toISOString();
    const data = { createdAt: now, ...item };

    // 既存レコードがあれば更新、なければ追加（key は code で判定）
    const existing = await db
      .collection(collection)
      .where(keyField, '==', item[keyField])
      .limit(1)
      .get();

    if (!existing.empty) {
      const ref = existing.docs[0].ref;
      await ref.set({ ...data, updatedAt: now }, { merge: true });
      log('info', 'updated', { collection, id: ref.id, key: item[keyField] });
    } else {
      const ref = await db.collection(collection).add(data);
      log('info', 'created', { collection, id: ref.id, key: item[keyField] });
    }
  }

  log('info', '[OPERATION] seed.done', { collection });
}

const target = process.argv[2];
const map = {
  memberTypes: ['memberTypes', 'memberTypes.json', 'code'],
  coupons: ['coupons', 'coupons.sample.json', 'code'],
  announcements: ['announcements', 'announcements.sample.json', 'title'],
};

if (!target || !map[target]) {
  console.error(
    'Usage: node seed.mjs <memberTypes | coupons | announcements>'
  );
  process.exit(1);
}

seed(...map[target]).catch((err) => {
  log('error', 'seed.fail', { message: String(err) });
  process.exit(1);
});
