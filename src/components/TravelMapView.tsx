import React, {useMemo, useState} from 'react';
import {ChevronRight} from 'lucide-react';
import type {Journey, LatLngPoint, TravelActivity} from '../types/journey';
import {
  ACTIVITY_META,
  ALL_ACTIVITIES,
  formatDateShort,
  formatDistanceKm,
  formatDuration,
} from '../utils/format';
import {InteractiveRouteMap, type MapRouteSeries} from './InteractiveRouteMap';

interface TravelMapViewProps {
  journeys: Journey[];
  livePoints: LatLngPoint[];
  liveActivity: TravelActivity;
  isTrackingActive: boolean;
  isOnline: boolean;
  hasApiKey: boolean;
  quotaExceeded: boolean;
  onOpenJourneyDetails: (journeyId: string) => void;
}

export const TravelMapView: React.FC<TravelMapViewProps> = ({
  journeys,
  livePoints,
  liveActivity,
  isTrackingActive,
  isOnline,
  hasApiKey,
  quotaExceeded,
  onOpenJourneyDetails,
}) => {
  const [selectedActivity, setSelectedActivity] = useState<TravelActivity | 'all'>('all');
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [showStops, setShowStops] = useState<boolean>(true);

  const visibleJourneys = useMemo(
    () =>
      selectedActivity === 'all'
        ? journeys
        : journeys.filter((j) => j.activity === selectedActivity),
    [journeys, selectedActivity]
  );

  const selectedJourney = useMemo(
    () => visibleJourneys.find((j) => j.id === selectedJourneyId) ?? null,
    [visibleJourneys, selectedJourneyId]
  );

  const mapRoutes = useMemo<MapRouteSeries[]>(() => {
    const series: MapRouteSeries[] = visibleJourneys.map((j) => ({
      id: j.id,
      title: j.title,
      activity: j.activity,
      points: j.points,
      stops: j.stops,
      selected: selectedJourneyId === j.id,
      dimmed: selectedJourneyId !== null && selectedJourneyId !== j.id,
    }));

    if (isTrackingActive && livePoints.length > 0) {
      series.unshift({
        id: 'active-live-overlay',
        title: 'Live Active Journey',
        activity: liveActivity,
        points: livePoints,
        stops: [],
        selected: selectedJourneyId === null,
      });
    }
    return series;
  }, [visibleJourneys, selectedJourneyId, isTrackingActive, livePoints, liveActivity]);

  const livePos =
    isTrackingActive && livePoints.length > 0
      ? livePoints[livePoints.length - 1]
      : null;

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col justify-between gap-4 border-b border-[#E5E8EE] pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Interactive Travel Map
          </h1>
          <p className="mt-1 text-sm text-[#526072] tabular-nums">
            Viewing {visibleJourneys.length}{' '}
            {visibleJourneys.length === 1 ? 'recorded route' : 'recorded routes'}
            {isTrackingActive ? ' plus live GPS path' : ''}. Click any route to inspect.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A]">
            <input
              type="checkbox"
              checked={showStops}
              onChange={(e) => setShowStops(e.target.checked)}
              className="h-4 w-4 accent-[#1D4ED8]"
            />
            <span>Show Stop Markers</span>
          </label>

          <select
            aria-label="Filter map routes by travel activity"
            value={selectedActivity}
            onChange={(e) => {
              setSelectedActivity(e.target.value as TravelActivity | 'all');
              setSelectedJourneyId(null);
            }}
            className="min-h-[40px] rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none"
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

      {/* Map + Route Directory Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <InteractiveRouteMap
            routes={mapRoutes}
            livePosition={livePos}
            showStops={showStops}
            onSelectRoute={(id) => {
              if (id !== 'active-live-overlay') {
                setSelectedJourneyId((prev) => (prev === id ? null : id));
              }
            }}
            heightClass="h-[420px] sm:h-[560px] lg:h-[620px]"
            isOnline={isOnline}
            hasApiKey={hasApiKey}
            quotaExceeded={quotaExceeded}
            testId="travel-atlas-map"
          />

          {/* Compact Color Key */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#E5E8EE] bg-white px-4 py-2.5 text-xs text-[#526072]">
            {ALL_ACTIVITIES.filter((a) => a !== 'other').map((act) => (
              <span key={act} className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-1.5 w-4 rounded-full"
                  style={{backgroundColor: ACTIVITY_META[act].strokeColor}}
                  aria-hidden="true"
                />
                <span>{ACTIVITY_META[act].label}</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full bg-[#D97706]"
                aria-hidden="true"
              />
              <span>Stop</span>
            </span>
          </div>
        </div>

        {/* Route Selector Sidebar */}
        <aside className="flex flex-col rounded-xl border border-[#E5E8EE] bg-white lg:col-span-4 lg:max-h-[676px]">
          <div className="flex items-center justify-between border-b border-[#E5E8EE] px-4 py-3.5">
            <h2 className="text-sm font-semibold text-[#0F172A]">Recorded Routes</h2>
            {selectedJourneyId && (
              <button
                type="button"
                onClick={() => setSelectedJourneyId(null)}
                className="text-xs font-medium text-[#1D4ED8] hover:underline"
              >
                Show All Routes
              </button>
            )}
          </div>

          {selectedJourney && (
            <div className="border-b border-[#E5E8EE] bg-[#F8FAFC] p-4">
              <p className="text-xs font-medium text-[#526072]">Selected Route</p>
              <p className="mt-1 text-sm font-semibold text-[#0F172A]">
                {selectedJourney.title}
              </p>
              <p className="mt-0.5 text-xs text-[#526072]">
                {selectedJourney.startLocation} → {selectedJourney.endLocation}
              </p>
              <p className="mt-2 font-mono text-xs text-[#0F172A] tabular-nums">
                {formatDistanceKm(selectedJourney.stats.totalDistanceKm)} ·{' '}
                {formatDuration(selectedJourney.stats.totalDurationSec)} ·{' '}
                {selectedJourney.stops.length} stops
              </p>
              <button
                type="button"
                onClick={() => onOpenJourneyDetails(selectedJourney.id)}
                className="mt-3 inline-flex min-h-[38px] w-full items-center justify-center gap-1 rounded-lg bg-[#1D4ED8] px-3 py-2 text-xs font-medium text-white hover:bg-[#1E40AF]"
              >
                <span>Open Journey Details & Replay</span>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          <ul className="divide-y divide-[#E5E8EE] overflow-y-auto">
            {visibleJourneys.length === 0 ? (
              <li className="p-6 text-center text-xs text-[#526072]">
                No routes recorded for this travel mode.
              </li>
            ) : (
              visibleJourneys.map((journey) => {
                const isSelected = selectedJourneyId === journey.id;
                return (
                  <li key={journey.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedJourneyId(isSelected ? null : journey.id)
                      }
                      aria-pressed={isSelected}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-[#EFF6FF]'
                          : 'hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-medium ${
                            isSelected ? 'text-[#1D4ED8]' : 'text-[#0F172A]'
                          }`}
                        >
                          {journey.title}
                        </p>
                        <p className="mt-0.5 text-xs text-[#64748B]">
                          {ACTIVITY_META[journey.activity].label} ·{' '}
                          {formatDateShort(journey.startTime)}
                        </p>
                      </div>
                      <span className="font-mono text-xs font-semibold text-[#0F172A] tabular-nums shrink-0">
                        {formatDistanceKm(journey.stats.totalDistanceKm)}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
};
