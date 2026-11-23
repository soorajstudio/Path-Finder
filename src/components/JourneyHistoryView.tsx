import React, {useMemo, useState} from 'react';
import {Calendar, ChevronRight, Search, Trash2, X} from 'lucide-react';
import type {Journey, TimeframeFilter, TravelActivity} from '../types/journey';
import {filterJourneys} from '../utils/analytics';
import {
  ACTIVITY_META,
  ALL_ACTIVITIES,
  formatDateTime,
  formatDistanceKm,
  formatDuration,
  formatSpeedKmh,
} from '../utils/format';
import {RouteMiniMap} from './RouteMiniMap';

interface JourneyHistoryViewProps {
  journeys: Journey[];
  onSelectJourney: (journeyId: string) => void;
  onDeleteJourney: (journeyId: string) => void;
  onStartLiveTracking: () => void;
}

const TIMEFRAMES: Array<{id: TimeframeFilter; label: string}> = [
  {id: 'all', label: 'All Time'},
  {id: 'day', label: 'Today'},
  {id: 'week', label: 'Week'},
  {id: 'month', label: 'Month'},
  {id: 'year', label: 'Year'},
];

export const JourneyHistoryView: React.FC<JourneyHistoryViewProps> = ({
  journeys,
  onSelectJourney,
  onDeleteJourney,
  onStartLiveTracking,
}) => {
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('all');
  const [activity, setActivity] = useState<TravelActivity | 'all'>('all');
  const [dateQuery, setDateQuery] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      filterJourneys(journeys, {
        timeframe,
        dateQuery,
        activity,
      }),
    [journeys, timeframe, dateQuery, activity]
  );

  const filteredSummary = useMemo(() => {
    const distance = filtered.reduce((s, j) => s + j.stats.totalDistanceKm, 0);
    const duration = filtered.reduce((s, j) => s + j.stats.totalDurationSec, 0);
    return {distance, duration};
  }, [filtered]);

  const hasActiveFilters =
    timeframe !== 'all' || activity !== 'all' || dateQuery.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[#E5E8EE] pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Journey History
          </h1>
          <p className="mt-1 text-sm text-[#526072] tabular-nums">
            {filtered.length} {filtered.length === 1 ? 'journey' : 'journeys'} ·{' '}
            {formatDistanceKm(filteredSummary.distance)} total ·{' '}
            {formatDuration(filteredSummary.duration)}
          </p>
        </div>

        {/* Timeframe Filter Segmented Control */}
        <div
          className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-[#EEF1F6] p-1"
          role="group"
          aria-label="Filter journeys by timeframe"
        >
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              type="button"
              onClick={() => setTimeframe(tf.id)}
              aria-pressed={timeframe === tf.id}
              className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                timeframe === tf.id
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'text-[#526072] hover:text-[#0F172A]'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search by Date / Location & Activity Filter Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="relative sm:col-span-6">
          <label htmlFor="history-search-input" className="sr-only">
            Search journeys by date, title, or location
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]"
            aria-hidden="true"
          />
          <input
            id="history-search-input"
            type="search"
            value={dateQuery}
            onChange={(e) => setDateQuery(e.target.value)}
            placeholder="Search by date (e.g. 2026-11-22, Nov 2026) or location…"
            className="min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white py-2 pl-10 pr-9 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1D4ED8] focus:outline-none"
          />
          {dateQuery && (
            <button
              type="button"
              onClick={() => setDateQuery('')}
              aria-label="Clear search query"
              className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#64748B] hover:bg-slate-100 hover:text-[#0F172A]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="relative sm:col-span-3">
          <label htmlFor="history-date-picker" className="sr-only">
            Pick exact journey date
          </label>
          <Calendar
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]"
            aria-hidden="true"
          />
          <input
            id="history-date-picker"
            type="date"
            aria-label="Filter by exact date"
            value={/^\d{4}-\d{2}-\d{2}$/.test(dateQuery) ? dateQuery : ''}
            onChange={(e) => setDateQuery(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white py-2 pl-9 pr-3 font-mono text-xs text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
          />
        </div>

        <div className="sm:col-span-3">
          <label htmlFor="history-activity-select" className="sr-only">
            Filter by travel activity
          </label>
          <select
            id="history-activity-select"
            value={activity}
            onChange={(e) => setActivity(e.target.value as TravelActivity | 'all')}
            className="min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
          >
            <option value="all">All Travel Modes</option>
            {ALL_ACTIVITIES.map((act) => (
              <option key={act} value={act}>
                {ACTIVITY_META[act].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Journey List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[#E5E8EE] bg-white px-6 py-12 text-center">
          <p className="text-base font-semibold text-[#0F172A]">
            {hasActiveFilters
              ? 'No journeys match your filters'
              : 'No completed journeys saved yet'}
          </p>
          <p className="mt-1.5 text-sm text-[#526072]">
            {hasActiveFilters
              ? 'Try widening your timeframe or clearing the date search.'
              : 'Record a journey in Live Tracking to build your personal travel log.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={() => {
                  setTimeframe('all');
                  setActivity('all');
                  setDateQuery('');
                }}
                className="min-h-[42px] rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
              >
                Clear Filters
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartLiveTracking}
                className="min-h-[42px] rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E40AF]"
              >
                Start Live Journey
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul data-testid="journey-history-list" className="space-y-3">
          {filtered.map((journey) => {
            const isConfirmingDelete = confirmDeleteId === journey.id;
            return (
              <li
                key={journey.id}
                className="rounded-xl border border-[#E5E8EE] bg-white p-4 transition-colors hover:border-[#CBD5E1]"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  {/* Small Route Map Preview */}
                  <button
                    type="button"
                    onClick={() => onSelectJourney(journey.id)}
                    aria-label={`Open route preview for ${journey.title}`}
                    className="self-start shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
                  >
                    <RouteMiniMap
                      points={journey.points}
                      stops={journey.stops}
                      activity={journey.activity}
                      width={152}
                      height={84}
                    />
                  </button>

                  {/* Core Metadata & Locations */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectJourney(journey.id)}
                        className="truncate text-left text-base font-semibold text-[#0F172A] hover:text-[#1D4ED8]"
                      >
                        {journey.title}
                      </button>
                      <span className="text-xs text-[#64748B]">
                        {ACTIVITY_META[journey.activity].label} ·{' '}
                        {formatDateTime(journey.startTime)}
                        {journey.recordedOffline ? ' · Offline GPS' : ''}
                      </span>
                    </div>

                    <p className="mt-1.5 text-sm text-[#475569]">
                      <span className="font-medium text-[#0F172A]">Start:</span>{' '}
                      {journey.startLocation}{' '}
                      <span className="mx-1.5 text-[#94A3B8]" aria-hidden="true">
                        →
                      </span>{' '}
                      <span className="font-medium text-[#0F172A]">End:</span>{' '}
                      {journey.endLocation}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs text-[#526072] tabular-nums">
                      <span className="font-semibold text-[#0F172A]">
                        {formatDistanceKm(journey.stats.totalDistanceKm)}
                      </span>
                      <span>Duration {formatDuration(journey.stats.totalDurationSec)}</span>
                      <span>Avg {formatSpeedKmh(journey.stats.avgSpeedKmh)}</span>
                      <span>
                        {journey.stops.length}{' '}
                        {journey.stops.length === 1 ? 'stop' : 'stops'}
                      </span>
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center justify-end gap-2 border-t border-[#E5E8EE] pt-3 md:border-t-0 md:pt-0 shrink-0">
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteJourney(journey.id);
                            setConfirmDeleteId(null);
                          }}
                          className="min-h-[38px] rounded-lg bg-[#DC2626] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#B91C1C] whitespace-nowrap"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[38px] rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-medium text-[#526072] hover:bg-[#F8FAFC] whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelectJourney(journey.id)}
                          aria-label={`View details for ${journey.title}`}
                          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#F8FAFC] whitespace-nowrap"
                        >
                          <span>Details</span>
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(journey.id)}
                          aria-label={`Delete ${journey.title}`}
                          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-[#E5E8EE] text-[#64748B] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-[#DC2626]"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
