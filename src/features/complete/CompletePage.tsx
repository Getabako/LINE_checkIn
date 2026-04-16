import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FiCheckCircle, FiCopy, FiHome, FiAlertTriangle, FiStar, FiFileText, FiLoader, FiCalendar } from 'react-icons/fi';
import { FaBasketballBall, FaDumbbell } from 'react-icons/fa';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Loading } from '../../components/common/Loading';
import { checkinApi, Checkin, LocationId } from '../../lib/api';
import { LOCATION_FACILITIES, getLocationName } from '../../lib/locations';
import { calculateEndTime } from '../../lib/price';
import { useCheckinStore } from '../../stores/checkinStore';
import { buildGoogleCalendarUrl } from '../../lib/gcal';

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

// 拠点別の入館手順
function getEntrySteps(location: LocationId, facilityType: string): string[] {
  if (location === 'YABASE') {
    return [
      '施設入口の電子ロックに向かう',
      '上記の4桁暗証番号を入力',
      'ロックが解除されたら入館',
    ];
  }
  // ASP: 玄関扉 + 施設別ロック（2段階）
  const facilityName = facilityType === 'GYM' ? '体育館' : 'トレーニングルーム';
  return [
    '玄関扉の電子ロックに暗証番号を入力して入館',
    `${facilityName}の電子ロックに同じ暗証番号を入力`,
    'ロックが解除されたらご利用開始',
  ];
}

