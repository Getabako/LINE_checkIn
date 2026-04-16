import React from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { adminApi, Checkin, Event, School, LocationId } from '../../lib/api';
import { Loading } from '../../components/common/Loading';
import { getLocationName } from '../../lib/locations';
import clsx from 'clsx';

type CheckinItem = Checkin & { displayName?: string };

const DAY_HEADERS = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_TO_NUM: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function monthEnd(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

/** カレンダーグリッド用: 月の1日から逆算した日曜始まりの日付配列（6週=42マス） */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = monthStart(year, month);
  const startOffset = first.getDay(); // 0 (Sun) - 6 (Sat)
  const startDate = new Date(first);
  startDate.setDate(startDate.getDate() - startOffset);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push(d);
  }
  return cells;
}

/** スクール（毎週繰り返し）を月内の開催日に展開 */
function expandSchoolToDates(school: School, mStart: Date, mEnd: Date): string[] {
  const targetDay = DAY_TO_NUM[school.dayOfWeek];
  if (targetDay === undefined) return [];

  const schoolStart = school.startDate ? new Date(school.startDate) : new Date('1970-01-01');
  const schoolEnd = school.endDate ? new Date(school.endDate) : new Date('2999-12-31');
  const rangeStart = new Date(Math.max(schoolStart.getTime(), mStart.getTime()));
  const rangeEnd = new Date(Math.min(schoolEnd.getTime(), mEnd.getTime()));

  const dates: string[] = [];
  const limit = school.totalSessions || 99;
  let count = 0;
  for (
    const d = new Date(rangeStart);
    d <= rangeEnd && count < limit;
    d.setDate(d.getDate() + 1)
  ) {
    if (d.getDay() === targetDay) {
      dates.push(ymd(d));
      count++;
    }
  }
  return dates;
}

