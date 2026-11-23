import type {
  Journey,
  TimeframeFilter,
  TravelActivity,
} from '../types/journey';

export interface DashboardMetrics {
  totalDistanceKm: number;
  totalJourneys: number;
  totalDurationSec: number;
  totalMovingTimeSec: number;
  totalStoppedTimeSec: number;
  longestJourney: Journey | null;
  averageDistanceKm: number;
  currentMonthDistanceKm: number;
  currentMonthJourneys: number;
  currentYearDistanceKm: number;
  currentYearJourneys: number;
}

export interface MonthlyInsightPoint {
  monthIndex: number;
  monthLabel: string;
  distanceKm: number;
  journeyCount: number;
  durationHours: number;
  avgDistanceKm: number;
}

export interface YearlyComparisonPoint {
  year: number;
  distanceKm: number;
  journeyCount: number;
  durationHours: number;
  avgDistanceKm: number;
  longestDistanceKm: number;
}

export interface ActivityBreakdownPoint {
  activity: TravelActivity;
  distanceKm: number;
  journeyCount: number;
  durationHours: number;
  sharePercent: number;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function computeDashboardMetrics(
  journeys: Journey[],
  referenceDate: Date = new Date()
): DashboardMetrics {
  if (journeys.length === 0) {
    return {
      totalDistanceKm: 0,
      totalJourneys: 0,
      totalDurationSec: 0,
      totalMovingTimeSec: 0,
      totalStoppedTimeSec: 0,
      longestJourney: null,
      averageDistanceKm: 0,
      currentMonthDistanceKm: 0,
      currentMonthJourneys: 0,
      currentYearDistanceKm: 0,
      currentYearJourneys: 0,
    };
  }

  let totalDistanceKm = 0;
  let totalDurationSec = 0;
  let totalMovingTimeSec = 0;
  let totalStoppedTimeSec = 0;
  let longestJourney: Journey | null = journeys[0];

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  let currentMonthDistanceKm = 0;
  let currentMonthJourneys = 0;
  let currentYearDistanceKm = 0;
  let currentYearJourneys = 0;

  for (const j of journeys) {
    totalDistanceKm += j.stats.totalDistanceKm;
    totalDurationSec += j.stats.totalDurationSec;
    totalMovingTimeSec += j.stats.movingTimeSec;
    totalStoppedTimeSec += j.stats.stoppedTimeSec;

    if (
      !longestJourney ||
      j.stats.totalDistanceKm > longestJourney.stats.totalDistanceKm
    ) {
      longestJourney = j;
    }

    const d = new Date(j.startTime);
    if (d.getFullYear() === refYear) {
      currentYearDistanceKm += j.stats.totalDistanceKm;
      currentYearJourneys += 1;
      if (d.getMonth() === refMonth) {
        currentMonthDistanceKm += j.stats.totalDistanceKm;
        currentMonthJourneys += 1;
      }
    }
  }

  return {
    totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
    totalJourneys: journeys.length,
    totalDurationSec,
    totalMovingTimeSec,
    totalStoppedTimeSec,
    longestJourney,
    averageDistanceKm: Number((totalDistanceKm / journeys.length).toFixed(1)),
    currentMonthDistanceKm: Number(currentMonthDistanceKm.toFixed(1)),
    currentMonthJourneys,
    currentYearDistanceKm: Number(currentYearDistanceKm.toFixed(1)),
    currentYearJourneys,
  };
}

export interface JourneyFilterParams {
  timeframe: TimeframeFilter;
  dateQuery: string;
  activity: TravelActivity | 'all';
  referenceDate?: Date;
}

export function filterJourneys(
  journeys: Journey[],
  params: JourneyFilterParams
): Journey[] {
  const ref = params.referenceDate ?? new Date();
  const query = params.dateQuery.trim().toLowerCase();

  return journeys
    .filter((j) => {
      if (params.activity !== 'all' && j.activity !== params.activity) {
        return false;
      }

      const d = new Date(j.startTime);
      const startOfRefDay = new Date(
        ref.getFullYear(),
        ref.getMonth(),
        ref.getDate()
      ).getTime();

      if (params.timeframe === 'day') {
        if (
          d.getFullYear() !== ref.getFullYear() ||
          d.getMonth() !== ref.getMonth() ||
          d.getDate() !== ref.getDate()
        ) {
          return false;
        }
      } else if (params.timeframe === 'week') {
        const sevenDaysAgo = startOfRefDay - 6 * 24 * 60 * 60 * 1000;
        const endOfToday = startOfRefDay + 24 * 60 * 60 * 1000 - 1;
        if (j.startTime < sevenDaysAgo || j.startTime > endOfToday) {
          return false;
        }
      } else if (params.timeframe === 'month') {
        if (
          d.getFullYear() !== ref.getFullYear() ||
          d.getMonth() !== ref.getMonth()
        ) {
          return false;
        }
      } else if (params.timeframe === 'year') {
        if (d.getFullYear() !== ref.getFullYear()) {
          return false;
        }
      }

      if (query.length > 0) {
        const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          '0'
        )}-${String(d.getDate()).padStart(2, '0')}`;
        const readableDate = d
          .toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
          .toLowerCase();
        const fullMonth = d
          .toLocaleDateString('en-US', {month: 'long', year: 'numeric'})
          .toLowerCase();

        const haystack = [
          isoDate,
          readableDate,
          fullMonth,
          j.title.toLowerCase(),
          j.startLocation.toLowerCase(),
          j.endLocation.toLowerCase(),
          j.activity.toLowerCase(),
        ].join(' ');

        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => b.startTime - a.startTime);
}

export function computeMonthlyInsights(
  journeys: Journey[],
  year: number
): MonthlyInsightPoint[] {
  const buckets = MONTH_LABELS.map((monthLabel, monthIndex) => ({
    monthIndex,
    monthLabel,
    distanceKm: 0,
    journeyCount: 0,
    durationSec: 0,
  }));

  for (const j of journeys) {
    const d = new Date(j.startTime);
    if (d.getFullYear() !== year) continue;
    const b = buckets[d.getMonth()];
    b.distanceKm += j.stats.totalDistanceKm;
    b.journeyCount += 1;
    b.durationSec += j.stats.totalDurationSec;
  }

  return buckets.map((b) => ({
    monthIndex: b.monthIndex,
    monthLabel: b.monthLabel,
    distanceKm: Number(b.distanceKm.toFixed(1)),
    journeyCount: b.journeyCount,
    durationHours: Number((b.durationSec / 3600).toFixed(2)),
    avgDistanceKm:
      b.journeyCount > 0 ? Number((b.distanceKm / b.journeyCount).toFixed(1)) : 0,
  }));
}

export function computeYearlyComparison(
  journeys: Journey[]
): YearlyComparisonPoint[] {
  const byYear: Record<
    number,
    {
      distanceKm: number;
      journeyCount: number;
      durationSec: number;
      longestDistanceKm: number;
    }
  > = {};

  for (const j of journeys) {
    const year = new Date(j.startTime).getFullYear();
    if (!byYear[year]) {
      byYear[year] = {
        distanceKm: 0,
        journeyCount: 0,
        durationSec: 0,
        longestDistanceKm: 0,
      };
    }
    byYear[year].distanceKm += j.stats.totalDistanceKm;
    byYear[year].journeyCount += 1;
    byYear[year].durationSec += j.stats.totalDurationSec;
    if (j.stats.totalDistanceKm > byYear[year].longestDistanceKm) {
      byYear[year].longestDistanceKm = j.stats.totalDistanceKm;
    }
  }

  return Object.keys(byYear)
    .map(Number)
    .sort((a, b) => a - b)
    .map((year) => {
      const entry = byYear[year];
      return {
        year,
        distanceKm: Number(entry.distanceKm.toFixed(1)),
        journeyCount: entry.journeyCount,
        durationHours: Number((entry.durationSec / 3600).toFixed(2)),
        avgDistanceKm:
          entry.journeyCount > 0
            ? Number((entry.distanceKm / entry.journeyCount).toFixed(1))
            : 0,
        longestDistanceKm: Number(entry.longestDistanceKm.toFixed(1)),
      };
    });
}

export function computeActivityBreakdown(
  journeys: Journey[]
): ActivityBreakdownPoint[] {
  const totalDistance = journeys.reduce(
    (sum, j) => sum + j.stats.totalDistanceKm,
    0
  );
  const grouped: Record<
    TravelActivity,
    {distanceKm: number; journeyCount: number; durationSec: number}
  > = {
    car: {distanceKm: 0, journeyCount: 0, durationSec: 0},
    motorcycle: {distanceKm: 0, journeyCount: 0, durationSec: 0},
    bus: {distanceKm: 0, journeyCount: 0, durationSec: 0},
    train: {distanceKm: 0, journeyCount: 0, durationSec: 0},
    walking: {distanceKm: 0, journeyCount: 0, durationSec: 0},
    other: {distanceKm: 0, journeyCount: 0, durationSec: 0},
  };

  for (const j of journeys) {
    grouped[j.activity].distanceKm += j.stats.totalDistanceKm;
    grouped[j.activity].journeyCount += 1;
    grouped[j.activity].durationSec += j.stats.totalDurationSec;
  }

  return (Object.keys(grouped) as TravelActivity[])
    .filter((activity) => grouped[activity].journeyCount > 0)
    .map((activity) => {
      const item = grouped[activity];
      return {
        activity,
        distanceKm: Number(item.distanceKm.toFixed(1)),
        journeyCount: item.journeyCount,
        durationHours: Number((item.durationSec / 3600).toFixed(2)),
        sharePercent:
          totalDistance > 0
            ? Math.round((item.distanceKm / totalDistance) * 100)
            : 0,
      };
    })
    .sort((a, b) => b.distanceKm - a.distanceKm);
}
