import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCheckCircle } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useCheckinStore } from '../../stores/checkinStore';
import { FACILITIES, calculateEndTime } from '../../lib/price';
import { checkinApi } from '../../lib/api';

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

  const handlePayment = async () => {
    if (!facilityType || !date || !startTime) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await checkinApi.create({
        facilityType,
        date: format(date, 'yyyy-MM-dd'),
        startTime,
        duration,
      });

      // LINE Pay決済ページへリダイレクト
      if (response.paymentUrl) {
        window.location.href = response.paymentUrl;
      } else {
        // 開発環境用：直接完了ページへ
        navigate(`/complete?checkinId=${response.checkin.id}`);
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError('決済処理中にエラーが発生しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
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
              <span className="text-3xl">{facility.icon}</span>
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
          <div className="flex items-center gap-3 p-3 bg-line-green/10 rounded-lg border-2 border-line-green">
            <div className="w-12 h-12 bg-line-green rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">LINE</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">LINE Pay</p>
              <p className="text-sm text-gray-500">LINEアプリで簡単決済</p>
            </div>
            <FiCheckCircle className="w-6 h-6 text-line-green" />
          </div>
        </div>

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
          variant="line"
          fullWidth
          loading={isLoading}
          onClick={handlePayment}
        >
          LINE Payで支払う
        </Button>
        <p className="text-xs text-gray-400 text-center mt-2">
          お支払い完了後、暗証番号が発行されます
        </p>
      </div>
    </div>
  );
};
