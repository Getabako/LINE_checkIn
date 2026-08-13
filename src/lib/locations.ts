import { LocationId, FacilityType } from './api';

export interface LocationInfo {
  id: LocationId;
  name: string;
  shortName: string;
  description: string;
  address: string;
  imageUrl?: string;
  overview?: string; // 施設概要（管理画面「施設」タブで上書き可）
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
    imageUrl: '/images/asp.webp', // 管理画面「施設」タブで上書き可
  },
  {
    id: 'YABASE',
    name: 'みんなの体育館 やばせ',
    shortName: 'やばせ',
    // 説明本文（ASPと同じ構成: description=本文 / overview=駐車場情報）
    description:
      '1時間単位で、おひとりからでもご利用いただける、完全予約制のプライベート体育館です。\n' +
      '予約〜決済まですべてwebで完結する無人営業店舗です。\n' +
      '体育館は、フットサル・バスケ・卓球などのスポーツはもちろん、トランポリン・スラックライン・バランスボールなど、小さなお子様でも楽しめる設備が盛りだくさん！！⚽🏀🏓\n' +
      '冷暖房完備の待合室もあるため、夏場や冬場も安心です！\n' +
      '広さは概ね横11m×縦25m=275㎡、高さは約3.7mです。',
    address: '秋田県秋田市八橋南2丁目8-2',
    imageUrl: '/images/yabase.jpg', // 管理画面「施設」タブで上書き可
    overview: '専用の無料駐車場に最大15台駐車可能です！',
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
      overview: o.overview || loc.overview,
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
