import type {TravelActivity} from '../types/journey';

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

export function formatDistanceKm(km: number): string {
  if (km >= 100) return `${km.toFixed(1)} km`;
  return `${km.toFixed(2)} km`;
}

export function formatSpeedKmh(kmh: number): string {
  return `${kmh.toFixed(1)} km/h`;
}

export function formatDateShort(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTimeShort(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(timestamp: number): string {
  return `${formatDateShort(timestamp)} · ${formatTimeShort(timestamp)}`;
}

export const ACTIVITY_META: Record<
  TravelActivity,
  {label: string; strokeColor: string; subtleColor: string}
> = {
  car: {label: 'Car', strokeColor: '#1D4ED8', subtleColor: '#EFF6FF'},
  motorcycle: {label: 'Motorcycle', strokeColor: '#B45309', subtleColor: '#FFFBEB'},
  bus: {label: 'Bus', strokeColor: '#0F766E', subtleColor: '#F0FDFA'},
  train: {label: 'Train', strokeColor: '#6D28D9', subtleColor: '#F5F3FF'},
  walking: {label: 'Walking', strokeColor: '#047857', subtleColor: '#ECFDF5'},
  other: {label: 'Other', strokeColor: '#475569', subtleColor: '#F8FAFC'},
};

export const ALL_ACTIVITIES: TravelActivity[] = [
  'car',
  'motorcycle',
  'bus',
  'train',
  'walking',
  'other',
];

export function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}
