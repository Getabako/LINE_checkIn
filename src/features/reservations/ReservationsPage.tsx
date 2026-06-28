import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCalendar, FiClock, FiMapPin, FiTrash2, FiPlus, FiCopy, FiAlertCircle, FiAward, FiFileText, FiLoader } from 'react-icons/fi';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { checkinApi, Checkin, MemberType, UserMembership, membershipApi } from '../../lib/api';
import { getLocationName, LOCATION_FACILITIES } from '../../lib/locations';
import { calculateEndTime } from '../../lib/price';
import clsx from 'clsx';

const FacilityIcon: React.FC<{ name: string; className?: string }> = ({ name, className }) => {
  switch (name) {
    case 'basketball': return <FaBasketballBall className={className} />;
    case 'dumbbell': return <FaDumbbell className={className} />;
    default: return null;
  }
};

const fmtDiscount = (type: string | undefined, value: number | undefined): string => {
  const t = type || 'NONE';
  if (t === 'NONE') return '割引なし';
  if (t === 'FREE') return '無料';
  if (t === 'PERCENTAGE') return `${value || 0}%OFF`;
  if (t === 'FIXED_PER_HOUR') return `¥${(value || 0).toLocaleString()}/h OFF`;
  return '';
};

const formatMemberDiscount = (mt: MemberType): string => {
  // 新スキーマ: 体育館/ジム別
  if (mt.gymDiscountType || mt.trainingDiscountType || mt.monthlyCoversTraining) {
    const gym = fmtDiscount(mt.gymDiscountType, mt.gymDiscountValue);
    const tr = mt.monthlyCoversTraining
      ? '月額契約中無料'
      : fmtDiscount(mt.trainingDiscountType, mt.trainingDiscountValue);
    if (gym === tr) return `体育館・ジム: ${gym}`;
    return `体育館: ${gym} / ジム: ${tr}`;
  }
  // 後方互換
  const t = mt.discountType || (mt.discounts ? 'FIXED_PER_HOUR' : 'NONE');
  return fmtDiscount(t, mt.discountValue);
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '決済待ち', color: 'bg-amber-100 text-amber-700' },
  PAID: { label: '予約確定', color: 'bg-emerald-100 text-emerald-700' },
  USED: { label: '利用済み', color: 'bg-gray-100 text-gray-500' },
  EXPIRED: { label: '期限切れ', color: 'bg-gray-100 text-gray-400' },
  CANCELLED: { label: 'キャンセル済', color: 'bg-red-100 text-red-500' },
};

