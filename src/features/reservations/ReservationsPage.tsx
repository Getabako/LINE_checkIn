import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCalendar, FiClock, FiMapPin, FiTrash2, FiPlus, FiCopy, FiAlertCircle } from 'react-icons/fi';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { checkinApi, Checkin } from '../../lib/api';
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

  const canCancel = (checkin: Checkin): boolean => {
    if (checkin.status !== 'PAID' && checkin.status !== 'PENDING') return false;
    const startDateTime = new Date(checkin.date);
    const [hours, minutes] = checkin.startTime.split(':').map(Number);
    startDateTime.setHours(hours, minutes, 0, 0);
    const oneHourBefore = new Date(startDateTime.getTime() - 60 * 60 * 1000);
    return new Date() < oneHourBefore;
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
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-bold text-primary-700">¥{checkin.totalPrice.toLocaleString()}</span>
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
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="マイ予約" showBack />

      <main className="p-4 pb-28">
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
    </div>
  );
};