export const CompletePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const checkinId = searchParams.get('checkinId');
  const groupId = searchParams.get('groupId');
  const isMock = searchParams.get('mock') === 'true';
  const store = useCheckinStore();
  const { reset } = store;

  const [checkin, setCheckin] = React.useState<Checkin | null>(null);
  const [groupCheckins, setGroupCheckins] = React.useState<Checkin[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = React.useState(false);

  const isMultiDate = groupCheckins.length > 1;

  React.useEffect(() => {
    // モックモード: ストアのデータからモックcheckinを作成
    if (isMock && store.location && store.date && store.startTime) {
      if (store.multiDateMode && store.dates.length > 1) {
        // 複数日モック
        const mocks = store.dates.map((d, i) => ({
          id: `mock-${Date.now()}-${i}`,
          location: store.location!,
          facilityType: store.facilityType || 'GYM',
          date: d.toISOString().split('T')[0],
          startTime: store.startTime!,
          duration: store.duration,
          totalPrice: Math.max(0, Math.floor((store.totalPrice - store.couponDiscount - store.memberDiscount) / store.dates.length)),
          pinCode: Math.floor(1000 + Math.random() * 9000).toString(),
          status: 'PAID' as const,
        } as Checkin));
        setGroupCheckins(mocks);
        setCheckin(mocks[0]);
      } else {
        const mockPin = Math.floor(1000 + Math.random() * 9000).toString();
        const mock = {
          id: 'mock-' + Date.now(),
          location: store.location,
          facilityType: store.facilityType || 'GYM',
          date: store.date.toISOString().split('T')[0],
          startTime: store.startTime,
          duration: store.duration,
          totalPrice: Math.max(0, store.totalPrice - store.couponDiscount - store.memberDiscount),
          pinCode: mockPin,
          status: 'PAID' as const,
        } as Checkin;
        setCheckin(mock);
      }
      setIsLoading(false);
      return;
    }

    if (!checkinId) {
      setError('予約情報が見つかりません');
      setIsLoading(false);
      return;
    }

    // グループ予約の場合は全checkinを取得
    if (groupId) {
      checkinApi.getByGroup(groupId)
        .then((data) => {
          setGroupCheckins(data);
          setCheckin(data[0] || null);
          setIsLoading(false);
        })
        .catch(() => {
          // フォールバック: 単一チェックイン取得
          checkinApi.getById(checkinId)
            .then((data) => {
              setCheckin(data);
              setIsLoading(false);
            })
            .catch(() => {
              setError('予約情報が見つかりません');
              setIsLoading(false);
            });
        });
    } else {
      checkinApi.getById(checkinId)
        .then((data) => {
          setCheckin(data);
          setIsLoading(false);
        })
        .catch(() => {
          setError('予約情報が見つかりません');
          setIsLoading(false);
        });
    }
  }, [checkinId, groupId, isMock]);

  const handleCopyPin = async (pin: string, id: string) => {
    await navigator.clipboard.writeText(pin);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownloadReceipt = async () => {
    const targetId = checkinId || checkin?.id;
    if (!targetId || isMock) return;
    setReceiptLoading(true);
    try {
      const { pdf } = await checkinApi.getReceipt(targetId);
      // Base64をBlobに変換してダウンロード
      const byteCharacters = atob(pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt_${targetId.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Receipt download error:', e);
    } finally {
      setReceiptLoading(false);
    }
  };

  const handleBackHome = () => {
    reset();
    navigate('/');
  };

  const handleAddToGCal = (c: Checkin) => {
    const locName = getLocationName((c.location || 'ASP') as LocationId);
    const fac = (LOCATION_FACILITIES[(c.location || 'ASP') as LocationId] || []).find((f) => f.id === c.facilityType);
    const endTime = calculateEndTime(c.startTime, c.duration);
    const url = buildGoogleCalendarUrl({
      title: `${locName} ${fac?.name || ''}`.trim(),
      startJst: `${c.date}T${c.startTime}:00`,
      endJst: `${c.date}T${endTime}:00`,
      description: c.pinCode ? `入館PIN: ${c.pinCode}` : undefined,
      location: locName,
    });
    window.open(url, '_blank');
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

  const loc = (checkin.location || 'ASP') as LocationId;
  const locationName = getLocationName(loc);
  const facilities = LOCATION_FACILITIES[loc] || [];
  const facility = facilities.find((f) => f.id === checkin.facilityType);
  const entrySteps = getEntrySteps(loc, checkin.facilityType);

  // 合計金額
  const grandTotal = isMultiDate
    ? groupCheckins.reduce((sum, c) => sum + c.totalPrice, 0)
    : checkin.totalPrice;

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
            {isMultiDate
              ? `${groupCheckins.length}日分の入館用暗証番号を発行しました`
              : '入館用の暗証番号を発行しました'}
          </p>
        </div>

        {isMultiDate ? (
          /* 複数日: 各日のPINカード */
          <div className="space-y-4 mb-6">
            {groupCheckins.map((c, index) => (
              <div
                key={c.id}
                className="bg-gradient-to-br from-primary-500 via-primary-500 to-primary-400 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden animate-fade-in-up"
                style={{ animationDelay: `${0.1 * index}s` }}
              >
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full"></div>
                <div className="flex items-center justify-between mb-3 relative">
                  <p className="text-primary-100 text-sm">
                    {format(new Date(c.date), 'M月d日(E)', { locale: ja })} {c.startTime}〜
                  </p>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                    {index + 1}/{groupCheckins.length}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-2 relative mb-3">
                  {c.pinCode?.split('').map((digit, di) => (
                    <div
                      key={di}
                      className="w-12 h-14 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center border border-white/20"
                    >
                      <span className="text-3xl font-bold">{digit}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleCopyPin(c.pinCode || '', c.id)}
                  className="flex items-center justify-center gap-2 w-full py-2 bg-white/20 backdrop-blur-sm rounded-xl hover:bg-white/30 transition-all duration-300 border border-white/10 relative text-sm"
                >
                  <FiCopy className="w-3.5 h-3.5" />
                  <span className="font-medium">{copied === c.id ? 'コピーしました！' : 'コピーする'}</span>
                </button>
                <button
                  onClick={() => handleAddToGCal(c)}
                  className="mt-2 flex items-center justify-center gap-2 w-full py-2 bg-white/15 backdrop-blur-sm rounded-xl hover:bg-white/25 transition-all duration-300 border border-white/10 relative text-sm"
                >
                  <FiCalendar className="w-3.5 h-3.5" />
                  <span className="font-medium">Googleカレンダーに追加</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* 単日: 従来のPINカード */
          <div className="bg-gradient-to-br from-primary-500 via-primary-500 to-primary-400 rounded-2xl p-6 text-white shadow-lg mb-6 animate-fade-in-up relative overflow-hidden" style={{ animationDelay: '0.1s' }}>
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
              onClick={() => handleCopyPin(checkin.pinCode || '', checkin.id)}
              className="mt-5 flex items-center justify-center gap-2 w-full py-2.5 bg-white/20 backdrop-blur-sm rounded-xl hover:bg-white/30 transition-all duration-300 border border-white/10 relative"
            >
              <FiCopy className="w-4 h-4" />
              <span className="text-sm font-medium">{copied === checkin.id ? 'コピーしました！' : 'コピーする'}</span>
            </button>
            <button
              onClick={() => handleAddToGCal(checkin)}
              className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 bg-white/15 backdrop-blur-sm rounded-xl hover:bg-white/25 transition-all duration-300 border border-white/10 relative"
            >
              <FiCalendar className="w-4 h-4" />
              <span className="text-sm font-medium">Googleカレンダーに追加</span>
            </button>
          </div>
        )}

        {/* 利用方法 */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/50 p-5 mb-6 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="font-bold text-primary-800 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            入館方法
          </h3>
          <ol className="space-y-4 text-sm">
            {entrySteps.map((text, i) => (
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
                <FacilityIcon name={facility?.iconName || 'basketball'} className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-primary-400">{locationName}</p>
                <p className="font-bold text-gray-900">{facility?.name || checkin.facilityType}</p>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">拠点</span>
              <span className="font-semibold text-gray-700">{locationName}</span>
            </div>
            {isMultiDate ? (
              <div>
                <span className="text-gray-400">利用日（{groupCheckins.length}日分）</span>
                <div className="mt-1 space-y-1 ml-2">
                  {groupCheckins.map((c, i) => (
                    <p key={i} className="font-semibold text-gray-700">
                      {format(new Date(c.date), 'yyyy年M月d日(E)', { locale: ja })}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="text-gray-400">利用日</span>
                <span className="font-semibold text-gray-700">
                  {format(new Date(checkin.date), 'yyyy年M月d日(E)', { locale: ja })}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">利用時間</span>
              <span className="font-semibold text-gray-700">
                {checkin.startTime} 〜 {calculateEndTime(checkin.startTime, checkin.duration)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">お支払い金額</span>
              <span className="font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                ¥{grandTotal.toLocaleString()}
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
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-primary-100/30 space-y-2">
        <Button
          fullWidth
          onClick={() => navigate(`/review?checkinId=${checkinId || checkin?.id || ''}&mock=${isMock}`)}
        >
          <FiStar className="w-5 h-5" />
          レビューを書く
        </Button>
        {!isMock && (
          <Button
            variant="secondary"
            fullWidth
            onClick={handleDownloadReceipt}
            disabled={receiptLoading}
          >
            {receiptLoading ? <FiLoader className="w-5 h-5 animate-spin" /> : <FiFileText className="w-5 h-5" />}
            領収書ダウンロード
          </Button>
        )}
        <Button variant="secondary" fullWidth onClick={handleBackHome}>
          <FiHome className="w-5 h-5" />
          ホームに戻る
        </Button>
      </div>
    </div>
  );
};
