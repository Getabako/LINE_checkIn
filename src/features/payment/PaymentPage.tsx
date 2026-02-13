import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCheckCircle, FiCreditCard, FiShield } from 'react-icons/fi';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useCheckinStore } from '../../stores/checkinStore';
import { FACILITIES, calculateEndTime } from '../../lib/price';

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

export const PaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { facilityType, date, startTime, duration, totalPrice } = useCheckinStore();

  React.useEffect(() => {
    if (!facilityType || !date || !startTime || !totalPrice) {
      navigate('/');
    }
  }, [facilityType, date, startTime, totalPrice, navigate]);

  const facility = FACILITIES.find((f) => f.id === facilityType);

  const [paymentStep, setPaymentStep] = React.useState(0);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const handlePayment = async () => {
    if (!facilityType || !date || !startTime) return;

    setIsLoading(true);
    setIsProcessing(true);
    setError(null);

    setPaymentStep(1);
    await new Promise((r) => setTimeout(r, 1200));
    setPaymentStep(2);
    await new Promise((r) => setTimeout(r, 1500));
    setPaymentStep(3);
    await new Promise((r) => setTimeout(r, 1000));

    const pinCode = String(Math.floor(1000 + Math.random() * 9000));

    const checkinData = {
      id: crypto.randomUUID(),
      facilityType,
      date: format(date, 'yyyy-MM-dd'),
      startTime,
      duration,
      totalPrice,
      pinCode,
      status: 'PAID',
      createdAt: new Date().toISOString(),
    };

    const existing = JSON.parse(localStorage.getItem('gym-checkins') || '[]');
    existing.push(checkinData);
    localStorage.setItem('gym-checkins', JSON.stringify(existing));

    setIsLoading(false);
    navigate(`/complete?checkinId=${checkinData.id}`);
  };

  if (!facility || !date || !startTime) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="ご利用内容確認" showBack />

      <main className="p-4 pb-36">
        {/* 確認カード */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/50 overflow-hidden animate-fade-in-up">
          {/* 施設 */}
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-400 text-white rounded-xl flex items-center justify-center shadow-button">
                <FacilityIcon name={facility.iconName} className="w-7 h-7" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{facility.name}</p>
                <p className="text-sm text-gray-400">{facility.description}</p>
              </div>
            </div>
          </div>

          {/* 詳細 */}
          <div className="p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">利用日</span>
              <span className="font-semibold text-gray-700">
                {format(date, 'yyyy年M月d日(E)', { locale: ja })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">利用時間</span>
              <span className="font-semibold text-gray-700">
                {startTime} 〜 {calculateEndTime(startTime, duration)}（{duration}時間）
              </span>
            </div>
          </div>

          {/* 料金 */}
          <div className="p-5 bg-gradient-to-r from-sky-50 to-primary-50 border-t border-primary-100/50">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-medium">お支払い金額</span>
              <span className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                ¥{totalPrice.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* 注意事項 */}
        <div className="mt-6 p-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200/50 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2">
            <span className="text-lg">💡</span>
            ご利用にあたって
          </h3>
          <ul className="text-sm text-amber-700 space-y-2">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full mt-1.5 flex-shrink-0"></span>
              決済完了後、入館用の4桁暗証番号が発行されます
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full mt-1.5 flex-shrink-0"></span>
              暗証番号は当日の利用時間のみ有効です
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full mt-1.5 flex-shrink-0"></span>
              入口の電子ロックに暗証番号を入力してください
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full mt-1.5 flex-shrink-0"></span>
              キャンセルは利用開始1時間前まで可能です
            </li>
          </ul>
        </div>

        {/* 決済方法 */}
        <div className="mt-6 p-5 bg-white rounded-2xl shadow-card border border-gray-100/50 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="font-bold text-primary-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            お支払い方法
          </h3>
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-primary-50 to-sky-50 rounded-xl border-2 border-primary-300 transition-all duration-300">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-400 rounded-xl flex items-center justify-center shadow-sm">
              <FiCreditCard className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900">クレジットカード</p>
              <p className="text-sm text-gray-400">Stripe決済</p>
            </div>
            <FiCheckCircle className="w-6 h-6 text-primary-500" />
          </div>
          <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-400">
            <FiShield className="w-3.5 h-3.5" />
            <span>安全な暗号化通信で保護されています</span>
          </div>
        </div>

        {/* フェイク決済処理ステップ */}
        {isProcessing && (
          <div className="mt-6 p-5 bg-white rounded-2xl shadow-card-hover border border-primary-100 animate-scale-in">
            <div className="flex justify-center mb-5">
              <div className="w-12 h-12 relative">
                <div className="absolute inset-0 rounded-full border-3 border-primary-100"></div>
                <div className="absolute inset-0 rounded-full border-3 border-primary-500 border-t-transparent animate-spin"></div>
              </div>
            </div>
            <div className="space-y-3">
              {[
                'カード情報を確認中...',
                '決済を処理中...',
                '暗証番号を発行中...',
              ].map((label, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-500 ${
                    i + 1 <= paymentStep ? 'opacity-100' : 'opacity-30'
                  } ${i + 1 === paymentStep ? 'bg-primary-50' : ''}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                    i + 1 < paymentStep
                      ? 'bg-primary-500 text-white'
                      : i + 1 === paymentStep
                        ? 'bg-primary-500 text-white animate-pulse-soft'
                        : 'bg-gray-200 text-gray-400'
                  }`}>
                    {i + 1 < paymentStep ? '✓' : i + 1}
                  </div>
                  <span className={`text-sm ${
                    i + 1 === paymentStep ? 'font-semibold text-primary-700' : 'text-gray-500'
                  }`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 rounded-2xl border border-red-200">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-primary-100/30">
        <Button
          fullWidth
          loading={isLoading}
          onClick={handlePayment}
        >
          カードで支払う
        </Button>
        <p className="text-xs text-gray-400 text-center mt-2">
          お支払い完了後、暗証番号が発行されます
        </p>
      </div>
    </div>
  );
};
