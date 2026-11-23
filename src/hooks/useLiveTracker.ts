import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {
  ActiveSession,
  DetectedStop,
  GpsPoint,
  GpsSignalStatus,
  Journey,
  JourneyStats,
  TrackingStatus,
  TravelActivity,
} from '../types/journey';
import {SIMULATED_LIVE_TRACK} from '../data/seedJourneys';
import {
  calculateBearing,
  computeJourneyStats,
  detectStops,
  filterGpsPoint,
} from '../utils/gpsMath';
import {formatCoordinates} from '../utils/format';
import {loadActiveSession, saveActiveSession} from '../utils/storage';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  released?: boolean;
}

export interface LiveTrackerApi {
  status: TrackingStatus;
  activity: TravelActivity;
  setActivity: (activity: TravelActivity) => void;
  sourceMode: 'device' | 'simulated';
  setSourceMode: (mode: 'device' | 'simulated') => void;
  points: GpsPoint[];
  stops: DetectedStop[];
  stats: JourneyStats;
  currentSpeedKmh: number;
  currentAccuracyMeters: number | null;
  signalStatus: GpsSignalStatus;
  signalMessage: string;
  filteredJumpCount: number;
  elapsedSec: number;
  isOnline: boolean;
  wakeLockEnabled: boolean;
  wakeLockSupported: boolean;
  toggleWakeLock: () => void;
  restoredSessionNotice: boolean;
  dismissRestoredNotice: () => void;
  startJourney: (customTitle?: string) => void;
  pauseJourney: () => void;
  resumeJourney: () => void;
  stopAndSaveJourney: (customTitle?: string) => Journey | null;
  discardJourney: () => void;
}

function classifySignal(accuracy: number | null, status: TrackingStatus): GpsSignalStatus {
  if (status === 'idle' && accuracy === null) return 'ready';
  if (accuracy === null) return 'acquiring';
  if (accuracy <= 12) return 'strong';
  if (accuracy <= 30) return 'moderate';
  return 'weak';
}

