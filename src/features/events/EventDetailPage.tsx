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

  React.useEffect(() => {
    if (passedEvent) return;
    eventApi.getAll()
      .then((events) => {
        const found = events.find((e) => e.id === id);
        setEvent(found || null);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [id, passedEvent]);

  const handleRegister = async () => {
    if (!id) return;
    setRegistering(true);
    setError(null);
    try {
      await eventApi.register(id);
      setRegistered(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '申込みに失敗しました';
      setError(message);
    } finally {
      setRegistering(false);
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
            <p className="text-gray-400 text-sm">イベントへの参加登録が完了しました</p>
            <div className="mt-8">
              <Button onClick={() => navigate('/')}>ホームに戻る</Button>
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
            {isFull ? '定員に達しています' : '申込む'}
          </Button>
        </div>
      )}
    </div>
  );
};
