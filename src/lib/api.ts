import { getAccessToken } from './liff';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const getHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
};

export const api = {
  get: async <T>(endpoint: string): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return handleResponse<T>(response);
  },

  post: async <T>(endpoint: string, data?: unknown): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },

  put: async <T>(endpoint: string, data?: unknown): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },

  delete: async <T>(endpoint: string): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse<T>(response);
  },
};

// Types
export type LocationId = 'ASP' | 'YABASE';
export type FacilityType = 'GYM' | 'TRAINING_PRIVATE' | 'TRAINING_SHARED';
export type CheckinStatus = 'PENDING' | 'PAID' | 'USED' | 'EXPIRED' | 'CANCELLED';

export interface User {
  id: string;
  lineUserId: string;
  displayName: string;
  pictureUrl?: string;
}

export interface PricePlan {
  id: string;
  location: LocationId;
  facilityType: FacilityType;
  dayType: 'WEEKDAY' | 'WEEKEND';
  timeSlot: 'DAYTIME' | 'EVENING' | 'ALLDAY';
  pricePerHour: number;
}

export interface Checkin {
  id: string;
  location: LocationId;
  facilityType: FacilityType;
  date: string;
  startTime: string;
  duration: number;
  totalPrice: number;
  pinCode?: string;
  status: CheckinStatus;
  createdAt: string;
}

export interface CreateCheckinRequest {
  location: LocationId;
  facilityType: FacilityType;
  date: string;
  startTime: string;
  duration: number;
}

export interface CreateCheckinResponse {
  checkin: Checkin;
}

export interface CreateCheckoutResponse {
  checkoutUrl?: string;
  checkinId: string;
  mode: 'stripe' | 'skip';
}

// クーポン関連
export interface CouponValidationResult {
  valid: boolean;
  couponId?: string;
  discountType?: 'PERCENTAGE' | 'FIXED';
  discountValue?: number;
  discount?: number;
  discountedPrice?: number;
  message: string;
}

// 会員種別関連
export interface MemberType {
  id: string;
  code: string;
  name: string;
  description: string;
  discounts: Record<string, number>; // { "ASP": -275, "YABASE": -250 } 等
  isActive: boolean;
  sortOrder: number;
}

export interface UserMembership {
  id: string;
  lineUserId: string;
  memberTypeId: string;
  isActive: boolean;
  memberType?: MemberType;
}

// レビュー関連
export interface Review {
  id: string;
  checkinId: string;
  lineUserId: string;
  displayName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

// API functions
export const userApi = {
  getMe: () => api.get<User>('/users/me'),
};

export const checkinApi = {
  create: (data: CreateCheckinRequest) =>
    api.post<CreateCheckinResponse>('/checkins', data),
  getAll: () => api.get<Checkin[]>('/checkins'),
  getById: (id: string) => api.get<Checkin>(`/checkins/${id}`),
  cancel: (id: string) => api.delete<void>(`/checkins/${id}`),
};

export const priceApi = {
  calculate: (params: {
    location: LocationId;
    facilityType: FacilityType;
    date: string;
    startTime: string;
    duration: number;
  }) => api.post<{ totalPrice: number; breakdown: { hour: number; price: number }[] }>('/prices/calculate', params),
};

export const couponApi = {
  validate: (params: { code: string; location: LocationId; totalPrice: number }) =>
    api.post<CouponValidationResult>('/coupons/validate', params),
};

export const memberTypeApi = {
  getAll: () => api.get<MemberType[]>('/member-types'),
};

export const membershipApi = {
  get: () => api.get<{ membership: (UserMembership & { memberType: MemberType | null }) | null }>('/users/membership'),
};

export const reviewApi = {
  create: (data: { checkinId: string; rating: number; comment?: string }) =>
    api.post<Review>('/reviews', data),
  getByCheckin: (checkinId: string) =>
    api.get<Review | null>(`/reviews?checkinId=${checkinId}`),
};
