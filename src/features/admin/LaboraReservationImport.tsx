import React from 'react';
import { FiUploadCloud, FiKey, FiLink } from 'react-icons/fi';
import { adminApi, AdminUser, LaboraImportResult, LaboraReservationRow, LaboraTeamSummary, LocationId } from '../../lib/api';
import { getLocationName } from '../../lib/locations';

// ============================================================
// LaBOLA（旧予約システム）の予約CSVを取り込む。
//   1. 拠点と「この日以降を取り込む」を選んで CSV を読み込む → 件数を確認
//   2. 取り込み（予約の登録）→ 続けてスマートロックの鍵を登録
//   3. 団体ごとの解錠コードと LINE 連携の状況を一覧で確認
// 同じ CSV を何度取り込んでも二重登録にはならない（切り替え直前の最新CSVで上書き確認できる）。
// ============================================================

/** ダブルクォート内の改行・カンマに対応した CSV パーサ */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      row.push(cur); cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

/** UTF-8 として正しく読めなければ Shift-JIS とみなす（LaBOLA の出力はどちらもあり得る） */
function decodeCsv(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('shift-jis').decode(buf);
  }
}

const COLUMNS: Record<keyof LaboraReservationRow, string> = {
  reservationNo: '予約番号',
  content: '予約内容',
  date: '日付',
  startTime: '開始時間',
  endTime: '終了時間',
  status: '予約ステータス',
  paymentMethod: '支払い方法',
  amount: '金額',
  customerType: '顧客タイプ',
  customerNumber: '会員番号',
  name: '名前',
  kana: 'ふりがな',
  teamName: '表示名／チーム名',
  email: 'メールアドレス',
  phone: '電話番号',
  mobile: '携帯電話',
};
const REQUIRED: Array<keyof LaboraReservationRow> = ['reservationNo', 'content', 'date', 'startTime', 'endTime', 'status', 'customerNumber'];

interface Preview {
  fileName: string;
  rows: LaboraReservationRow[];
  targetCount: number;       // 取り込み対象（予約完了・開始日以降）
  beforeCount: number;       // 開始日より前（取り込まない）
  inactiveCount: number;     // キャンセル・削除（取り込まない）
  teams: Array<{ name: string; count: number }>;
  hasTraining: boolean;
}

