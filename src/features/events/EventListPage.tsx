import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCalendar, FiMapPin, FiUsers, FiClock } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Loading } from '../../components/common/Loading';
import { eventApi, Event } from '../../lib/api';
import { getLocationName } from '../../lib/locations';

export const EventListPage: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = React.useState<Event[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    eventApi.getAll()
      .then(setEvents)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <Loading fullScreen text="読み込み中..." />;

  const upcomingEvents = events.filter((e) => new Date(e.date) >= new Date(new Date().toDateString()));

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="イベント" showBack />

      <main className="p-4 pb-8">
        {upcomingEvents.length === 0 ? (
          <div className="text-center py-16">
            <FiCalendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-400">現在予定されているイベントはありません</p>
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => navigate(`/events/${event.id}`, { state: { event } })}
                className="w-full bg-white rounded-2xl shadow-card border border-gray-100/50 overflow-hidden text-left transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-bold text-gray-900 text-lg leading-tight">{event.title}</h3>
                    {event.price > 0 && (
                      <span className="flex-shrink-0 ml-2 px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm font-bold">
                        ¥{event.price.toLocaleString()}
                      </span>
                    )}
                    {event.price === 0 && (
                      <span className="flex-shrink-0 ml-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-sm font-bold">
                        無料
                      </span>
                    )}
                  </div>
                  {event.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{event.description}</p>
                  )}
                  <div className="space-y-1.5 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <FiCalendar className="w-4 h-4 text-primary-400" />
                      <span>{format(new Date(event.date), 'yyyy年M月d日(E)', { locale: ja })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FiClock className="w-4 h-4 text-primary-400" />
                      <span>{event.startTime} 〜 {event.endTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FiMapPin className="w-4 h-4 text-primary-400" />
                      <span>{getLocationName(event.location)}</span>
                    </div>
                    {event.capacity > 0 && (
                      <div className="flex items-center gap-2">
                        <FiUsers className="w-4 h-4 text-primary-400" />
                        <span>
                          {event.currentCount}/{event.capacity}名
                          {event.currentCount >= event.capacity && (
                            <span className="ml-1 text-red-500 font-semibold">（満員）</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