export function useLiveTracker(): LiveTrackerApi {
  const initialSession = useMemo(() => loadActiveSession(), []);

  const [session, setSession] = useState<ActiveSession | null>(initialSession);
  const [activity, setActivityState] = useState<TravelActivity>(
    initialSession?.activity ?? 'car'
  );
  const [sourceMode, setSourceModeState] = useState<'device' | 'simulated'>(
    initialSession?.sourceMode ?? 'device'
  );
  const [signalStatus, setSignalStatus] = useState<GpsSignalStatus>(
    initialSession ? 'moderate' : 'ready'
  );
  const [signalMessage, setSignalMessage] = useState<string>(
    initialSession
      ? 'Previous active journey restored from local storage.'
      : 'Ready to acquire GPS location.'
  );
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [restoredSessionNotice, setRestoredSessionNotice] = useState<boolean>(
    Boolean(initialSession)
  );
  const [wakeLockEnabled, setWakeLockEnabled] = useState<boolean>(
    initialSession?.wakeLockEnabled ?? true
  );

  const wakeLockSupported =
    typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const watchIdRef = useRef<number | null>(null);
  const simTimerRef = useRef<number | null>(null);
  const simIndexRef = useRef<number>(initialSession?.points.length ?? 0);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const lastSignalTimeRef = useRef<number>(Date.now());
  const sessionRef = useRef<ActiveSession | null>(session);
  sessionRef.current = session;

  // Persist active session whenever it updates
  useEffect(() => {
    saveActiveSession(session);
  }, [session]);

  // Online/offline browser listener
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Live clock tick & signal-loss watchdog while recording
  useEffect(() => {
    if (!session || session.status !== 'recording') return;
    const interval = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (
        sessionRef.current?.sourceMode === 'device' &&
        current - lastSignalTimeRef.current > 15000
      ) {
        setSignalStatus('lost');
        setSignalMessage('GPS signal temporarily lost. Waiting for satellite fix…');
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [session?.status]);

  // Screen Wake Lock management for screen-locked / background tracking
  const acquireWakeLock = useCallback(async () => {
    if (!wakeLockSupported || !wakeLockEnabled) return;
    try {
      const nav = navigator as unknown as {
        wakeLock?: {request: (type: 'screen') => Promise<WakeLockSentinelLike>};
      };
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request('screen');
      }
    } catch {
      // Silently ignore if document is hidden or browser restricts wake lock
    }
  }, [wakeLockEnabled, wakeLockSupported]);

  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeLockRef.current?.release();
      wakeLockRef.current = null;
    } catch {
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (session?.status === 'recording' && wakeLockEnabled) {
      void acquireWakeLock();
    } else {
      void releaseWakeLock();
    }

    const onVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        sessionRef.current?.status === 'recording' &&
        wakeLockEnabled
      ) {
        void acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void releaseWakeLock();
    };
  }, [session?.status, wakeLockEnabled, acquireWakeLock, releaseWakeLock]);

  // Ingest incoming GPS fix through filtering & anti-jump pipeline
  const ingestPoint = useCallback((rawPoint: GpsPoint) => {
    lastSignalTimeRef.current = Date.now();

    setSession((prev) => {
      if (!prev || prev.status !== 'recording') return prev;
      const lastPoint = prev.points[prev.points.length - 1] ?? null;
      const result = filterGpsPoint(lastPoint, rawPoint);

      if (!result.accepted) {
        if (result.reason === 'unreasonable_jump') {
          setSignalStatus('moderate');
          setSignalMessage('Filtered anomalous GPS jump to protect route accuracy.');
          return {
            ...prev,
            filteredJumpCount: prev.filteredJumpCount + 1,
            lastUpdated: Date.now(),
          };
        }
        if (result.reason === 'poor_accuracy') {
          setSignalStatus('weak');
          setSignalMessage(
            `Low GPS accuracy (±${Math.round(rawPoint.accuracyMeters)}m) — waiting for clearer fix.`
          );
        }
        return prev;
      }

      const heading =
        rawPoint.heading !== undefined
          ? rawPoint.heading
          : lastPoint
            ? Math.round(calculateBearing(lastPoint, rawPoint))
            : 0;

      const acceptedPoint: GpsPoint = {
        ...rawPoint,
        speedKmh: result.computedSpeedKmh,
        heading,
      };

      const nextPoints = [...prev.points, acceptedPoint];
      const nextStartLoc =
        prev.points.length === 0
          ? prev.sourceMode === 'simulated'
            ? 'Embarcadero Ferry Terminal'
            : formatCoordinates(acceptedPoint.lat, acceptedPoint.lng)
          : prev.startLocation;

      const nextSignal = classifySignal(acceptedPoint.accuracyMeters, 'recording');
      setSignalStatus(nextSignal);
      setSignalMessage(
        nextSignal === 'strong'
          ? `Strong GPS lock (±${Math.round(acceptedPoint.accuracyMeters)}m)`
          : `Active GPS fix (±${Math.round(acceptedPoint.accuracyMeters)}m)`
      );

      return {
        ...prev,
        points: nextPoints,
        startLocation: nextStartLoc,
        lastUpdated: Date.now(),
      };
    });
  }, []);

  // Attach/detach GPS watcher or deterministic simulator when recording
  useEffect(() => {
    if (!session || session.status !== 'recording') {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (simTimerRef.current !== null) {
        window.clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
      return;
    }

    if (session.sourceMode === 'simulated') {
      // Emit initial point immediately if session has none
      const emitSimStep = () => {
        const idx = simIndexRef.current % SIMULATED_LIVE_TRACK.length;
        const lap = Math.floor(simIndexRef.current / SIMULATED_LIVE_TRACK.length);
        const template = SIMULATED_LIVE_TRACK[idx];
        simIndexRef.current += 1;

        // Slight offset on subsequent laps so continuous drives remain smooth
        const lapOffset = lap * 0.0004;
        ingestPoint({
          lat: Number((template.lat + lapOffset).toFixed(6)),
          lng: Number((template.lng - lapOffset).toFixed(6)),
          timestamp: Date.now(),
          speedKmh: template.speedKmh,
          accuracyMeters: template.accuracyMeters,
        });
      };

      if (session.points.length === 0) {
        emitSimStep();
      }
      simTimerRef.current = window.setInterval(emitSimStep, 1200);

      return () => {
        if (simTimerRef.current !== null) {
          window.clearInterval(simTimerRef.current);
          simTimerRef.current = null;
        }
      };
    }

    // Real device Geolocation API
    if (!('geolocation' in navigator)) {
      setSignalStatus('lost');
      setSignalMessage(
        'Geolocation is unavailable in this browser. Switch to Simulated GPS to test.'
      );
      return;
    }

    setSignalStatus('acquiring');
    setSignalMessage('Acquiring device GPS signal…');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const speedKmh =
          pos.coords.speed !== null && pos.coords.speed >= 0
            ? Number((pos.coords.speed * 3.6).toFixed(1))
            : -1;
        ingestPoint({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: pos.timestamp || Date.now(),
          speedKmh,
          accuracyMeters: pos.coords.accuracy || 10,
          heading:
            pos.coords.heading !== null && !Number.isNaN(pos.coords.heading)
              ? Math.round(pos.coords.heading)
              : undefined,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setSignalStatus('denied');
          setSignalMessage(
            'Location permission denied. Allow GPS access or switch to Simulated GPS.'
          );
        } else {
          setSignalStatus('lost');
          setSignalMessage(
            'Temporary GPS signal loss. Recording will resume automatically once signal returns.'
          );
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      }
    );

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [session?.status, session?.sourceMode, ingestPoint]);

  const setActivity = useCallback((next: TravelActivity) => {
    setActivityState(next);
    setSession((prev) => (prev ? {...prev, activity: next} : prev));
  }, []);

  const setSourceMode = useCallback((mode: 'device' | 'simulated') => {
    setSourceModeState(mode);
    setSession((prev) => (prev ? {...prev, sourceMode: mode} : prev));
  }, []);

  const toggleWakeLock = useCallback(() => {
    setWakeLockEnabled((prev) => {
      const next = !prev;
      setSession((s) => (s ? {...s, wakeLockEnabled: next} : s));
      return next;
    });
  }, []);

  const startJourney = useCallback(() => {
    const startTs = Date.now();
    simIndexRef.current = 0;
    lastSignalTimeRef.current = startTs;
    setNowMs(startTs);
    setRestoredSessionNotice(false);
    setSignalStatus('acquiring');
    setSignalMessage(
      sourceMode === 'simulated'
        ? 'Starting simulated GPS route stream…'
        : 'Acquiring GPS satellite lock…'
    );

    setSession({
      id: `jrn-${startTs}`,
      status: 'recording',
      activity,
      sourceMode,
      startTime: startTs,
      pausedAt: null,
      accumulatedPausedMs: 0,
      points: [],
      filteredJumpCount: 0,
      startLocation:
        sourceMode === 'simulated'
          ? 'Embarcadero Ferry Terminal'
          : 'Acquiring starting location…',
      lastUpdated: startTs,
      wakeLockEnabled,
    });
  }, [activity, sourceMode, wakeLockEnabled]);

  const pauseJourney = useCallback(() => {
    setSession((prev) => {
      if (!prev || prev.status !== 'recording') return prev;
      return {
        ...prev,
        status: 'paused',
        pausedAt: Date.now(),
        lastUpdated: Date.now(),
      };
    });
    setSignalMessage('Journey paused. GPS coordinates held locally.');
  }, []);

  const resumeJourney = useCallback(() => {
    const now = Date.now();
    lastSignalTimeRef.current = now;
    setNowMs(now);
    setSession((prev) => {
      if (!prev || prev.status !== 'paused') return prev;
      const pauseDelta = prev.pausedAt ? now - prev.pausedAt : 0;
      return {
        ...prev,
        status: 'recording',
        pausedAt: null,
        accumulatedPausedMs: prev.accumulatedPausedMs + pauseDelta,
        lastUpdated: now,
      };
    });
    setSignalMessage('Tracking resumed.');
  }, []);

  const discardJourney = useCallback(() => {
    setSession(null);
    simIndexRef.current = 0;
    setSignalStatus('ready');
    setSignalMessage('Ready to acquire GPS location.');
    setRestoredSessionNotice(false);
  }, []);

  const elapsedSec = useMemo(() => {
    if (!session) return 0;
    const effectiveEnd =
      session.status === 'paused' && session.pausedAt ? session.pausedAt : nowMs;
    return Math.max(
      0,
      Math.floor((effectiveEnd - session.startTime - session.accumulatedPausedMs) / 1000)
    );
  }, [session, nowMs]);

  const points = session?.points ?? [];

  const stops = useMemo(() => detectStops(points), [points]);

  const stats = useMemo(
    () => computeJourneyStats(points, stops, elapsedSec),
    [points, stops, elapsedSec]
  );

  const stopAndSaveJourney = useCallback(
    (customTitle?: string): Journey | null => {
      const current = sessionRef.current;
      if (!current) return null;

      const endTs = Date.now();
      const recordedPoints = current.points;
      if (recordedPoints.length === 0) {
        setSession(null);
        setSignalStatus('ready');
        setSignalMessage('No GPS points were captured yet.');
        return null;
      }

      const finalElapsed = Math.max(
        1,
        Math.floor(
          ((current.pausedAt ?? endTs) -
            current.startTime -
            current.accumulatedPausedMs) /
            1000
        )
      );
      const finalStops = detectStops(recordedPoints);
      const finalStats = computeJourneyStats(recordedPoints, finalStops, finalElapsed);

      const firstPt = recordedPoints[0];
      const lastPt = recordedPoints[recordedPoints.length - 1];
      const startLoc =
        current.startLocation && !current.startLocation.startsWith('Acquiring')
          ? current.startLocation
          : formatCoordinates(firstPt.lat, firstPt.lng);
      const endLoc =
        current.sourceMode === 'simulated'
          ? 'Fisherman’s Wharf Promenade'
          : formatCoordinates(lastPt.lat, lastPt.lng);

      const actName =
        current.activity.charAt(0).toUpperCase() + current.activity.slice(1);
      const defaultTitle =
        customTitle?.trim() ||
        (current.sourceMode === 'simulated'
          ? `Waterfront ${actName} Journey`
          : `${actName} Journey · ${new Date(current.startTime).toLocaleDateString(
              'en-US',
              {month: 'short', day: 'numeric'}
            )}`);

      const journey: Journey = {
        id: current.id,
        title: defaultTitle,
        activity: current.activity,
        startTime: current.startTime,
        endTime: endTs,
        startLocation: startLoc,
        endLocation: endLoc,
        points: recordedPoints,
        stops: finalStops,
        stats: finalStats,
        filteredJumpCount: current.filteredJumpCount,
        recordedOffline: !isOnline,
      };

      setSession(null);
      simIndexRef.current = 0;
      setSignalStatus('ready');
      setSignalMessage('Journey saved locally to your travel history.');
      setRestoredSessionNotice(false);
      return journey;
    },
    [isOnline]
  );

  const lastPoint = points[points.length - 1] ?? null;

  return {
    status: session?.status ?? 'idle',
    activity,
    setActivity,
    sourceMode,
    setSourceMode,
    points,
    stops,
    stats,
    currentSpeedKmh:
      session?.status === 'recording' && lastPoint ? lastPoint.speedKmh : 0,
    currentAccuracyMeters: lastPoint ? Math.round(lastPoint.accuracyMeters) : null,
    signalStatus,
    signalMessage,
    filteredJumpCount: session?.filteredJumpCount ?? 0,
    elapsedSec,
    isOnline,
    wakeLockEnabled,
    wakeLockSupported,
    toggleWakeLock,
    restoredSessionNotice,
    dismissRestoredNotice: () => setRestoredSessionNotice(false),
    startJourney,
    pauseJourney,
    resumeJourney,
    stopAndSaveJourney,
    discardJourney,
  };
}
