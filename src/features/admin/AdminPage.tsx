import React from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCalendar, FiBook, FiBarChart2, FiPlus, FiTrash2, FiGrid, FiDownload, FiBell, FiUser, FiSearch, FiTag } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Loading } from '../../components/common/Loading';
import { adminApi, Event, School, SalesData, Announcement, AnnouncementPriority, MemberType, UserMembership, DiscountType, Coupon } from '../../lib/api';
import { isHoliday as isJpHoliday } from '@holiday-jp/holiday_jp';
import { getLocationName, getFacilityName } from '../../lib/locations';
import { CalendarTab } from './CalendarTab';
import clsx from 'clsx';

// CSVダウンロードヘルパー
const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(',')).join('\r\n');
  // Excel互換のためBOM付き
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

type Tab = 'calendar' | 'events' | 'schools' | 'sales' | 'announcements' | 'members' | 'coupons';

const DISCOUNT_TYPE_LABEL: Record<DiscountType, string> = {
  NONE: '割引なし',
  PERCENTAGE: '％割引',
  FIXED_PER_HOUR: '時間あたり定額OFF',
  FREE: '無料',
};

const formatDiscount = (m: MemberType): string => {
  const t = m.discountType || 'NONE';
  if (t === 'NONE') return '割引なし';
  if (t === 'FREE') return '無料';
  if (t === 'PERCENTAGE') return `${m.discountValue || 0}%OFF`;
  if (t === 'FIXED_PER_HOUR') return `¥${(m.discountValue || 0).toLocaleString()}/h OFF`;
  return '';
};

const PRIORITY_LABEL: Record<AnnouncementPriority, string> = {
  info: 'お知らせ',
  warning: '注意',
  critical: '重要',
};

