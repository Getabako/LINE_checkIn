import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCheckCircle, FiCreditCard } from 'react-icons/fi';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useCheckinStore } from '../../stores/checkinStore';
import { FACILITIES, calculateEndTime } from '../../lib/price';
import { checkinApi } from '../../lib/api';

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

  // 必要な情報がない場合はホームに戻す
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

    // フェイク決済処理（ステップを順に進める）
    setPaymentStep(1); // カード情報確認中
    await new Promise((r) => setTimeout(r, 1200));
    setPaymentStep(2); // 決済処理中
    await new Promise((r) => setTimeout(r, 1500));
    setPaymentStep(3); // 暗証番号発行中
    await new Promise((r) => setTimeout(r, 1000));

    // 4桁のランダム暗証番号を生成
    const pinCode = String(Math.floor(1000 + Math.random() * 9000));

    // ローカルストレージに予約情報を保存
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
    <div className="min-h-screen bg-gray-50">
      <Header title="ご利用内容確認" showBack />

      <main className="p-4 pb-32">
        {/* 確認カード */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* 施設 */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary-500 text-white rounded-lg flex items-center justify-center">
                <FacilityIcon name={facility.iconName} className="w-6 h-6" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{facility.name}</p>
                <p className="text-sm text-gray-500">{facility.description}</p>
              </div>
            </div>
          </div>

          {/* 詳細 */}
          <div className="p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">利用日</span>
              <span className="font-medium">
                {format(date, 'yyyy年M月d日(E)', { locale: ja })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">利用時間</span>
              <span className="font-medium">
                {startTime} 〜 {calculateEndTime(startTime, duration)}（{duration}時間）
              </span>
            </div>
          </div>

          {/* 料金 */}
          <div className="p-4 bg-gray-50 border-t border-gray-100">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">お支払い金額</span>
              <span className="text-2xl font-bold text-primary-600">
                ¥{totalPrice.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* 注意事項 */}
        <div className="mt-6 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
          <h3 className="font-semibold text-yellow-800 mb-2">ご利用にあたって</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• 決済完了後、入館用の4桁暗証番号が発行されます</li>
            <li>• 暗証番号は当日の利用時間のみ有効です</li>
            <li>• 入口の電子ロックに暗証番号を入力してください</li>
            <li>• キャンセルは利用開始1時間前まで可能です</li>
          </ul>
        </div>

        {/* 決済方法 */}
        <div className="mt-6 p-4 bg-white rounded-xl border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">お支払い方法</h3>
          <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-lg border-2 border-indigo-500">
            <div className="w-12 h-12 bg-indigo-500 rounded-lg flex items-center justify-center">
              <FiCreditCard className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">クレジットカード</p>
              <p className="text-sm text-gray-500">Stripe決済</p>
            </div>
            <FiCheckCircle className="w-6 h-6 text-indigo-500" />
          </div>
        </div>

        {/* フェイク決済処理ステップ */}
        {isProcessing && (
          <div className="mt-6 p-4 bg-white rounded-xl border border-gray-200">
            <div className="flex justify-center mb-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
            </div>
            <div className="space-y-2">
              {[
                'カード情報を確認中...',
                '決済を処理中...',
                '暗証番号を発行中...',
              ].map((label, i) => (
                <p
                  key={i}
                  className={`text-sm transition-opacity duration-300 text-center ${
                    i + 1 <= paymentStep ? 'opacity-100' : 'opacity-30'
                  } ${i + 1 === paymentStep ? 'font-medium text-primary-600' : 'text-gray-600'}`}
                >
                  {i + 1 < paymentStep ? '✓ ' : i + 1 === paymentStep ? '● ' : '○ '}
                  {label}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
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
