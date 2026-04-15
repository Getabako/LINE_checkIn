import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCheckCircle, FiCreditCard, FiShield, FiTag, FiX } from 'react-icons/fi';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useCheckinStore } from '../../stores/checkinStore';
import { LOCATION_FACILITIES, getLocationName } from '../../lib/locations';
import { calculateEndTime } from '../../lib/price';
import { api, couponApi, membershipApi } from '../../lib/api';
import { useDebugStore } from '../../stores/debugStore';

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
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const cancelled = searchParams.get('cancelled') === 'true';

  // クーポン状態
  const [couponInput, setCouponInput] = React.useState('');
  const [couponLoading, setCouponLoading] = React.useState(false);
  const [couponMessage, setCouponMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const {
    location, facilityType, date, startTime, duration, totalPrice,
    couponCode, couponDiscount, memberDiscount, memberTypeName,
    multiDateMode, dates, recurringType,
    setCoupon, setMemberDiscount,
  } = useCheckinStore();
  const { paymentEnabled, remoteLockEnabled } = useDebugStore();

  React.useEffect(() => {
    if (!location || !facilityType || !date || !startTime || !totalPrice) {
      navigate('/');
    }
  }, [location, facilityType, date, startTime, totalPrice, navigate]);

  // 会員割引の自動適用
  React.useEffect(() => {
    if (!location || !duration) return;

    membershipApi.get().then((res) => {
      if (res.membership?.memberType) {
        const mt = res.membership.memberType;
        const discountPerHour = mt.discounts?.[location] || 0;
        if (discountPerHour !== 0) {
          const totalDiscount = Math.abs(discountPerHour) * duration;
          setMemberDiscount(totalDiscount, mt.name);
        }
      }
    }).catch(() => {
      // 会員情報取得失敗は無視
    });
  }, [location, duration, setMemberDiscount]);

  const facility = location ? LOCATION_FACILITIES[location]?.find((f) => f.id === facilityType) : null;
  const locationName = location ? getLocationName(location) : '';

  // 最終支払額
  const finalPrice = Math.max(0, totalPrice - couponDiscount - memberDiscount);

  const handleApplyCoupon = async () => {
    if (!couponInput.trim() || !location) return;

    setCouponLoading(true);
    setCouponMessage(null);

    try {
      const result = await couponApi.validate({
        code: couponInput.trim(),
        location,
        totalPrice: totalPrice - memberDiscount,
      });

      if (result.valid && result.discount) {
        setCoupon(couponInput.trim().toUpperCase(), result.discount);
        setCouponMessage({ type: 'success', text: result.message });
      } else {
        setCouponMessage({ type: 'error', text: result.message });
      }
    } catch {
      setCouponMessage({ type: 'error', text: 'クーポンの検証に失敗しました' });
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCoupon(null, 0);
    setCouponInput('');
    setCouponMessage(null);
  };

  const handlePayment = async () => {
    if (!location || !facilityType || !date || !startTime) return;

    setIsLoading(true);
    setError(null);

    // 決済OFFの場合: APIを呼ばず直接完了画面へ
    if (!paymentEnabled) {
      navigate(`/complete?mock=true`);
      return;
    }

    try {
      const isMulti = multiDateMode && dates.length > 0;
      const payload: Record<string, unknown> = {
        location,
        facilityType,
        date: format(date, 'yyyy-MM-dd'),
        startTime,
        duration,
        couponCode: couponCode || undefined,
        skipRemoteLock: !remoteLockEnabled,
      };

      if (isMulti) {
        if (recurringType) {
          payload.recurring = { type: recurringType, count: dates.length };
        } else {
          payload.dates = dates.map((d) => format(d, 'yyyy-MM-dd'));
        }
      }

      const response = await api.post<{
        checkoutUrl?: string;
        checkinId: string;
        checkinIds?: string[];
        groupId?: string;
        mode: 'stripe' | 'skip';
      }>('/payments/create-checkout', payload);

      if (response.mode === 'skip') {
        const groupParam = response.groupId ? `&groupId=${response.groupId}` : '';
        navigate(`/complete?checkinId=${response.checkinId}${groupParam}`);
      } else if (response.checkoutUrl) {
        window.location.href = response.checkoutUrl;
      } else {
        setError('決済ページの作成に失敗しました');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError('決済処理中にエラーが発生しました。もう一度お試しください。');
      setIsLoading(false);
    }
  };

  if (!facility || !date || !startTime || !location) {
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
                <p className="text-xs text-primary-400 mb-0.5">{locationName}</p>
                <p className="text-lg font-bold text-gray-900">{facility.name}</p>
                <p className="text-sm text-gray-400">{facility.description}</p>
              </div>
            </div>
          </div>

          {/* 詳細 */}
          <div className="p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">拠点</span>
              <span className="font-semibold text-gray-700">{locationName}</span>
            </div>
            {multiDateMode && dates.length > 1 ? (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-sm">利用日（{dates.length}日分）</span>
                  {recurringType && (
                    <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-semibold">
                      {recurringType === 'WEEKLY' ? '毎週' : '隔週'}
                    </span>
                  )}
                </div>
                <div className="space-y-1 ml-2">
                  {dates.map((d, i) => (
                    <p key={i} className="text-sm font-semibold text-gray-700">
                      {format(d, 'yyyy年M月d日(E)', { locale: ja })}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">利用日</span>
                <span className="font-semibold text-gray-700">
                  {format(date, 'yyyy年M月d日(E)', { locale: ja })}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">利用時間</span>
              <span className="font-semibold text-gray-700">
                {startTime} 〜 {calculateEndTime(startTime, duration)}（{duration}時間）
              </span>
            </div>
          </div>

          {/* 料金内訳 */}
          <div className="p-5 bg-gradient-to-r from-sky-50 to-primary-50 border-t border-primary-100/50">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">施設利用料</span>
                <span className="font-semibold text-gray-700">¥{totalPrice.toLocaleString()}</span>
              </div>
              {memberDiscount > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-emerald-600">{memberTypeName}割引</span>
                  <span className="font-semibold text-emerald-600">-¥{memberDiscount.toLocaleString()}</span>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-emerald-600">クーポン割引</span>
                  <span className="font-semibold text-emerald-600">-¥{couponDiscount.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t border-primary-200/50 pt-2 flex justify-between items-center">
                <span className="text-gray-500 font-medium">お支払い金額</span>
                <span className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                  ¥{finalPrice.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* クーポンコード入力 */}
        <div className="mt-6 p-5 bg-white rounded-2xl shadow-card border border-gray-100/50 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <h3 className="font-bold text-primary-800 mb-3 flex items-center gap-2">
            <FiTag className="w-4 h-4 text-primary-500" />
            クーポンコード
          </h3>
          {couponCode ? (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <FiCheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <span className="flex-1 font-semibold text-emerald-700">{couponCode}</span>
              <button
                onClick={handleRemoveCoupon}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder="クーポンコードを入力"
                className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-primary-300 focus:outline-none text-sm transition-colors"
              />
              <button
                onClick={handleApplyCoupon}
                disabled={!couponInput.trim() || couponLoading}
                className="px-5 py-3 bg-gradient-to-r from-primary-500 to-primary-400 text-white rounded-xl font-semibold text-sm disabled:opacity-50 transition-all"
              >
                {couponLoading ? '...' : '適用'}
              </button>
            </div>
          )}
          {couponMessage && (
            <p className={`mt-2 text-xs ${couponMessage.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
              {couponMessage.text}
            </p>
          )}
        </div>

        {/* 注意事項 */}
        <div className="mt-6 p-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200/50 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2">
            <span className="text-lg">&#x1F4A1;</span>
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

        {/* キャンセルメッセージ */}
        {cancelled && (
          <div className="mt-6 p-4 bg-amber-50 rounded-2xl border border-amber-200 animate-fade-in-up">
            <p className="text-amber-700 text-sm font-medium">
              決済がキャンセルされました。もう一度お試しください。
            </p>
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
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-500 text-sm">お支払い金額</span>
          <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
            ¥{finalPrice.toLocaleString()}
          </span>
        </div>
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
