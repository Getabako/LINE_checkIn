import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useCheckinStore } from '../../stores/checkinStore';
import { FACILITIES } from '../../lib/price';
import { FacilityType } from '../../lib/api';
import clsx from 'clsx';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { facilityType, setFacilityType, reset } = useCheckinStore();

  React.useEffect(() => {
    reset();
  }, [reset]);

  const handleFacilitySelect = (type: FacilityType) => {
    setFacilityType(type);
  };

  const handleNext = () => {
    if (facilityType) {
      navigate('/checkin');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="みんなの体育館ASP" />

      <main className="p-4 pb-24">
        {/* 施設紹介 */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            施設を選択してください
          </h2>
          <p className="text-gray-500 text-sm">
            利用したい施設をタップしてください
          </p>
        </div>

        {/* 施設カード */}
        <div className="space-y-4">
          {FACILITIES.map((facility) => (
            <button
              key={facility.id}
              onClick={() => handleFacilitySelect(facility.id as FacilityType)}
              className={clsx(
                'w-full p-5 rounded-xl border-2 text-left transition-all duration-200',
                facilityType === facility.id
                  ? 'border-primary-500 bg-primary-50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm'
              )}
            >
              <div className="flex items-start gap-4">
                <div className="text-4xl">{facility.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">
                      {facility.name}
                    </h3>
                    {facilityType === facility.id && (
                      <span className="px-2 py-1 bg-primary-500 text-white text-xs rounded-full">
                        選択中
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm mt-1">
                    {facility.description}
                  </p>
                  <p className="text-gray-400 text-xs mt-2">
                    営業時間: {facility.operatingHours}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* 料金表 */}
        <div className="mt-6 p-4 bg-white rounded-xl border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">料金表（税込）</h3>

          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">🏀 体育館</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-gray-500 text-xs">平日 07:00-17:00</p>
                  <p className="font-semibold">¥2,750/h</p>
                </div>
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-gray-500 text-xs">平日 17:00-21:00</p>
                  <p className="font-semibold">¥2,200/h</p>
                </div>
                <div className="bg-gray-50 p-2 rounded col-span-2">
                  <p className="text-gray-500 text-xs">土日祝（終日）</p>
                  <p className="font-semibold">¥2,750/h</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">💪 トレーニングジム</h4>
              <div className="bg-gray-50 p-2 rounded text-sm">
                <p className="text-gray-500 text-xs">全日 07:00-21:00</p>
                <p className="font-semibold">¥2,200/h</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
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
