import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeActivityBreakdown,
  computeDashboardMetrics,
  computeMonthlyInsights,
  computeYearlyComparison,
  filterJourneys,
} from './analytics';
import {createSeedJourneys} from '../data/seedJourneys';

const refDate = new Date('2026-11-23T10:00:00-08:00');

test('computeDashboardMetrics aggregates all journeys and monthly/yearly totals', () => {
  const journeys = createSeedJourneys();
  const metrics = computeDashboardMetrics(journeys, refDate);

  assert.equal(metrics.totalJourneys, journeys.length);
  assert.ok(metrics.totalDistanceKm > 200);
  assert.ok(metrics.longestJourney !== null);
  assert.ok(metrics.currentMonthJourneys === 4);
  assert.ok(metrics.currentYearJourneys === 8);
  assert.ok(metrics.averageDistanceKm > 0);
});

test('filterJourneys filters by timeframe, activity, and date/location query', () => {
  const journeys = createSeedJourneys();

  const weekResults = filterJourneys(journeys, {
    timeframe: 'week',
    dateQuery: '',
    activity: 'all',
    referenceDate: refDate,
  });
  assert.equal(weekResults.length, 3);

  const monthTrains = filterJourneys(journeys, {
    timeframe: 'month',
    dateQuery: '',
    activity: 'train',
    referenceDate: refDate,
  });
  assert.equal(monthTrains.length, 1);
  assert.equal(monthTrains[0].activity, 'train');

  const dateSearch = filterJourneys(journeys, {
    timeframe: 'all',
    dateQuery: '2026-11-22',
    activity: 'all',
    referenceDate: refDate,
  });
  assert.equal(dateSearch.length, 1);
  assert.equal(dateSearch[0].id, 'jrn-2026-11-22-bay-drive');
});

test('computeMonthlyInsights, yearly comparison, and activity breakdown are consistent', () => {
  const journeys = createSeedJourneys();

  const monthly2026 = computeMonthlyInsights(journeys, 2026);
  assert.equal(monthly2026.length, 12);
  const nov = monthly2026[10];
  assert.equal(nov.monthLabel, 'Nov');
  assert.equal(nov.journeyCount, 4);
  assert.ok(nov.distanceKm > 0);

  const yearly = computeYearlyComparison(journeys);
  assert.equal(yearly.length, 2);
  assert.equal(yearly[0].year, 2025);
  assert.equal(yearly[1].year, 2026);

  const activities = computeActivityBreakdown(journeys);
  assert.ok(activities.length >= 4);
  const shareSum = activities.reduce((acc, a) => acc + a.sharePercent, 0);
  assert.ok(shareSum >= 98 && shareSum <= 102);
});
