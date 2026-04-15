import { create } from 'zustand';
import { FacilityType, LocationId } from '../lib/api';

interface CheckinState {
  // 選択状態
  location: LocationId | null;
  facilityType: FacilityType | null;
  date: Date | null;
  startTime: string | null;
  duration: number;

  // 計算結果
  totalPrice: number;

  // クーポン
  couponCode: string | null;
  couponDiscount: number;

  // 会員割引
  memberDiscount: number;
  memberTypeName: string | null;

  // アクション
  setLocation: (location: LocationId) => void;
  setFacilityType: (type: FacilityType) => void;
  setDate: (date: Date) => void;
  setStartTime: (time: string) => void;
  setDuration: (duration: number) => void;
  setTotalPrice: (price: number) => void;
  setCoupon: (code: string | null, discount: number) => void;
  setMemberDiscount: (discount: number, typeName: string | null) => void;
  reset: () => void;
}

const initialState = {
  location: null,
  facilityType: null,
  date: null,
  startTime: null,
  duration: 1,
  totalPrice: 0,
  couponCode: null,
  couponDiscount: 0,
  memberDiscount: 0,
  memberTypeName: null,
};

export const useCheckinStore = create<CheckinState>((set) => ({
  ...initialState,

  setLocation: (location) => set({ location }),
  setFacilityType: (type) => set({ facilityType: type }),
  setDate: (date) => set({ date }),
  setStartTime: (time) => set({ startTime: time }),
  setDuration: (duration) => set({ duration }),
  setTotalPrice: (price) => set({ totalPrice: price }),
  setCoupon: (code, discount) => set({ couponCode: code, couponDiscount: discount }),
  setMemberDiscount: (discount, typeName) => set({ memberDiscount: discount, memberTypeName: typeName }),
  reset: () => set(initialState),
}));
