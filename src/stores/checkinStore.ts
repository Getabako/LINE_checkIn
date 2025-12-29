import { create } from 'zustand';
import { FacilityType } from '../lib/api';

interface CheckinState {
  // 選択状態
  facilityType: FacilityType | null;
  date: Date | null;
  startTime: string | null;
  duration: number;

  // 計算結果
  totalPrice: number;

  // アクション
  setFacilityType: (type: FacilityType) => void;
  setDate: (date: Date) => void;
  setStartTime: (time: string) => void;
  setDuration: (duration: number) => void;
  setTotalPrice: (price: number) => void;
  reset: () => void;
}

const initialState = {
  facilityType: null,
  date: null,
  startTime: null,
  duration: 1,
  totalPrice: 0,
};

export const useCheckinStore = create<CheckinState>((set) => ({
  ...initialState,

  setFacilityType: (type) => set({ facilityType: type }),
  setDate: (date) => set({ date }),
  setStartTime: (time) => set({ startTime: time }),
  setDuration: (duration) => set({ duration }),
  setTotalPrice: (price) => set({ totalPrice: price }),
  reset: () => set(initialState),
}));
