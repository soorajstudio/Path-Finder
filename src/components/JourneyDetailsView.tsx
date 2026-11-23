import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowLeft,
  Pause,
  Play,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {Journey} from '../types/journey';
import {
  ACTIVITY_META,
  formatClock,
  formatCoordinates,
  formatDateShort,
  formatDistanceKm,
  formatDuration,
  formatSpeedKmh,
  formatTimeShort,
} from '../utils/format';
import {interpolateReplayPosition} from '../utils/gpsMath';
import {InteractiveRouteMap, type MapRouteSeries} from './InteractiveRouteMap';

interface JourneyDetailsViewProps {
  journey: Journey;
  isOnline: boolean;
  hasApiKey: boolean;
  quotaExceeded: boolean;
  onBack: () => void;
  onDelete: (journeyId: string) => void;
}

const REPLAY_SPEEDS = [1, 2, 5, 10] as const;

export const JourneyDetailsView: React.FC<JourneyDetailsViewProps> = ({
  journey,
  isOnline,
  hasApiKey,
  quotaExceeded,
  onBack,
  onDelete,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(2);
  const [progress, setProgress] = useState<number>(0);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  // Reset replay when switching journeys
  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
    setConfirmDelete(false);
  }, [journey.id]);

  // Smooth replay loop (completes full journey in ~18 seconds at 1x)
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
      return;
    }

    const baseDurationMs = 18000;
    const step = (now: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = now;
      }
      const deltaMs = now - lastFrameRef.current;
      lastFrameRef.current = now;

      setProgress((prev) => {
        const next = prev + (deltaMs * replaySpeed) / baseDurationMs;
        if (next >= 1) {
          setIsPlaying(false);
          return 1;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
    };
  }, [isPlaying, replaySpeed]);

  const replaySnapshot = useMemo(
    () => interpolateReplayPosition(journey.points, journey.stops, progress),
    [journey.points, journey.stops, progress]
  );

  const routes = useMemo<MapRouteSeries[]>(
    () => [
      {
        id: journey.id,
        title: journey.title,
        activity: journey.activity,
        points: journey.points,
        stops: journey.stops,
        selected: true,
      },
    ],
    [journey]
  );

  const speedProfileData = useMemo(() => {
    if (journey.points.length === 0) return [];
    const startTs = journey.points[0].timestamp;
    const stride = Math.max(1, Math.floor(journey.points.length / 40));
    const sampled: Array<{elapsedLabel: string; speedKmh: number}> = [];
    for (let i = 0; i < journey.points.length; i += stride) {
      const pt = journey.points[i];
      const elapsedSec = Math.round((pt.timestamp - startTs) / 1000);
      sampled.push({
        elapsedLabel: formatDuration(elapsedSec),
        speedKmh: pt.speedKmh,
      });
    }
    return sampled;
  }, [journey.points]);

  const handleTogglePlay = () => {
    if (progress >= 1) {
      setProgress(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col justify-between gap-4 border-b border-[#E5E8EE] pb-5 sm:flex-row sm:items-end">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#526072] hover:text-[#0F172A]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Journey History</span>
          </button>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0F172A]">
            {journey.title}
          </h1>
          <p className="mt-1 text-xs text-[#526072]">
            {ACTIVITY_META[journey.activity].label} · {formatDateShort(journey.startTime)} ·{' '}
            {formatTimeShort(journey.startTime)} – {formatTimeShort(journey.endTime)}
            {journey.recordedOffline ? ' · Recorded Offline' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => onDelete(journey.id)}
                className="min-h-[40px] rounded-lg bg-[#DC2626] px-4 py-2 text-xs font-medium text-white hover:bg-[#B91C1C] whitespace-nowrap"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[40px] rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-xs font-medium text-[#526072] hover:bg-[#F8FAFC] whitespace-nowrap"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#E5E8EE] bg-white px-3.5 py-2 text-xs font-medium text-[#DC2626] transition-colors hover:border-red-200 hover:bg-red-50 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Delete Journey</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Route Map + Replay Controls */}
      <section className="space-y-4">
        <InteractiveRouteMap
          routes={routes}
          replayPosition={
            progress > 0 || isPlaying ? replaySnapshot?.position ?? null : null
          }
          replayHeading={replaySnapshot?.heading ?? 0}
          showStops={true}
          heightClass="h-[380px] sm:h-[480px]"
          isOnline={isOnline}
          hasApiKey={hasApiKey}
          quotaExceeded={quotaExceeded}
          testId="journey-details-map"
        />

        {/* Route Replay Player */}
        <div
          data-testid="route-replay-player"
          className="rounded-xl border border-[#E5E8EE] bg-white p-5"
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-sm font-semibold text-[#0F172A]">Route Replay</h2>
              <p className="mt-0.5 text-xs text-[#526072]">
                {journey.startLocation} → {journey.endLocation}
                {replaySnapshot?.atStop
                  ? ` · Paused at ${replaySnapshot.atStop.label}`
                  : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePlay}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1E40AF] whitespace-nowrap"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                    <span>Pause Replay</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                    <span>{progress >= 1 ? 'Replay Again' : 'Play Replay'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setProgress(0);
                }}
                aria-label="Reset route replay"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reset</span>
              </button>

              <div
                className="inline-flex items-center gap-0.5 rounded-lg bg-[#EEF1F6] p-1"
                role="group"
                aria-label="Replay speed"
              >
                {REPLAY_SPEEDS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setReplaySpeed(spd)}
                    aria-pressed={replaySpeed === spd}
                    className={`min-h-[32px] rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
                      replaySpeed === spd
                        ? 'bg-white text-[#0F172A] shadow-sm'
                        : 'text-[#526072] hover:text-[#0F172A]'
                    }`}
                  >
                    {spd}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scrubber Slider */}
          <div className="mt-4">
            <label htmlFor="replay-progress-slider" className="sr-only">
              Route replay progress
            </label>
            <input
              id="replay-progress-slider"
              type="range"
              min={0}
              max={1000}
              value={Math.round(progress * 1000)}
              onChange={(e) => {
                setIsPlaying(false);
                setProgress(Number(e.target.value) / 1000);
              }}
              className="h-2 w-full cursor-pointer accent-[#1D4ED8]"
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-[#526072] tabular-nums">
              <span data-testid="replay-progress-percent">
                Progress: {Math.round(progress * 100)}%
              </span>
              <span data-testid="replay-distance-covered">
                Covered: {formatDistanceKm(replaySnapshot?.distanceCoveredKm ?? 0)} /{' '}
                {formatDistanceKm(journey.stats.totalDistanceKm)}
              </span>
              <span>Speed: {formatSpeedKmh(replaySnapshot?.currentSpeedKmh ?? 0)}</span>
              <span>Elapsed: {formatClock(replaySnapshot?.elapsedSec ?? 0)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Journey Statistics Grid */}
      <section aria-label="Journey statistics">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-[#E5E8EE] bg-white p-4">
            <p className="text-xs text-[#526072]">Total Distance</p>
            <p className="mt-1.5 font-mono text-lg font-semibold text-[#0F172A] tabular-nums">
              {formatDistanceKm(journey.stats.totalDistanceKm)}
            </p>
          </div>
          <div className="rounded-xl border border-[#E5E8EE] bg-white p-4">
            <p className="text-xs text-[#526072]">Average Speed</p>
            <p className="mt-1.5 font-mono text-lg font-semibold text-[#0F172A] tabular-nums">
              {formatSpeedKmh(journey.stats.avgSpeedKmh)}
            </p>
          </div>
          <div className="rounded-xl border border-[#E5E8EE] bg-white p-4">
            <p className="text-xs text-[#526072]">Maximum Speed</p>
            <p className="mt-1.5 font-mono text-lg font-semibold text-[#0F172A] tabular-nums">
              {formatSpeedKmh(journey.stats.maxSpeedKmh)}
            </p>
          </div>
          <div className="rounded-xl border border-[#E5E8EE] bg-white p-4">
            <p className="text-xs text-[#526072]">Total Duration</p>
            <p className="mt-1.5 font-mono text-lg font-semibold text-[#0F172A] tabular-nums">
              {formatDuration(journey.stats.totalDurationSec)}
            </p>
          </div>
          <div className="rounded-xl border border-[#E5E8EE] bg-white p-4">
            <p className="text-xs text-[#526072]">Moving Time</p>
            <p className="mt-1.5 font-mono text-lg font-semibold text-[#0F172A] tabular-nums">
              {formatDuration(journey.stats.movingTimeSec)}
            </p>
          </div>
          <div className="rounded-xl border border-[#E5E8EE] bg-white p-4">
            <p className="text-xs text-[#526072]">Stopped Time</p>
            <p className="mt-1.5 font-mono text-lg font-semibold text-[#0F172A] tabular-nums">
              {formatDuration(journey.stats.stoppedTimeSec)}
            </p>
          </div>
        </div>
      </section>

      {/* Speed Profile & Detected Stops Breakdown */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-[#E5E8EE] bg-white p-6 lg:col-span-7">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-[#0F172A]">Speed Profile</h2>
            <span className="font-mono text-xs text-[#526072] tabular-nums">
              {journey.points.length} GPS samples · {journey.filteredJumpCount} jumps
              filtered
            </span>
          </div>
          <div className="mt-4 h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={speedProfileData}
                margin={{top: 8, right: 12, left: -12, bottom: 0}}
              >
                <CartesianGrid stroke="#EEF1F6" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="elapsedLabel"
                  tick={{fontSize: 11, fill: '#64748B'}}
                  axisLine={{stroke: '#E5E8EE'}}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{fontSize: 11, fill: '#64748B'}}
                  axisLine={false}
                  tickLine={false}
                  unit=" km/h"
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    borderColor: '#E5E8EE',
                    fontSize: '12px',
                  }}
                  formatter={(val: unknown) => [`${Number(val).toFixed(1)} km/h`, 'Speed']}
                />
                <Area
                  type="monotone"
                  dataKey="speedKmh"
                  stroke={ACTIVITY_META[journey.activity].strokeColor}
                  fill={ACTIVITY_META[journey.activity].strokeColor}
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-[#E5E8EE] bg-white p-6 lg:col-span-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-[#0F172A]">
              Detected Stopping Locations
            </h2>
            <span className="font-mono text-xs text-[#526072] tabular-nums">
              {journey.stops.length} {journey.stops.length === 1 ? 'stop' : 'stops'}
            </span>
          </div>

          {journey.stops.length === 0 ? (
            <p className="mt-4 text-sm text-[#526072]">
              No sustained stops (≥ 45 seconds) were detected during this journey.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[#E5E8EE]">
              {journey.stops.map((stop, idx) => (
                <li
                  key={stop.id}
                  className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-[#0F172A]">
                      {idx + 1}. {stop.label}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-[#526072] tabular-nums">
                      {formatTimeShort(stop.startTime)} – {formatTimeShort(stop.endTime)}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#64748B] tabular-nums">
                      {formatCoordinates(stop.lat, stop.lng)}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-semibold text-[#B45309] tabular-nums shrink-0">
                    {formatDuration(stop.durationSec)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Start & End Location Coordinates */}
          <div className="mt-5 space-y-2 border-t border-[#E5E8EE] pt-4 text-xs">
            <div className="flex justify-between gap-3">
              <span className="font-medium text-[#059669]">Start Point</span>
              <span className="text-right text-[#0F172A]">{journey.startLocation}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-medium text-[#DC2626]">End Point</span>
              <span className="text-right text-[#0F172A]">{journey.endLocation}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
