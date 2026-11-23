import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBearing,
  computeJourneyStats,
  detectStops,
  filterGpsPoint,
  haversineDistanceMeters,
  interpolateReplayPosition,
} from './gpsMath';
import type {GpsPoint} from '../types/journey';

test('haversineDistanceMeters computes accurate geodesic distances', () => {
  // ~1 degree of latitude is ~111.19 km
  const dist = haversineDistanceMeters(
    {lat: 37.0, lng: -122.0},
    {lat: 38.0, lng: -122.0}
  );
  assert.ok(dist > 110500 && dist < 112000, `Expected ~111.2km, got ${dist}`);
  assert.equal(
    haversineDistanceMeters({lat: 37.78, lng: -122.4}, {lat: 37.78, lng: -122.4}),
    0
  );
});

test('calculateBearing returns cardinal directions accurately', () => {
  const north = calculateBearing({lat: 37.0, lng: -122.0}, {lat: 38.0, lng: -122.0});
  const east = calculateBearing({lat: 37.0, lng: -122.0}, {lat: 37.0, lng: -121.0});
  assert.ok(north < 1 || north > 359);
  assert.ok(Math.abs(east - 90) < 1);
});

test('filterGpsPoint rejects duplicates, poor accuracy, and teleportation jumps', () => {
  const base: GpsPoint = {
    lat: 37.79,
    lng: -122.39,
    timestamp: 1000000,
    speedKmh: 30,
    accuracyMeters: 6,
  };

  // Poor accuracy (> 65m)
  const poorAcc = filterGpsPoint(base, {
    ...base,
    lat: 37.7905,
    timestamp: 1003000,
    accuracyMeters: 95,
  });
  assert.equal(poorAcc.accepted, false);
  assert.equal(poorAcc.reason, 'poor_accuracy');

  // Duplicate timestamp
  const dupTs = filterGpsPoint(base, {
    ...base,
    timestamp: 1000000,
  });
  assert.equal(dupTs.accepted, false);
  assert.equal(dupTs.reason, 'duplicate');

  // Unreasonable GPS jump (~10km in 2s)
  const jump = filterGpsPoint(base, {
    lat: 37.88,
    lng: -122.39,
    timestamp: 1002000,
    speedKmh: 40,
    accuracyMeters: 8,
  });
  assert.equal(jump.accepted, false);
  assert.equal(jump.reason, 'unreasonable_jump');

  // Valid point (~28m in 2s = ~50 km/h)
  const valid = filterGpsPoint(base, {
    lat: 37.79025,
    lng: -122.39,
    timestamp: 1002000,
    speedKmh: 48,
    accuracyMeters: 5,
  });
  assert.equal(valid.accepted, true);
  assert.ok(valid.deltaMeters > 20 && valid.deltaMeters < 35);
});

test('detectStops identifies sustained stops and ignores brief slowdowns', () => {
  const t0 = 1700000000000;
  const points: GpsPoint[] = [
    // Moving
    {lat: 37.7900, lng: -122.3900, timestamp: t0, speedKmh: 40, accuracyMeters: 5},
    {lat: 37.7915, lng: -122.3900, timestamp: t0 + 15000, speedKmh: 42, accuracyMeters: 5},
    // Brief 15s slowdown (should NOT trigger a stop since min is 45s)
    {lat: 37.7920, lng: -122.3900, timestamp: t0 + 25000, speedKmh: 0.5, accuracyMeters: 6},
    {lat: 37.79201, lng: -122.39001, timestamp: t0 + 40000, speedKmh: 0.4, accuracyMeters: 6},
    // Moving again
    {lat: 37.7940, lng: -122.3900, timestamp: t0 + 60000, speedKmh: 38, accuracyMeters: 5},
    // Genuine 90-second stop with slight GPS drift (< 4m)
    {lat: 37.7960, lng: -122.3900, timestamp: t0 + 90000, speedKmh: 0.2, accuracyMeters: 6},
    {lat: 37.79602, lng: -122.39001, timestamp: t0 + 120000, speedKmh: 0.0, accuracyMeters: 6},
    {lat: 37.79599, lng: -122.38998, timestamp: t0 + 150000, speedKmh: 0.1, accuracyMeters: 6},
    {lat: 37.79601, lng: -122.39002, timestamp: t0 + 180000, speedKmh: 0.3, accuracyMeters: 5},
    // Resume driving
    {lat: 37.7985, lng: -122.3900, timestamp: t0 + 210000, speedKmh: 45, accuracyMeters: 5},
  ];

  const stops = detectStops(points);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].durationSec, 90);
});

