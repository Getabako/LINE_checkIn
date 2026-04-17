import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { FiCheck, FiCalendar, FiRepeat } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useCheckinStore } from '../../stores/checkinStore';
import { LOCATION_FACILITIES } from '../../lib/locations';
import {
  LOCATION_TIME_SLOTS,
  calculatePrice,
  calculateEndTime,
  getAvailableDurations,
} from '../../lib/price';
import { checkinApi, AvailabilityInfo } from '../../lib/api';
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

  const dateOptions = React.useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => addDays(new Date(), i));
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

  // 定期予約: 日付自動生成
  React.useEffect(() => {
    if (!multiDateMode || !recurringType || !date) return;
    const interval = recurringType === 'BIWEEKLY' ? 14 : 7;
    const generated: Date[] = [];
    for (let i = 0; i < recurringCount; i++) {
      const d = addDays(date, interval * i);
      generated.push(d);
    }
    setDates(generated);
  }, [recurringType, recurringCount, date, multiDateMode, setDates]);

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
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="日時選択" showBack />

      <main className="p-4 pb-36">
        {/* 選択中の施設 */}
        <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-primary-50 to-sky-50 rounded-2xl mb-6 border border-primary-100/50 animate-fade-in">
          <div className="w-11 h-11 bg-gradient-to-br from-primary-500 to-primary-400 text-white rounded-xl flex items-center justify-center shadow-sm">
            <FacilityIcon name={facility?.iconName || ''} className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-primary-800">{facility?.name}</p>
            <p className="text-xs text-primary-400">を利用予定</p>
          </div>
        </div>

        {/* 予約モード選択 */}
        <section className="mb-6 animate-fade-in-up">
          <div className="flex gap-2">
            <button
              onClick={() => setMultiDateMode(false)}
              className={clsx(
                'flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-1.5',
                !multiDateMode
                  ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-sky-50 text-primary-700 shadow-card'
                  : 'border-gray-100 bg-white text-gray-500'
              )}
            >
              <FiCalendar className="w-4 h-4" />
              単日予約
            </button>
            <button
              onClick={() => setMultiDateMode(true)}
              className={clsx(
                'flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-1.5',
                multiDateMode
                  ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-sky-50 text-primary-700 shadow-card'
                  : 'border-gray-100 bg-white text-gray-500'
              )}
            >
              <FiRepeat className="w-4 h-4" />
              複数日予約
            </button>
          </div>
        </section>

        {/* 定期予約オプション（複数日モード時） */}
        {multiDateMode && (
          <section className="mb-6 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100/50 animate-fade-in-up">
            <h3 className="font-bold text-indigo-800 mb-3 flex items-center gap-2 text-sm">
              <FiRepeat className="w-4 h-4" />
              定期予約（任意）
            </h3>
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
              <div>
                <p className="text-xs text-indigo-600 mb-2">回数を選択（基準日を下から選んでください）</p>
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6, 7, 8].map((c) => (
                    <button
                      key={c}
                      onClick={() => setRecurring(recurringType, c)}
                      className={clsx(
                        'w-9 h-9 rounded-lg border-2 text-xs font-bold transition-all',
                        recurringCount === c
                          ? 'border-indigo-500 bg-indigo-100 text-indigo-700'
                          : 'border-gray-200 bg-white text-gray-500'
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 日時選択セクション（まとめてスッキリ） */}
        <section className="mb-6 p-5 bg-white rounded-2xl shadow-card border border-gray-100/50 animate-fade-in-up">
          <h3 className="font-bold text-primary-800 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            日時選択
          </h3>

          {/* 単日モード: 日付はドロップダウン */}
          {!multiDateMode && (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-600 mb-2">利用日</label>
              <div className="relative">
                <select
                  value={date ? date.toISOString() : ''}
                  onChange={(e) => setDate(new Date(e.target.value))}
                  className="w-full px-4 py-3 pr-10 rounded-xl border-2 border-gray-100 bg-white text-gray-800 text-sm font-semibold appearance-none focus:border-primary-500 focus:outline-none shadow-sm"
                >
                  <option value="">日付を選択してください</option>
                  {dateOptions.map((d) => {
                    const avail = getAvailabilityLabel(d);
                    const isFull = avail?.text === '×';
                    return (
                      <option key={d.toISOString()} value={d.toISOString()} disabled={isFull}>
                        {avail ? `${avail.text} ` : ''}{formatDateLabel(d)}（{format(d, 'M/d', { locale: ja })}）{isFull ? ' - 予約済み' : ''}
                      </option>
                    );
                  })}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary-400">
                  <FiCalendar className="w-5 h-5" />
                </div>
              </div>
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
        </section>

        {/* 料金内訳 */}
        {priceInfo && (
          <section className="p-5 bg-white rounded-2xl shadow-card border border-gray-100/50 animate-scale-in">
            <h3 className="font-bold text-primary-800 mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
              料金内訳
            </h3>
            <div className="space-y-2">
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
