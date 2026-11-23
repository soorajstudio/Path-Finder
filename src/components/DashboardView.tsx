import React, {useMemo} from 'react';
import {ArrowRight, ChevronRight, MapPin, Play} from 'lucide-react';
import type {Journey} from '../types/journey';
import {computeDashboardMetrics, computeMonthlyInsights} from '../utils/analytics';
import {
  ACTIVITY_META,
  formatDateTime,
  formatDistanceKm,
  formatDuration,
} from '../utils/format';
import {RouteMiniMap} from './RouteMiniMap';

interface DashboardViewProps {
  journeys: Journey[];
  hasActiveTracking: boolean;
  onStartLiveTracking: () => void;
  onOpenHistory: () => void;
  onOpenInsights: () => void;
  onOpenMap: () => void;
  onSelectJourney: (journeyId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  journeys,
  hasActiveTracking,
  onStartLiveTracking,
  onOpenHistory,
  onOpenInsights,
  onOpenMap,
  onSelectJourney,
}) => {
  const referenceDate = useMemo(() => new Date(), []);
  const metrics = useMemo(
    () => computeDashboardMetrics(journeys, referenceDate),
    [journeys, referenceDate]
  );

  const currentYear = referenceDate.getFullYear();
  const currentMonthName = referenceDate.toLocaleDateString('en-US', {
    month: 'long',
  });

  const recentMonthly = useMemo(() => {
    const allMonths = computeMonthlyInsights(journeys, currentYear);
    const activeMonths = allMonths.filter((m) => m.journeyCount > 0);
    return activeMonths.slice(-6);
  }, [journeys, currentYear]);

  const maxMonthDist = useMemo(
    () => Math.max(1, ...recentMonthly.map((m) => m.distanceKm)),
    [recentMonthly]
  );

  const recentJourneys = useMemo(() => journeys.slice(0, 4), [journeys]);

  return (
    <div className="space-y-8">
      {/* Page Title & Primary Action */}
      <section className="flex flex-col justify-between gap-4 border-b border-[#E5E8EE] pb-6 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-[#526072]">
            Personal GPS travel log · Stored locally on this device
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl [text-wrap:balance]">
            Travel Overview
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#526072]">
            Record personal journeys in real time, review exact GPS routes on interactive
            maps, and track your cumulative distance and travel time.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onStartLiveTracking}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] whitespace-nowrap shrink-0"
          >
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            <span>{hasActiveTracking ? 'Resume Live Tracking' : 'Start Journey'}</span>
          </button>
        </div>
      </section>

      {/* Primary KPI Grid — 6 Core Statistics */}
      <section aria-label="Overall travel statistics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-[#E5E8EE] bg-white p-5">
            <p className="text-xs font-medium text-[#526072]">Total Distance Travelled</p>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-[#0F172A] tabular-nums">
              {metrics.totalDistanceKm.toFixed(1)}{' '}
              <span className="text-sm font-normal text-[#526072]">km</span>
            </p>
            <p className="mt-2 text-xs text-[#526072] tabular-nums">
              Across all {metrics.totalJourneys} recorded journeys
            </p>
          </div>

          <div className="rounded-xl border border-[#E5E8EE] bg-white p-5">
            <p className="text-xs font-medium text-[#526072]">Total Journeys</p>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-[#0F172A] tabular-nums">
              {metrics.totalJourneys}
            </p>
            <p className="mt-2 text-xs text-[#526072] tabular-nums">
              {metrics.currentYearJourneys} recorded in {currentYear}
            </p>
          </div>

          <div className="rounded-xl border border-[#E5E8EE] bg-white p-5">
            <p className="text-xs font-medium text-[#526072]">Total Travel Duration</p>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-[#0F172A] tabular-nums">
              {formatDuration(metrics.totalDurationSec)}
            </p>
            <p className="mt-2 text-xs text-[#526072] tabular-nums">
              Includes {formatDuration(metrics.totalStoppedTimeSec)} stopped time
            </p>
          </div>

          <div className="rounded-xl border border-[#E5E8EE] bg-white p-5">
            <p className="text-xs font-medium text-[#526072]">Total Moving Time</p>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-[#0F172A] tabular-nums">
              {formatDuration(metrics.totalMovingTimeSec)}
            </p>
            <p className="mt-2 text-xs text-[#526072] tabular-nums">
              {metrics.totalDurationSec > 0
                ? `${Math.round(
                    (metrics.totalMovingTimeSec / metrics.totalDurationSec) * 100
                  )}% active movement`
                : 'No movement recorded yet'}
            </p>
          </div>

          <div className="rounded-xl border border-[#E5E8EE] bg-white p-5">
            <p className="text-xs font-medium text-[#526072]">Longest Journey</p>
            {metrics.longestJourney ? (
              <>
                <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-[#0F172A] tabular-nums">
                  {metrics.longestJourney.stats.totalDistanceKm.toFixed(1)}{' '}
                  <span className="text-sm font-normal text-[#526072]">km</span>
                </p>
                <button
                  type="button"
                  onClick={() => onSelectJourney(metrics.longestJourney!.id)}
                  className="mt-2 inline-flex max-w-full items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline"
                >
                  <span className="truncate">{metrics.longestJourney.title}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
              </>
            ) : (
              <p className="mt-2 font-mono text-2xl font-semibold text-[#0F172A] tabular-nums">
                0.0 km
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[#E5E8EE] bg-white p-5">
            <p className="text-xs font-medium text-[#526072]">Average Journey Distance</p>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-[#0F172A] tabular-nums">
              {metrics.averageDistanceKm.toFixed(1)}{' '}
              <span className="text-sm font-normal text-[#526072]">km</span>
            </p>
            <p className="mt-2 text-xs text-[#526072]">
              Mean distance per saved route
            </p>
          </div>
        </div>
      </section>

      {/* Monthly & Yearly Summary + Recent Activity Rhythm */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Monthly & Yearly Period Breakdown */}
        <div className="rounded-xl border border-[#E5E8EE] bg-white p-6 lg:col-span-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-[#0F172A]">
              Monthly & Yearly Summary
            </h2>
            <button
              type="button"
              onClick={onOpenInsights}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap shrink-0"
            >
              <span>Full Insights</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 divide-y divide-[#E5E8EE]">
            <div className="flex items-baseline justify-between py-3.5 first:pt-0">
              <div>
                <p className="text-sm font-medium text-[#0F172A]">
                  {currentMonthName} {currentYear}
                </p>
                <p className="mt-0.5 text-xs text-[#526072] tabular-nums">
                  {metrics.currentMonthJourneys}{' '}
                  {metrics.currentMonthJourneys === 1 ? 'journey' : 'journeys'} this month
                </p>
              </div>
              <p className="font-mono text-lg font-semibold text-[#0F172A] tabular-nums">
                {metrics.currentMonthDistanceKm.toFixed(1)} km
              </p>
            </div>

            <div className="flex items-baseline justify-between py-3.5">
              <div>
                <p className="text-sm font-medium text-[#0F172A]">Year {currentYear}</p>
                <p className="mt-0.5 text-xs text-[#526072] tabular-nums">
                  {metrics.currentYearJourneys}{' '}
                  {metrics.currentYearJourneys === 1 ? 'journey' : 'journeys'} recorded
                </p>
              </div>
              <p className="font-mono text-lg font-semibold text-[#0F172A] tabular-nums">
                {metrics.currentYearDistanceKm.toFixed(1)} km
              </p>
            </div>
          </div>

          {/* Compact Recent Months Bar Distribution */}
          <div className="mt-5 border-t border-[#E5E8EE] pt-5">
            <p className="text-xs font-medium text-[#526072]">
              Active months in {currentYear}
            </p>
            {recentMonthly.length === 0 ? (
              <p className="mt-3 text-xs text-[#526072]">
                No journeys logged in {currentYear} yet.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {recentMonthly.map((m) => (
                  <div key={m.monthLabel} className="flex items-center gap-3">
                    <span className="w-8 text-xs font-medium text-[#526072]">
                      {m.monthLabel}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F1F5F9]">
                      <div
                        className="h-full rounded-full bg-[#1D4ED8]"
                        style={{
                          width: `${Math.max(
                            6,
                            Math.round((m.distanceKm / maxMonthDist) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="w-16 text-right font-mono text-xs text-[#0F172A] tabular-nums">
                      {m.distanceKm.toFixed(1)} km
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Recorded Journeys */}
        <div className="rounded-xl border border-[#E5E8EE] bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-[#0F172A]">Recent Journeys</h2>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={onOpenMap}
                className="text-xs font-medium text-[#526072] hover:text-[#0F172A] whitespace-nowrap shrink-0"
              >
                Explore Travel Map
              </button>
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline whitespace-nowrap shrink-0"
              >
                <span>View All</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {recentJourneys.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-[#CBD5E1] p-8 text-center">
              <MapPin className="mx-auto h-6 w-6 text-[#94A3B8]" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-[#0F172A]">
                No journeys recorded yet
              </p>
              <p className="mt-1 text-xs text-[#526072]">
                Start live GPS tracking to record your first route and view travel
                statistics here.
              </p>
              <button
                type="button"
                onClick={onStartLiveTracking}
                className="mt-4 inline-flex min-h-[40px] items-center justify-center rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E40AF]"
              >
                Start First Journey
              </button>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[#E5E8EE]">
              {recentJourneys.map((journey) => (
                <li key={journey.id} className="py-3.5 first:pt-1 last:pb-0">
                  <button
                    type="button"
                    onClick={() => onSelectJourney(journey.id)}
                    className="group flex w-full flex-col gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-[#F8FAFC] sm:flex-row sm:items-center"
                  >
                    <RouteMiniMap
                      points={journey.points}
                      stops={journey.stops}
                      activity={journey.activity}
                      width={116}
                      height={64}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#0F172A] group-hover:text-[#1D4ED8]">
                        {journey.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[#526072]">
                        {journey.startLocation} → {journey.endLocation}
                      </p>
                      <p className="mt-1 text-xs text-[#64748B]">
                        {ACTIVITY_META[journey.activity].label} ·{' '}
                        {formatDateTime(journey.startTime)} · {journey.stops.length}{' '}
                        {journey.stops.length === 1 ? 'stop' : 'stops'}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-0.5 shrink-0">
                      <span className="font-mono text-sm font-semibold text-[#0F172A] tabular-nums">
                        {formatDistanceKm(journey.stats.totalDistanceKm)}
                      </span>
                      <span className="font-mono text-xs text-[#526072] tabular-nums">
                        {formatDuration(journey.stats.totalDurationSec)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
