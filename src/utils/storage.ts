import type {ActiveSession, Journey} from '../types/journey';
import {createSeedJourneys} from '../data/seedJourneys';

const JOURNEYS_KEY = 'pathtracker_journeys_v1';
const ACTIVE_SESSION_KEY = 'pathtracker_active_session_v1';

export function loadJourneys(): Journey[] {
  try {
    const raw = window.localStorage.getItem(JOURNEYS_KEY);
    if (!raw) {
      const seeds = createSeedJourneys();
      saveJourneys(seeds);
      return seeds;
    }
    const parsed = JSON.parse(raw) as Journey[];
    if (!Array.isArray(parsed)) {
      const seeds = createSeedJourneys();
      saveJourneys(seeds);
      return seeds;
    }
    return parsed.sort((a, b) => b.startTime - a.startTime);
  } catch {
    return createSeedJourneys();
  }
}

export function saveJourneys(journeys: Journey[]): void {
  try {
    window.localStorage.setItem(JOURNEYS_KEY, JSON.stringify(journeys));
  } catch {
    // Storage quota exceeded or unavailable; keep in-memory state intact
  }
}

export function loadActiveSession(): ActiveSession | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSession;
    if (!parsed || !parsed.id || parsed.status === 'idle') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveSession(session: ActiveSession | null): void {
  try {
    if (!session || session.status === 'idle') {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}
