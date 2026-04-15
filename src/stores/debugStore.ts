import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DebugState {
  paymentEnabled: boolean;
  remoteLockEnabled: boolean;
  panelOpen: boolean;
  togglePayment: () => void;
  toggleRemoteLock: () => void;
  togglePanel: () => void;
}

export const useDebugStore = create<DebugState>()(
  persist(
    (set) => ({
      paymentEnabled: false,
      remoteLockEnabled: false,
      panelOpen: false,
      togglePayment: () => set((s) => ({ paymentEnabled: !s.paymentEnabled })),
      toggleRemoteLock: () => set((s) => ({ remoteLockEnabled: !s.remoteLockEnabled })),
      togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
    }),
    {
      name: 'gym-checkin-debug',
      partialize: (state) => ({
        paymentEnabled: state.paymentEnabled,
        remoteLockEnabled: state.remoteLockEnabled,
      }),
    }
  )
);
