import React from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { FiMapPin, FiUsers, FiClock, FiCheckCircle, FiBook, FiCalendar } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Loading } from '../../components/common/Loading';
import { schoolApi, School } from '../../lib/api';
import { getLocationName } from '../../lib/locations';
import { buildGoogleCalendarUrl, buildWeeklyRecurRule } from '../../lib/gcal';

const DAY_NAMES: Record<string, string> = {
  MON: '月', TUE: '火', WED: '水', THU: '木', FRI: '金', SAT: '土', SUN: '日',
};

const DAY_TO_NUM: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

/** スクールの初回開催日（YYYY-MM-DD）を算出 */
function resolveFirstSessionDate(school: School): string {
  const target = DAY_TO_NUM[school.dayOfWeek] ?? 1;
  const base = school.startDate ? new Date(school.startDate) : new Date();
  // base 当日が target 曜日なら当日、そうでなければ次の該当曜日
  const diff = (target - base.getDay() + 7) % 7;
  const d = new Date(base);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

export const SchoolDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const passedSchool = (location.state as { school?: School })?.school;

  const [school, setSchool] = React.useState<School | null>(passedSchool || null);
  const [isLoading, setIsLoading] = React.useState(!passedSchool);
  const [registering, setRegistering] = React.useState(false);
  const [registered, setRegistered] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (passedSchool) return;
    schoolApi.getAll()
      .then((schools) => {
        const found = schools.find((s) => s.id === id);
        setSchool(found || null);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [id, passedSchool]);

  const handleRegister = async () => {
    if (!id) return;
    setRegistering(true);
    setError(null);
    try {
      await schoolApi.register(id);
      setRegistered(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '申込みに失敗しました';
      setError(message);
    } finally {
      setRegistering(false);
    }
  };

  if (isLoading) return <Loading fullScreen text="読み込み中..." />;
  if (!school) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-500 mb-4">スクールが見つかりません</p>
          <Button onClick={() => navigate('/schools')}>一覧に戻る</Button>
        </div>
      </div>
    );
  }

  const isFull = school.capacity > 0 && school.currentCount >= school.capacity;
  const totalPrice = school.pricePerSession * (school.totalSessions || 1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="スクール詳細" showBack />

      <main className="p-4 pb-32">
        {registered ? (
          <div className="text-center py-12 animate-fade-in-up">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg">
              <FiCheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">申込み完了</h2>
            <p className="text-gray-400 text-sm">スクールへの参加登録が完了しました</p>
            <div className="mt-8 space-y-2 max-w-xs mx-auto">
              <Button
                fullWidth
                variant="secondary"
                onClick={() => {
                  const firstDate = resolveFirstSessionDate(school);
                  const url = buildGoogleCalendarUrl({
                    title: school.title,
                    startJst: `${firstDate}T${school.startTime}:00`,
                    endJst: `${firstDate}T${school.endTime}:00`,
                    description: school.description || undefined,
                    location: getLocationName(school.location),
                    recur: buildWeeklyRecurRule(school.dayOfWeek, school.totalSessions || 8),
                  });
                  window.open(url, '_blank');
                }}
              >
                <FiCalendar className="w-5 h-5" />
                Googleカレンダーに追加
              </Button>
              <Button fullWidth onClick={() => navigate('/')}>ホームに戻る</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100/50 overflow-hidden mb-6 animate-fade-in-up">
              <div className="p-5">
                <h2 className="text-xl font-bold text-gray-900 mb-3">{school.title}</h2>
                {school.description && (
                  <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap">{school.description}</p>
                )}
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3">
                    <FiClock className="w-5 h-5 text-primary-400" />
                    <span className="font-semibold text-gray-700">
                      毎週{DAY_NAMES[school.dayOfWeek] || school.dayOfWeek}曜日 {school.startTime} 〜 {school.endTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <FiMapPin className="w-5 h-5 text-primary-400" />
                    <span className="font-semibold text-gray-700">{getLocationName(school.location)}</span>
                  </div>
                  {school.instructor && (
                    <div className="flex items-center gap-3">
                      <FiUsers className="w-5 h-5 text-primary-400" />
                      <span className="font-semibold text-gray-700">講師: {school.instructor}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <FiBook className="w-5 h-5 text-primary-400" />
                    <span className="font-semibold text-gray-700">全{school.totalSessions}回</span>
                  </div>
                  {school.capacity > 0 && (
                    <div className="flex items-center gap-3">
                      <FiUsers className="w-5 h-5 text-primary-400" />
                      <span className="font-semibold text-gray-700">
                        {school.currentCount}/{school.capacity}名
                        {isFull && <span className="ml-1 text-red-500">（満員）</span>}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-5 bg-gradient-to-r from-sky-50 to-primary-50 border-t border-primary-100/50 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">1回あたり</span>
                  <span className="font-semibold text-gray-700">¥{school.pricePerSession.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-medium">合計（{school.totalSessions}回分）</span>
                  <span className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                    ¥{totalPrice.toLocaleString()}
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
