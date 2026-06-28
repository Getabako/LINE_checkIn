// 料金マスタ（サーバー側の課金計算の唯一の参照元）
// 既定値はコードに固定。管理画面で上書きした分は Firestore settings/pricePlans に保存し、
// loadPriceTable() で既定値にディープマージして返す。
import { getDb } from './firebase.js';

export type PriceTable = Record<string, Record<string, Record<string, Record<string, number>>>>;

// 既定の料金表（税込・円/h）
export const DEFAULT_PRICE_TABLE: PriceTable = {
  ASP: {
    GYM: {
      WEEKDAY: { DAYTIME: 2200, EVENING: 2750 },
      WEEKEND: { DAYTIME: 2750, EVENING: 2750 },
    },
    TRAINING_PRIVATE: {
      WEEKDAY: { ALLDAY: 2200 },
      WEEKEND: { ALLDAY: 2200 },
    },
    TRAINING_SHARED: {
      WEEKDAY: { ALLDAY: 550 },
      WEEKEND: { ALLDAY: 550 },
    },
  },
  YABASE: {
    GYM: {
      WEEKDAY: { DAYTIME: 1650, EVENING: 2200 },
      WEEKEND: { DAYTIME: 2200, EVENING: 2200 },
    },
  },
};

const SETTINGS_COLLECTION = 'settings';
const PRICE_DOC = 'pricePlans';

// 上書き値を既定値にディープマージ（数値のみ採用）
function deepMergePrices(base: PriceTable, override: unknown): PriceTable {
  if (!override || typeof override !== 'object') return base;
  const result: PriceTable = JSON.parse(JSON.stringify(base));
  const ov = override as Record<string, any>;
  for (const loc of Object.keys(result)) {
    const oLoc = ov[loc];
    if (!oLoc || typeof oLoc !== 'object') continue;
    for (const fac of Object.keys(result[loc])) {
      const oFac = oLoc[fac];
      if (!oFac || typeof oFac !== 'object') continue;
      for (const dayType of Object.keys(result[loc][fac])) {
        const oDay = oFac[dayType];
        if (!oDay || typeof oDay !== 'object') continue;
        for (const slot of Object.keys(result[loc][fac][dayType])) {
          const v = oDay[slot];
          if (typeof v === 'number' && isFinite(v) && v >= 0) {
            result[loc][fac][dayType][slot] = Math.round(v);
          }
        }
      }
    }
  }
  return result;
}

// 課金計算で使う料金表を取得（既定 + 管理画面上書き）
export async function loadPriceTable(): Promise<PriceTable> {
  try {
    const db = getDb();
    const doc = await db.collection(SETTINGS_COLLECTION).doc(PRICE_DOC).get();
    if (!doc.exists) return DEFAULT_PRICE_TABLE;
    return deepMergePrices(DEFAULT_PRICE_TABLE, doc.data());
  } catch (e) {
    console.error('loadPriceTable error:', e);
    return DEFAULT_PRICE_TABLE;
  }
}

// 上書き値の保存（管理画面）。既定構造に存在するキーのみ採用。
export async function savePriceTable(override: unknown): Promise<PriceTable> {
  const db = getDb();
  const merged = deepMergePrices(DEFAULT_PRICE_TABLE, override);
  await db
    .collection(SETTINGS_COLLECTION)
    .doc(PRICE_DOC)
    .set({ ...merged, updatedAt: new Date().toISOString() }, { merge: false });
  return merged;
}
