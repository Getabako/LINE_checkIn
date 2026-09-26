import { create } from 'zustand';
import { User } from '../lib/api';

interface UserState {
  user: User | null;
  /** /users/me の取得が終わったか（未取得の間は管理者判定を保留する） */
  loaded: boolean;
  isAdmin: boolean;
  setUser: (user: User | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  loaded: false,
  isAdmin: false,
  setUser: (user) => set({ user, loaded: true, isAdmin: !!user?.isAdmin }),
}));
