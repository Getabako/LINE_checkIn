import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiStar, FiCheck, FiHome } from 'react-icons/fi';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { Loading } from '../../components/common/Loading';
import { reviewApi, Review } from '../../lib/api';
import clsx from 'clsx';

export const ReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const checkinId = searchParams.get('checkinId');

  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = React.useState(true);
  const [existingReview, setExistingReview] = React.useState<Review | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!checkinId) {
      setIsCheckingExisting(false);
      return;
    }

    reviewApi.getByCheckin(checkinId)
      .then((review) => {
        if (review) {
          setExistingReview(review);
          setRating(review.rating);
          setComment(review.comment);
        }
        setIsCheckingExisting(false);
      })
      .catch(() => {
        setIsCheckingExisting(false);
      });
  }, [checkinId]);

  const handleSubmit = async () => {
    if (!checkinId || rating === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      await reviewApi.create({ checkinId, rating, comment: comment.trim() });
      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'レビューの投稿に失敗しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingExisting) {
    return <Loading fullScreen text="読み込み中..." />;
  }

  if (!checkinId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-500 mb-4">予約情報が見つかりません</p>
          <Button onClick={() => navigate('/')}>ホームに戻る</Button>
        </div>
      </div>
    );
  }

  // 投稿完了画面
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
        <Header title="レビュー完了" />
        <main className="p-4 pt-12">
          <div className="text-center animate-fade-in-up">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg">
              <FiCheck className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              ありがとうございます！
            </h2>
            <p className="text-gray-400 text-sm mb-2">
              レビューを投稿しました
            </p>
            <div className="flex justify-center gap-1 mb-8">
              {[1, 2, 3, 4, 5].map((star) => (
                <FiStar
                  key={star}
                  className={clsx('w-6 h-6', star <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200')}
                />
              ))}
            </div>
            <Button onClick={() => navigate('/')}>
              <FiHome className="w-5 h-5" />
              ホームに戻る
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // 既存レビューがある場合
  if (existingReview) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
        <Header title="レビュー" showBack />
        <main className="p-4 pt-8">
          <div className="text-center animate-fade-in-up">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              レビュー投稿済み
            </h2>
            <div className="flex justify-center gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <FiStar
                  key={star}
                  className={clsx('w-7 h-7', star <= existingReview.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200')}
                />
              ))}
            </div>
            {existingReview.comment && (
              <div className="bg-white rounded-2xl shadow-card border border-gray-100/50 p-5 text-left mb-6">
                <p className="text-gray-600 text-sm">{existingReview.comment}</p>
              </div>
            )}
            <Button variant="secondary" onClick={() => navigate('/')}>
              <FiHome className="w-5 h-5" />
              ホームに戻る
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      <Header title="レビュー" showBack />

      <main className="p-4 pb-28">
        <div className="text-center pt-4 mb-8 animate-fade-in-up">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            ご利用いかがでしたか？
          </h2>
          <p className="text-gray-400 text-sm">
            施設の利用体験を評価してください
          </p>
        </div>

        {/* 星評価 */}
        <div className="flex justify-center gap-3 mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className="transition-transform duration-200 hover:scale-110 active:scale-95"
            >
              <FiStar
                className={clsx(
                  'w-12 h-12 transition-colors duration-200',
                  star <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
                )}
              />
            </button>
          ))}
        </div>

        {rating > 0 && (
          <p className="text-center text-sm text-primary-500 font-semibold mb-6">
            {rating === 5 ? '最高！' : rating === 4 ? 'とても良い' : rating === 3 ? '普通' : rating === 2 ? 'やや不満' : '不満'}
          </p>
        )}

        {/* コメント入力 */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/50 p-5 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="font-bold text-primary-800 mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-primary-500 to-primary-300 rounded-full"></span>
            コメント（任意）
          </h3>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="施設の感想やご要望をお聞かせください..."
            rows={4}
            maxLength={500}
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-primary-300 focus:outline-none text-sm resize-none transition-colors"
          />
          <p className="text-xs text-gray-300 text-right mt-1">
            {comment.length}/500
          </p>
        </div>

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
          disabled={rating === 0}
          loading={isLoading}
          onClick={handleSubmit}
        >
          レビューを投稿する
        </Button>
      </div>
    </div>
  );
};
