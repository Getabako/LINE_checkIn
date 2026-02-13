import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useCheckinStore } from '../../stores/checkinStore';
import {
  TIME_SLOTS,
  FACILITIES,
  calculatePrice,
  calculateEndTime,
  getAvailableDurations,
} from '../../lib/price';
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
    facilityType,
    date,
    startTime,
    duration,
    setDate,
    setStartTime,
    setDuration,
    setTotalPrice,
  } = useCheckinStore();

  React.useEffect(() => {
    if (!facilityType) {
      navigate('/');
    }
  }, [facilityType, navigate]);

  const dateOptions = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
  }, []);

  const priceInfo = React.useMemo(() => {
    if (!facilityType || !date || !startTime) return null;
    return calculatePrice(facilityType, date, startTime, duration);
  }, [facilityType, date, startTime, duration]);

  const availableDurations = React.useMemo(() => {
    if (!startTime) return [1, 2, 3, 4];
    return getAvailableDurations(startTime);
  }, [startTime]);

  React.useEffect(() => {
    if (startTime && !availableDurations.includes(duration)) {
      setDuration(availableDurations[availableDurations.length - 1] || 1);
    }
  }, [startTime, duration, availableDurations, setDuration]);

  const facility = FACILITIES.find((f) => f.id === facilityType);

  const formatDateLabel = (d: Date) => {
    if (isToday(d)) return '今日';
    if (isTomorrow(d)) return '明日';
    return format(d, 'M/d(E)', { locale: ja });
  };

  const handleNext = () => {
    if (priceInfo) {
      setTotalPrice(priceInfo.totalPrice);
      navigate('/payment');
    }
  };

  const canProceed = date && startTime && priceInfo;

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

        {/* 日付選択 */}
        <section className="mb-6 animate-fade-in-up">
          <h3 className="font-bold text-primary-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            利用日
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-2 stagger-children">
            {dateOptions.map((d) => (
              <button
                key={d.toISOString()}
                onClick={() => setDate(d)}
                className={clsx(
                  'flex-shrink-0 px-4 py-3 rounded-xl border-2 text-center min-w-[80px] transition-all duration-300 transform hover:-translate-y-0.5',
                  date?.toDateString() === d.toDateString()
                    ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-sky-50 text-primary-700 shadow-card'
                    : 'border-gray-100 bg-white text-gray-700 shadow-sm hover:border-primary-200 hover:shadow-card'
                )}
              >
                <p className="text-sm font-bold">{formatDateLabel(d)}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {format(d, 'M/d', { locale: ja })}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* 開始時間選択 */}
        <section className="mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="font-bold text-primary-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            開始時間
          </h3>
          <div className="grid grid-cols-4 gap-2 stagger-children">
            {TIME_SLOTS.map((time) => (
              <button
                key={time}
                onClick={() => setStartTime(time)}
                className={clsx(
                  'py-3 rounded-xl border-2 text-sm font-semibold transition-all duration-300 transform hover:-translate-y-0.5',
                  startTime === time
                    ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-sky-50 text-primary-700 shadow-card'
                    : 'border-gray-100 bg-white text-gray-600 shadow-sm hover:border-primary-200 hover:shadow-card'
                )}
              >
                {time}
              </button>
            ))}
          </div>
        </section>

        {/* 利用時間選択 */}
        <section className="mb-6 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="font-bold text-primary-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            利用時間
          </h3>
          <div className="flex gap-2">
            {availableDurations.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={clsx(
                  'flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all duration-300 transform hover:-translate-y-0.5',
                  duration === d
                    ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-sky-50 text-primary-700 shadow-card'
                    : 'border-gray-100 bg-white text-gray-600 shadow-sm hover:border-primary-200 hover:shadow-card'
                )}
              >
                {d}時間
              </button>
            ))}
          </div>
          {startTime && (
            <p className="text-sm text-primary-400 mt-2 ml-1">
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
              {priceInfo.breakdown.map((item, index) => (
                <div key={index} className="flex justify-between text-sm py-1">
                  <span className="text-gray-500">
                    {item.hour}:00 〜 {item.hour + 1}:00
                  </span>
                  <span className="font-semibold text-gray-700">¥{item.price.toLocaleString()}</span>
                </div>
              ))}
              <div className="border-t-2 border-primary-100 pt-3 mt-3 flex justify-between items-center">
                <span className="font-bold text-gray-700">合計</span>
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
