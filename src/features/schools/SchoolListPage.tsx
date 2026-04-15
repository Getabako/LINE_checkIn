import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBook, FiMapPin, FiUsers, FiClock } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Loading } from '../../components/common/Loading';
import { schoolApi, School } from '../../lib/api';
import { getLocationName } from '../../lib/locations';

const DAY_NAMES: Record<string, string> = {
  MON: '月', TUE: '火', WED: '水', THU: '木', FRI: '金', SAT: '土', SUN: '日',
};

export const SchoolListPage: React.FC = () => {
  const navigate = useNavigate();
  const [schools, setSchools] = React.useState<School[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    schoolApi.getAll()
      .then(setSchools)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <Loading fullScreen text="読み込み中..." />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="スクール" showBack />

      <main className="p-4 pb-8">
        {schools.length === 0 ? (
          <div className="text-center py-16">
            <FiBook className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-400">現在開講中のスクールはありません</p>
          </div>
        ) : (
          <div className="space-y-4">
            {schools.map((school) => (
              <button
                key={school.id}
                onClick={() => navigate(`/schools/${school.id}`, { state: { school } })}
                className="w-full bg-white rounded-2xl shadow-card border border-gray-100/50 overflow-hidden text-left transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-bold text-gray-900 text-lg leading-tight">{school.title}</h3>
                    <span className="flex-shrink-0 ml-2 px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm font-bold">
                      ¥{school.pricePerSession.toLocaleString()}/回
                    </span>
                  </div>
                  {school.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{school.description}</p>
                  )}
                  <div className="space-y-1.5 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <FiClock className="w-4 h-4 text-primary-400" />
                      <span>毎週{DAY_NAMES[school.dayOfWeek] || school.dayOfWeek}曜日 {school.startTime} 〜 {school.endTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FiMapPin className="w-4 h-4 text-primary-400" />
                      <span>{getLocationName(school.location)}</span>
                    </div>
                    {school.instructor && (
                      <div className="flex items-center gap-2">
                        <FiUsers className="w-4 h-4 text-primary-400" />
                        <span>講師: {school.instructor}</span>
                      </div>
                    )}
                    {school.capacity > 0 && (
                      <div className="flex items-center gap-2">
                        <FiUsers className="w-4 h-4 text-primary-400" />
                        <span>
                          {school.currentCount}/{school.capacity}名
                          {school.currentCount >= school.capacity && (
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
