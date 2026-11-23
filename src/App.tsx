import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {APIProvider} from '@vis.gl/react-google-maps';
import {
  BarChart3,
  Clock,
  LayoutDashboard,
  Map as MapIcon,
  Navigation,
} from 'lucide-react';
import type {AppModule, Journey} from './types/journey';
import {loadJourneys, saveJourneys} from './utils/storage';
import {useLiveTracker} from './hooks/useLiveTracker';
import {DashboardView} from './components/DashboardView';
import {LiveTrackingView} from './components/LiveTrackingView';
import {JourneyHistoryView} from './components/JourneyHistoryView';
import {JourneyDetailsView} from './components/JourneyDetailsView';
import {TravelMapView} from './components/TravelMapView';
import {TravelInsightsView} from './components/TravelInsightsView';

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';

const NAV_ITEMS: Array<{
  id: Exclude<AppModule, 'details'>;
  label: string;
  mobileLabel: string;
  Icon: React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>;
}> = [
  {id: 'dashboard', label: 'Dashboard', mobileLabel: 'Overview', Icon: LayoutDashboard},
  {id: 'live', label: 'Live Track', mobileLabel: 'Track', Icon: Navigation},
  {id: 'history', label: 'History', mobileLabel: 'History', Icon: Clock},
  {id: 'map', label: 'Travel Map', mobileLabel: 'Map', Icon: MapIcon},
  {id: 'insights', label: 'Insights', mobileLabel: 'Insights', Icon: BarChart3},
];

export default function App() {
  const [journeys, setJourneys] = useState<Journey[]>(() => loadJourneys());
  const [activeModule, setActiveModule] = useState<AppModule>('dashboard');
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(false);

  const tracker = useLiveTracker();

  // Persist journeys locally on every change
  useEffect(() => {
    saveJourneys(journeys);
  }, [journeys]);

  // Listen to Google Maps Platform Demo Key quota exhaustion events
  useEffect(() => {
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const selectedJourney = useMemo(
    () => journeys.find((j) => j.id === selectedJourneyId) ?? journeys[0] ?? null,
    [journeys, selectedJourneyId]
  );

  const handleOpenJourney = useCallback((journeyId: string) => {
    setSelectedJourneyId(journeyId);
    setActiveModule('details');
  }, []);

  const handleJourneySaved = useCallback((journey: Journey) => {
    setJourneys((prev) => [journey, ...prev]);
    setSelectedJourneyId(journey.id);
    setActiveModule('details');
  }, []);

  const handleDeleteJourney = useCallback((journeyId: string) => {
    setJourneys((prev) => prev.filter((j) => j.id !== journeyId));
    setSelectedJourneyId((prevId) => (prevId === journeyId ? null : prevId));
    setActiveModule((curr) => (curr === 'details' ? 'history' : curr));
  }, []);

  const hasApiKey = MAPS_API_KEY.trim().length > 0;
  const isTrackingActive = tracker.status !== 'idle';

  const appShell = (
    <div
      data-testid="path-tracker-app"
      data-active-module={activeModule}
      className="flex min-h-screen flex-col bg-[#F7F8FA] text-[#0F172A]"
    >
      {/* Required Google Maps Platform Demo Key Quota Banner */}
      {quotaExceeded && (
        <div
          role="alert"
          className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-900 shadow-sm md:text-sm"
        >
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-950 underline hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Desktop Top Bar (3-zone contract: Brand — 5 single-line nav links — 1 primary CTA) */}
      <header className="sticky top-0 z-30 border-b border-[#E5E8EE] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[52px] max-w-[1320px] items-center justify-between gap-8 px-4 sm:px-6 md:h-16">
          {/* Zone 1: Single-line Wordmark */}
          <button
            type="button"
            onClick={() => setActiveModule('dashboard')}
            className="font-display text-lg font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            Path Tracker
          </button>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-6 md:flex"
          >
            {NAV_ITEMS.map((item) => {
              const isCurrent =
                activeModule === item.id ||
                (activeModule === 'details' && item.id === 'history');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveModule(item.id)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isCurrent
                      ? 'text-[#0F172A] after:absolute after:inset-x-0 after:-bottom-[1px] after:h-0.5 after:bg-[#1D4ED8]'
                      : 'text-[#526072] hover:text-[#0F172A]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveModule('live')}
              className={`inline-flex min-h-[38px] items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isTrackingActive
                  ? 'bg-[#059669] text-white hover:bg-[#047857]'
                  : 'bg-[#1D4ED8] text-white hover:bg-[#1E40AF]'
              }`}
            >
              {isTrackingActive ? 'Active Journey' : 'Track Live'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-12 md:pt-8">
        {activeModule === 'dashboard' && (
          <DashboardView
            journeys={journeys}
            hasActiveTracking={isTrackingActive}
            onStartLiveTracking={() => setActiveModule('live')}
            onOpenHistory={() => setActiveModule('history')}
            onOpenInsights={() => setActiveModule('insights')}
            onOpenMap={() => setActiveModule('map')}
            onSelectJourney={handleOpenJourney}
          />
        )}

        {activeModule === 'live' && (
          <LiveTrackingView
            tracker={tracker}
            hasApiKey={hasApiKey}
            quotaExceeded={quotaExceeded}
            onJourneySaved={handleJourneySaved}
          />
        )}

        {activeModule === 'history' && (
          <JourneyHistoryView
            journeys={journeys}
            onSelectJourney={handleOpenJourney}
            onDeleteJourney={handleDeleteJourney}
            onStartLiveTracking={() => setActiveModule('live')}
          />
        )}

        {activeModule === 'details' && selectedJourney && (
          <JourneyDetailsView
            journey={selectedJourney}
            isOnline={tracker.isOnline}
            hasApiKey={hasApiKey}
            quotaExceeded={quotaExceeded}
            onBack={() => setActiveModule('history')}
            onDelete={handleDeleteJourney}
          />
        )}

        {activeModule === 'map' && (
          <TravelMapView
            journeys={journeys}
            livePoints={tracker.points}
            liveActivity={tracker.activity}
            isTrackingActive={isTrackingActive}
            isOnline={tracker.isOnline}
            hasApiKey={hasApiKey}
            quotaExceeded={quotaExceeded}
            onOpenJourneyDetails={handleOpenJourney}
          />
        )}

        {activeModule === 'insights' && (
          <TravelInsightsView
            journeys={journeys}
            onSelectJourney={handleOpenJourney}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (60px height; combined with 52px header = 112px < 15% of 844px) */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-40 grid h-[60px] grid-cols-5 border-t border-[#E5E8EE] bg-white/95 backdrop-blur-md md:hidden"
      >
        {NAV_ITEMS.map(({id, mobileLabel, Icon}) => {
          const isCurrent =
            activeModule === id || (activeModule === 'details' && id === 'history');
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveModule(id)}
              aria-current={isCurrent ? 'page' : undefined}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                isCurrent ? 'text-[#1D4ED8]' : 'text-[#526072]'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden={true} />
              <span className="whitespace-nowrap">{mobileLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  if (!hasApiKey) {
    return appShell;
  }

  return (
    <APIProvider
      apiKey={MAPS_API_KEY}
      libraries={['maps', 'marker']}
      language="en"
      region="US"
    >
      {appShell}
    </APIProvider>
  );
}
