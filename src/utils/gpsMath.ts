import type {
  DetectedStop,
  GpsFilterResult,
  GpsPoint,
  JourneyStats,
  LatLngPoint,
  ReplaySnapshot,
} from '../types/journey';

const EARTH_RADIUS_M = 6371000;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Great-circle Haversine distance in meters between two WGS-84 coordinates.
 */
export function haversineDistanceMeters(a: LatLngPoint, b: LatLngPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const clamped = Math.min(1, Math.max(0, h));
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(clamped));
}

/**
 * Compass bearing in degrees (0-360) from coordinate a to b.
 */
export function calculateBearing(a: LatLngPoint, b: LatLngPoint): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export interface GpsFilterOptions {
  maxAccuracyMeters?: number;
  minDuplicateDistanceMeters?: number;
  minDuplicateTimeMs?: number;
  maxPlausibleSpeedKmh?: number;
  maxSingleStepJumpMeters?: number;
}

/**
 * Validates an incoming GPS point against the previous accepted point to prevent
 * duplicate readings, low-accuracy drift, and unreasonable teleportation jumps.
 */
export function filterGpsPoint(
  prev: GpsPoint | null,
  candidate: GpsPoint,
  options: GpsFilterOptions = {}
): GpsFilterResult {
  const maxAccuracyMeters = options.maxAccuracyMeters ?? 65;
  const minDuplicateDistanceMeters = options.minDuplicateDistanceMeters ?? 1.5;
  const minDuplicateTimeMs = options.minDuplicateTimeMs ?? 500;
  const maxPlausibleSpeedKmh = options.maxPlausibleSpeedKmh ?? 340;
  const maxSingleStepJumpMeters = options.maxSingleStepJumpMeters ?? 650;

  if (candidate.accuracyMeters > maxAccuracyMeters) {
    return {
      accepted: false,
      reason: 'poor_accuracy',
      computedSpeedKmh: 0,
      deltaMeters: 0,
    };
  }

  if (!prev) {
    return {
      accepted: true,
      computedSpeedKmh: Math.max(0, candidate.speedKmh),
      deltaMeters: 0,
    };
  }

  const dtMs = candidate.timestamp - prev.timestamp;
  const deltaMeters = haversineDistanceMeters(prev, candidate);

  // Reject identical timestamps or near-duplicate points within short window
  if (dtMs <= 0) {
    return {
      accepted: false,
      reason: 'duplicate',
      computedSpeedKmh: 0,
      deltaMeters,
    };
  }

  if (dtMs < minDuplicateTimeMs && deltaMeters < minDuplicateDistanceMeters) {
    return {
      accepted: false,
      reason: 'duplicate',
      computedSpeedKmh: 0,
      deltaMeters,
    };
  }

  const dtSec = dtMs / 1000;
  const impliedSpeedKmh = (deltaMeters / dtSec) * 3.6;

  // Reject unreasonable GPS jumps (teleportation spikes)
  if (
    impliedSpeedKmh > maxPlausibleSpeedKmh ||
    (dtSec <= 2.5 && deltaMeters > maxSingleStepJumpMeters)
  ) {
    return {
      accepted: false,
      reason: 'unreasonable_jump',
      computedSpeedKmh: impliedSpeedKmh,
      deltaMeters,
    };
  }

  // Smooth stationary noise: if movement is within GPS jitter band (< 2.5m), treat speed as 0
  const effectiveSpeed =
    deltaMeters < 2.5 && candidate.speedKmh < 2.2
      ? 0
      : candidate.speedKmh >= 0
        ? candidate.speedKmh
        : impliedSpeedKmh;

  return {
    accepted: true,
    computedSpeedKmh: Number(effectiveSpeed.toFixed(1)),
    deltaMeters,
  };
}

export interface StopDetectionOptions {
  radiusMeters?: number;
  minStopDurationSec?: number;
  maxStationarySpeedKmh?: number;
}

/**
 * Detects genuine stops from a sequence of GPS points while filtering out brief
 * GPS fluctuations or traffic slowdowns shorter than minStopDurationSec.
 */
