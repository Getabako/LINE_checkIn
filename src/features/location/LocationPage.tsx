import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMapPin } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useCheckinStore } from '../../stores/checkinStore';
import { LOCATIONS } from '../../lib/locations';
import { LocationId } from '../../lib/api';
import clsx from 'clsx';

export const LocationPage: React.FC = () => {
  const navigate = useNavigate();
  const { location, setLocation, reset } = useCheckinStore();

  React.useEffect(() => {
    reset();
  }, [reset]);

  const handleLocationSelect = (id: LocationId) => {
    setLocation(id);
  };

  const handleNext = () => {
    if (location) {
      navigate('/facility');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="みんなの体育館" />

      <main className="p-4 pb-28">
        {/* ヒーローセクション */}
        <div className="text-center mb-8 pt-4 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-400 rounded-2xl shadow-glow mb-4 animate-float">
            <FiMapPin className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-primary-800 mb-2">
            拠点を選択してください
          </h2>
          <p className="text-gray-500 text-sm">
            ご利用になる施設の拠点をお選びください
          </p>
        </div>

        {/* 拠点カード */}
        <div className="space-y-4 stagger-children">
          {LOCATIONS.map((loc) => (
            <button
              key={loc.id}
              onClick={() => handleLocationSelect(loc.id)}
              className={clsx(
                'w-full p-5 rounded-2xl border-2 text-left transition-all duration-300 transform hover:-translate-y-1',
                location === loc.id
                  ? 'border-primary-500 bg-gradient-to-br from-white to-sky-50 shadow-card-hover scale-[1.01]'
                  : 'border-gray-100 bg-white shadow-card hover:shadow-card-hover hover:border-primary-200'
              )}
            >
              <div className="flex items-start gap-4">
                <div className={clsx(
                  'w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm',
                  location === loc.id
                    ? 'bg-gradient-to-br from-primary-500 to-primary-400 text-white shadow-button'
                    : 'bg-sky-50 text-primary-400'
                )}>
                  <FiMapPin className="w-7 h-7" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">
                      {loc.name}
                    </h3>
                    {location === loc.id && (
                      <span className="px-3 py-1 bg-gradient-to-r from-primary-500 to-primary-400 text-white text-xs font-bold rounded-full shadow-sm animate-scale-in">
                        選択中
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm mt-1">
                    {loc.description}
                  </p>
                  <p className="text-xs text-primary-400 mt-1">
                    {loc.address}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-primary-100/30 animate-slide-up">
        <Button
          fullWidth
          disabled={!location}
          onClick={handleNext}
        >
          次へ進む
        </Button>
      </div>
    </div>
  );
};
