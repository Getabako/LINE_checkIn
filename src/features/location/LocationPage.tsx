import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMapPin, FiCalendar, FiBook, FiSettings, FiClock, FiUsers } from 'react-icons/fi';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useCheckinStore } from '../../stores/checkinStore';
import { LOCATIONS, getLocationName } from '../../lib/locations';
import { LocationId, Event, School, eventApi, schoolApi } from '../../lib/api';
import clsx from 'clsx';

export const LocationPage: React.FC = () => {
  const navigate = useNavigate();
  const { location, setLocation, reset } = useCheckinStore();
  const [events, setEvents] = React.useState<Event[]>([]);
  const [schools, setSchools] = React.useState<School[]>([]);

  React.useEffect(() => {
    reset();
  }, [reset]);

  React.useEffect(() => {
    // イベント・スクール一覧を取得（失敗しても無視）
    eventApi.getAll().then(setEvents).catch(() => setEvents([]));
    schoolApi.getAll().then(setSchools).catch(() => setSchools([]));
  }, []);

  const handleLocationSelect = (id: LocationId) => {
    setLocation(id);
  };

  const handleNext = () => {
    if (location) {
      navigate('/facility');
    }
  };

  const upcomingEvents = events
    .filter((e) => e.isActive && new Date(e.date) >= new Date(new Date().setHours(0, 0, 0, 0)))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  const activeSchools = schools.filter((s) => s.isActive).slice(0, 3);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="みんなの体育館" />

      <main className="p-4 pb-28">
        {/* ヒーローセクション */}
        <div className="text-center mb-8 pt-4 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-400 rounded-2xl shadow-glow mb-4 animate-float">
            <FiMapPin className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-primary-800 mb-2">
            拠点を選択してください
          </h2>
          <p className="text-gray-500 text-sm">
            ご利用になる施設の拠点をお選びください
          </p>
        </div>

        {/* 拠点カード */}
        <div className="space-y-4 stagger-children">
          {LOCATIONS.map((loc) => (
            <button
              key={loc.id}
              onClick={() => handleLocationSelect(loc.id)}
              className={clsx(
                'w-full p-5 rounded-2xl border-2 text-left transition-all duration-300 transform hover:-translate-y-1',
                location === loc.id
                  ? 'border-primary-500 bg-gradient-to-br from-white to-sky-50 shadow-card-hover scale-[1.01]'
                  : 'border-gray-100 bg-white shadow-card hover:shadow-card-hover hover:border-primary-200'
              )}
            >
              <div className="flex items-start gap-4">
                <div className={clsx(
                  'w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm',
                  location === loc.id
                    ? 'bg-gradient-to-br from-primary-500 to-primary-400 text-white shadow-button'
                    : 'bg-sky-50 text-primary-400'
                )}>
                  <FiMapPin className="w-7 h-7" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">
                      {loc.name}
                    </h3>
                    {location === loc.id && (
                      <span className="px-3 py-1 bg-gradient-to-r from-primary-500 to-primary-400 text-white text-xs font-bold rounded-full shadow-sm animate-scale-in">
                        選択中
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm mt-1">
                    {loc.description}
                  </p>
                  <p className="text-xs text-primary-400 mt-1">
                    {loc.address}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* 施設間違い注意 */}
        <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2">
          <span className="text-amber-500 mt-0.5 flex-shrink-0">&#x26A0;&#xFE0F;</span>
          <p className="text-xs text-amber-700 font-medium leading-relaxed">
            施設のお間違いにご注意ください。ASP（八橋大畑）とやばせ（八橋南）は異なる場所です。
          </p>
        </div>

        {/* 開催予定のイベント */}
        {upcomingEvents.length > 0 && (
          <div className="mt-8 space-y-3 stagger-children">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-primary-800 flex items-center gap-2">
                <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
                開催予定のイベント
              </h3>
              <button
                onClick={() => navigate('/events')}
                className="text-xs text-primary-500 font-semibold"
              >
                すべて見る →
              </button>
            </div>
            <div className="space-y-2">
              {upcomingEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => navigate(`/events/${event.id}`)}
                  className="w-full p-4 bg-white rounded-2xl shadow-card border border-gray-100 text-left hover:shadow-card-hover transition-all duration-300"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 bg-gradient-to-br from-primary-500 to-primary-400 rounded-xl flex items-center justify-center shadow-sm text-white">
                      <FiCalendar className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">{event.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {format(new Date(event.date), 'M/d(E)', { locale: ja })} {event.startTime}〜{event.endTime}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <FiMapPin className="w-3 h-3" />
                          {getLocationName(event.location)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FiUsers className="w-3 h-3" />
                          {event.currentCount}/{event.capacity}
                        </span>
                        <span className="font-bold text-primary-600">¥{event.price.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* スクール */}
        {activeSchools.length > 0 && (
          <div className="mt-6 space-y-3 stagger-children">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-primary-800 flex items-center gap-2">
                <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
                開講中のスクール
              </h3>
              <button
                onClick={() => navigate('/schools')}
                className="text-xs text-primary-500 font-semibold"
              >
                すべて見る →
              </button>
            </div>
            <div className="space-y-2">
              {activeSchools.map((school) => (
                <button
                  key={school.id}
                  onClick={() => navigate(`/schools/${school.id}`)}
                  className="w-full p-4 bg-white rounded-2xl shadow-card border border-gray-100 text-left hover:shadow-card-hover transition-all duration-300"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-indigo-400 rounded-xl flex items-center justify-center shadow-sm text-white">
                      <FiBook className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate">{school.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        毎週{school.dayOfWeek}曜 {school.startTime}〜{school.endTime}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <FiMapPin className="w-3 h-3" />
                          {getLocationName(school.location)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FiClock className="w-3 h-3" />
                          全{school.totalSessions}回
                        </span>
                        <span className="font-bold text-primary-600">¥{school.pricePerSession.toLocaleString()}/回</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* マイ予約・管理画面リンク */}
        <div className="mt-8 space-y-2">
          <button
            onClick={() => navigate('/reservations')}
            className="w-full p-3 bg-gradient-to-r from-primary-50 to-sky-50 rounded-xl border border-primary-200 text-left flex items-center gap-3 hover:from-primary-100 hover:to-sky-100 transition-colors"
          >
            <FiCalendar className="w-5 h-5 text-primary-500" />
            <div>
              <span className="text-sm font-semibold text-primary-700">マイ予約</span>
              <p className="text-[10px] text-primary-400">予約の確認・キャンセル</p>
            </div>
          </button>
          <button
            onClick={() => navigate('/admin')}
            className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 text-left flex items-center gap-3 hover:bg-gray-100 transition-colors"
          >
            <FiSettings className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-500">管理画面</span>
          </button>
        </div>

        {/* 法務リンク */}
        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-center gap-4 text-xs text-gray-500">
          <button
            onClick={() => navigate('/privacy')}
            className="hover:text-primary-600 underline"
          >
            プライバシーポリシー
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={() => navigate('/commerce-law')}
            className="hover:text-primary-600 underline"
          >
            特定商取引法に基づく表記
          </button>
        </div>
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-primary-100/30 animate-slide-up">
        <Button
          fullWidth
          disabled={!location}
          onClick={handleNext}
        >
          次へ進む
        </Button>
      </div>
    </div>
  );
};
