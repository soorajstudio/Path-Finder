export type TravelActivity =
  | 'car'
  | 'motorcycle'
  | 'bus'
  | 'train'
  | 'walking'
  | 'other';

export type MapLayerType = 'roadmap' | 'satellite' | 'terrain';

export type AppModule =
  | 'dashboard'
  | 'live'
  | 'history'
  | 'details'
  | 'map'
  | 'insights';

export type TimeframeFilter = 'all' | 'day' | 'week' | 'month' | 'year';

export type TrackingStatus = 'idle' | 'recording' | 'paused';

export type GpsSignalStatus =
  | 'ready'
  | 'acquiring'
  | 'strong'
  | 'moderate'
  | 'weak'
  | 'lost'
  | 'denied';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface GpsPoint extends LatLngPoint {
  timestamp: number; // Unix ms
  speedKmh: number;
  accuracyMeters: number;
  heading?: number;
}

export interface DetectedStop extends LatLngPoint {
  id: string;
  startTime: number;
  endTime: number;
  durationSec: number;
  label: string;
}

export interface JourneyStats {
  totalDistanceKm: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  totalDurationSec: number;
  movingTimeSec: number;
  stoppedTimeSec: number;
}

export interface Journey {
  id: string;
  title: string;
  activity: TravelActivity;
  startTime: number;
  endTime: number;
  startLocation: string;
  endLocation: string;
  points: GpsPoint[];
  stops: DetectedStop[];
  stats: JourneyStats;
  filteredJumpCount: number;
  recordedOffline?: boolean;
}

export interface ActiveSession {
  id: string;
  status: TrackingStatus;
  activity: TravelActivity;
  sourceMode: 'device' | 'simulated';
  startTime: number;
  pausedAt: number | null;
  accumulatedPausedMs: number;
  points: GpsPoint[];
  filteredJumpCount: number;
  startLocation: string;
  lastUpdated: number;
  wakeLockEnabled: boolean;
}

export interface GpsFilterResult {
  accepted: boolean;
  reason?: 'duplicate' | 'poor_accuracy' | 'unreasonable_jump';
  computedSpeedKmh: number;
  deltaMeters: number;
}

export interface ReplaySnapshot {
  position: LatLngPoint;
  distanceCoveredKm: number;
  totalDistanceKm: number;
  progressRatio: number;
  currentSpeedKmh: number;
  elapsedSec: number;
  heading: number;
  pointIndex: number;
  atStop: DetectedStop | null;
}
