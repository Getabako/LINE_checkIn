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
  groupId?: string;
  recurringType?: string;
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
  checkinIds?: string[];
  groupId?: string;
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
  getByGroup: (groupId: string) => api.get<Checkin[]>(`/checkins?groupId=${groupId}`),
  cancel: (id: string) => api.delete<void>(`/checkins/${id}`),
  getReceipt: (id: string) => api.get<{ pdf: string }>(`/checkins/${id}?format=receipt`),
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

// イベント関連
export interface Event {
  id: string;
  title: string;
  description: string;
  location: LocationId;
  facilityType: FacilityType;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  currentCount: number;
  price: number;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export interface School {
  id: string;
  title: string;
  description: string;
  location: LocationId;
  facilityType: FacilityType;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  capacity: number;
  currentCount: number;
  pricePerSession: number;
  totalSessions: number;
  instructor?: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
}

export interface EventRegistration {
  id: string;
  eventId: string;
  userId: string;
  lineUserId: string;
  status: string;
  paidAmount: number;
  createdAt: string;
}

export interface SchoolRegistration {
  id: string;
  schoolId: string;
  userId: string;
  lineUserId: string;
  status: string;
  paidAmount: number;
  createdAt: string;
}

export const eventApi = {
  getAll: () => api.get<Event[]>('/checkins?type=events'),
  register: (eventId: string) => api.post<EventRegistration>('/checkins?type=event-register', { eventId }),
};

export const schoolApi = {
  getAll: () => api.get<School[]>('/checkins?type=schools'),
  register: (schoolId: string) => api.post<SchoolRegistration>('/checkins?type=school-register', { schoolId }),
};

// 管理者API
export interface SalesData {
  period: string;
  groupBy: string;
  sales: Record<string, { count: number; total: number }>;
  totalCount: number;
  totalAmount: number;
}

export const adminApi = {
  // イベント管理
  getEvents: () => api.get<Event[]>('/admin?action=events'),
  createEvent: (data: Partial<Event>) => api.post<Event>('/admin?action=createEvent', data),
  updateEvent: (eventId: string, data: Partial<Event>) => api.put<void>('/admin?action=updateEvent', { eventId, ...data }),
  deleteEvent: (eventId: string) => api.delete<void>(`/admin?action=deleteEvent&eventId=${eventId}`),
  getEventRegistrations: (eventId: string) => api.get<EventRegistration[]>(`/admin?action=eventRegistrations&eventId=${eventId}`),

  // スクール管理
  getSchools: () => api.get<School[]>('/admin?action=schools'),
  createSchool: (data: Partial<School>) => api.post<School>('/admin?action=createSchool', data),
  updateSchool: (schoolId: string, data: Partial<School>) => api.put<void>('/admin?action=updateSchool', { schoolId, ...data }),
  deleteSchool: (schoolId: string) => api.delete<void>(`/admin?action=deleteSchool&schoolId=${schoolId}`),
  getSchoolRegistrations: (schoolId: string) => api.get<SchoolRegistration[]>(`/admin?action=schoolRegistrations&schoolId=${schoolId}`),

  // 売上集計
  getSales: (params: { period?: string; from?: string; to?: string; year?: string; groupBy?: string }) => {
    const qs = new URLSearchParams();
    qs.set('action', 'sales');
    if (params.period) qs.set('period', params.period);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.year) qs.set('year', params.year);
    if (params.groupBy) qs.set('groupBy', params.groupBy);
    return api.get<SalesData>(`/admin?${qs.toString()}`);
  },

  // 領収書
  generateReceipt: (checkinId: string) => api.post<{ pdf: string }>('/admin?action=receipt', { checkinId }),
};
