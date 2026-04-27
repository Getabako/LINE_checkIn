import { create } from 'zustand';
import { FacilityType, LocationId } from '../lib/api';

interface CheckinState {
  // 選択状態
  location: LocationId | null;
  facilityType: FacilityType | null;
  date: Date | null;
  startTime: string | null;
  duration: number;

  // 複数日選択
  multiDateMode: boolean;
  dates: Date[];

  // 定期予約
  recurringType: 'WEEKLY' | 'BIWEEKLY' | null;
  recurringCount: number;

  // 計算結果
  totalPrice: number;

  // クーポン
  couponCode: string | null;
  couponDiscount: number;

  // 会員割引
  memberDiscount: number;
  memberTypeName: string | null;
  // 請求書払い（FREE 会員区分: S-01 等）
  isInvoicePayment: boolean;

  // アクション
  setLocation: (location: LocationId) => void;
  setFacilityType: (type: FacilityType) => void;
  setDate: (date: Date) => void;
  setStartTime: (time: string) => void;
  setDuration: (duration: number) => void;
  setTotalPrice: (price: number) => void;
  setCoupon: (code: string | null, discount: number) => void;
  setMemberDiscount: (discount: number, typeName: string | null, isInvoice?: boolean) => void;
  setMultiDateMode: (enabled: boolean) => void;
  toggleDate: (date: Date) => void;
  setDates: (dates: Date[]) => void;
  setRecurring: (type: 'WEEKLY' | 'BIWEEKLY' | null, count: number) => void;
  reset: () => void;
}

const initialState = {
  location: null,
  facilityType: null,
  date: null,
  startTime: null,
  duration: 1,
  multiDateMode: false,
  dates: [] as Date[],
  recurringType: null as 'WEEKLY' | 'BIWEEKLY' | null,
  recurringCount: 4,
  totalPrice: 0,
  couponCode: null,
  couponDiscount: 0,
  memberDiscount: 0,
  memberTypeName: null,
  isInvoicePayment: false,
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
  setMemberDiscount: (discount, typeName, isInvoice) => set({ memberDiscount: discount, memberTypeName: typeName, isInvoicePayment: !!isInvoice }),
  setMultiDateMode: (enabled) => set({ multiDateMode: enabled, dates: [], recurringType: null }),
  toggleDate: (date) => set((state) => {
    const exists = state.dates.some((d) => d.toDateString() === date.toDateString());
    if (exists) {
      return { dates: state.dates.filter((d) => d.toDateString() !== date.toDateString()) };
    }
    return { dates: [...state.dates, date].sort((a, b) => a.getTime() - b.getTime()) };
  }),
  setDates: (dates) => set({ dates }),
  setRecurring: (type, count) => set({ recurringType: type, recurringCount: count }),
  reset: () => set(initialState),
}));