const PRIORITY_STYLE: Record<AnnouncementPriority, string> = {
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
};

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
  const [isDownloading, setIsDownloading] = React.useState(false);
  // 期間：デフォルトは当月
  const today = new Date();
  const defaultFrom = format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd');
  const defaultTo = format(new Date(today.getFullYear(), today.getMonth() + 1, 0), 'yyyy-MM-dd');
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);

  const load = React.useCallback(() => {
    setIsLoading(true);
    const params: Record<string, string> = { period, from, to };
    if (groupBy) params.groupBy = groupBy;
    adminApi.getSales(params)
      .then(setSalesData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [period, groupBy, from, to]);

  React.useEffect(load, [load]);

  // 集計CSVダウンロード（現在表示中のサマリ）
  const handleSummaryCsv = () => {
    if (!salesData) return;
    const groupLabel =
      groupBy === 'location' ? '拠点' :
      groupBy === 'facility' ? '拠点_施設' :
      period === 'monthly' ? '年月' : '日付';
    const rows: (string | number)[][] = [
      [groupLabel, '件数', '売上(円)'],
      ...Object.entries(salesData.sales)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, v.count, v.total]),
      ['合計', salesData.totalCount, salesData.totalAmount],
    ];
    downloadCsv(`売上集計_${from}_${to}.csv`, rows);
  };

  // 詳細CSVダウンロード（個別予約一覧）
  // 時間帯区分: 平日昼 / 平日夜 / 土日祝（夜間=18:00以降開始）
  const classifySlot = (dateStr: string, startTime: string): string => {
    const d = new Date(dateStr);
    const dow = d.getDay();
    if (dow === 0 || dow === 6 || isJpHoliday(d)) return '土日祝';
    const hour = parseInt(startTime.split(':')[0], 10);
    return hour >= 18 ? '平日夜' : '平日昼';
  };
  const handleDetailCsv = async () => {
    setIsDownloading(true);
    try {
      const checkins = await adminApi.getCheckins({ from, to });
      const paid = checkins.filter((c) => c.status === 'PAID');
      const rows: (string | number)[][] = [
        [
          '予約ID', '日付', '開始時刻', '時間(h)',
          '拠点', '施設', '利用者',
          '利用区分', '会員区分(団体名)',
          '時間帯区分',
          '元金額(税込)', '会員割引', 'クーポン割引',
          '請求額(税込)', '請求額(税抜)',
          'ステータス', '作成日時',
        ],
        ...paid.map((c) => {
          const isMember = !!c.memberTypeName;
          const total = c.totalPrice || 0;
          const ex = Math.floor(total / 1.1);
          return [
            c.id,
            c.date,
            c.startTime,
            c.duration,
            getLocationName(c.location),
            getFacilityName(c.location, c.facilityType),
            c.displayName || '',
            isMember ? '定期' : '一般',
            c.memberTypeName || '',
            classifySlot(c.date, c.startTime),
            c.originalPrice ?? total,
            c.memberDiscount ?? 0,
            c.couponDiscount ?? 0,
            total,
            ex,
            c.status,
            c.createdAt || '',
          ];
        }),
      ];
      downloadCsv(`売上詳細_${from}_${to}.csv`, rows);
    } catch (e) {
      console.error(e);
      alert('CSVのダウンロードに失敗しました');
    } finally {
      setIsDownloading(false);
    }
  };

  const entries = salesData
    ? Object.entries(salesData.sales).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const maxTotal = Math.max(...entries.map(([, v]) => v.total), 1);

  return (
    <div className="space-y-4">
      {/* 期間指定 */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">集計期間</p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
          />
          <span className="text-gray-400 text-sm">〜</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
          />
        </div>
      </div>

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

      {isLoading ? (
        <Loading text="集計中..." />
      ) : !salesData ? (
        <p className="text-center text-gray-400 py-8">データがありません</p>
      ) : (
        <>
          {/* サマリ */}
          <div className="bg-gradient-to-r from-primary-500 to-primary-400 rounded-2xl p-5 text-white">
            <p className="text-primary-100 text-sm">合計売上</p>
            <p className="text-3xl font-bold mt-1">¥{salesData.totalAmount.toLocaleString()}</p>
            <p className="text-primary-200 text-sm mt-1">{salesData.totalCount}件</p>
          </div>

          {/* CSVダウンロード */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSummaryCsv}
              disabled={entries.length === 0}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white border-2 border-primary-500 text-primary-700 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FiDownload className="w-4 h-4" /> 集計CSV
            </button>
            <button
              onClick={handleDetailCsv}
              disabled={isDownloading}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FiDownload className="w-4 h-4" /> {isDownloading ? '取得中...' : '詳細CSV'}
            </button>
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
        </>
      )}
    </div>
  );
};

