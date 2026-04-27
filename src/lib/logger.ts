// フロントエンド共通ロガー
// - debug: 開発時のみ出力（import.meta.env.DEV）
// - info : 操作ログ（画面遷移・ユーザー操作）
// - warn : 軽度な異常
// - error: 例外・失敗
//
// 出力形式: [LEVEL] HH:mm:ss.SSS [scope] message { ...payload }
// ブラウザコンソールに出力されるため、LIFF/デバッグパネルからも確認可能。

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = import.meta.env.DEV;

// 本番でも info 以上は出す（ユーザー操作の追跡に利用）
const MIN_LEVEL: LogLevel = isDev ? 'debug' : 'info';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function ts(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function write(level: LogLevel, scope: string, message: string, payload?: unknown) {
  if (!shouldLog(level)) return;
  const tag = `[${level.toUpperCase()}] ${ts()} [${scope}]`;
  const args: unknown[] = [tag, message];
  if (payload !== undefined) args.push(payload);

  switch (level) {
    case 'debug':
      console.debug(...args);
      break;
    case 'info':
      console.info(...args);
      break;
    case 'warn':
      console.warn(...args);
      break;
    case 'error':
      console.error(...args);
      break;
  }
}

export interface Logger {
  debug: (message: string, payload?: unknown) => void;
  info: (message: string, payload?: unknown) => void;
  warn: (message: string, payload?: unknown) => void;
  error: (message: string, payload?: unknown) => void;
  // 操作ログ専用（info 相当・必ず [OPERATION] プレフィックス）
  op: (action: string, payload?: unknown) => void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, p) => write('debug', scope, m, p),
    info: (m, p) => write('info', scope, m, p),
    warn: (m, p) => write('warn', scope, m, p),
    error: (m, p) => write('error', scope, m, p),
    op: (action, p) => write('info', scope, `[OPERATION] ${action}`, p),
  };
}