export function detectStops(
  points: GpsPoint[],
  options: StopDetectionOptions = {}
): DetectedStop[] {
  if (points.length < 2) return [];

  const radiusMeters = options.radiusMeters ?? 28;
  const minStopDurationSec = options.minStopDurationSec ?? 45;
  const maxStationarySpeedKmh = options.maxStationarySpeedKmh ?? 2.8;

  const stops: DetectedStop[] = [];
  let clusterStartIdx: number | null = null;
  let anchorLat = 0;
  let anchorLng = 0;

  const finalizeCluster = (startIdx: number, endIdx: number) => {
    const startPt = points[startIdx];
    const endPt = points[endIdx];
    const durationSec = Math.round((endPt.timestamp - startPt.timestamp) / 1000);
    if (durationSec < minStopDurationSec) return;

    // Average centroid of cluster points to smooth GPS wobble
    let sumLat = 0;
    let sumLng = 0;
    const count = endIdx - startIdx + 1;
    for (let i = startIdx; i <= endIdx; i++) {
      sumLat += points[i].lat;
      sumLng += points[i].lng;
    }

    stops.push({
      id: `stop-${stops.length + 1}-${startPt.timestamp}`,
      lat: Number((sumLat / count).toFixed(6)),
      lng: Number((sumLng / count).toFixed(6)),
      startTime: startPt.timestamp,
      endTime: endPt.timestamp,
      durationSec,
      label: `Stop ${stops.length + 1}`,
    });
  };

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const isSlow = pt.speedKmh <= maxStationarySpeedKmh;

    if (clusterStartIdx === null) {
      if (isSlow) {
        clusterStartIdx = i;
        anchorLat = pt.lat;
        anchorLng = pt.lng;
      }
    } else {
      const distFromAnchor = haversineDistanceMeters(
        {lat: anchorLat, lng: anchorLng},
        pt
      );
      if (distFromAnchor <= radiusMeters && isSlow) {
        // Still within stop cluster
        continue;
      } else {
        finalizeCluster(clusterStartIdx, i - 1);
        if (isSlow) {
          clusterStartIdx = i;
          anchorLat = pt.lat;
          anchorLng = pt.lng;
        } else {
          clusterStartIdx = null;
        }
      }
    }
  }

  if (clusterStartIdx !== null) {
    finalizeCluster(clusterStartIdx, points.length - 1);
  }

  return stops;
}

/**
 * Calculates total distance, average speed, max speed, total duration,
 * moving time, and stopped time from recorded GPS points.
 */
export function computeJourneyStats(
  points: GpsPoint[],
  stops?: DetectedStop[],
  explicitTotalDurationSec?: number
): JourneyStats {
  if (points.length === 0) {
    return {
      totalDistanceKm: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      totalDurationSec: explicitTotalDurationSec ?? 0,
      movingTimeSec: 0,
      stoppedTimeSec: explicitTotalDurationSec ?? 0,
    };
  }

  if (points.length === 1) {
    const dur = explicitTotalDurationSec ?? 0;
    return {
      totalDistanceKm: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: Number(points[0].speedKmh.toFixed(1)),
      totalDurationSec: dur,
      movingTimeSec: 0,
      stoppedTimeSec: dur,
    };
  }

  let totalMeters = 0;
  let maxSpeedKmh = points[0].speedKmh;
  let movingTimeSec = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dtSec = Math.max(0, (curr.timestamp - prev.timestamp) / 1000);
    const distM = haversineDistanceMeters(prev, curr);

    // Ignore sub-2m jitter when stationary
    const effectiveDistM =
      distM < 2.0 && curr.speedKmh < 1.5 && prev.speedKmh < 1.5 ? 0 : distM;
    totalMeters += effectiveDistM;

    if (curr.speedKmh > maxSpeedKmh) {
      maxSpeedKmh = curr.speedKmh;
    }

    const segmentSpeedKmh =
      dtSec > 0 ? Math.max(curr.speedKmh, (effectiveDistM / dtSec) * 3.6) : curr.speedKmh;

    if (segmentSpeedKmh >= 2.2 && effectiveDistM >= 2.0) {
      movingTimeSec += dtSec;
    }
  }

  const rawSpanSec = Math.max(
    0,
    Math.round((points[points.length - 1].timestamp - points[0].timestamp) / 1000)
  );
  const totalDurationSec =
    explicitTotalDurationSec !== undefined
      ? Math.max(0, Math.round(explicitTotalDurationSec))
      : rawSpanSec;

  const detectedStopSum = (stops ?? detectStops(points)).reduce(
    (sum, s) => sum + s.durationSec,
    0
  );

  const clampedMovingSec = Math.min(
    totalDurationSec,
    Math.round(movingTimeSec)
  );
  const stoppedTimeSec = Math.min(
    totalDurationSec,
    Math.max(detectedStopSum, totalDurationSec - clampedMovingSec)
  );
  const finalMovingSec = Math.max(0, totalDurationSec - stoppedTimeSec);

  const totalDistanceKm = Number((totalMeters / 1000).toFixed(2));
  const avgSpeedKmh =
    finalMovingSec > 0
      ? Number(((totalMeters / 1000) / (finalMovingSec / 3600)).toFixed(1))
      : totalDurationSec > 0
        ? Number(((totalMeters / 1000) / (totalDurationSec / 3600)).toFixed(1))
        : 0;

  return {
    totalDistanceKm,
    avgSpeedKmh,
    maxSpeedKmh: Number(Math.max(maxSpeedKmh, avgSpeedKmh).toFixed(1)),
    totalDurationSec,
    movingTimeSec: finalMovingSec,
    stoppedTimeSec,
  };
}

