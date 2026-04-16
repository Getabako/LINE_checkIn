import React from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCalendar, FiBook, FiBarChart2, FiPlus, FiTrash2, FiGrid } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Loading } from '../../components/common/Loading';
import { adminApi, Event, School, SalesData } from '../../lib/api';
import { CalendarTab } from './CalendarTab';
import clsx from 'clsx';

type Tab = 'calendar' | 'events' | 'schools' | 'sales';

const DAY_OPTIONS = [
  { value: 'MON', label: '月' },
  { value: 'TUE', label: '火' },
  { value: 'WED', label: '水' },
  { value: 'THU', label: '木' },
  { value: 'FRI', label: '金' },
  { value: 'SAT', label: '土' },
  { value: 'SUN', label: '日' },
];

// ============ イベント管理タブ ============
const EventsTab: React.FC = () => {
  const [events, setEvents] = React.useState<Event[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({
    title: '', description: '', location: 'ASP', facilityType: 'GYM',
    date: '', startTime: '10:00', endTime: '12:00', capacity: 20, price: 0,
  });

  const loadEvents = () => {
    adminApi.getEvents()
      .then(setEvents)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  React.useEffect(loadEvents, []);

  const handleCreate = async () => {
    try {
      await adminApi.createEvent(form as unknown as Partial<Event>);
      setShowForm(false);
      setForm({ title: '', description: '', location: 'ASP', facilityType: 'GYM', date: '', startTime: '10:00', endTime: '12:00', capacity: 20, price: 0 });
      loadEvents();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await adminApi.deleteEvent(id);
    loadEvents();
  };

  if (isLoading) return <Loading text="読み込み中..." />;

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowForm(!showForm)}>
        <FiPlus className="w-4 h-4" /> {showForm ? '閉じる' : 'イベント作成'}
      </Button>

      {showForm && (
        <div className="bg-white p-5 rounded-2xl shadow-card border border-gray-100 space-y-3">
          <input
            placeholder="タイトル" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <textarea
            placeholder="説明" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm" rows={2}
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              <option value="ASP">ASP</option>
              <option value="YABASE">やばせ</option>
            </select>
            <select value={form.facilityType} onChange={(e) => setForm({ ...form, facilityType: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              <option value="GYM">体育館</option>
              <option value="TRAINING_PRIVATE">トレーニング(貸切)</option>
              <option value="TRAINING_SHARED">トレーニング(相席)</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">定員</label>
              <input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">参加費(円)</label>
              <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
          <Button fullWidth onClick={handleCreate} disabled={!form.title || !form.date}>作成</Button>
        </div>
      )}

      {events.length === 0 && !showForm && (
        <p className="text-center text-gray-400 py-8">イベントがありません</p>
      )}

      {events.map((event) => (
        <div key={event.id} className="bg-white p-4 rounded-2xl shadow-card border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-gray-900">{event.title}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {format(new Date(event.date), 'yyyy/M/d(E)', { locale: ja })} {event.startTime}〜{event.endTime}
              </p>
              <p className="text-sm text-gray-500">{event.currentCount}/{event.capacity}名 / ¥{event.price.toLocaleString()}</p>
            </div>
            <button onClick={() => handleDelete(event.id)} className="p-2 text-red-400 hover:text-red-600">
              <FiTrash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============ スクール管理タブ ============
const SchoolsTab: React.FC = () => {
  const [schools, setSchools] = React.useState<School[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({
    title: '', description: '', location: 'ASP', facilityType: 'GYM',
    dayOfWeek: 'MON', startTime: '10:00', endTime: '12:00',
    capacity: 10, pricePerSession: 1000, totalSessions: 8, instructor: '',
    startDate: '', endDate: '',
  });

  const loadSchools = () => {
    adminApi.getSchools()
      .then(setSchools)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  React.useEffect(loadSchools, []);

  const handleCreate = async () => {
    try {
      await adminApi.createSchool(form as unknown as Partial<School>);
      setShowForm(false);
      setForm({
        title: '', description: '', location: 'ASP', facilityType: 'GYM',
        dayOfWeek: 'MON', startTime: '10:00', endTime: '12:00',
        capacity: 10, pricePerSession: 1000, totalSessions: 8, instructor: '',
        startDate: '', endDate: '',
      });
      loadSchools();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await adminApi.deleteSchool(id);
    loadSchools();
  };

  if (isLoading) return <Loading text="読み込み中..." />;

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowForm(!showForm)}>
        <FiPlus className="w-4 h-4" /> {showForm ? '閉じる' : 'スクール作成'}
      </Button>

      {showForm && (
        <div className="bg-white p-5 rounded-2xl shadow-card border border-gray-100 space-y-3">
          <input
            placeholder="タイトル" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <textarea
            placeholder="説明" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm" rows={2}
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              <option value="ASP">ASP</option>
              <option value="YABASE">やばせ</option>
            </select>
            <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              {DAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}曜日</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="開始" />
            <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" placeholder="終了" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500">定員</label>
              <input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">1回料金</label>
              <input type="number" value={form.pricePerSession} onChange={(e) => setForm({ ...form, pricePerSession: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">全回数</label>
              <input type="number" value={form.totalSessions} onChange={(e) => setForm({ ...form, totalSessions: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
          <input
            placeholder="講師名（任意）" value={form.instructor}
            onChange={(e) => setForm({ ...form, instructor: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <Button fullWidth onClick={handleCreate} disabled={!form.title}>作成</Button>
        </div>
      )}

      {schools.length === 0 && !showForm && (
        <p className="text-center text-gray-400 py-8">スクールがありません</p>
      )}

      {schools.map((school) => (
        <div key={school.id} className="bg-white p-4 rounded-2xl shadow-card border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-gray-900">{school.title}</h3>
              <p className="text-sm text-gray-500 mt-1">
                毎週{DAY_OPTIONS.find((d) => d.value === school.dayOfWeek)?.label || school.dayOfWeek}曜 {school.startTime}〜{school.endTime}
              </p>
              <p className="text-sm text-gray-500">
                {school.currentCount}/{school.capacity}名 / ¥{school.pricePerSession.toLocaleString()}/回 × {school.totalSessions}回
              </p>
            </div>
            <button onClick={() => handleDelete(school.id)} className="p-2 text-red-400 hover:text-red-600">
              <FiTrash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============ 売上集計タブ (Phase 4) ============
const SalesTab: React.FC = () => {
  const [salesData, setSalesData] = React.useState<SalesData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [period, setPeriod] = React.useState<'daily' | 'monthly'>('daily');
  const [groupBy, setGroupBy] = React.useState<string>('');
  const currentYear = new Date().getFullYear().toString();
  const currentMonth = format(new Date(), 'yyyy-MM');

  const load = React.useCallback(() => {
    setIsLoading(true);
    const params: Record<string, string> = { period };
    if (groupBy) params.groupBy = groupBy;
    if (period === 'daily') {
      params.from = `${currentMonth}-01`;
      params.to = `${currentMonth}-31`;
    } else {
      params.year = currentYear;
    }
    adminApi.getSales(params)
      .then(setSalesData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [period, groupBy, currentMonth, currentYear]);

  React.useEffect(load, [load]);

  if (isLoading) return <Loading text="集計中..." />;
  if (!salesData) return <p className="text-center text-gray-400 py-8">データがありません</p>;

  const entries = Object.entries(salesData.sales).sort(([a], [b]) => a.localeCompare(b));
  const maxTotal = Math.max(...entries.map(([, v]) => v.total), 1);

  return (
    <div className="space-y-4">
      {/* フィルタ */}
      <div className="flex gap-2">
        <button
          onClick={() => { setPeriod('daily'); setGroupBy(''); }}
          className={clsx('flex-1 py-2 rounded-lg border-2 text-sm font-semibold', period === 'daily' && !groupBy ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500')}
        >日別</button>
        <button
          onClick={() => { setPeriod('monthly'); setGroupBy(''); }}
          className={clsx('flex-1 py-2 rounded-lg border-2 text-sm font-semibold', period === 'monthly' && !groupBy ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500')}
        >月別</button>
        <button
          onClick={() => { setPeriod('daily'); setGroupBy('location'); }}
          className={clsx('flex-1 py-2 rounded-lg border-2 text-sm font-semibold', groupBy === 'location' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500')}
        >拠点別</button>
      </div>

      {/* サマリ */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-400 rounded-2xl p-5 text-white">
        <p className="text-primary-100 text-sm">合計売上</p>
        <p className="text-3xl font-bold mt-1">¥{salesData.totalAmount.toLocaleString()}</p>
        <p className="text-primary-200 text-sm mt-1">{salesData.totalCount}件</p>
      </div>

      {/* 棒グラフ */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4 space-y-3">
        {entries.length === 0 ? (
          <p className="text-center text-gray-400 py-4">データがありません</p>
        ) : (
          entries.map(([key, val]) => (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600 font-medium">{key}</span>
                <span className="text-gray-700 font-bold">¥{val.total.toLocaleString()} ({val.count}件)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-primary-500 to-primary-400 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(val.total / maxTotal) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============ メインの管理画面 ============
export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<Tab>('calendar');

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="管理画面" showBack />

      <main className="p-4 pb-8">
        {/* タブ切り替え */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
          {([
            { key: 'calendar', icon: FiGrid, label: 'カレンダー' },
            { key: 'events', icon: FiCalendar, label: 'イベント' },
            { key: 'schools', icon: FiBook, label: 'スクール' },
            { key: 'sales', icon: FiBarChart2, label: '売上' },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={clsx(
                'flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1',
                activeTab === key
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'calendar' && <CalendarTab />}
        {activeTab === 'events' && <EventsTab />}
        {activeTab === 'schools' && <SchoolsTab />}
        {activeTab === 'sales' && <SalesTab />}
      </main>
    </div>
  );
};