export const CalendarTab: React.FC = () => {
  const today = new Date();
  const [year, setYear] = React.useState(today.getFullYear());
  const [month, setMonth] = React.useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  const [checkins, setCheckins] = React.useState<CheckinItem[]>([]);
  const [events, setEvents] = React.useState<Event[]>([]);
  const [schools, setSchools] = React.useState<School[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const mStart = monthStart(year, month);
  const mEnd = monthEnd(year, month);
  const grid = buildMonthGrid(year, month);

  React.useEffect(() => {
    setIsLoading(true);
    setSelectedDate(null);
    const from = ymd(mStart);
    const to = ymd(mEnd);
    Promise.all([
      adminApi.getCheckins({ from, to }).catch(() => []),
      adminApi.getEvents().catch(() => []),
      adminApi.getSchools().catch(() => []),
    ])
      .then(([c, e, s]) => {
        setCheckins(c);
        setEvents(e);
        setSchools(s);
      })
      .finally(() => setIsLoading(false));
  }, [year, month]);

  /** 日付ごとのアイテム集約 */
  const itemsByDate = React.useMemo(() => {
    const map = new Map<string, { checkins: CheckinItem[]; events: Event[]; schools: School[] }>();
    const ensure = (key: string) => {
      if (!map.has(key)) map.set(key, { checkins: [], events: [], schools: [] });
      return map.get(key)!;
    };

    for (const c of checkins) {
      if (c.date) ensure(c.date).checkins.push(c);
    }
    for (const e of events) {
      if (e.date && e.isActive) ensure(e.date).events.push(e);
    }
    for (const s of schools) {
      if (!s.isActive) continue;
      const dates = expandSchoolToDates(s, mStart, mEnd);
      for (const d of dates) ensure(d).schools.push(s);
    }
    return map;
  }, [checkins, events, schools, year, month]);

  const handlePrev = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNext = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  };

  const handleToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(ymd(today));
  };

  const todayStr = ymd(today);
  const selected = selectedDate ? itemsByDate.get(selectedDate) : null;

  return (
    <div className="space-y-4">
      {/* ヘッダー（月切替） */}
      <div className="flex items-center justify-between bg-white rounded-2xl shadow-card border border-gray-100 p-3">
        <button onClick={handlePrev} className="p-2 text-gray-500 hover:text-primary-600">
          <FiChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-900 text-lg">{year}年{month + 1}月</span>
          <button
            onClick={handleToday}
            className="px-3 py-1 text-xs rounded-full bg-primary-50 text-primary-700 font-semibold hover:bg-primary-100"
          >
            今日
          </button>
        </div>
        <button onClick={handleNext} className="p-2 text-gray-500 hover:text-primary-600">
          <FiChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 凡例 */}
      <div className="flex gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-400" />予約
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-400" />イベント
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-400" />スクール
        </span>
      </div>

      {/* カレンダー本体 */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 text-center text-xs font-bold bg-gray-50 border-b border-gray-100">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              className={clsx(
                'py-2',
                i === 0 && 'text-red-500',
                i === 6 && 'text-blue-500',
                i !== 0 && i !== 6 && 'text-gray-600',
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* マス */}
        {isLoading ? (
          <div className="py-10"><Loading text="読み込み中..." /></div>
        ) : (
          <div className="grid grid-cols-7">
            {grid.map((date, idx) => {
              const dateStr = ymd(date);
              const isCurrentMonth = date.getMonth() === month;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const items = itemsByDate.get(dateStr);
              const cCount = items?.checkins.length || 0;
              const eCount = items?.events.length || 0;
              const sCount = items?.schools.length || 0;
              const hasItems = cCount + eCount + sCount > 0;

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(dateStr)}
                  className={clsx(
                    'relative min-h-[60px] border-r border-b border-gray-100 p-1 text-left transition-colors',
                    !isCurrentMonth && 'bg-gray-50 text-gray-300',
                    isCurrentMonth && 'text-gray-700 hover:bg-primary-50',
                    isSelected && 'ring-2 ring-primary-500 ring-inset',
                  )}
                >
                  <div
                    className={clsx(
                      'text-xs font-semibold',
                      isToday && 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-500 text-white',
                      !isToday && date.getDay() === 0 && isCurrentMonth && 'text-red-500',
                      !isToday && date.getDay() === 6 && isCurrentMonth && 'text-blue-500',
                    )}
                  >
                    {date.getDate()}
                  </div>
                  {hasItems && (
                    <div className="mt-0.5 space-y-0.5">
                      {cCount > 0 && (
                        <div className="text-[10px] px-1 rounded bg-blue-100 text-blue-700 truncate">
                          予約{cCount}
                        </div>
                      )}
                      {eCount > 0 && (
                        <div className="text-[10px] px-1 rounded bg-orange-100 text-orange-700 truncate">
                          イベ{eCount}
                        </div>
                      )}
                      {sCount > 0 && (
                        <div className="text-[10px] px-1 rounded bg-green-100 text-green-700 truncate">
                          スク{sCount}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 選択日の詳細 */}
      {selectedDate && selected && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-4 space-y-3">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full" />
            {selectedDate} の予定
          </h3>

          {selected.checkins.length === 0 && selected.events.length === 0 && selected.schools.length === 0 && (
            <p className="text-center text-gray-400 py-4 text-sm">この日は予定がありません</p>
          )}

          {selected.checkins.length > 0 && (
            <div>
              <p className="text-xs font-bold text-blue-600 mb-1">予約 ({selected.checkins.length}件)</p>
              <div className="space-y-1">
                {selected.checkins.map((c) => (
                  <div key={c.id} className="text-sm bg-blue-50 rounded-lg p-2 border border-blue-100">
                    <div className="flex justify-between">
                      <span className="font-semibold text-blue-800">
                        {c.startTime}〜 {getLocationName((c.location || 'ASP') as LocationId)} / {c.facilityType}
                      </span>
                      <span className="text-xs text-gray-500">
                        {c.status === 'PENDING' ? '未決済' : '決済済'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {c.displayName || ''} ({c.duration}h)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selected.events.length > 0 && (
            <div>
              <p className="text-xs font-bold text-orange-600 mb-1">イベント ({selected.events.length}件)</p>
              <div className="space-y-1">
                {selected.events.map((e) => (
                  <div key={e.id} className="text-sm bg-orange-50 rounded-lg p-2 border border-orange-100">
                    <div className="font-semibold text-orange-800">{e.title}</div>
                    <div className="text-xs text-gray-600">
                      {e.startTime}〜{e.endTime} / {getLocationName(e.location)} / {e.currentCount}/{e.capacity}名
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selected.schools.length > 0 && (
            <div>
              <p className="text-xs font-bold text-green-600 mb-1">スクール ({selected.schools.length}件)</p>
              <div className="space-y-1">
                {selected.schools.map((s) => (
                  <div key={s.id} className="text-sm bg-green-50 rounded-lg p-2 border border-green-100">
                    <div className="font-semibold text-green-800">{s.title}</div>
                    <div className="text-xs text-gray-600">
                      {s.startTime}〜{s.endTime} / {getLocationName(s.location)} / {s.currentCount}/{s.capacity}名
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