/**
 * Interpolates a route replay position, distance covered, heading, and speed
 * at a normalized progress value in [0, 1].
 */
export function interpolateReplayPosition(
  points: GpsPoint[],
  stops: DetectedStop[],
  progressRatio: number
): ReplaySnapshot | null {
  if (points.length === 0) return null;

  const ratio = Math.min(1, Math.max(0, progressRatio));
  const startTs = points[0].timestamp;
  const endTs = points[points.length - 1].timestamp;
  const totalSpanMs = Math.max(1, endTs - startTs);

  // Build cumulative distances
  const cumulativeMeters: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulativeMeters.push(
      cumulativeMeters[i - 1] + haversineDistanceMeters(points[i - 1], points[i])
    );
  }
  const totalMeters = cumulativeMeters[cumulativeMeters.length - 1];

  if (points.length === 1) {
    return {
      position: {lat: points[0].lat, lng: points[0].lng},
      distanceCoveredKm: 0,
      totalDistanceKm: 0,
      progressRatio: ratio,
      currentSpeedKmh: points[0].speedKmh,
      elapsedSec: 0,
      heading: points[0].heading ?? 0,
      pointIndex: 0,
      atStop: stops[0] ?? null,
    };
  }

  const targetTs = startTs + ratio * totalSpanMs;

  // Find bracketing segment by timestamp
  let idx = 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i + 1].timestamp >= targetTs) {
      idx = i;
      break;
    }
    idx = i;
  }

  const p0 = points[idx];
  const p1 = points[Math.min(idx + 1, points.length - 1)];
  const segSpan = Math.max(1, p1.timestamp - p0.timestamp);
  const localT = Math.min(1, Math.max(0, (targetTs - p0.timestamp) / segSpan));

  const lat = p0.lat + (p1.lat - p0.lat) * localT;
  const lng = p0.lng + (p1.lng - p0.lng) * localT;
  const segMeters = cumulativeMeters[idx + 1] - cumulativeMeters[idx];
  const coveredMeters = cumulativeMeters[idx] + segMeters * localT;
  const currentSpeedKmh = p0.speedKmh + (p1.speedKmh - p0.speedKmh) * localT;
  const heading =
    segMeters > 0.5 ? calculateBearing(p0, p1) : (p0.heading ?? 0);

  const atStop =
    stops.find((s) => targetTs >= s.startTime && targetTs <= s.endTime) ?? null;

  return {
    position: {lat, lng},
    distanceCoveredKm: Number((coveredMeters / 1000).toFixed(2)),
    totalDistanceKm: Number((totalMeters / 1000).toFixed(2)),
    progressRatio: ratio,
    currentSpeedKmh: Number(currentSpeedKmh.toFixed(1)),
    elapsedSec: Math.round((targetTs - startTs) / 1000),
    heading: Math.round(heading),
    pointIndex: idx,
    atStop,
  };
}