// ============ お知らせ管理タブ ============
const AnnouncementsTab: React.FC = () => {
  const [items, setItems] = React.useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const emptyForm = {
    title: '',
    body: '',
    location: '' as '' | 'ASP' | 'YABASE',
    priority: 'info' as AnnouncementPriority,
    startDate: '',
    endDate: '',
    isActive: true,
  };
  const [form, setForm] = React.useState(emptyForm);

  const load = () => {
    adminApi.getAnnouncements()
      .then(setItems)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  React.useEffect(load, []);

  const handleCreate = async () => {
    try {
      await adminApi.createAnnouncement({
        title: form.title,
        body: form.body,
        location: form.location || null,
        priority: form.priority,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        isActive: form.isActive,
      });
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleActive = async (a: Announcement) => {
    await adminApi.updateAnnouncement(a.id, { isActive: !a.isActive });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await adminApi.deleteAnnouncement(id);
    load();
  };

  if (isLoading) return <Loading text="読み込み中..." />;

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowForm(!showForm)}>
        <FiPlus className="w-4 h-4" /> {showForm ? '閉じる' : 'お知らせ作成'}
      </Button>

      {showForm && (
        <div className="bg-white p-5 rounded-2xl shadow-card border border-gray-100 space-y-3">
          <input
            placeholder="タイトル" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <textarea
            placeholder="本文" value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm" rows={4}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value as typeof form.location })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">全拠点</option>
              <option value="ASP">ASPのみ</option>
              <option value="YABASE">やばせのみ</option>
            </select>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as AnnouncementPriority })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="info">通常</option>
              <option value="warning">注意</option>
              <option value="critical">重要</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">表示開始日（任意）</label>
              <input
                type="date" value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">表示終了日（任意）</label>
              <input
                type="date" value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>
          <Button fullWidth onClick={handleCreate} disabled={!form.title || !form.body}>作成</Button>
        </div>
      )}

      {items.length === 0 && !showForm && (
        <p className="text-center text-gray-400 py-8">お知らせがありません</p>
      )}

      {items.map((a) => (
        <div
          key={a.id}
          className={clsx(
            'bg-white p-4 rounded-2xl shadow-card border',
            a.isActive ? 'border-gray-100' : 'border-gray-200 opacity-60'
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={clsx(
                  'inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border',
                  PRIORITY_STYLE[a.priority]
                )}>
                  {PRIORITY_LABEL[a.priority]}
                </span>
                {a.location && (
                  <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-600">
                    {a.location === 'ASP' ? 'ASP' : 'やばせ'}限定
                  </span>
                )}
                {!a.isActive && (
                  <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-500">
                    非表示
                  </span>
                )}
              </div>
              <h3 className="font-bold text-gray-900">{a.title}</h3>
              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.body}</p>
              {(a.startDate || a.endDate) && (
                <p className="text-xs text-gray-400 mt-2">
                  期間: {a.startDate || '指定なし'} 〜 {a.endDate || '指定なし'}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => handleToggleActive(a)}
                className="p-2 text-primary-500 hover:text-primary-700 text-xs font-semibold"
              >
                {a.isActive ? '非表示' : '表示'}
              </button>
              <button
                onClick={() => handleDelete(a.id)}
                className="p-2 text-red-400 hover:text-red-600"
              >
                <FiTrash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============ 会員管理タブ ============
const MembersTab: React.FC = () => {
  const [memberTypes, setMemberTypes] = React.useState<MemberType[]>([]);
  const [memberships, setMemberships] = React.useState<UserMembership[]>([]);
  const [users, setUsers] = React.useState<Array<{ id: string; lineUserId: string; displayName: string }>>([]);
  const [search, setSearch] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [showTypeForm, setShowTypeForm] = React.useState(false);
  const [showAssignForm, setShowAssignForm] = React.useState(false);
  const emptyTypeForm = {
    code: '',
    name: '',
    description: '',
    discountType: 'NONE' as DiscountType,
    discountValue: 0,
    monthlyFee: 0,
    sortOrder: 0,
  };
  const [typeForm, setTypeForm] = React.useState(emptyTypeForm);
  const [assignForm, setAssignForm] = React.useState({
    userId: '',
    lineUserId: '',
    displayName: '',
    memberTypeId: '',
    startDate: '',
    endDate: '',
  });

  const load = () => {
    Promise.all([adminApi.getMemberTypes(), adminApi.getMemberships()])
      .then(([t, m]) => { setMemberTypes(t); setMemberships(m); })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  React.useEffect(load, []);

  const handleSearchUsers = async (q?: string) => {
    try {
      const list = await adminApi.getUsers(q !== undefined ? q : search);
      setUsers(list);
    } catch (e) {
      console.error(e);
    }
  };

  // フォームを開いた時に全ユーザーを自動取得
  React.useEffect(() => {
    if (showAssignForm) {
      handleSearchUsers('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAssignForm]);

  const handleAssignSelf = async () => {
    if (!assignForm.memberTypeId) {
      alert('先に会員種別を選択してください');
      return;
    }
    if (!confirm('管理者(自分)にこの会員区分を付与しますか？')) return;
    try {
      await adminApi.assignSelfMembership({
        memberTypeId: assignForm.memberTypeId,
        startDate: assignForm.startDate || null,
        endDate: assignForm.endDate || null,
      });
      setShowAssignForm(false);
      setAssignForm({ userId: '', lineUserId: '', displayName: '', memberTypeId: '', startDate: '', endDate: '' });
      setUsers([]);
      setSearch('');
      load();
    } catch (e) {
      console.error(e);
      alert('付与に失敗しました');
    }
  };

  const handleCreateType = async () => {
    await adminApi.createMemberType(typeForm);
    setShowTypeForm(false);
    setTypeForm(emptyTypeForm);
    load();
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await adminApi.deleteMemberType(id);
    load();
  };

  const handleToggleType = async (m: MemberType) => {
    await adminApi.updateMemberType(m.id, { isActive: !m.isActive });
    load();
  };

  const handleAssign = async () => {
    if (!assignForm.lineUserId || !assignForm.memberTypeId) return;
    await adminApi.assignMembership({
      lineUserId: assignForm.lineUserId,
      userId: assignForm.userId,
      displayName: assignForm.displayName,
      memberTypeId: assignForm.memberTypeId,
      startDate: assignForm.startDate || null,
      endDate: assignForm.endDate || null,
    });
    setShowAssignForm(false);
    setAssignForm({ userId: '', lineUserId: '', displayName: '', memberTypeId: '', startDate: '', endDate: '' });
    setUsers([]);
    setSearch('');
    load();
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('この会員区分を解除しますか？')) return;
    await adminApi.revokeMembership(id);
    load();
  };

  // クイック登録（要件に沿った既定値）
  const handleSeedDefaults = async () => {
    if (!confirm('5種類の会員区分（一般・TR-01／その他／S-01／TR-00／学生会員）を一括登録しますか？')) return;
    const seeds: Array<Partial<MemberType>> = [
      { code: 'GENERAL', name: '一般・TR-01', description: '基準料金', discountType: 'NONE', discountValue: 0, monthlyFee: 0, sortOrder: 1 },
      { code: 'OTHER', name: 'その他', description: '30%OFF', discountType: 'PERCENTAGE', discountValue: 30, monthlyFee: 0, sortOrder: 2 },
      { code: 'S-01', name: 'S-01（定期）', description: '時間あたり¥275 OFF', discountType: 'FIXED_PER_HOUR', discountValue: 275, monthlyFee: 0, sortOrder: 3 },
      { code: 'TR-00', name: 'TR-00', description: '無料', discountType: 'FREE', discountValue: 0, monthlyFee: 0, sortOrder: 4 },
      { code: 'STUDENT', name: '学生会員', description: '月額¥3,630（利用は無料）', discountType: 'FREE', discountValue: 0, monthlyFee: 3630, sortOrder: 5 },
    ];
    for (const s of seeds) {
      await adminApi.createMemberType(s);
    }
    load();
  };

  if (isLoading) return <Loading text="読み込み中..." />;

  return (
    <div className="space-y-6">
      {/* 会員種別マスタ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-primary-800 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            会員種別マスタ
          </h3>
          <div className="flex gap-2">
            {memberTypes.length === 0 && (
              <button
                onClick={handleSeedDefaults}
                className="text-xs text-primary-600 font-semibold underline"
              >
                既定値で一括登録
              </button>
            )}
            <button
              onClick={() => setShowTypeForm(!showTypeForm)}
              className="text-xs text-primary-700 font-semibold flex items-center gap-1"
            >
              <FiPlus className="w-3 h-3" /> {showTypeForm ? '閉じる' : '追加'}
            </button>
          </div>
        </div>

        {showTypeForm && (
          <div className="bg-white p-4 rounded-2xl shadow-card border border-gray-100 space-y-2 mb-3">
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="コード（例: S-01）" value={typeForm.code} onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="表示名" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            </div>
            <input placeholder="説明（任意）" value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={typeForm.discountType} onChange={(e) => setTypeForm({ ...typeForm, discountType: e.target.value as DiscountType })} className="px-3 py-2 border rounded-lg text-sm">
                {(['NONE', 'PERCENTAGE', 'FIXED_PER_HOUR', 'FREE'] as DiscountType[]).map((t) => (
                  <option key={t} value={t}>{DISCOUNT_TYPE_LABEL[t]}</option>
                ))}
              </select>
              <div>
                <input
                  type="number" placeholder="割引値" value={typeForm.discountValue}
                  onChange={(e) => setTypeForm({ ...typeForm, discountValue: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  disabled={typeForm.discountType === 'NONE' || typeForm.discountType === 'FREE'}
                />
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {typeForm.discountType === 'PERCENTAGE' ? '%' : typeForm.discountType === 'FIXED_PER_HOUR' ? '円/h' : ''}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400">月額（任意・備考）</label>
                <input type="number" value={typeForm.monthlyFee} onChange={(e) => setTypeForm({ ...typeForm, monthlyFee: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400">並び順</label>
                <input type="number" value={typeForm.sortOrder} onChange={(e) => setTypeForm({ ...typeForm, sortOrder: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            <Button fullWidth onClick={handleCreateType} disabled={!typeForm.code || !typeForm.name}>作成</Button>
          </div>
        )}

        <div className="space-y-2">
          {memberTypes.length === 0 ? (
            <p className="text-center text-gray-400 py-4 text-sm">会員種別が登録されていません</p>
          ) : memberTypes.map((m) => (
            <div key={m.id} className={clsx('bg-white p-3 rounded-xl border flex items-center justify-between', m.isActive ? 'border-gray-100' : 'border-gray-200 opacity-60')}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">{m.name}</span>
                  <span className="text-[10px] text-gray-400">[{m.code}]</span>
                </div>
                <p className="text-xs text-primary-600 font-semibold mt-0.5">{formatDiscount(m)}</p>
                {m.monthlyFee ? <p className="text-[10px] text-gray-500">月額¥{m.monthlyFee.toLocaleString()}</p> : null}
                {m.description && <p className="text-[10px] text-gray-400 mt-0.5">{m.description}</p>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleToggleType(m)} className="text-xs text-primary-500 px-2">
                  {m.isActive ? '無効化' : '有効化'}
                </button>
                <button onClick={() => handleDeleteType(m.id)} className="p-2 text-red-400 hover:text-red-600">
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ユーザーへの会員区分付与 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-primary-800 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            会員登録一覧
          </h3>
          <button
            onClick={() => setShowAssignForm(!showAssignForm)}
            className="text-xs text-primary-700 font-semibold flex items-center gap-1"
          >
            <FiPlus className="w-3 h-3" /> {showAssignForm ? '閉じる' : '会員を付与'}
          </button>
        </div>

        {showAssignForm && (
          <div className="bg-white p-4 rounded-2xl shadow-card border border-gray-100 space-y-3 mb-3">
            {/* ユーザー検索 */}
            <div>
              <label className="text-xs text-gray-500">ユーザー検索（表示名 or LINEユーザーID）</label>
              <div className="flex gap-2 mt-1">
                <input
                  placeholder="表示名で検索" value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                />
                <button onClick={() => handleSearchUsers()} className="px-3 py-2 bg-primary-500 text-white rounded-lg text-sm flex items-center gap-1">
                  <FiSearch className="w-4 h-4" />
                </button>
              </div>
              {users.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg divide-y">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setAssignForm({ ...assignForm, userId: u.id, lineUserId: u.lineUserId, displayName: u.displayName })}
                      className={clsx(
                        'w-full px-3 py-2 text-left text-sm hover:bg-sky-50',
                        assignForm.lineUserId === u.lineUserId && 'bg-sky-50 font-semibold'
                      )}
                    >
                      <div className="text-gray-900">{u.displayName}</div>
                      <div className="text-[10px] text-gray-400 truncate">{u.lineUserId}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {assignForm.lineUserId && (
              <div className="p-2 bg-sky-50 rounded-lg text-xs">
                <span className="text-gray-500">対象:</span> <span className="font-semibold text-primary-700">{assignForm.displayName}</span>
              </div>
            )}

            {/* 会員種別選択 */}
            <div>
              <label className="text-xs text-gray-500">会員種別</label>
              <select
                value={assignForm.memberTypeId}
                onChange={(e) => setAssignForm({ ...assignForm, memberTypeId: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">選択してください</option>
                {memberTypes.filter((m) => m.isActive).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}（{formatDiscount(m)}）</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400">開始日（任意）</label>
                <input type="date" value={assignForm.startDate} onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400">終了日（任意）</label>
                <input type="date" value={assignForm.endDate} onChange={(e) => setAssignForm({ ...assignForm, endDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>

            <Button fullWidth onClick={handleAssign} disabled={!assignForm.lineUserId || !assignForm.memberTypeId}>
              この内容で付与
            </Button>
            <button
              onClick={handleAssignSelf}
              disabled={!assignForm.memberTypeId}
              className="w-full mt-2 py-2 rounded-xl border-2 border-primary-300 text-primary-700 text-sm font-semibold disabled:opacity-40"
            >
              自分(管理者)に付与（テスト用）
            </button>
            <p className="text-[10px] text-gray-400 mt-2 text-center">
              ※ ユーザーが見つからない場合は、対象の方が一度ミニアプリを開く必要があります
            </p>
          </div>
        )}

        <div className="space-y-2">
          {memberships.length === 0 ? (
            <p className="text-center text-gray-400 py-4 text-sm">会員登録がありません</p>
          ) : memberships.map((m) => (
            <div key={m.id} className="bg-white p-3 rounded-xl border border-gray-100 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FiUser className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-semibold text-gray-900">{m.displayName || '(名前未取得)'}</span>
                </div>
                <p className="text-xs text-primary-600 font-semibold mt-0.5">{m.memberTypeName}</p>
                <p className="text-[10px] text-gray-400">
                  {(m.startDate || '指定なし')} 〜 {(m.endDate || '指定なし')}
                </p>
              </div>
              <button onClick={() => handleRevoke(m.id)} className="p-2 text-red-400 hover:text-red-600">
                <FiTrash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

// ============ クーポン管理タブ ============
const CouponsTab: React.FC = () => {
  const [coupons, setCoupons] = React.useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const emptyForm = {
    code: '',
    description: '',
    discountType: 'FIXED' as 'FIXED' | 'PERCENTAGE',
    discountValue: 500,
    locationFilter: '' as '' | 'ASP' | 'YABASE',
    validFrom: '',
    validUntil: '',
    maxUses: '',
  };
  const [form, setForm] = React.useState(emptyForm);

  const load = () => {
    adminApi.getCoupons()
      .then(setCoupons)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  React.useEffect(load, []);

  const handleCreate = async () => {
    try {
      await adminApi.createCoupon({
        code: form.code,
        description: form.description,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        locationFilter: (form.locationFilter || null) as any,
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        isActive: true,
      });
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '作成に失敗しました';
      alert(msg);
    }
  };

  const handleSeedTerada = async () => {
    if (!confirm('TERADA（¥500OFF テスト用）を作成しますか？')) return;
    try {
      await adminApi.createCoupon({
        code: 'TERADA',
        description: 'テスト用 ¥500OFF',
        discountType: 'FIXED',
        discountValue: 500,
        isActive: true,
      });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '作成に失敗しました';
      alert(msg);
    }
  };

  const handleToggle = async (c: Coupon) => {
    await adminApi.updateCoupon(c.id, { isActive: !c.isActive });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await adminApi.deleteCoupon(id);
    load();
  };

  if (isLoading) return <Loading text="読み込み中..." />;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => setShowForm(!showForm)}>
          <FiPlus className="w-4 h-4" /> {showForm ? '閉じる' : 'クーポン作成'}
        </Button>
        <button
          onClick={handleSeedTerada}
          className="px-4 py-2.5 rounded-xl border-2 border-primary-300 text-primary-700 text-sm font-semibold whitespace-nowrap"
        >
          TERADA¥500を追加
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-5 rounded-2xl shadow-card border border-gray-100 space-y-3">
          <input
            placeholder="コード（例: TERADA）" value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <input
            placeholder="説明（任意）" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value as 'FIXED' | 'PERCENTAGE' })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="FIXED">固定額OFF</option>
              <option value="PERCENTAGE">％OFF</option>
            </select>
            <div>
              <input
                type="number" placeholder="割引値" value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">
                {form.discountType === 'FIXED' ? '円' : '%'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.locationFilter}
              onChange={(e) => setForm({ ...form, locationFilter: e.target.value as typeof form.locationFilter })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">全拠点</option>
              <option value="ASP">ASPのみ</option>
              <option value="YABASE">やばせのみ</option>
            </select>
            <input
              type="number" placeholder="使用回数上限（任意）" value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400">有効開始日（任意）</label>
              <input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400">有効終了日（任意）</label>
              <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
          <Button fullWidth onClick={handleCreate} disabled={!form.code || !form.discountValue}>作成</Button>
        </div>
      )}

      {coupons.length === 0 && !showForm && (
        <p className="text-center text-gray-400 py-8 text-sm">クーポンがありません</p>
      )}

      {coupons.map((c) => (
        <div
          key={c.id}
          className={clsx(
            'bg-white p-4 rounded-2xl shadow-card border',
            c.isActive ? 'border-gray-100' : 'border-gray-200 opacity-60'
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-mono font-bold text-primary-700">{c.code}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                  {c.discountType === 'PERCENTAGE'
                    ? `${c.discountValue}%OFF`
                    : `¥${c.discountValue.toLocaleString()} OFF`}
                </span>
                {c.locationFilter && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    {c.locationFilter === 'ASP' ? 'ASP' : 'やばせ'}限定
                  </span>
                )}
                {!c.isActive && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">無効</span>
                )}
              </div>
              {c.description && <p className="text-xs text-gray-600">{c.description}</p>}
              <div className="text-[10px] text-gray-400 mt-1 space-x-2">
                {(c.validFrom || c.validUntil) && (
                  <span>期間: {c.validFrom || '指定なし'}〜{c.validUntil || '指定なし'}</span>
                )}
                {c.maxUses ? <span>使用 {c.usedCount || 0}/{c.maxUses}</span> : null}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => handleToggle(c)} className="text-xs text-primary-500 px-2">
                {c.isActive ? '無効化' : '有効化'}
              </button>
              <button onClick={() => handleDelete(c.id)} className="p-2 text-red-400 hover:text-red-600">
                <FiTrash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
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
        <div className="grid grid-cols-7 gap-1 bg-gray-100 rounded-xl p-1 mb-6">
          {([
            { key: 'calendar', icon: FiGrid, label: 'カレンダー' },
            { key: 'events', icon: FiCalendar, label: 'イベント' },
            { key: 'schools', icon: FiBook, label: 'スクール' },
            { key: 'sales', icon: FiBarChart2, label: '売上' },
            { key: 'announcements', icon: FiBell, label: 'お知らせ' },
            { key: 'members', icon: FiUser, label: '会員' },
            { key: 'coupons', icon: FiTag, label: 'クーポン' },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={clsx(
                'py-2.5 rounded-lg text-[10px] font-semibold transition-all flex flex-col items-center justify-center gap-0.5',
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
        {activeTab === 'announcements' && <AnnouncementsTab />}
        {activeTab === 'members' && <MembersTab />}
        {activeTab === 'coupons' && <CouponsTab />}
      </main>
    </div>
  );
};
