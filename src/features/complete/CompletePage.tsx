import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCheckCircle, FiCopy, FiHome, FiAlertTriangle } from 'react-icons/fi';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Loading } from '../../components/common/Loading';
import { checkinApi, Checkin } from '../../lib/api';
import { FACILITIES, calculateEndTime } from '../../lib/price';
import { useCheckinStore } from '../../stores/checkinStore';

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
    if (!checkinId) {
      setError('予約情報が見つかりません');
      setIsLoading(false);
      return;
    }

    try {
      const checkins = JSON.parse(localStorage.getItem('gym-checkins') || '[]');
      const found = checkins.find((c: Checkin) => c.id === checkinId);
      if (found) {
        setCheckin(found);
      } else {
        checkinApi.getById(checkinId)
          .then((data) => setCheckin(data))
          .catch(() => setError('予約情報が見つかりません'));
      }
    } catch {
      setError('予約情報の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
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
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || '予約情報が見つかりません'}</p>
          <Button onClick={() => navigate('/')}>ホームに戻る</Button>
        </div>
      </div>
    );
  }

  const facility = FACILITIES.find((f) => f.id === checkin.facilityType);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="予約完了" />

      <main className="p-4 pb-28">
        {/* 完了メッセージ */}
        <div className="text-center py-8 animate-fade-in-up">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg animate-bounce-soft">
            <FiCheckCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            決済が完了しました
          </h2>
          <p className="text-gray-400 text-sm">
            入館用の暗証番号を発行しました
          </p>
        </div>

        {/* 暗証番号カード */}
        <div className="bg-gradient-to-br from-primary-500 via-primary-500 to-primary-400 rounded-2xl p-6 text-white shadow-lg mb-6 animate-fade-in-up relative overflow-hidden" style={{ animationDelay: '0.1s' }}>
          {/* 装飾的な円 */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full"></div>
          <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/5 rounded-full"></div>
          
          <p className="text-primary-100 text-sm mb-3 relative">入館用暗証番号</p>
          <div className="flex items-center justify-center gap-3 relative">
            <div className="flex gap-2.5">
              {checkin.pinCode?.split('').map((digit, index) => (
                <div
                  key={index}
                  className="w-16 h-18 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/20 animate-scale-in"
                  style={{ animationDelay: `${0.3 + index * 0.1}s` }}
                >
                  <span className="text-4xl font-bold">{digit}</span>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={handleCopyPin}
            className="mt-5 flex items-center justify-center gap-2 w-full py-2.5 bg-white/20 backdrop-blur-sm rounded-xl hover:bg-white/30 transition-all duration-300 border border-white/10 relative"
          >
            <FiCopy className="w-4 h-4" />
            <span className="text-sm font-medium">{copied ? 'コピーしました！' : 'コピーする'}</span>
          </button>
        </div>

        {/* 利用方法 */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/50 p-5 mb-6 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="font-bold text-primary-800 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            入館方法
          </h3>
          <ol className="space-y-4 text-sm">
            {[
              '施設入口の電子ロックに向かう',
              '上記の4桁暗証番号を入力',
              'ロックが解除されたら入館',
            ].map((text, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-7 h-7 bg-gradient-to-br from-primary-500 to-primary-400 text-white rounded-lg flex items-center justify-center text-xs font-bold shadow-sm">
                  {i + 1}
                </span>
                <span className="text-gray-600 pt-0.5">{text}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* 予約詳細 */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/50 overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-primary-500 to-primary-400 text-white rounded-xl flex items-center justify-center shadow-sm">
                <FacilityIcon name={facility?.iconName || ''} className="w-5 h-5" />
              </div>
              <p className="font-bold text-gray-900">{facility?.name}</p>
            </div>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">利用日</span>
              <span className="font-semibold text-gray-700">
                {format(new Date(checkin.date), 'yyyy年M月d日(E)', { locale: ja })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">利用時間</span>
              <span className="font-semibold text-gray-700">
                {checkin.startTime} 〜 {calculateEndTime(checkin.startTime, checkin.duration)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">お支払い金額</span>
              <span className="font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                ¥{checkin.totalPrice.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* 注意事項 */}
        <div className="mt-5 p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200/50 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <div className="flex items-start gap-2.5 text-sm text-amber-700">
            <FiAlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
            <span>暗証番号は予約時間内のみ有効です。時間外はご利用いただけません。</span>
          </div>
        </div>
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-primary-100/30">
        <Button variant="secondary" fullWidth onClick={handleBackHome}>
          <FiHome className="w-5 h-5" />
          ホームに戻る
        </Button>
      </div>
    </div>
  );
};
