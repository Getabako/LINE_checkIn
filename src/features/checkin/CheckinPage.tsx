import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addDays, isToday, isTomorrow, getDay, isSameDay, startOfDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { FiCheck, FiCalendar, FiRepeat, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Loading } from '../../components/common/Loading';
import { useCheckinStore } from '../../stores/checkinStore';
import { LOCATION_FACILITIES, getLocationName } from '../../lib/locations';
import {
  LOCATION_TIME_SLOTS,
  calculatePrice,
  calculateEndTime,
  getAvailableDurations,
} from '../../lib/price';
import { checkinApi, AvailabilityInfo, LocationId, FacilityType } from '../../lib/api';
import clsx from 'clsx';

const FacilityIcon: React.FC<{ name: string; className?: string }> = ({ name, className }) => {
  switch (name) {
    case 'basketball':
      return <FaBasketballBall className={className} />;
    case 'dumbbell':
      return <FaDumbbell className={className} />;
    default:
      return null;
  }
};

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// ダイヤル式の数値ピッカー（1列分）: スクロールして止まった位置の値を採用
const DIAL_ITEM_H = 36;
const DialColumn: React.FC<{
  values: number[];
  value: number;
  onChange: (v: number) => void;
}> = ({ values, value, onChange }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<number | null>(null);
  const idx = Math.max(0, values.indexOf(value));

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = idx * DIAL_ITEM_H;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const handleScroll = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / DIAL_ITEM_H)));
      if (values[i] !== value) onChange(values[i]);
    }, 120);
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={handleScroll}
        className="w-14 overflow-y-auto snap-y snap-mandatory rounded-xl bg-white border-2 border-indigo-200 [&::-webkit-scrollbar]:hidden"
        style={{ height: DIAL_ITEM_H * 3, scrollbarWidth: 'none' }}
      >
        <div style={{ height: DIAL_ITEM_H }} />
        {values.map((v) => (
          <div
            key={v}
            className={clsx(
              'flex items-center justify-center snap-center transition-colors',
              v === value ? 'text-indigo-700 text-xl font-bold' : 'text-gray-300 text-base font-semibold'
            )}
            style={{ height: DIAL_ITEM_H }}
          >
            {v}
          </div>
        ))}
        <div style={{ height: DIAL_ITEM_H }} />
      </div>
      {/* 中央の選択帯 */}
      <div
        className="pointer-events-none absolute left-1 right-1 top-1/2 -translate-y-1/2 border-y-2 border-indigo-300/70"
        style={{ height: DIAL_ITEM_H }}
      />
    </div>
  );
};

// 回数ダイヤル: 10の位と1の位を別々のダイヤルで選択
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const CountDial: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  const set = (t: number, o: number) => onChange(Math.max(1, t * 10 + o));
  return (
    <div className="flex items-center justify-center gap-2">
      <DialColumn values={DIGITS} value={tens} onChange={(t) => set(t, ones)} />
      <DialColumn values={DIGITS} value={ones} onChange={(o) => set(tens, o)} />
      <span className="text-base font-bold text-indigo-700 ml-1">回</span>
    </div>
  );
};

// その週の日曜を返す
const sundayOf = (d: Date): Date => {
  const s = startOfDay(d);
  return addDays(s, -getDay(s));
};

