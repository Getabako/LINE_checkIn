import React from 'react';
import { FiCreditCard, FiLock, FiSettings } from 'react-icons/fi';
import { useDebugStore } from '../../stores/debugStore';
import clsx from 'clsx';

export const DebugPanel: React.FC = () => {
  const { paymentEnabled, remoteLockEnabled, panelOpen, togglePayment, toggleRemoteLock, togglePanel } = useDebugStore();

  return (
    <div className="fixed top-16 left-2 z-[100]">
      {/* バッジ（常に表示） */}
      <button
        onClick={togglePanel}
        className="flex items-center gap-1 px-2 py-1 bg-gray-900/80 backdrop-blur-sm rounded-lg shadow-lg text-[10px] font-mono text-white"
      >
        <FiSettings className="w-3 h-3" />
        <span className={paymentEnabled ? 'text-emerald-400' : 'text-red-400'}>
          {paymentEnabled ? 'Pay' : 'Pay'}
        </span>
        <span className="text-gray-500">|</span>
        <span className={remoteLockEnabled ? 'text-emerald-400' : 'text-red-400'}>
          {remoteLockEnabled ? 'Lock' : 'Lock'}
        </span>
      </button>

      {/* 展開パネル */}
      {panelOpen && (
        <div className="mt-1 p-3 bg-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl text-white min-w-[200px]">
          <p className="text-[10px] text-gray-400 mb-2 font-mono">DEBUG SETTINGS</p>

          {/* Stripe決済 */}
          <button
            onClick={togglePayment}
            className="w-full flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FiCreditCard className="w-4 h-4" />
              <span className="text-xs">Stripe決済</span>
            </div>
            <div className={clsx(
              'w-10 h-5 rounded-full relative transition-colors',
              paymentEnabled ? 'bg-emerald-500' : 'bg-gray-600'
            )}>
              <div className={clsx(
                'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                paymentEnabled ? 'translate-x-5' : 'translate-x-0.5'
              )} />
            </div>
          </button>

          {/* RemoteLock */}
          <button
            onClick={toggleRemoteLock}
            className="w-full flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FiLock className="w-4 h-4" />
              <span className="text-xs">RemoteLock</span>
            </div>
            <div className={clsx(
              'w-10 h-5 rounded-full relative transition-colors',
              remoteLockEnabled ? 'bg-emerald-500' : 'bg-gray-600'
            )}>
              <div className={clsx(
                'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                remoteLockEnabled ? 'translate-x-5' : 'translate-x-0.5'
              )} />
            </div>
          </button>

          <p className="text-[9px] text-gray-500 mt-2">
            OFFの場合、実際のAPI呼出をスキップ
          </p>
        </div>
      )}
    </div>
  );
};
