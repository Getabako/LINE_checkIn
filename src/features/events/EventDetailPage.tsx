import React from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCalendar, FiMapPin, FiUsers, FiClock, FiCheckCircle } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Loading } from '../../components/common/Loading';
import { eventApi, Event } from '../../lib/api';
import { getLocationName } from '../../lib/locations';
import { buildGoogleCalendarUrl } from '../../lib/gcal';

export const EventDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const passedEvent = (location.state as { event?: Event })?.event;

  const [event, setEvent] = React.useState<Event | null>(passedEvent || null);
  const [isLoading, setIsLoading] = React.useState(!passedEvent);
  const [registering, setRegistering] = React.useState(false);
  const [registered, setRegistered] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [canCancel, setCanCancel] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [cancelled, setCancelled] = React.useState<string | null>(null);
  // 決済画面から戻ってきたときの結果（done = 決済完了 / cancelled = 決済をやめた）
  const paymentResult = new URLSearchParams(location.search).get('payment');

  React.useEffect(() => {
    // 一覧から来たときも読み直す（申込み済みかどうかと、最新の人数を出すため）
    eventApi.getAll()
      .then((events) => {
        const found = events.find((e) => e.id === id);
        setEvent(found || null);
        if (found?.registered) setRegistered(true);
        setCanCancel(!!found?.canCancel);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleRegister = async () => {
    if (!id) return;
    setRegistering(true);
    setError(null);
    try {
      const result = await eventApi.register(id);
      if (result.checkoutUrl) {
        // 参加費の決済画面へ（決済が終わると、この画面に戻って申込み完了になる）
        window.location.href = result.checkoutUrl;
        return;
      }
      setRegistered(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '申込みに失敗しました';
      setError(message);
    } finally {
      setRegistering(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    if (!window.confirm('このイベントの申込みをキャンセルしますか？')) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await eventApi.cancel(id);
      setRegistered(false);
      setCanCancel(false);
      setCancelled(
        result.refunded
          ? `申込みをキャンセルしました。¥${result.refundAmount.toLocaleString()} を返金しました（カード会社・PayPay への反映まで数日かかる場合があります）。`
          : '申込みをキャンセルしました。'
      );
      eventApi.getAll().then((list) => setEvent(list.find((x) => x.id === id) || null)).catch(console.error);
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : 'キャンセルに失敗しました');
    } finally {
      setCancelling(false);
    }
  };

  if (isLoading) return <Loading fullScreen text="読み込み中..." />;
  if (!event) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-500 mb-4">イベントが見つかりません</p>
          <Button onClick={() => navigate('/events')}>一覧に戻る</Button>
        </div>
      </div>
    );
  }

  const isFull = event.capacity > 0 && event.currentCount >= event.capacity;

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="イベント詳細" showBack />

      <main className="p-4 pb-32">
        {registered ? (
          <div className="text-center py-12 animate-fade-in-up">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg">
              <FiCheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">申込み完了</h2>
            <p className="text-gray-500 text-base leading-relaxed">
              {event.price > 0
                ? `参加費 ¥${event.price.toLocaleString()} のお支払いと、参加登録が完了しました`
                : 'イベントへの参加登録が完了しました'}
            </p>
            <div className="mt-8 space-y-2 max-w-xs mx-auto">
              <Button
                fullWidth
                variant="secondary"
                onClick={() => {
                  const url = buildGoogleCalendarUrl({
                    title: event.title,
                    startJst: `${event.date}T${event.startTime}:00`,
                    endJst: `${event.date}T${event.endTime}:00`,
                    description: event.description || undefined,
                    location: getLocationName(event.location),
                  });
                  window.open(url, '_blank');
                }}
              >
                <FiCalendar className="w-5 h-5" />
                Googleカレンダーに追加
              </Button>
              <Button fullWidth onClick={() => navigate('/')}>ホームに戻る</Button>
              <div className="pt-6 mt-4 border-t border-gray-200 text-left">
                {cancelError && (
                  <div className="mb-3 p-4 bg-red-50 rounded-2xl border border-red-200">
                    <p className="text-red-700 text-sm leading-relaxed">{cancelError}</p>
                  </div>
                )}
                {canCancel ? (
                  <>
                    <p className="text-sm text-gray-600 leading-relaxed mb-3">
                      開催日の前日まで（お申込みから1時間以内は当日でも）キャンセルできます。{event.price > 0 ? 'お支払いいただいた参加費は全額返金します。' : ''}
                    </p>
                    <button
                      type="button"
                      disabled={cancelling}
                      onClick={handleCancel}
                      className="w-full min-h-[48px] rounded-xl bg-white text-red-600 font-bold border-2 border-red-300 shadow-[0_3px_0_0_rgba(252,165,165,1)] active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:shadow-none"
                    >
                      {cancelling ? 'キャンセルしています…' : '申込みをキャンセルする'}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-gray-500 leading-relaxed">
                    キャンセルできる期限（開催日の前日まで）を過ぎています。ご事情がある場合は施設までお問い合わせください。
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100/50 overflow-hidden mb-6 animate-fade-in-up">
              <div className="p-5">
                <h2 className="text-xl font-bold text-gray-900 mb-3">{event.title}</h2>
                {event.description && (
                  <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap">{event.description}</p>
                )}
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3">
                    <FiCalendar className="w-5 h-5 text-primary-400" />
                    <span className="font-semibold text-gray-700">
                      {format(new Date(event.date), 'yyyy年M月d日(E)', { locale: ja })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <FiClock className="w-5 h-5 text-primary-400" />
                    <span className="font-semibold text-gray-700">{event.startTime} 〜 {event.endTime}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <FiMapPin className="w-5 h-5 text-primary-400" />
                    <span className="font-semibold text-gray-700">{getLocationName(event.location)}</span>
                  </div>
                  {event.capacity > 0 && (
                    <div className="flex items-center gap-3">
                      <FiUsers className="w-5 h-5 text-primary-400" />
                      <span className="font-semibold text-gray-700">
                        {event.currentCount}/{event.capacity}名
                        {isFull && <span className="ml-1 text-red-500">（満員）</span>}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-5 bg-gradient-to-r from-sky-50 to-primary-50 border-t border-primary-100/50">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">参加費</span>
                  <span className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                    {event.price > 0 ? `¥${event.price.toLocaleString()}` : '無料'}
                  </span>
                </div>
              </div>
            </div>

            {cancelled && (
              <div className="mb-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                <p className="text-emerald-800 text-sm leading-relaxed">{cancelled}</p>
              </div>
            )}
            {event.price > 0 && (
              <p className="mb-4 text-sm text-gray-600 leading-relaxed">
                参加費は、申込みのときにクレジットカードまたは PayPay でお支払いいただきます。お支払いが終わると申込み完了です。
              </p>
            )}
            {paymentResult === 'cancelled' && !error && !cancelled && (
              <div className="mb-4 p-4 bg-amber-50 rounded-2xl border border-amber-200">
                <p className="text-amber-800 text-sm leading-relaxed">お支払いが完了していないため、申込みはまだ終わっていません。もう一度「支払いに進む」を押してください。</p>
              </div>
            )}
            {error && (
              <div className="mb-4 p-4 bg-red-50 rounded-2xl border border-red-200">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
          </>
        )}
      </main>

      {!registered && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-primary-100/30">
          <Button
            fullWidth
            loading={registering}
            disabled={isFull}
            onClick={handleRegister}
          >
            {isFull ? '定員に達しています' : event.price > 0 ? `支払いに進む（¥${event.price.toLocaleString()}）` : '申込む'}
          </Button>
        </div>
      )}
    </div>
  );
};