// 月カレンダーで日付を選んでジャンプするポップオーバー
const MonthJumpCalendar: React.FC<{
  minDate: Date;
  maxDate: Date;
  onPick: (d: Date) => void;
  onClose: () => void;
}> = ({ minDate, maxDate, onPick, onClose }) => {
  const [viewMonth, setViewMonth] = React.useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const minD = startOfDay(minDate);
  const maxD = startOfDay(maxDate);
  const firstDay = viewMonth;
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const leadingBlanks = getDay(firstDay);
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)),
  ];

  const prevMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  const nextMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  // 前月/翌月に予約可能日が1日でもあるか
  const canPrevMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0) >= minD;
  const canNextMonth = nextMonth <= maxD;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => canPrevMonth && setViewMonth(prevMonth)} disabled={!canPrevMonth}
            className="p-2 rounded-lg text-primary-500 disabled:text-gray-200" aria-label="前の月">
            <FiChevronLeft className="w-5 h-5" />
          </button>
          <p className="font-bold text-gray-800">{format(viewMonth, 'yyyy年M月', { locale: ja })}</p>
          <button type="button" onClick={() => canNextMonth && setViewMonth(nextMonth)} disabled={!canNextMonth}
            className="p-2 rounded-lg text-primary-500 disabled:text-gray-200" aria-label="次の月">
            <FiChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {WEEKDAY_LABELS.map((w, i) => (
            <span key={w} className={clsx('text-[11px] font-semibold', i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400')}>{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`b${i}`} />;
            const selectable = d >= minD && d <= maxD;
            const dow = getDay(d);
            return (
              <button
                key={d.toISOString()}
                type="button"
                disabled={!selectable}
                onClick={() => { onPick(d); onClose(); }}
                className={clsx(
                  'h-9 rounded-lg text-sm font-semibold transition-colors',
                  !selectable
                    ? 'text-gray-200 cursor-not-allowed'
                    : isToday(d)
                      ? 'bg-primary-500 text-white'
                      : clsx('hover:bg-primary-50', dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700')
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400 text-center mt-3">日付をタップするとその週の空き状況へ移動します（本日〜90日先まで）</p>
      </div>
    </div>
  );
};

// 週間タイムテーブル（曜日 × 時間で空き状況を一覧表示・Labola風）
const WeeklyTimetable: React.FC<{
  location: LocationId;
  facilityType: FacilityType;
  selectedDate: Date | null;
  selectedStartTime: string | null;
  minDate: Date;
  maxDate: Date;
  onSelectSlot: (date: Date, startTime: string) => void;
}> = ({ location, facilityType, selectedDate, selectedStartTime, minDate, maxDate, onSelectSlot }) => {
  const [weekStart, setWeekStart] = React.useState<Date>(() => sundayOf(selectedDate || new Date()));
  const [data, setData] = React.useState<{ openHour: number; closeHour: number; timetable: Record<string, Record<string, number>> } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showJump, setShowJump] = React.useState(false);

  const capacity = facilityType === 'TRAINING_SHARED' ? 10 : 1;
  const weekDays = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const minD = startOfDay(minDate);
  const maxD = startOfDay(maxDate);

  React.useEffect(() => {
    setLoading(true);
    const dateStrs = weekDays.map((d) => format(d, 'yyyy-MM-dd'));
    checkinApi.getTimetable({ location, facilityType, dates: dateStrs })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [location, facilityType, weekStart]);

  const openHour = data?.openHour ?? (location === 'ASP' ? 8 : 7);
  const closeHour = data?.closeHour ?? 21;
  const hours = React.useMemo(
    () => Array.from({ length: closeHour - openHour }, (_, i) => openHour + i),
    [openHour, closeHour]
  );

  const canPrev = weekStart > minD;
  const canNext = addDays(weekStart, 6) < maxD;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
      {/* 週ナビ */}
      <div className="px-3 pt-3 pb-2.5 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => canPrev && setWeekStart(addDays(weekStart, -7))} disabled={!canPrev}
            className="w-9 h-9 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center text-primary-500 active:scale-95 transition-all disabled:text-gray-200 disabled:shadow-none"
            aria-label="前の週">
            <FiChevronLeft className="w-5 h-5" />
          </button>
          <p className="text-base font-bold text-gray-800">
            {format(weekStart, 'M/d', { locale: ja })} <span className="text-gray-400 font-normal">〜</span> {format(addDays(weekStart, 6), 'M/d', { locale: ja })}
          </p>
          <button type="button" onClick={() => canNext && setWeekStart(addDays(weekStart, 7))} disabled={!canNext}
            className="w-9 h-9 rounded-full border border-gray-200 bg-white shadow-sm flex items-center justify-center text-primary-500 active:scale-95 transition-all disabled:text-gray-200 disabled:shadow-none"
            aria-label="次の週">
            <FiChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <button type="button" onClick={() => setWeekStart(sundayOf(new Date()))}
            className="px-4 py-1.5 rounded-full border-2 border-primary-200 bg-white text-xs font-bold text-primary-600 shadow-sm active:scale-95 transition-all">
            今週へ
          </button>
          <button type="button" onClick={() => setShowJump(true)}
            className="px-4 py-1.5 rounded-full bg-primary-500 text-xs font-bold text-white shadow-button active:scale-95 transition-all flex items-center gap-1.5">
            <FiCalendar className="w-3.5 h-3.5" />
            日付を指定
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-10">
          <Loading text="空き状況を読み込み中..." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-center select-none">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 px-2 py-2 text-[11px] font-bold text-gray-600 border-b border-r border-gray-200 min-w-[64px]">日付</th>
                {hours.map((h) => (
                  <th key={h} className="px-1 py-2 text-[10px] font-bold text-gray-500 border-b border-gray-200 min-w-[40px]">
                    {String(h).padStart(2, '0')}:00
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDays.map((d) => {
                const dStr = format(d, 'yyyy-MM-dd');
                const inRange = d >= minD && d <= maxD;
                const dow = getDay(d);
                const dayHours = data?.timetable[dStr] || {};
                return (
                  <tr key={dStr}>
                    <td className={clsx(
                      'sticky left-0 z-10 bg-white px-2 py-1.5 text-[11px] font-semibold border-b border-r border-gray-100 whitespace-nowrap',
                      dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-700'
                    )}>
                      {format(d, 'M/d', { locale: ja })}({WEEKDAY_LABELS[dow]})
                    </td>
                    {hours.map((h) => {
                      const count = Number(dayHours[h] || 0);
                      const remaining = capacity - count;
                      const bookable = inRange && remaining > 0;
                      const selected = selectedDate != null && isSameDay(d, selectedDate) && selectedStartTime === `${String(h).padStart(2, '0')}:00`;
                      let cell: React.ReactNode;
                      if (!inRange) {
                        cell = <span className="text-gray-200">-</span>;
                      } else if (facilityType === 'TRAINING_SHARED') {
                        cell = <span className={clsx('font-bold', bookable ? 'text-emerald-600' : 'text-red-400')}>{count}</span>;
                      } else if (count > 0) {
                        cell = '';
                      } else {
                        cell = <span className="text-emerald-600 font-bold">○</span>;
                      }
                      return (
                        <td key={h} className="p-0 border-b border-gray-50">
                          <button
                            type="button"
                            onClick={() => bookable && onSelectSlot(d, `${String(h).padStart(2, '0')}:00`)}
                            disabled={!bookable}
                            className={clsx(
                              'w-full h-9 text-[12px] flex items-center justify-center transition-colors',
                              selected
                                ? 'bg-primary-500 text-white'
                                : !inRange
                                  ? 'bg-gray-50 cursor-not-allowed'
                                  : count >= capacity
                                    ? 'bg-blue-100 cursor-not-allowed'
                                    : 'hover:bg-emerald-50'
                            )}
                          >
                            {selected ? <FiCheck className="w-3.5 h-3.5" /> : cell}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 月カレンダーで日付ジャンプ */}
      {showJump && (
        <MonthJumpCalendar
          minDate={minD}
          maxDate={maxD}
          onPick={(d) => setWeekStart(sundayOf(d))}
          onClose={() => setShowJump(false)}
        />
      )}

      {/* 凡例 */}
      <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1 px-2 py-2 text-[11px] text-gray-500 border-t border-gray-100">
        <span><span className="text-emerald-600 font-bold">○</span> 空き（予約可能）</span>
        <span><span className="inline-block w-3 h-3 align-middle bg-blue-100 rounded-sm"></span> 予約済</span>
        {facilityType === 'TRAINING_SHARED' && <span>数字 = 現在の利用人数（定員{capacity}名）</span>}
      </div>
    </div>
  );
};

export const CheckinPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    location,
    facilityType,
    date,
    startTime,
    duration,
    multiDateMode,
    dates,
    recurringType,
    recurringCount,
    recurringEndDate,
    setRecurringEndDate,
    setDate,
    setStartTime,
    setDuration,
    setTotalPrice,
    setMultiDateMode,
    toggleDate,
    setRecurring,
    setDates,
  } = useCheckinStore();

  React.useEffect(() => {
    if (!location || !facilityType) {
      navigate('/');
    }
  }, [location, facilityType, navigate]);

  // 予約可能期間: 当日から90日先まで（通常会員、約3ヶ月）
  const RESERVABLE_DAYS = 90;
  const dateOptions = React.useMemo(() => {
    return Array.from({ length: RESERVABLE_DAYS }, (_, i) => addDays(new Date(), i));
  }, []);

  // 単一日の料金
  const priceInfo = React.useMemo(() => {
    if (!location || !facilityType || !startTime) return null;
    if (multiDateMode) {
      if (dates.length === 0) return null;
      // 複数日: 各日の料金を合計
      let total = 0;
      const allBreakdowns: { hour: number; price: number }[] = [];
      for (const d of dates) {
        const result = calculatePrice(location, facilityType, d, startTime, duration);
        total += result.totalPrice;
        allBreakdowns.push(...result.breakdown);
      }
      return { totalPrice: total, breakdown: allBreakdowns, dateCount: dates.length };
    }
    if (!date) return null;
    const result = calculatePrice(location, facilityType, date, startTime, duration);
    return { ...result, dateCount: 1 };
  }, [location, facilityType, date, dates, startTime, duration, multiDateMode]);

  const availableDurations = React.useMemo(() => {
    if (!startTime) return [1, 2, 3, 4];
    return getAvailableDurations(startTime);
  }, [startTime]);

  React.useEffect(() => {
    if (startTime && !availableDurations.includes(duration)) {
      setDuration(availableDurations[availableDurations.length - 1] || 1);
    }
  }, [startTime, duration, availableDurations, setDuration]);

  // 定期予約: 日付自動生成（期間指定があれば終了日まで、なければ回数分）
  React.useEffect(() => {
    if (!multiDateMode || !recurringType || !date) return;
    const interval = recurringType === 'BIWEEKLY' ? 14 : 7;
    const maxDate = addDays(startOfDay(new Date()), RESERVABLE_DAYS - 1);
    const generated: Date[] = [];
    if (recurringEndDate) {
      const end = startOfDay(recurringEndDate) <= maxDate ? startOfDay(recurringEndDate) : maxDate;
      for (let d = date; startOfDay(d) <= end; d = addDays(d, interval)) {
        generated.push(d);
      }
    } else {
      for (let i = 0; i < recurringCount; i++) {
        const d = addDays(date, interval * i);
        if (startOfDay(d) > maxDate) break;
        generated.push(d);
      }
    }
    setDates(generated);
  }, [recurringType, recurringCount, recurringEndDate, date, multiDateMode, setDates]);

  // 空き状況の取得
  const [availability, setAvailability] = React.useState<Record<string, AvailabilityInfo>>({});

  React.useEffect(() => {
    if (!location || !facilityType) return;
    const dateStrs = dateOptions.map((d) => format(d, 'yyyy-MM-dd'));
    checkinApi.getAvailability({
      location,
      facilityType,
      dates: dateStrs,
      startTime: startTime || undefined,
      duration: startTime ? duration : undefined,
    }).then(setAvailability).catch(() => setAvailability({}));
  }, [location, facilityType, startTime, duration, dateOptions]);

  const getAvailabilityLabel = (d: Date): { text: string; color: string } | null => {
    const key = format(d, 'yyyy-MM-dd');
    const info = availability[key];
    if (!info) return null;
    switch (info.status) {
      case 'full': return { text: '×', color: 'text-red-500' };
      case 'few': return { text: '△', color: 'text-amber-500' };
      case 'available': return { text: '○', color: 'text-emerald-500' };
    }
  };

  const facility = location ? LOCATION_FACILITIES[location]?.find((f) => f.id === facilityType) : null;

  const formatDateLabel = (d: Date) => {
    if (isToday(d)) return '今日';
    if (isTomorrow(d)) return '明日';
    return format(d, 'M/d(E)', { locale: ja });
  };

  const isDateSelected = (d: Date) => {
    if (multiDateMode) {
      return dates.some((sd) => sd.toDateString() === d.toDateString());
    }
    return date?.toDateString() === d.toDateString();
  };

  const handleDateClick = (d: Date) => {
    if (multiDateMode && !recurringType) {
      toggleDate(d);
      // 複数日モードでは最初の選択日をdateにも設定
      if (!date || dates.length === 0) {
        setDate(d);
      }
    } else {
      setDate(d);
    }
  };

  const handleNext = () => {
    if (priceInfo) {
      setTotalPrice(priceInfo.totalPrice);
      navigate('/payment');
    }
  };

  const canProceed = startTime && priceInfo && (multiDateMode ? dates.length > 0 : !!date);

  return (
    <div className="min-h-screen bg-[#eef2f7]">
      <Header
        title="日時選択"
        subtitle={location ? `${getLocationName(location)}｜${facility?.name || ''}` : undefined}
        showBack
      />

      <main className="p-4 pb-36">
        {/* 選択中の施設 */}
        <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl mb-6 shadow-card animate-fade-in">
          <div className="w-11 h-11 bg-white/20 text-white rounded-xl flex items-center justify-center">
            <FacilityIcon name={facility?.iconName || ''} className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-primary-100 font-semibold">利用する施設</p>
            <p className="font-bold text-white">{facility?.name}</p>
          </div>
        </div>

        {/* 予約モード選択（セグメントコントロール） */}
        <section className="mb-6 animate-fade-in-up">
          <p className="text-xs font-bold text-gray-500 mb-1.5 ml-1">予約タイプを選択</p>
          <div className="flex gap-1 p-1 bg-gray-300/60 rounded-xl">
            <button
              onClick={() => setMultiDateMode(false)}
              className={clsx(
                'flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1.5',
                !multiDateMode
                  ? 'bg-primary-500 text-white shadow-button'
                  : 'text-gray-600 hover:bg-white/60'
              )}
            >
              <FiCalendar className="w-4 h-4" />
              単日予約
            </button>
            <button
              onClick={() => setMultiDateMode(true)}
              className={clsx(
                'flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1.5',
                multiDateMode
                  ? 'bg-primary-500 text-white shadow-button'
                  : 'text-gray-600 hover:bg-white/60'
              )}
            >
              <FiRepeat className="w-4 h-4" />
              複数日予約
            </button>
          </div>
        </section>

        {/* 日時選択セクション（まとめてスッキリ） */}
        <section className="mb-6 panel animate-fade-in-up">
          <div className="panel-header">
            <FiCalendar className="w-4 h-4" />
            日時を選択
          </div>
          <div className="panel-body">

          {/* 単日モード: 週間タイムテーブルで空き状況を一覧表示 */}
          {!multiDateMode && location && facilityType && (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-600 mb-2">
                利用日・開始時間（空いている枠をタップ）
              </label>
              <WeeklyTimetable
                location={location}
                facilityType={facilityType}
                selectedDate={date}
                selectedStartTime={startTime}
                minDate={dateOptions[0]}
                maxDate={dateOptions[dateOptions.length - 1]}
                onSelectSlot={(d, st) => { setDate(d); setStartTime(st); }}
              />
              {date && startTime && (
                <p className="text-sm text-primary-600 mt-2 font-semibold text-center">
                  選択中: {formatDateLabel(date)}（{format(date, 'M/d(E)', { locale: ja })}）{startTime}〜
                </p>
              )}
            </div>
          )}

          {/* 複数日モード: カレンダーグリッド */}
          {multiDateMode && (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-600 mb-2">
                {recurringType ? '基準日を選択' : '利用日（複数選択可）'}
              </label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {dateOptions.map((d) => {
                  const avail = getAvailabilityLabel(d);
                  const isFull = avail?.text === '×';
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => !isFull && handleDateClick(d)}
                      disabled={isFull}
                      className={clsx(
                        'flex-shrink-0 px-3 py-2 rounded-lg border-2 text-center min-w-[72px] transition-all relative',
                        isFull
                          ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed'
                          : isDateSelected(d)
                            ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-sky-50 text-primary-700 shadow-sm'
                            : 'border-gray-100 bg-white text-gray-700 hover:border-primary-200'
                      )}
                    >
                      {isDateSelected(d) && !isFull && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                          <FiCheck className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                      {avail && (
                        <p className={clsx('text-xs font-bold', avail.color)}>{avail.text}</p>
                      )}
                      <p className="text-xs font-bold">{formatDateLabel(d)}</p>
                      <p className="text-[10px] text-gray-400">
                        {format(d, 'M/d', { locale: ja })}
                      </p>
                    </button>
                  );
                })}
              </div>
              {dates.length > 0 && (
                <p className="text-sm text-primary-500 mt-2 font-semibold">
                  {dates.length}日分を選択中
                </p>
              )}
            </div>
          )}

          {/* 開始時間・利用時間を横並びに */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-2">開始時間</label>
              <div className="relative">
                <select
                  value={startTime || ''}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-4 py-3 pr-10 rounded-xl border-2 border-gray-100 bg-white text-gray-800 text-sm font-semibold appearance-none focus:border-primary-500 focus:outline-none shadow-sm"
                >
                  <option value="">選択</option>
                  {(location ? LOCATION_TIME_SLOTS[location] : []).map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary-400 text-xs">▼</div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-2">利用時間</label>
              <div className="relative">
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full px-4 py-3 pr-10 rounded-xl border-2 border-gray-100 bg-white text-gray-800 text-sm font-semibold appearance-none focus:border-primary-500 focus:outline-none shadow-sm"
                >
                  {availableDurations.map((d) => (
                    <option key={d} value={d}>
                      {d}時間
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary-400 text-xs">▼</div>
              </div>
            </div>
          </div>
          {startTime && (
            <p className="text-sm text-primary-500 mt-3 font-semibold text-center">
              {startTime} 〜 {calculateEndTime(startTime, duration)}
            </p>
          )}
          </div>
        </section>

        {/* 繰り返し設定（複数日モード時）: 基準日を選んだあとに回数・期間を決める */}
        {multiDateMode && (
          <section className="mb-6 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100/50 animate-fade-in-up">
            <h3 className="font-bold text-indigo-800 mb-1 flex items-center gap-2 text-sm">
              <FiRepeat className="w-4 h-4" />
              繰り返し設定（任意）
            </h3>
            <p className="text-[11px] text-indigo-400 mb-3">
              {date
                ? `基準日 ${format(date, 'M/d(E)', { locale: ja })} をもとに、同じ曜日・時間で繰り返し予約します`
                : '上の「基準日を選択」で日付を選んでから設定してください'}
            </p>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setRecurring(recurringType === 'WEEKLY' ? null : 'WEEKLY', recurringCount)}
                className={clsx(
                  'flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-all',
                  recurringType === 'WEEKLY'
                    ? 'border-indigo-500 bg-indigo-100 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-500'
                )}
              >
                毎週
              </button>
              <button
                onClick={() => setRecurring(recurringType === 'BIWEEKLY' ? null : 'BIWEEKLY', recurringCount)}
                className={clsx(
                  'flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-all',
                  recurringType === 'BIWEEKLY'
                    ? 'border-indigo-500 bg-indigo-100 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-500'
                )}
              >
                隔週
              </button>
            </div>
            {recurringType && (
              <div className="space-y-4">
                <div className={clsx('rounded-xl p-3 border-2 transition-all', !recurringEndDate ? 'border-indigo-300 bg-white/70' : 'border-transparent bg-white/40 opacity-60')}>
                  <p className="text-xs font-bold text-indigo-600 mb-2">回数で指定（ダイヤルを回して選択）</p>
                  <CountDial
                    value={recurringCount}
                    onChange={(c) => { setRecurringEndDate(null); setRecurring(recurringType, c); }}
                  />
                </div>
                <div className={clsx('rounded-xl p-3 border-2 transition-all', recurringEndDate ? 'border-indigo-300 bg-white/70' : 'border-transparent bg-white/40')}>
                  <p className="text-xs font-bold text-indigo-600 mb-2">
                    または終了日で指定（終了日まで{recurringType === 'BIWEEKLY' ? '隔週' : '毎週'}繰り返し）
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={recurringEndDate ? format(recurringEndDate, 'yyyy-MM-dd') : ''}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      max={format(addDays(new Date(), RESERVABLE_DAYS - 1), 'yyyy-MM-dd')}
                      onChange={(e) => setRecurringEndDate(e.target.value ? new Date(`${e.target.value}T00:00:00`) : null)}
                      className={clsx(
                        'flex-1 px-3 py-2 rounded-lg border-2 text-sm font-semibold bg-white',
                        recurringEndDate ? 'border-indigo-500 text-indigo-700' : 'border-gray-200 text-gray-500'
                      )}
                    />
                    {recurringEndDate && (
                      <button
                        onClick={() => setRecurringEndDate(null)}
                        className="px-3 py-2 rounded-lg border-2 border-gray-200 bg-white text-xs font-semibold text-gray-500"
                      >
                        解除
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-indigo-400">
                  ※予約は{RESERVABLE_DAYS}日先まで（それを超える分は自動で除外）。年間予約は運営にご相談ください。
                </p>
                {dates.length > 0 && (
                  <p className="text-xs font-bold text-indigo-700 text-center">
                    {dates.length}日分を予約します（{format(dates[0], 'M/d', { locale: ja })} 〜 {format(dates[dates.length - 1], 'M/d', { locale: ja })}）
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* 料金内訳 */}
        {priceInfo && (
          <section className="panel animate-scale-in">
            <div className="panel-header">
              <span className="text-sm">¥</span>
              料金内訳
            </div>
            <div className="panel-body space-y-2">
              {!multiDateMode ? (
                // 単日: 時間帯別
                priceInfo.breakdown.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm py-1">
                    <span className="text-gray-500">
                      {item.hour}:00 〜 {item.hour + 1}:00
                    </span>
                    <span className="font-semibold text-gray-700">¥{item.price.toLocaleString()}</span>
                  </div>
                ))
              ) : (
                // 複数日: 日付別の合計
                <>
                  {dates.map((d, index) => {
                    const dayResult = location && facilityType && startTime
                      ? calculatePrice(location, facilityType, d, startTime, duration)
                      : null;
                    return (
                      <div key={index} className="flex justify-between text-sm py-1">
                        <span className="text-gray-500">
                          {format(d, 'M/d(E)', { locale: ja })}
                        </span>
                        <span className="font-semibold text-gray-700">
                          ¥{(dayResult?.totalPrice || 0).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
              <div className="border-t-2 border-primary-100 pt-3 mt-3 flex justify-between items-center">
                <span className="font-bold text-gray-700">
                  合計{multiDateMode && dates.length > 1 ? `（${dates.length}日分）` : ''}
                </span>
                <span className="font-bold text-2xl bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                  ¥{priceInfo.totalPrice.toLocaleString()}
                </span>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-primary-100/30">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-500 text-sm">お支払い金額</span>
          <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
            ¥{(priceInfo?.totalPrice || 0).toLocaleString()}
          </span>
        </div>
        <Button fullWidth disabled={!canProceed} onClick={handleNext}>
          確認画面へ
        </Button>
      </div>
    </div>
  );
};
