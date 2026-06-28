import { LocationId, FacilityType } from './api';

export interface LocationInfo {
  id: LocationId;
  name: string;
  shortName: string;
  description: string;
  address: string;
  imageUrl?: string;
}

export interface FacilityInfo {
  id: FacilityType;
  name: string;
  description: string;
  iconName: 'basketball' | 'dumbbell';
  operatingHours: string;
}

// 拠点定義
export const LOCATIONS: LocationInfo[] = [
  {
    id: 'ASP',
    name: 'みんなの体育館 ASP',
    shortName: 'ASP',
    description: '体育館・トレーニングルーム',
    address: '秋田県秋田市八橋大畑1丁目3-20',
    // サムネイル画像は管理画面「施設」タブで設定（imageUrl）
  },
  {
    id: 'YABASE',
    name: 'みんなの体育館 やばせ',
    shortName: 'やばせ',
    description: '体育館',
    address: '秋田県秋田市八橋南2丁目8-2',
    // サムネイル画像は管理画面「施設」タブで設定（imageUrl）
  },
];

// 拠点別の施設定義
export const LOCATION_FACILITIES: Record<LocationId, FacilityInfo[]> = {
  ASP: [
    {
      id: 'GYM',
      name: '体育館',
      description: 'バスケットボール・バレーボール等',
      iconName: 'basketball',
      operatingHours: '08:00 - 21:00',
    },
    {
      id: 'TRAINING_PRIVATE',
      name: 'トレーニングルーム（貸切）',
      description: '貸切でトレーニング機器をご利用',
      iconName: 'dumbbell',
      operatingHours: '08:00 - 21:00',
    },
    {
      id: 'TRAINING_SHARED',
      name: 'トレーニングルーム（相席）',
      description: '他の利用者と共有でご利用',
      iconName: 'dumbbell',
      operatingHours: '08:00 - 21:00',
    },
  ],
  YABASE: [
    {
      id: 'GYM',
      name: '体育館',
      description: 'バスケットボール・バレーボール等',
      iconName: 'basketball',
      operatingHours: '07:00 - 21:00',
    },
  ],
};

// 管理画面で設定された施設プロフィールを静的定義に上書きマージ
import type { FacilityProfiles } from './api';

export function mergeLocations(profiles?: FacilityProfiles): (LocationInfo & { overview?: string })[] {
  if (!profiles) return LOCATIONS;
  return LOCATIONS.map((loc) => {
    const o = profiles[loc.id];
    if (!o) return loc;
    return {
      ...loc,
      description: o.description || loc.description,
      address: o.address || loc.address,
      imageUrl: o.imageUrl || loc.imageUrl,
      overview: o.overview,
    };
  });
}

export function mergeFacilities(
  locationId: LocationId,
  profiles?: FacilityProfiles
): FacilityInfo[] {
  const base = LOCATION_FACILITIES[locationId] || [];
  const o = profiles?.[locationId]?.facilities;
  if (!o) return base;
  return base.map((f) => {
    const fo = o[f.id];
    if (!fo) return f;
    return {
      ...f,
      description: fo.description || f.description,
      operatingHours: fo.operatingHours || f.operatingHours,
    };
  });
}

// 拠点名を取得
export function getLocationName(locationId: LocationId): string {
  return LOCATIONS.find((l) => l.id === locationId)?.name || locationId;
}

// 施設名を取得
export function getFacilityName(locationId: LocationId, facilityType: FacilityType): string {
  const facilities = LOCATION_FACILITIES[locationId];
  return facilities?.find((f) => f.id === facilityType)?.name || facilityType;
}
