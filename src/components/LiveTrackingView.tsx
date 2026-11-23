import React, {useMemo, useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  Smartphone,
  Square,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type {LiveTrackerApi} from '../hooks/useLiveTracker';
import type {Journey} from '../types/journey';
import {
  ACTIVITY_META,
  ALL_ACTIVITIES,
  formatClock,
  formatCoordinates,
  formatDistanceKm,
  formatDuration,
  formatSpeedKmh,
} from '../utils/format';
import {InteractiveRouteMap, type MapRouteSeries} from './InteractiveRouteMap';

interface LiveTrackingViewProps {
  tracker: LiveTrackerApi;
  hasApiKey: boolean;
  quotaExceeded: boolean;
  onJourneySaved: (journey: Journey) => void;
}

const SIGNAL_LABELS: Record<
  LiveTrackerApi['signalStatus'],
  {label: string; toneClass: string}
> = {
  ready: {label: 'GPS Standby', toneClass: 'text-slate-600'},
  acquiring: {label: 'Acquiring Fix', toneClass: 'text-[#1D4ED8]'},
  strong: {label: 'Strong Signal', toneClass: 'text-[#059669]'},
  moderate: {label: 'Good Signal', toneClass: 'text-[#0F766E]'},
  weak: {label: 'Weak Signal', toneClass: 'text-[#B45309]'},
  lost: {label: 'Signal Lost', toneClass: 'text-[#DC2626]'},
  denied: {label: 'Permission Needed', toneClass: 'text-[#DC2626]'},
};

export const LiveTrackingView: React.FC<LiveTrackingViewProps> = ({
  tracker,
  hasApiKey,
  quotaExceeded,
  onJourneySaved,
}) => {
  const [autoFollow, setAutoFollow] = useState<boolean>(true);
  const [customTitle, setCustomTitle] = useState<string>('');
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  const lastPoint = tracker.points[tracker.points.length - 1] ?? null;

  const liveRoutes = useMemo<MapRouteSeries[]>(() => {
    if (tracker.points.length === 0) return [];
    return [
      {
        id: 'active-live-route',
        title: customTitle.trim() || 'Active Journey',
        activity: tracker.activity,
        points: tracker.points,
        stops: tracker.stops,
        selected: true,
      },
    ];
  }, [tracker.points, tracker.stops, tracker.activity, customTitle]);

  const handleStopAndSave = () => {
    setSaveWarning(null);
    if (tracker.points.length === 0) {
      setSaveWarning(
        'Wait for at least one GPS coordinate before saving, or switch to Simulated GPS to test immediately.'
      );
      return;
    }
    const saved = tracker.stopAndSaveJourney(customTitle);
    if (saved) {
      setCustomTitle('');
      onJourneySaved(saved);
    }
  };

  const signalMeta = SIGNAL_LABELS[tracker.signalStatus];

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col justify-between gap-3 border-b border-[#E5E8EE] pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Live GPS Tracking
          </h1>
          <p className="mt-1 text-sm text-[#526072]">
            Manually start, pause, resume, and stop tracking. Coordinates are filtered
            and saved locally in real time.
          </p>
        </div>

        {/* GPS Input Source Toggle (Device Hardware vs Simulated Drive for Testing) */}
        <div
          className="inline-flex items-center gap-1 self-start rounded-lg bg-[#EEF1F6] p-1 sm:self-auto"
          role="group"
          aria-label="GPS signal source"
        >
          <button
            type="button"
            disabled={tracker.status !== 'idle'}
            onClick={() => tracker.setSourceMode('device')}
            className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
              tracker.sourceMode === 'device'
                ? 'bg-white text-[#0F172A] shadow-sm'
                : 'text-[#526072] hover:text-[#0F172A]'
            }`}
          >
            Device GPS
          </button>
          <button
            type="button"
            disabled={tracker.status !== 'idle'}
            onClick={() => tracker.setSourceMode('simulated')}
            className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
              tracker.sourceMode === 'simulated'
                ? 'bg-white text-[#0F172A] shadow-sm'
                : 'text-[#526072] hover:text-[#0F172A]'
            }`}
          >
            Simulated GPS
          </button>
        </div>
      </div>

      {/* Restored Crash-Recovery Session Notice */}
      {tracker.restoredSessionNotice && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm text-[#1E3A8A]"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
            <span>
              Active journey restored from local storage ({tracker.points.length} GPS
              points preserved).
            </span>
          </div>
          <button
            type="button"
            onClick={tracker.dismissRestoredNotice}
            className="text-xs font-semibold text-[#1D4ED8] hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace: Interactive Map (left 8 cols) + Live Controls & Telemetry (right 4 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Live Interactive Map */}
        <div className="space-y-3 lg:col-span-8">
          <InteractiveRouteMap
            routes={liveRoutes}
            livePosition={lastPoint ? {lat: lastPoint.lat, lng: lastPoint.lng} : null}
            liveAccuracyMeters={tracker.currentAccuracyMeters}
            liveHeading={lastPoint?.heading ?? 0}
            autoFollow={autoFollow}
            onAutoFollowChange={setAutoFollow}
            showStops={true}
            heightClass="h-[380px] sm:h-[520px] lg:h-[600px]"
            isOnline={tracker.isOnline}
            hasApiKey={hasApiKey}
            quotaExceeded={quotaExceeded}
            testId="live-tracking-map"
          />

          {/* Compact Coordinate & Signal Strip below Map */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5E8EE] bg-white px-4 py-3 text-xs text-[#526072]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className={`inline-flex items-center gap-1.5 font-semibold ${signalMeta.toneClass}`}>
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                {signalMeta.label}
              </span>
              <span className="font-mono tabular-nums text-[#0F172A]">
                Accuracy:{' '}
                {tracker.currentAccuracyMeters !== null
                  ? `±${tracker.currentAccuracyMeters} m`
                  : '—'}
              </span>
              <span className="font-mono tabular-nums">
                {lastPoint
                  ? formatCoordinates(lastPoint.lat, lastPoint.lng)
                  : 'Waiting for coordinates'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 font-medium text-[#0F172A]">
                {tracker.isOnline ? (
                  <>
                    <Wifi className="h-3.5 w-3.5 text-[#059669]" aria-hidden="true" />
                    <span>Online · Local backup active</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3.5 w-3.5 text-[#D97706]" aria-hidden="true" />
                    <span>Offline · Recording locally</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Telemetry Readouts & Journey Controls */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          {/* Primary Telemetry Card */}
          <div
            data-testid="live-telemetry-panel"
            data-tracking-status={tracker.status}
            className="rounded-xl border border-[#E5E8EE] bg-white p-5"
          >
            <div className="flex items-center justify-between border-b border-[#E5E8EE] pb-3">
              <h2 className="text-sm font-semibold text-[#0F172A]">Live Statistics</h2>
              <span className="font-mono text-xs font-medium text-[#526072] tabular-nums">
                {tracker.status === 'recording'
                  ? 'Recording'
                  : tracker.status === 'paused'
                    ? 'Paused'
                    : 'Ready'}
              </span>
            </div>

            {/* Hero Readouts: Current Speed + Distance + Elapsed Time */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#526072]">Current Speed</p>
                <p
                  data-testid="live-speed-value"
                  className="mt-1 font-mono text-2xl font-semibold text-[#0F172A] tabular-nums"
                >
                  {tracker.currentSpeedKmh.toFixed(1)}{' '}
                  <span className="text-xs font-normal text-[#526072]">km/h</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-[#526072]">Distance</p>
                <p
                  data-testid="live-distance-value"
                  className="mt-1 font-mono text-2xl font-semibold text-[#0F172A] tabular-nums"
                >
                  {tracker.stats.totalDistanceKm.toFixed(2)}{' '}
                  <span className="text-xs font-normal text-[#526072]">km</span>
                </p>
              </div>
            </div>

            <div className="mt-4 border-t border-[#E5E8EE] pt-4">
              <p className="text-xs text-[#526072]">Elapsed Journey Time</p>
              <p
                data-testid="live-elapsed-clock"
                className="mt-1 font-mono text-3xl font-semibold tracking-tight text-[#0F172A] tabular-nums"
              >
                {formatClock(tracker.elapsedSec)}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-y-3 border-t border-[#E5E8EE] pt-4 text-xs">
              <div>
                <span className="text-[#526072]">Avg Speed</span>
                <p className="mt-0.5 font-mono font-medium text-[#0F172A] tabular-nums">
                  {formatSpeedKmh(tracker.stats.avgSpeedKmh)}
                </p>
              </div>
              <div>
                <span className="text-[#526072]">Max Speed</span>
                <p className="mt-0.5 font-mono font-medium text-[#0F172A] tabular-nums">
                  {formatSpeedKmh(tracker.stats.maxSpeedKmh)}
                </p>
              </div>
              <div>
                <span className="text-[#526072]">Moving Time</span>
                <p className="mt-0.5 font-mono font-medium text-[#0F172A] tabular-nums">
                  {formatDuration(tracker.stats.movingTimeSec)}
                </p>
              </div>
              <div>
                <span className="text-[#526072]">Stopped Time</span>
                <p className="mt-0.5 font-mono font-medium text-[#0F172A] tabular-nums">
                  {formatDuration(tracker.stats.stoppedTimeSec)}
                </p>
              </div>
            </div>
          </div>

          {/* Journey Controls & Activity Mode */}
          <div className="rounded-xl border border-[#E5E8EE] bg-white p-5 space-y-4">
            <div>
              <label
                htmlFor="journey-title-input"
                className="block text-xs font-medium text-[#526072]"
              >
                Journey Label (optional)
              </label>
              <input
                id="journey-title-input"
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g., Morning Commute, Coastal Drive"
                className="mt-1.5 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1D4ED8] focus:outline-none"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-[#526072]">Travel Mode</p>
              <div
                className="mt-2 grid grid-cols-3 gap-1.5"
                role="group"
                aria-label="Select travel activity"
              >
                {ALL_ACTIVITIES.map((act) => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => tracker.setActivity(act)}
                    aria-pressed={tracker.activity === act}
                    className={`min-h-[40px] rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                      tracker.activity === act
                        ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]'
                        : 'border-[#E5E8EE] bg-white text-[#526072] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
                    }`}
                  >
                    {ACTIVITY_META[act].label}
                  </button>
                ))}
              </div>
            </div>

            {saveWarning && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <span>{saveWarning}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-1">
              {tracker.status === 'idle' && (
                <button
                  type="button"
                  onClick={() => {
                    setSaveWarning(null);
                    tracker.startJourney();
                  }}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1E40AF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
                >
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                  <span>Start Journey</span>
                </button>
              )}

              {tracker.status === 'recording' && (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={tracker.pauseJourney}
                      className="flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 py-2.5 text-sm font-semibold text-[#0F172A] transition-colors hover:bg-[#F8FAFC]"
                    >
                      <Pause className="h-4 w-4" aria-hidden="true" />
                      <span>Pause</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStopAndSave}
                      className="flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-[#DC2626] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C]"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                      <span>Stop & Save</span>
                    </button>
                  </div>
                </>
              )}

              {tracker.status === 'paused' && (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={tracker.resumeJourney}
                      className="flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-[#059669] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#047857]"
                    >
                      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                      <span>Resume</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStopAndSave}
                      className="flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1E293B]"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                      <span>Stop & Save</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={tracker.discardJourney}
                    className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-[#E5E8EE] bg-white px-3 py-2 text-xs font-medium text-[#DC2626] transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Discard Active Journey</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Signal Integrity & Background Protection */}
          <div className="rounded-xl border border-[#E5E8EE] bg-white p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#0F172A]">GPS Protection</span>
              <span className="font-mono text-[#526072] tabular-nums">
                {tracker.points.length} pts · {tracker.stops.length} stops
              </span>
            </div>
            <p className="text-[#526072] leading-relaxed">{tracker.signalMessage}</p>
            <div className="flex items-center justify-between border-t border-[#E5E8EE] pt-3">
              <span className="inline-flex items-center gap-1.5 text-[#526072]">
                <ShieldCheck className="h-4 w-4 text-[#059669]" aria-hidden="true" />
                GPS jumps filtered
              </span>
              <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                {tracker.filteredJumpCount}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[#E5E8EE] pt-3">
              <span className="inline-flex items-center gap-1.5 text-[#526072]">
                <Smartphone className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
                Keep screen awake while tracking
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={tracker.wakeLockEnabled}
                aria-label="Keep screen awake while tracking"
                onClick={tracker.toggleWakeLock}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  tracker.wakeLockEnabled ? 'bg-[#1D4ED8]' : 'bg-[#CBD5E1]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    tracker.wakeLockEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
