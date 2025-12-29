import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCheckCircle, FiCopy, FiHome } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Loading } from '../../components/common/Loading';
import { checkinApi, Checkin } from '../../lib/api';
import { FACILITIES, calculateEndTime } from '../../lib/price';
import { useCheckinStore } from '../../stores/checkinStore';

export const CompletePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const checkinId = searchParams.get('checkinId');
  const { reset } = useCheckinStore();

  const [checkin, setCheckin] = React.useState<Checkin | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const fetchCheckin = async () => {
      if (!checkinId) {
        setError('予約情報が見つかりません');
        setIsLoading(false);
        return;
      }

      try {
        const data = await checkinApi.getById(checkinId);
        setCheckin(data);
      } catch (err) {
        console.error('Failed to fetch checkin:', err);
        setError('予約情報の取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCheckin();
  }, [checkinId]);

  const handleCopyPin = async () => {
    if (checkin?.pinCode) {
      await navigator.clipboard.writeText(checkin.pinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBackHome = () => {
    reset();
    navigate('/');
  };

  if (isLoading) {
    return <Loading fullScreen text="読み込み中..." />;
  }

  if (error || !checkin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || '予約情報が見つかりません'}</p>
          <Button onClick={() => navigate('/')}>ホームに戻る</Button>
        </div>
      </div>
    );
  }

  const facility = FACILITIES.find((f) => f.id === checkin.facilityType);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="予約完了" />

      <main className="p-4 pb-24">
        {/* 完了メッセージ */}
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-line-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiCheckCircle className="w-10 h-10 text-line-green" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            決済が完了しました
          </h2>
          <p className="text-gray-500 text-sm">
            入館用の暗証番号を発行しました
          </p>
        </div>

        {/* 暗証番号カード */}
        <div className="bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl p-6 text-white shadow-lg mb-6">
          <p className="text-primary-100 text-sm mb-2">入館用暗証番号</p>
          <div className="flex items-center justify-center gap-3">
            <div className="flex gap-2">
              {checkin.pinCode?.split('').map((digit, index) => (
                <div
                  key={index}
                  className="w-14 h-16 bg-white/20 rounded-lg flex items-center justify-center"
                >
                  <span className="text-3xl font-bold">{digit}</span>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={handleCopyPin}
            className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
          >
            <FiCopy className="w-4 h-4" />
            <span className="text-sm">{copied ? 'コピーしました' : 'コピーする'}</span>
          </button>
        </div>

        {/* 利用方法 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">入館方法</h3>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-xs font-bold">
                1
              </span>
              <span className="text-gray-600">施設入口の電子ロックに向かう</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-xs font-bold">
                2
              </span>
              <span className="text-gray-600">上記の4桁暗証番号を入力</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-xs font-bold">
                3
              </span>
              <span className="text-gray-600">ロックが解除されたら入館</span>
            </li>
          </ol>
        </div>

        {/* 予約詳細 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{facility?.icon}</span>
              <p className="font-semibold text-gray-900">{facility?.name}</p>
            </div>
          </div>
          <div className="p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">利用日</span>
              <span className="font-medium">
                {format(new Date(checkin.date), 'yyyy年M月d日(E)', { locale: ja })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">利用時間</span>
              <span className="font-medium">
                {checkin.startTime} 〜 {calculateEndTime(checkin.startTime, checkin.duration)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">お支払い金額</span>
              <span className="font-medium">¥{checkin.totalPrice.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* 注意事項 */}
        <div className="mt-4 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
          <p className="text-sm text-yellow-700">
            ⚠️ 暗証番号は予約時間内のみ有効です。時間外はご利用いただけません。
          </p>
        </div>
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
        <Button variant="secondary" fullWidth onClick={handleBackHome}>
          <FiHome className="w-5 h-5" />
          ホームに戻る
        </Button>
      </div>
    </div>
  );
};
