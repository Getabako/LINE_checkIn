import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { FiClock, FiMapPin } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useCheckinStore } from '../../stores/checkinStore';
import { LOCATION_FACILITIES, getLocationName } from '../../lib/locations';
import { PRICE_TABLE } from '../../lib/price';
import { FacilityType } from '../../lib/api';
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

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { location, facilityType, setFacilityType } = useCheckinStore();

  React.useEffect(() => {
    if (!location) {
      navigate('/');
    }
  }, [location, navigate]);

  if (!location) return null;

  const facilities = LOCATION_FACILITIES[location] || [];
  const locationName = getLocationName(location);
  const locationPrices = PRICE_TABLE[location];

  const handleFacilitySelect = (type: FacilityType) => {
    setFacilityType(type);
  };

  const handleNext = () => {
    if (facilityType) {
      navigate('/checkin');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title={locationName} showBack />

      <main className="p-4 pb-28">
        {/* ヒーローセクション */}
        <div className="text-center mb-8 pt-4 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-400 rounded-2xl shadow-glow mb-4 animate-float">
            <FiMapPin className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-primary-800 mb-2">
            施設を選択してください
          </h2>
          <p className="text-gray-500 text-sm">
            利用したい施設をタップしてください
          </p>
        </div>

        {/* 施設カード */}
        <div className="space-y-4 stagger-children">
          {facilities.map((facility) => (
            <button
              key={facility.id}
              onClick={() => handleFacilitySelect(facility.id)}
              className={clsx(
                'w-full p-5 rounded-2xl border-2 text-left transition-all duration-300 transform hover:-translate-y-1',
                facilityType === facility.id
                  ? 'border-primary-500 bg-gradient-to-br from-white to-sky-50 shadow-card-hover scale-[1.01]'
                  : 'border-gray-100 bg-white shadow-card hover:shadow-card-hover hover:border-primary-200'
              )}
            >
              <div className="flex items-start gap-4">
                <div className={clsx(
                  'w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm',
                  facilityType === facility.id
                    ? 'bg-gradient-to-br from-primary-500 to-primary-400 text-white shadow-button'
                    : 'bg-sky-50 text-primary-400'
                )}>
                  <FacilityIcon name={facility.iconName} className="w-7 h-7" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">
                      {facility.name}
                    </h3>
                    {facilityType === facility.id && (
                      <span className="px-3 py-1 bg-gradient-to-r from-primary-500 to-primary-400 text-white text-xs font-bold rounded-full shadow-sm animate-scale-in">
                        選択中
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm mt-1">
                    {facility.description}
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-primary-400">
                    <FiClock className="w-3.5 h-3.5" />
                    <p className="text-xs">
                      {facility.operatingHours}
                    </p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* 料金表 */}
        <div className="mt-8 p-5 bg-white rounded-2xl shadow-card border border-gray-100/50 animate-fade-in-up">
          <h3 className="font-bold text-primary-800 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            料金表（税込）
          </h3>

          <div className="space-y-6">
            {/* 体育館料金 */}
            {locationPrices.GYM && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <div className="w-7 h-7 bg-sky-50 rounded-lg flex items-center justify-center">
                    <FaBasketballBall className="w-3.5 h-3.5 text-primary-500" />
                  </div>
                  体育館
                </h4>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-sky-50 text-gray-600">
                      <th className="text-left px-3 py-2 font-semibold border border-sky-100">区分</th>
                      <th className="text-left px-3 py-2 font-semibold border border-sky-100">時間帯</th>
                      <th className="text-right px-3 py-2 font-semibold border border-sky-100">料金</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border border-sky-100 text-gray-700">平日</td>
                      <td className="px-3 py-2 border border-sky-100 text-gray-500">{location === 'ASP' ? '08' : '07'}:00-17:00</td>
                      <td className="px-3 py-2 border border-sky-100 text-right font-bold text-primary-700">¥{locationPrices.GYM.WEEKDAY.DAYTIME.toLocaleString()}<span className="text-xs font-normal text-gray-400">/h</span></td>
                    </tr>
                    <tr className="bg-gray-50/50">
                      <td className="px-3 py-2 border border-sky-100 text-gray-700">平日</td>
                      <td className="px-3 py-2 border border-sky-100 text-gray-500">17:00-21:00</td>
                      <td className="px-3 py-2 border border-sky-100 text-right font-bold text-primary-700">¥{locationPrices.GYM.WEEKDAY.EVENING.toLocaleString()}<span className="text-xs font-normal text-gray-400">/h</span></td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border border-sky-100 text-gray-700">土日祝</td>
                      <td className="px-3 py-2 border border-sky-100 text-gray-500">終日</td>
                      <td className="px-3 py-2 border border-sky-100 text-right font-bold text-primary-700">¥{locationPrices.GYM.WEEKEND.DAYTIME.toLocaleString()}<span className="text-xs font-normal text-gray-400">/h</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* トレーニングルーム（貸切）料金 */}
            {locationPrices.TRAINING_PRIVATE && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <div className="w-7 h-7 bg-sky-50 rounded-lg flex items-center justify-center">
                    <FaDumbbell className="w-3.5 h-3.5 text-primary-500" />
                  </div>
                  トレーニングルーム（貸切）
                </h4>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-sky-50 text-gray-600">
                      <th className="text-left px-3 py-2 font-semibold border border-sky-100">時間帯</th>
                      <th className="text-right px-3 py-2 font-semibold border border-sky-100">料金</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border border-sky-100 text-gray-500">全日 {location === 'ASP' ? '08' : '07'}:00-21:00</td>
                      <td className="px-3 py-2 border border-sky-100 text-right font-bold text-primary-700">¥{locationPrices.TRAINING_PRIVATE.WEEKDAY.ALLDAY.toLocaleString()}<span className="text-xs font-normal text-gray-400">/h</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* トレーニングルーム（相席）料金 */}
            {locationPrices.TRAINING_SHARED && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <div className="w-7 h-7 bg-sky-50 rounded-lg flex items-center justify-center">
                    <FaDumbbell className="w-3.5 h-3.5 text-primary-500" />
                  </div>
                  トレーニングルーム（相席）
                </h4>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-sky-50 text-gray-600">
                      <th className="text-left px-3 py-2 font-semibold border border-sky-100">時間帯</th>
                      <th className="text-right px-3 py-2 font-semibold border border-sky-100">料金</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 border border-sky-100 text-gray-500">全日 {location === 'ASP' ? '08' : '07'}:00-21:00</td>
                      <td className="px-3 py-2 border border-sky-100 text-right font-bold text-primary-700">¥{locationPrices.TRAINING_SHARED.WEEKDAY.ALLDAY.toLocaleString()}<span className="text-xs font-normal text-gray-400">/人</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-primary-100/30 animate-slide-up">
        <Button
          fullWidth
          disabled={!facilityType}
          onClick={handleNext}
        >
          次へ進む
        </Button>
      </div>
    </div>
  );
};
