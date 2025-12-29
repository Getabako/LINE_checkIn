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

  // 施設が選択されていない場合はホームに戻す
  React.useEffect(() => {
    if (!facilityType) {
      navigate('/');
    }
  }, [facilityType, navigate]);

  // 日付選択肢を生成（今日から7日間）
  const dateOptions = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
  }, []);

  // 料金を計算
  const priceInfo = React.useMemo(() => {
    if (!facilityType || !date || !startTime) return null;
    return calculatePrice(facilityType, date, startTime, duration);
  }, [facilityType, date, startTime, duration]);

  // 利用可能な時間数
  const availableDurations = React.useMemo(() => {
    if (!startTime) return [1, 2, 3, 4];
    return getAvailableDurations(startTime);
  }, [startTime]);

  // 時間選択時にdurationを調整
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
    <div className="min-h-screen bg-gray-50">
      <Header title="日時選択" showBack />

      <main className="p-4 pb-32">
        {/* 選択中の施設 */}
        <div className="flex items-center gap-3 p-3 bg-primary-50 rounded-lg mb-6">
          <div className="w-10 h-10 bg-primary-500 text-white rounded-lg flex items-center justify-center">
            <FacilityIcon name={facility?.iconName || ''} className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{facility?.name}</p>
            <p className="text-xs text-gray-500">を利用予定</p>
          </div>
        </div>

        {/* 日付選択 */}
        <section className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">利用日</h3>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {dateOptions.map((d) => (
              <button
                key={d.toISOString()}
                onClick={() => setDate(d)}
                className={clsx(
                  'flex-shrink-0 px-4 py-3 rounded-lg border-2 text-center min-w-[80px] transition-all',
                  date?.toDateString() === d.toDateString()
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300'
                )}
              >
                <p className="text-sm font-medium">{formatDateLabel(d)}</p>
                <p className="text-xs text-gray-500">
                  {format(d, 'M/d', { locale: ja })}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* 開始時間選択 */}
        <section className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">開始時間</h3>
          <div className="grid grid-cols-4 gap-2">
            {TIME_SLOTS.map((time) => (
              <button
                key={time}
                onClick={() => setStartTime(time)}
                className={clsx(
                  'py-3 rounded-lg border-2 text-sm font-medium transition-all',
                  startTime === time
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300'
                )}
              >
                {time}
              </button>
            ))}
          </div>
        </section>

        {/* 利用時間選択 */}
        <section className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">利用時間</h3>
          <div className="flex gap-2">
            {availableDurations.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={clsx(
                  'flex-1 py-3 rounded-lg border-2 text-sm font-medium transition-all',
                  duration === d
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300'
                )}
              >
                {d}時間
              </button>
            ))}
          </div>
          {startTime && (
            <p className="text-sm text-gray-500 mt-2">
              {startTime} 〜 {calculateEndTime(startTime, duration)}
            </p>
          )}
        </section>

        {/* 料金内訳 */}
        {priceInfo && (
          <section className="p-4 bg-white rounded-xl border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3">料金内訳</h3>
            <div className="space-y-2">
              {priceInfo.breakdown.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {item.hour}:00 〜 {item.hour + 1}:00
                  </span>
                  <span className="font-medium">¥{item.price.toLocaleString()}</span>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
                <span className="font-semibold">合計</span>
                <span className="font-bold text-lg text-primary-600">
                  ¥{priceInfo.totalPrice.toLocaleString()}
                </span>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-600">お支払い金額</span>
          <span className="text-xl font-bold text-primary-600">
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