export const ReservationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [checkins, setCheckins] = React.useState<Checkin[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [receiptTarget, setReceiptTarget] = React.useState<Checkin | null>(null);
  const [recipientInput, setRecipientInput] = React.useState('');
  const [receiptLoadingId, setReceiptLoadingId] = React.useState<string | null>(null);
  const [emailInput, setEmailInput] = React.useState('');
  const [emailSending, setEmailSending] = React.useState(false);
  const [emailMsg, setEmailMsg] = React.useState('');
  const [membership, setMembership] = React.useState<(UserMembership & { memberType: MemberType | null }) | null>(null);
  const [withdrawing, setWithdrawing] = React.useState(false);

  const reloadMembership = React.useCallback(() => {
    membershipApi.get().then((res) => setMembership(res.membership)).catch(() => setMembership(null));
  }, []);

  React.useEffect(() => {
    reloadMembership();
  }, [reloadMembership]);

  const handleWithdraw = async () => {
    if (!confirm('現在の会員区分を退会します。よろしいですか？\n（割引が適用されなくなります。再登録は施設へお問い合わせください）')) return;
    setWithdrawing(true);
    try {
      await membershipApi.withdraw();
      reloadMembership();
      alert('退会手続きが完了しました');
    } catch {
      alert('退会手続きに失敗しました');
    } finally {
      setWithdrawing(false);
    }
  };

  const fetchCheckins = React.useCallback(async () => {
    try {
      const data = await checkinApi.getAll();
      setCheckins(data);
    } catch {
      setError('予約情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCheckins();
  }, [fetchCheckins]);

  const handleCancel = async (id: string) => {
    if (!confirm('この予約をキャンセルしますか？')) return;

    setCancellingId(id);
    setError(null);
    try {
      await checkinApi.cancel(id);
      await fetchCheckins();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'キャンセルに失敗しました';
      setError(msg);
    } finally {
      setCancellingId(null);
    }
  };

  const handleCopyPin = (pin: string, id: string) => {
    navigator.clipboard.writeText(pin).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // キャンセル可否: 前日まで or 申込から1時間以内（サーバー側の判定と一致させる）
  const canCancel = (checkin: Checkin): boolean => {
    if (checkin.status !== 'PAID' && checkin.status !== 'PENDING') return false;
    const nowT = new Date();
    const startOfUsageDayJst = new Date(`${checkin.date}T00:00:00+09:00`);
    const beforeUsageDay = nowT < startOfUsageDayJst;
    const withinGrace = checkin.createdAt
      ? nowT.getTime() - new Date(checkin.createdAt).getTime() <= 60 * 60 * 1000
      : false;
    return beforeUsageDay || withinGrace;
  };

  const openReceiptModal = (checkin: Checkin) => {
    setReceiptTarget(checkin);
    setRecipientInput('');
    setEmailInput('');
    setEmailMsg('');
  };

  const handleEmailReceipt = async () => {
    if (!receiptTarget) return;
    if (!emailInput.trim()) {
      setEmailMsg('メールアドレスを入力してください');
      return;
    }
    setEmailSending(true);
    setEmailMsg('');
    try {
      await checkinApi.emailReceipt(receiptTarget.id, emailInput, recipientInput);
      setEmailMsg('送信しました');
      setTimeout(() => {
        setReceiptTarget(null);
        setEmailMsg('');
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'メール送信に失敗しました';
      setEmailMsg(msg);
    } finally {
      setEmailSending(false);
    }
  };

  const handleDownloadReceipt = async () => {
    if (!receiptTarget) return;
    const id = receiptTarget.id;
    setReceiptLoadingId(id);
    setError(null);
    try {
      const { pdf } = await checkinApi.getReceipt(id, recipientInput);
      const byteCharacters = atob(pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt_${id.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setReceiptTarget(null);
      setRecipientInput('');
    } catch {
      setError('領収書の取得に失敗しました');
    } finally {
      setReceiptLoadingId(null);
    }
  };

  // 予約を「今後」と「過去」に分類
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const upcoming = checkins.filter((c) => {
    const d = new Date(c.date);
    return d >= now && c.status !== 'CANCELLED';
  }).sort((a, b) => a.date.localeCompare(b.date));

  const past = checkins.filter((c) => {
    const d = new Date(c.date);
    return d < now || c.status === 'CANCELLED';
  }).sort((a, b) => b.date.localeCompare(a.date));

  const getFacility = (checkin: Checkin) => {
    return LOCATION_FACILITIES[checkin.location]?.find((f) => f.id === checkin.facilityType);
  };

  const renderCheckinCard = (checkin: Checkin) => {
    const facility = getFacility(checkin);
    const statusInfo = STATUS_LABELS[checkin.status] || STATUS_LABELS.PENDING;
    const isPast = new Date(checkin.date) < now || checkin.status === 'CANCELLED';

    return (
      <div
        key={checkin.id}
        className={clsx(
          'p-4 bg-white rounded-2xl shadow-card border transition-all',
          isPast ? 'border-gray-100 opacity-70' : 'border-gray-100/50'
        )}
      >
        <div className="flex items-start gap-3">
          <div className={clsx(
            'w-11 h-11 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0',
            isPast
              ? 'bg-gray-100 text-gray-400'
              : 'bg-gradient-to-br from-primary-500 to-primary-400 text-white'
          )}>
            <FacilityIcon name={facility?.iconName || 'basketball'} className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold text-gray-900 text-sm truncate">{facility?.name || checkin.facilityType}</p>
              <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0', statusInfo.color)}>
                {statusInfo.label}
              </span>
            </div>
            <div className="space-y-1 text-xs text-gray-500">
              <p className="flex items-center gap-1">
                <FiMapPin className="w-3 h-3" />
                {getLocationName(checkin.location)}
              </p>
              <p className="flex items-center gap-1">
                <FiCalendar className="w-3 h-3" />
                {format(new Date(checkin.date), 'yyyy年M月d日(E)', { locale: ja })}
              </p>
              <p className="flex items-center gap-1">
                <FiClock className="w-3 h-3" />
                {checkin.startTime} 〜 {calculateEndTime(checkin.startTime, checkin.duration)}（{checkin.duration}時間）
              </p>
            </div>

            {/* PINコード表示 */}
            {checkin.pinCode && checkin.status === 'PAID' && !isPast && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-400">PIN:</span>
                <span className="font-mono font-bold text-primary-700 tracking-widest">{checkin.pinCode}</span>
                <button
                  onClick={() => handleCopyPin(checkin.pinCode!, checkin.id)}
                  className="p-1 text-gray-400 hover:text-primary-500 transition-colors"
                >
                  <FiCopy className="w-3.5 h-3.5" />
                </button>
                {copiedId === checkin.id && (
                  <span className="text-[10px] text-emerald-500 font-semibold">Copied!</span>
                )}
              </div>
            )}

            {/* 料金 */}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-primary-700">¥{checkin.totalPrice.toLocaleString()}</span>
              <div className="flex items-center gap-2">
                {checkin.status === 'PAID' && (
                  <button
                    onClick={() => openReceiptModal(checkin)}
                    disabled={receiptLoadingId === checkin.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50"
                  >
                    {receiptLoadingId === checkin.id ? (
                      <FiLoader className="w-3 h-3 animate-spin" />
                    ) : (
                      <FiFileText className="w-3 h-3" />
                    )}
                    領収書
                  </button>
                )}
                {canCancel(checkin) && (
                  <button
                    onClick={() => handleCancel(checkin.id)}
                    disabled={cancellingId === checkin.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    <FiTrash2 className="w-3 h-3" />
                    {cancellingId === checkin.id ? '処理中...' : 'キャンセル'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="マイ予約" showBack />

      <main className="p-4 pb-28">
        {/* 会員区分カード */}
        <section className="mb-4">
          <h3 className="font-bold text-primary-800 mb-2 flex items-center gap-2 text-sm">
            <span className="w-1 h-4 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            あなたの会員情報
          </h3>
          {membership?.memberType ? (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-primary-500 to-primary-400 text-white shadow-button">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center">
                  <FiAward className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-primary-100">会員区分</p>
                  <p className="font-bold truncate">{membership.memberType.name}</p>
                  {membership.memberType.description && (
                    <p className="text-[10px] text-primary-100 truncate mt-0.5">
                      {membership.memberType.description}
                    </p>
                  )}
                </div>
                <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold whitespace-nowrap">
                  {formatMemberDiscount(membership.memberType)}
                </span>
              </div>
              {membership.memberType.monthlyFee ? (
                <p className="text-[10px] text-primary-100 mt-2">
                  月額¥{membership.memberType.monthlyFee.toLocaleString()}（別途請求）
                </p>
              ) : null}
              {(membership.startDate || membership.endDate) && (
                <p className="text-[10px] text-primary-100 mt-1">
                  期間: {membership.startDate || '指定なし'} 〜 {membership.endDate || '指定なし'}
                </p>
              )}
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="mt-3 w-full py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {withdrawing ? '手続き中...' : '会員区分を退会する'}
              </button>
              <p className="text-[10px] text-primary-100 mt-1 text-center">
                ※更新・プラン変更は施設・LINEへお問い合わせください
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 text-center">
              <p className="text-sm text-gray-500">一般会員（通常料金）</p>
              <p className="text-[10px] text-gray-400 mt-1">割引会員区分の適用をご希望の場合は、施設の受付・LINEにてお問い合わせください</p>
            </div>
          )}
        </section>

        {error && (
          <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-200 flex items-center gap-2">
            <FiAlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin"></div>
            <p className="text-sm text-gray-400 mt-3">読み込み中...</p>
          </div>
        ) : checkins.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-2xl mb-4">
              <FiCalendar className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-500 mb-1">予約はまだありません</p>
            <p className="text-xs text-gray-400">施設を予約して利用を開始しましょう</p>
          </div>
        ) : (
          <>
            {/* 今後の予約 */}
            {upcoming.length > 0 && (
              <section className="mb-6">
                <h3 className="font-bold text-primary-800 mb-3 flex items-center gap-2">
                  <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
                  今後の予約（{upcoming.length}件）
                </h3>
                <div className="space-y-3">
                  {upcoming.map(renderCheckinCard)}
                </div>
              </section>
            )}

            {/* 過去の予約 */}
            {past.length > 0 && (
              <section>
                <h3 className="font-bold text-gray-500 mb-3 flex items-center gap-2">
                  <span className="w-1 h-5 bg-gray-300 rounded-full"></span>
                  過去の予約（{past.length}件）
                </h3>
                <div className="space-y-3">
                  {past.map(renderCheckinCard)}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* 新規予約ボタン */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-primary-100/30">
        <Button fullWidth onClick={() => navigate('/')}>
          <span className="flex items-center gap-2 justify-center">
            <FiPlus className="w-5 h-5" />
            新しい予約をする
          </span>
        </Button>
      </div>

      {/* 領収書 宛名編集モーダル */}
      {receiptTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={() => receiptLoadingId ? null : setReceiptTarget(null)}
        >
          <div
            className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
              <FiFileText className="w-4 h-4 text-primary-500" />
              領収書の宛名
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              宛名を入力してください。空欄の場合はご登録のお名前で発行されます。
            </p>
            <input
              type="text"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              placeholder="例: 株式会社○○ / 山田 太郎"
              className="w-full px-3 py-2.5 border-2 border-gray-100 rounded-xl text-sm focus:border-primary-300 focus:outline-none mb-2"
              autoFocus
            />
            <p className="text-[11px] text-gray-400 mb-4">
              ※「様」は自動で付きます。但し書きは「利用施設名（利用年月日）ご利用分として」です。
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setReceiptTarget(null)}
                disabled={!!receiptLoadingId || emailSending}
              >
                閉じる
              </Button>
              <Button fullWidth onClick={handleDownloadReceipt} disabled={!!receiptLoadingId || emailSending}>
                {receiptLoadingId ? '生成中...' : 'ダウンロード'}
              </Button>
            </div>

            {/* メール送信 */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-600 mb-2">メールで送る</p>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="送信先メールアドレス"
                className="w-full px-3 py-2.5 border-2 border-gray-100 rounded-xl text-sm focus:border-primary-300 focus:outline-none mb-2"
              />
              <Button
                variant="secondary"
                fullWidth
                onClick={handleEmailReceipt}
                disabled={emailSending || !!receiptLoadingId}
              >
                {emailSending ? '送信中...' : 'メールで領収書を送る'}
              </Button>
              {emailMsg && (
                <p className={clsx('text-xs mt-2 text-center', emailMsg === '送信しました' ? 'text-green-600' : 'text-red-500')}>
                  {emailMsg}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
