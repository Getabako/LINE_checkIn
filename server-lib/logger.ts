// サーバーサイド（Vercel Serverless Functions）共通ロガー
// - Vercel のログビューアに集約される（vercel logs / ダッシュボード）。
// - 構造化ログ（JSON）で出力し、検索性を確保。
//
// 出力形式: JSON 1 行（{ ts, level, scope, msg, ...payload }）
//
// 運用ログ例:
//   logger.op('checkin.create', { userId, location, facilityType });
//   logger.info('stripe.webhook.received', { event: evt.type });

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const ENV_LEVEL = (process.env.LOG_LEVEL || 'info') as Level;
const MIN = LEVEL_ORDER[ENV_LEVEL] || 20;

function emit(level: Level, scope: string, msg: string, payload?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < MIN) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(payload || {}),
  };
  const line = JSON.stringify(record);
  switch (level) {
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
    default:
      console.log(line);
  }
}

export interface ServerLogger {
  debug: (msg: string, payload?: Record<string, unknown>) => void;
  info: (msg: string, payload?: Record<string, unknown>) => void;
  warn: (msg: string, payload?: Record<string, unknown>) => void;
  error: (msg: string, payload?: Record<string, unknown>) => void;
  // 操作ログ（監査用：ユーザー操作／管理者操作を識別するため action を必須）
  op: (action: string, payload?: Record<string, unknown>) => void;
}

export function createLogger(scope: string): ServerLogger {
  return {
    debug: (m, p) => emit('debug', scope, m, p),
    info: (m, p) => emit('info', scope, m, p),
    warn: (m, p) => emit('warn', scope, m, p),
    error: (m, p) => emit('error', scope, m, p),
    op: (action, p) => emit('info', scope, `[OPERATION] ${action}`, p),
  };
}
