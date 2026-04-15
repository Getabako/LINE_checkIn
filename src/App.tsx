import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initializeLiff } from './lib/liff';
import { Loading } from './components/common/Loading';
import { DebugPanel } from './components/common/DebugPanel';
import { LocationPage } from './features/location/LocationPage';
import { HomePage } from './features/home/HomePage';
import { CheckinPage } from './features/checkin/CheckinPage';
import { PaymentPage } from './features/payment/PaymentPage';
import { CompletePage } from './features/complete/CompletePage';
import { ReviewPage } from './features/review/ReviewPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App: React.FC = () => {
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await initializeLiff();
        setIsLiffReady(true);
      } catch (err) {
        console.error('LIFF initialization failed:', err);
        setError('LIFFの初期化に失敗しました');
        // 開発環境では続行
        if (import.meta.env.DEV) {
          setIsLiffReady(true);
        }
      }
    };
    init();
  }, []);

  if (error && !import.meta.env.DEV) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary px-4 py-2"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  if (!isLiffReady) {
    return <Loading fullScreen text="起動中..." />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DebugPanel />
        <Routes>
          <Route path="/" element={<LocationPage />} />
          <Route path="/facility" element={<HomePage />} />
          <Route path="/checkin" element={<CheckinPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/complete" element={<CompletePage />} />
          <Route path="/review" element={<ReviewPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
