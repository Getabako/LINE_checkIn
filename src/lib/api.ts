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
export type FacilityType = 'GYM' | 'TRAINING';
export type CheckinStatus = 'PENDING' | 'PAID' | 'USED' | 'EXPIRED' | 'CANCELLED';

export interface User {
  id: string;
  lineUserId: string;
  displayName: string;
  pictureUrl?: string;
}

export interface PricePlan {
  id: string;
  facilityType: FacilityType;
  dayType: 'WEEKDAY' | 'WEEKEND';
  timeSlot: 'DAYTIME' | 'EVENING' | 'ALLDAY';
  pricePerHour: number;
}

export interface Checkin {
  id: string;
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
  facilityType: FacilityType;
  date: string;
  startTime: string;
  duration: number;
}

export interface CreateCheckinResponse {
  checkin: Checkin;
  paymentUrl: string;
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
    facilityType: FacilityType;
    date: string;
    startTime: string;
    duration: number;
  }) => api.post<{ totalPrice: number; breakdown: { hour: number; price: number }[] }>('/prices/calculate', params),
};