function buildPreview(fileName: string, rows: LaboraReservationRow[], fromDate: string): Preview {
  const from = fromDate.replace(/-/g, '/');
  const live = rows.filter((r) => r.status === '予約完了');
  const target = live.filter((r) => r.date >= from);
  const counts = new Map<string, number>();
  for (const r of target) {
    const name = r.teamName || r.name || '(名前なし)';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return {
    fileName,
    rows,
    targetCount: target.length,
    beforeCount: live.length - target.length,
    inactiveCount: rows.length - live.length,
    teams: [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    hasTraining: target.some((r) => r.content.includes('トレーニング')),
  };
}

const inputClass = 'w-full mt-1 px-3 py-2.5 border border-gray-300 rounded-lg bg-white';
const textStyle: React.CSSProperties = { fontSize: '15px', lineHeight: 1.8, letterSpacing: '0.03em' };

export const LaboraReservationImport: React.FC = () => {
  const [location, setLocation] = React.useState<LocationId | ''>('');
  const [fromDate, setFromDate] = React.useState('2027-01-13');
  const [parsed, setParsed] = React.useState<{ fileName: string; rows: LaboraReservationRow[] } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState('');
  const [result, setResult] = React.useState<(LaboraImportResult & { lockRegistered: number; lockFailed: number; lockRemaining: number; pinChanged: number }) | null>(null);
  const [summary, setSummary] = React.useState<LaboraTeamSummary[] | null>(null);
  const [linkTarget, setLinkTarget] = React.useState<LaboraTeamSummary | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const preview = React.useMemo(
    () => (parsed ? buildPreview(parsed.fileName, parsed.rows, fromDate) : null),
    [parsed, fromDate],
  );

  const loadSummary = React.useCallback(() => {
    adminApi.getLaboraImportSummary().then(setSummary).catch(console.error);
  }, []);
  React.useEffect(loadSummary, [loadSummary]);

  const handleFile = async (file: File) => {
    setResult(null);
    try {
      const table = parseCsv(decodeCsv(await file.arrayBuffer()));
      if (table.length < 2) throw new Error('CSVが空です');
      const header = table[0].map((h) => h.trim());
      const index = {} as Record<keyof LaboraReservationRow, number>;
      (Object.keys(COLUMNS) as Array<keyof LaboraReservationRow>).forEach((k) => {
        index[k] = header.indexOf(COLUMNS[k]);
      });
      const missing = REQUIRED.filter((k) => index[k] < 0).map((k) => COLUMNS[k]);
      if (missing.length > 0) {
        throw new Error(`LaBOLA の「予約一覧（詳細）」CSV ではないようです。見つからない列: ${missing.join('、')}`);
      }
      // LaBOLA は記号を &#39; のような形で出力することがある（例: M&#39;s → M's）
      const decode = (v: string) =>
        v
          .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
      const rows = table.slice(1).map((cells) => {
        const row = {} as LaboraReservationRow;
        (Object.keys(COLUMNS) as Array<keyof LaboraReservationRow>).forEach((k) => {
          row[k] = index[k] >= 0 ? decode(cells[index[k]] || '').trim() : '';
        });
        return row;
      });
      setParsed({ fileName: file.name, rows });
    } catch (e) {
      setParsed(null);
      alert('CSVを読み込めませんでした: ' + (e as Error).message);
    }
  };

  const reset = () => {
    setParsed(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const runLocks = async (retryFailed: boolean) => {
    return adminApi.drainPendingLocks(
      (r) => setProgress(`鍵を登録しています… ${r.totalRegistered}件完了（残り${r.remaining}件）`),
      retryFailed,
    );
  };

  const handleImport = async () => {
    if (!preview || !location) return;
    if (!confirm(`${getLocationName(location)} に ${preview.targetCount}件の予約を取り込みます。\n（${fromDate} 以降の「予約完了」のみ。決済は発生しません）\n\nよろしいですか？`)) return;
    setBusy(true);
    setResult(null);
    try {
      setProgress('予約を登録しています…');
      const imp = await adminApi.importReservations(location, fromDate, preview.rows, (done, total) =>
        setProgress(`予約を登録しています… ${done} / ${total} 行`),
      );
      setProgress('鍵を登録しています…');
      const lock = await runLocks(false);
      setResult({ ...imp, lockRegistered: lock.registered, lockFailed: lock.failed, lockRemaining: lock.remaining, pinChanged: lock.pinChanged });
      reset();
      loadSummary();
    } catch (e) {
      alert('取り込みに失敗しました: ' + (e as Error).message + '\n\n途中まで登録された分は、同じCSVをもう一度取り込めば続きから登録されます（二重にはなりません）。');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const handleRetryLocks = async () => {
    setBusy(true);
    try {
      setProgress('鍵を登録しています…');
      const lock = await runLocks(true);
      alert(`鍵の登録: ${lock.registered}件完了` + (lock.failed + lock.remaining > 0 ? ` / ${lock.failed + lock.remaining}件は登録できませんでした` : ''));
      loadSummary();
    } catch (e) {
      alert('鍵の登録に失敗しました: ' + (e as Error).message);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const wrongLocation = !!preview && location === 'YABASE' && preview.hasTraining;
  const needsLock = (summary || []).some((s) => s.pending > 0 || s.failed > 0);

  return (
    <section className="panel" style={textStyle}>
      <div className="panel-header">
        <FiUploadCloud className="w-4 h-4" />
        LaBOLA予約の取り込み（定期利用の移行）
      </div>
      <div className="panel-body space-y-4">
        <p className="text-gray-600">
          LaBOLA の「予約一覧（詳細）」CSV から、指定した日以降の予約をまとめて登録します。
          決済は発生せず、団体ごとに全日程共通の解錠コードを発行します。
          同じCSVを取り込み直しても二重登録にはなりません。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-gray-700 font-semibold">拠点</span>
            <select value={location} onChange={(e) => setLocation(e.target.value as LocationId | '')} className={inputClass} disabled={busy}>
              <option value="">選んでください</option>
              <option value="ASP">{getLocationName('ASP')}</option>
              <option value="YABASE">{getLocationName('YABASE')}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-gray-700 font-semibold">この日以降の利用分を取り込む</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} disabled={busy} />
          </label>
        </div>

        <label className="block">
          <span className="text-gray-700 font-semibold">予約CSV（拠点ごとに1ファイル）</span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="block w-full mt-1"
          />
        </label>

        {preview && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="font-bold text-gray-900">取り込む予約: {preview.targetCount}件</p>
            <p className="text-gray-600">
              取り込まない行: {fromDate} より前 {preview.beforeCount}件 / キャンセル・削除 {preview.inactiveCount}件
            </p>
            {preview.teams.length > 0 && (
              <ul className="divide-y divide-gray-200 bg-white rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
                {preview.teams.map((t) => (
                  <li key={t.name} className="flex justify-between gap-3 px-3 py-2">
                    <span className="text-gray-800 min-w-0 break-words">{t.name}</span>
                    <span className="font-semibold text-primary-700 flex-shrink-0">{t.count}件</span>
                  </li>
                ))}
              </ul>
            )}
            {wrongLocation && (
              <p className="text-red-600 font-semibold">
                トレーニングルームの予約が含まれています。やばせではなく ASP のCSVではありませんか。拠点を確認してください。
              </p>
            )}
            {!location && <p className="text-amber-700 font-semibold">拠点を選ぶと取り込めます。</p>}
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={busy || !location || wrongLocation || preview.targetCount === 0}
                className="flex-1 py-3 rounded-lg bg-primary-600 text-white font-semibold disabled:opacity-40"
              >
                {busy ? '取り込み中…' : '取り込む'}
              </button>
              <button onClick={reset} disabled={busy} className="px-4 py-3 rounded-lg border border-gray-300 text-gray-700 font-semibold disabled:opacity-40">
                やめる
              </button>
            </div>
          </div>
        )}

        {busy && progress && (
          <p className="text-primary-700 font-semibold" role="status">{progress}（画面を閉じずにお待ちください）</p>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <p className="font-bold text-green-800">取り込みが終わりました</p>
            <p className="text-gray-800">
              新しく登録 {result.created}件 / 登録済みで変更なし {result.unchanged}件 / 日時を変更 {result.changed}件 / 取り消し {result.cancelled}件
            </p>
            <p className="text-gray-800">
              鍵の登録 {result.lockRegistered}件
              {result.pinChanged > 0 && ` / うち ${result.pinChanged}件は団体共通とは別の解錠コードになりました`}
            </p>
            {(result.lockFailed > 0 || result.lockRemaining > 0) && (
              <p className="text-red-600 font-semibold">
                {result.lockFailed + result.lockRemaining}件は鍵を登録できませんでした。下の「鍵の登録をやり直す」を押してください。
              </p>
            )}
            {result.conflicts.length > 0 && (
              <details className="text-red-700">
                <summary className="cursor-pointer font-semibold">すでに別の予約が入っていて登録できなかった枠 {result.conflicts.length}件</summary>
                <ul className="list-disc pl-5 mt-1">{result.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </details>
            )}
            {result.errors.length > 0 && (
              <details className="text-red-700">
                <summary className="cursor-pointer font-semibold">読み取れなかった行 {result.errors.length}件</summary>
                <ul className="list-disc pl-5 mt-1">{result.errors.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </details>
            )}
          </div>
        )}

        {summary && summary.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="font-bold text-gray-900 flex items-center gap-2">
                <FiKey className="w-4 h-4 text-primary-500" />
                取り込んだ団体と解錠コード
              </h4>
              {needsLock && (
                <button onClick={handleRetryLocks} disabled={busy} className="px-3 py-2 rounded-lg bg-gray-800 text-white font-semibold disabled:opacity-40">
                  鍵の登録をやり直す
                </button>
              )}
            </div>
            <ul className="space-y-2">
              {summary.map((s) => (
                <li key={`${s.userId}-${s.location}`} className="border border-gray-200 rounded-xl p-3 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 break-words">{s.displayName}</p>
                      <p className="text-gray-600">
                        {getLocationName(s.location)} / {s.count}件（{s.firstDate}〜{s.lastDate}）
                      </p>
                      <p className="text-gray-800">
                        解錠コード:{' '}
                        {s.pins.length > 0
                          ? <span className="font-mono font-bold tracking-widest text-primary-700">{s.pins.join(' / ')}</span>
                          : <span className="text-amber-700">未登録</span>}
                        {s.pending + s.failed > 0 && <span className="text-red-600">（鍵の未登録 {s.pending + s.failed}件）</span>}
                      </p>
                    </div>
                    {s.linked ? (
                      <span className="flex-shrink-0 px-2 py-1 rounded-md bg-green-100 text-green-800 font-semibold">LINE連携済み</span>
                    ) : (
                      <button
                        onClick={() => setLinkTarget(s)}
                        className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg border-2 border-primary-300 text-primary-700 font-semibold"
                      >
                        <FiLink className="w-4 h-4" />
                        LINEと紐づける
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {linkTarget && (
        <LinkLineAccountModal
          userId={linkTarget.userId}
          teamName={linkTarget.displayName}
          onClose={() => setLinkTarget(null)}
          onLinked={() => { setLinkTarget(null); loadSummary(); }}
        />
      )}
    </section>
  );
};

// ============================================================
// LINE未連携の団体（取り込んだ会員）を、本人の LINE アカウントに紐づける。
// 本人に一度ミニアプリを開いてもらうと、ここに LINE の名前で表示される。
// ============================================================
export const LinkLineAccountModal: React.FC<{
  userId: string;
  teamName: string;
  onClose: () => void;
  onLinked: () => void;
}> = ({ userId, teamName, onClose, onLinked }) => {
  const [search, setSearch] = React.useState('');
  const [users, setUsers] = React.useState<AdminUser[] | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback((q?: string) => {
    adminApi.getLineUsers(q).then((list) => setUsers(list.filter((u) => u.id !== userId))).catch((e) => {
      console.error(e);
      setUsers([]);
    });
  }, [userId]);
  React.useEffect(() => load(), [load]);

  const handleLink = async (u: AdminUser) => {
    const lineName = u.lineDisplayName || u.displayName || '(名前なし)';
    const note = u.isImported ? `\n（この方はすでに「${u.displayName}」と連携済みです。2つの団体の予約を同じ LINE にまとめます）` : '';
    if (!confirm(`「${teamName}」を LINE の「${lineName}」さんに紐づけます。${note}\n\n紐づけると、この方のマイ予約に団体の予約と解錠コードが表示され、LINE に案内が届きます。\nよろしいですか？`)) return;
    setSaving(true);
    try {
      const r = await adminApi.linkLineAccount(userId, u.id);
      alert(r.notified ? '紐づけました。ご本人の LINE に解錠コードの案内を送りました。' : '紐づけました。（LINE への案内は送れませんでした。マイ予約には表示されます）');
      onLinked();
    } catch (e) {
      alert('紐づけに失敗しました: ' + (e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onClose()}>
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-5 space-y-3"
        style={textStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-gray-900" style={{ fontSize: '18px' }}>LINEアカウントと紐づける</h3>
        <p className="text-gray-600">
          「{teamName}」のご担当者を選んでください。一覧に出るのは、ミニアプリを一度でも開いた方です（新しい順）。
          見つからないときは、ご本人にミニアプリを開いてもらってから「更新」を押してください。
        </p>
        <div className="flex gap-2">
          <input
            placeholder="LINEの名前で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(search)}
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg"
          />
          <button onClick={() => load(search)} className="px-4 py-2.5 rounded-lg bg-primary-500 text-white font-semibold">
            更新
          </button>
        </div>
        {users === null ? (
          <p className="text-gray-500">読み込み中…</p>
        ) : users.length === 0 ? (
          <p className="text-gray-500">該当する LINE アカウントがありません。</p>
        ) : (
          <ul className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-80 overflow-y-auto">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 break-words">{u.lineDisplayName || u.displayName || '(名前なし)'}</p>
                  <p className="text-gray-500" style={{ fontSize: '13px' }}>
                    {u.isImported ? `連携済み: ${u.displayName}` : u.createdAt ? `初回利用 ${u.createdAt.slice(0, 10)}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleLink(u)}
                  disabled={saving}
                  className="flex-shrink-0 px-3 py-2 rounded-lg bg-primary-600 text-white font-semibold disabled:opacity-40"
                >
                  この人
                </button>
              </li>
            ))}
          </ul>
        )}
        <button onClick={onClose} disabled={saving} className="w-full py-2.5 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold disabled:opacity-40">
          閉じる
        </button>
      </div>
    </div>
  );
};