test('computeJourneyStats calculates distance, speeds, moving time, and stopped time', () => {
  const t0 = 1700000000000;
  const points: GpsPoint[] = [
    {lat: 37.7900, lng: -122.3900, timestamp: t0, speedKmh: 36, accuracyMeters: 5},
    {lat: 37.7945, lng: -122.3900, timestamp: t0 + 50000, speedKmh: 50, accuracyMeters: 5},
    {lat: 37.79451, lng: -122.3900, timestamp: t0 + 110000, speedKmh: 0, accuracyMeters: 5},
    {lat: 37.7990, lng: -122.3900, timestamp: t0 + 160000, speedKmh: 42, accuracyMeters: 5},
  ];
  const stops = detectStops(points);
  const stats = computeJourneyStats(points, stops);

  assert.ok(stats.totalDistanceKm > 0.95 && stats.totalDistanceKm < 1.05);
  assert.equal(stats.totalDurationSec, 160);
  assert.equal(stats.maxSpeedKmh, 50);
  assert.equal(stats.movingTimeSec + stats.stoppedTimeSec, stats.totalDurationSec);
  assert.ok(stats.stoppedTimeSec >= 60);
});

test('interpolateReplayPosition tracks route progress from 0 to 1', () => {
  const t0 = 1700000000000;
  const points: GpsPoint[] = [
    {lat: 37.7900, lng: -122.3900, timestamp: t0, speedKmh: 20, accuracyMeters: 5},
    {lat: 37.8000, lng: -122.3900, timestamp: t0 + 100000, speedKmh: 40, accuracyMeters: 5},
  ];

  const start = interpolateReplayPosition(points, [], 0);
  const mid = interpolateReplayPosition(points, [], 0.5);
  const end = interpolateReplayPosition(points, [], 1);

  assert.ok(start && mid && end);
  assert.equal(start.distanceCoveredKm, 0);
  assert.ok(Math.abs(mid.position.lat - 37.795) < 0.0001);
  assert.equal(mid.elapsedSec, 50);
  assert.equal(mid.currentSpeedKmh, 30);
  assert.equal(end.distanceCoveredKm, end.totalDistanceKm);
});

test('SIMULATED_LIVE_TRACK yields realistic driving increments and filters only the glitch jump', async () => {
  const {SIMULATED_LIVE_TRACK} = await import('../data/seedJourneys');
  const accepted: GpsPoint[] = [];
  let rejectedJumps = 0;
  let ts = 1700000000000;

  for (const step of SIMULATED_LIVE_TRACK) {
    const candidate: GpsPoint = {
      lat: step.lat,
      lng: step.lng,
      timestamp: ts,
      speedKmh: step.speedKmh,
      accuracyMeters: step.accuracyMeters,
    };
    const prev = accepted[accepted.length - 1] ?? null;
    const res = filterGpsPoint(prev, candidate);
    if (res.accepted) {
      accepted.push(candidate);
    } else if (res.reason === 'unreasonable_jump') {
      rejectedJumps += 1;
    }
    ts += 1200;
  }

  assert.equal(rejectedJumps, 1);
  assert.equal(accepted.length, SIMULATED_LIVE_TRACK.length - 1);
  const stats = computeJourneyStats(accepted);
  assert.ok(stats.totalDistanceKm > 0.3, `Expected >0.3 km, got ${stats.totalDistanceKm}`);
});
