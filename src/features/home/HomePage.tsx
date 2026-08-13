import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { FiClock, FiMapPin, FiCheck, FiChevronRight } from 'react-icons/fi';
import { FaYenSign } from 'react-icons/fa';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useCheckinStore } from '../../stores/checkinStore';
import { mergeFacilities, getLocationName } from '../../lib/locations';
import { PRICE_TABLE } from '../../lib/price';
import { FacilityType, FacilityProfiles, PriceTable, facilityApi, priceApi } from '../../lib/api';
import clsx from 'clsx';

// 料金セクション: 見出し＋シンプルな行リスト（入れ子の表をやめてフラットに）
const PriceSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  rows: { label: string; time: string; price: number; unit: string }[];
}> = ({ icon, title, rows }) => (
  <div>
    <h4 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
      <div className="w-7 h-7 bg-sky-50 rounded-lg flex items-center justify-center">
        {icon}
      </div>
      {title}
    </h4>
    <div className="rounded-xl bg-gray-50 divide-y divide-gray-200/70">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center px-4 py-3">
          <span className="w-14 flex-shrink-0 text-xs font-bold text-gray-700">{r.label}</span>
          <span className="flex-1 text-xs text-gray-500">{r.time}</span>
          <span className="font-bold text-primary-700">
            ¥{r.price.toLocaleString()}
            <span className="text-xs font-normal text-gray-400">{r.unit}</span>
          </span>
        </div>
      ))}
    </div>
  </div>
);

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
  const [profiles, setProfiles] = React.useState<FacilityProfiles | undefined>(undefined);
  const [priceTable, setPriceTable] = React.useState<PriceTable | undefined>(undefined);

  React.useEffect(() => {
    if (!location) {
      navigate('/');
    }
  }, [location, navigate]);

  React.useEffect(() => {
    facilityApi.getProfiles().then(setProfiles).catch(() => setProfiles(undefined));
    priceApi.getPricePlans().then(setPriceTable).catch(() => setPriceTable(undefined));
  }, []);

  if (!location) return null;

  const facilities = mergeFacilities(location, profiles);
  const locationName = getLocationName(location);
  const locationPrices = (priceTable || PRICE_TABLE)[location];
  // 拠点別の営業開始時刻
  const openTime = location === 'ASP' ? '08:00' : '07:00';
  const dayRange = `${openTime}-17:00`;

  const handleFacilitySelect = (type: FacilityType) => {
    setFacilityType(type);
  };

  const handleNext = () => {
    if (facilityType) {
      navigate('/checkin');
    }
  };

  return (
    <div className="min-h-screen bg-[#eef2f7]">
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
              className={clsx('choice-card overflow-hidden', facilityType === facility.id && 'selected')}
            >
              <div className="p-5 pb-4">
                {/* ヘッダー行: アイコン + 名称 + 営業時間 + 選択インジケーター */}
                <div className="flex items-center gap-4">
                  <div className={clsx(
                    'w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm flex-shrink-0',
                    facilityType === facility.id
                      ? 'bg-gradient-to-br from-primary-500 to-primary-400 text-white shadow-button'
                      : 'bg-sky-50 text-primary-400'
                  )}>
                    <FacilityIcon name={facility.iconName} className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-gray-900 leading-snug">
                      {facility.name}
                    </h3>
                    <div className="flex items-center gap-1 mt-1 text-primary-400">
                      <FiClock className="w-3.5 h-3.5" />
                      <p className="text-xs">
                        {facility.operatingHours}
                      </p>
                    </div>
                  </div>
                  {/* 選択インジケーター */}
                  <div className={clsx(
                    'w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                    facilityType === facility.id
                      ? 'border-primary-500 bg-primary-500 text-white'
                      : 'border-gray-300 bg-white text-transparent'
                  )}>
                    <FiCheck className="w-4 h-4" />
                  </div>
                </div>
                {/* 説明: カードの横幅いっぱいに表示 */}
                {facility.description && (
                  <p className="text-[13px] text-gray-600 mt-3 pt-3 border-t border-gray-100 leading-relaxed whitespace-pre-wrap">
                    {facility.description}
                  </p>
                )}
              </div>
              {/* タップ可能であることを示すフッター帯 */}
              <div className={clsx(
                'px-5 py-2 text-xs font-bold flex items-center justify-center gap-1 border-t',
                facilityType === facility.id
                  ? 'bg-primary-500 text-white border-primary-500'
                  : 'bg-sky-50 text-primary-600 border-gray-100'
              )}>
                {facilityType === facility.id ? (
                  <>
                    <FiCheck className="w-3.5 h-3.5" />
                    選択中
                  </>
                ) : (
                  <>
                    タップして選択
                    <FiChevronRight className="w-3.5 h-3.5" />
                  </>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* 料金表 */}
        <div className="mt-8 panel animate-fade-in-up">
          <div className="panel-header">
            <FaYenSign className="w-4 h-4" />
            料金表（税込）
          </div>

          <div className="panel-body space-y-5">
            {/* 体育館料金 */}
            {locationPrices.GYM && (
              <PriceSection
                icon={<FaBasketballBall className="w-3.5 h-3.5 text-primary-500" />}
                title="体育館"
                rows={[
                  { label: '平日', time: dayRange, price: locationPrices.GYM.WEEKDAY.DAYTIME, unit: '/h' },
                  { label: '平日', time: '17:00-21:00', price: locationPrices.GYM.WEEKDAY.EVENING, unit: '/h' },
                  { label: '土日祝', time: '終日', price: locationPrices.GYM.WEEKEND.DAYTIME, unit: '/h' },
                ]}
              />
            )}

            {/* トレーニングルーム（貸切）料金 */}
            {locationPrices.TRAINING_PRIVATE && (
              <PriceSection
                icon={<FaDumbbell className="w-3.5 h-3.5 text-primary-500" />}
                title="トレーニングルーム（貸切）"
                rows={[
                  { label: '全日', time: `${openTime}-21:00`, price: locationPrices.TRAINING_PRIVATE.WEEKDAY.ALLDAY, unit: '/h' },
                ]}
              />
            )}

            {/* トレーニングルーム（相席）料金 */}
            {locationPrices.TRAINING_SHARED && (
              <PriceSection
                icon={<FaDumbbell className="w-3.5 h-3.5 text-primary-500" />}
                title="トレーニングルーム（相席）"
                rows={[
                  { label: '全日', time: `${openTime}-21:00`, price: locationPrices.TRAINING_SHARED.WEEKDAY.ALLDAY, unit: '/人' },
                ]}
              />
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
