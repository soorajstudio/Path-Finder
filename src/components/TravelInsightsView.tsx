import React, {useMemo, useState} from 'react';
import {ChevronRight} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {Journey} from '../types/journey';
import {
  computeActivityBreakdown,
  computeMonthlyInsights,
  computeYearlyComparison,
} from '../utils/analytics';
import {
  ACTIVITY_META,
  formatDateShort,
  formatDistanceKm,
  formatDuration,
  formatSpeedKmh,
} from '../utils/format';

interface TravelInsightsViewProps {
  journeys: Journey[];
  onSelectJourney: (journeyId: string) => void;
}

export const TravelInsightsView: React.FC<TravelInsightsViewProps> = ({
  journeys,
  onSelectJourney,
}) => {
  const availableYears = useMemo(() => {
    const years = Array.from(
      new Set(journeys.map((j) => new Date(j.startTime).getFullYear()))
    ).sort((a, b) => b - a);
    return years.length > 0 ? years : [new Date().getFullYear()];
  }, [journeys]);

  const [selectedYear, setSelectedYear] = useState<number>(availableYears[0]);

  const monthlyData = useMemo(
    () => computeMonthlyInsights(journeys, selectedYear),
    [journeys, selectedYear]
  );

  const yearlyComparison = useMemo(
    () => computeYearlyComparison(journeys),
    [journeys]
  );

  const activityBreakdown = useMemo(
    () => computeActivityBreakdown(journeys),
    [journeys]
  );

  const longestRecords = useMemo(
    () =>
      [...journeys]
        .sort((a, b) => b.stats.totalDistanceKm - a.stats.totalDistanceKm)
        .slice(0, 5),
    [journeys]
  );

  const yearTotals = useMemo(() => {
    const totalDist = monthlyData.reduce((s, m) => s + m.distanceKm, 0);
    const totalCount = monthlyData.reduce((s, m) => s + m.journeyCount, 0);
    const totalHours = monthlyData.reduce((s, m) => s + m.durationHours, 0);
    return {
      totalDist: Number(totalDist.toFixed(1)),
      totalCount,
      totalHours: Number(totalHours.toFixed(1)),
      avgDist: totalCount > 0 ? Number((totalDist / totalCount).toFixed(1)) : 0,
    };
  }, [monthlyData]);

  return (
    <div className="space-y-6">
      {/* Header & Year Selector */}
      <div className="flex flex-col justify-between gap-4 border-b border-[#E5E8EE] pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Travel Insights
          </h1>
          <p className="mt-1 text-sm text-[#526072]">
            Monthly and yearly comparisons of your recorded personal travel activity.
          </p>
        </div>

        <div
          className="inline-flex items-center gap-1 self-start rounded-lg bg-[#EEF1F6] p-1 sm:self-auto"
          role="group"
          aria-label="Select analytics year"
        >
          {availableYears.map((yr) => (
            <button
              key={yr}
              type="button"
              onClick={() => setSelectedYear(yr)}
              aria-pressed={selectedYear === yr}
              className={`min-h-[36px] rounded-md px-3.5 py-1.5 font-mono text-xs font-medium transition-colors ${
                selectedYear === yr
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'text-[#526072] hover:text-[#0F172A]'
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Year Summary Strip */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E5E8EE] bg-white p-5">
          <p className="text-xs text-[#526072]">{selectedYear} Total Distance</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-[#0F172A] tabular-nums">
            {yearTotals.totalDist.toFixed(1)}{' '}
            <span className="text-sm font-normal text-[#526072]">km</span>
          </p>
        </div>
        <div className="rounded-xl border border-[#E5E8EE] bg-white p-5">
          <p className="text-xs text-[#526072]">{selectedYear} Journeys</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-[#0F172A] tabular-nums">
            {yearTotals.totalCount}
          </p>
        </div>
        <div className="rounded-xl border border-[#E5E8EE] bg-white p-5">
          <p className="text-xs text-[#526072]">Average Distance / Journey</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-[#0F172A] tabular-nums">
            {yearTotals.avgDist.toFixed(1)}{' '}
            <span className="text-sm font-normal text-[#526072]">km</span>
          </p>
        </div>
        <div className="rounded-xl border border-[#E5E8EE] bg-white p-5">
          <p className="text-xs text-[#526072]">{selectedYear} Total Travel Time</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-[#0F172A] tabular-nums">
            {yearTotals.totalHours.toFixed(1)}{' '}
            <span className="text-sm font-normal text-[#526072]">hrs</span>
          </p>
        </div>
      </section>

      {/* Primary Charts Row: Monthly Distance + Monthly Journey Count & Travel Time */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#E5E8EE] bg-white p-6">
          <h2 className="text-base font-semibold text-[#0F172A]">
            Monthly Distance Comparison ({selectedYear})
          </h2>
          <p className="mt-0.5 text-xs text-[#526072]">
            Kilometers travelled per calendar month
          </p>
          <div className="mt-4 h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyData}
                margin={{top: 8, right: 8, left: -14, bottom: 0}}
              >
                <CartesianGrid stroke="#EEF1F6" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  tick={{fontSize: 11, fill: '#64748B'}}
                  axisLine={{stroke: '#E5E8EE'}}
                  tickLine={false}
                />
                <YAxis
                  tick={{fontSize: 11, fill: '#64748B'}}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    borderColor: '#E5E8EE',
                    fontSize: '12px',
                  }}
                  formatter={(val: unknown) => [`${Number(val).toFixed(1)} km`, 'Distance']}
                />
                <Bar dataKey="distanceKm" fill="#1D4ED8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-[#E5E8EE] bg-white p-6">
          <h2 className="text-base font-semibold text-[#0F172A]">
            Monthly Journey Count & Travel Time ({selectedYear})
          </h2>
          <p className="mt-0.5 text-xs text-[#526072]">
            Recorded trips and total hours by month
          </p>
          <div className="mt-4 h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyData}
                margin={{top: 8, right: 8, left: -14, bottom: 0}}
              >
                <CartesianGrid stroke="#EEF1F6" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  tick={{fontSize: 11, fill: '#64748B'}}
                  axisLine={{stroke: '#E5E8EE'}}
                  tickLine={false}
                />
                <YAxis
                  tick={{fontSize: 11, fill: '#64748B'}}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    borderColor: '#E5E8EE',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="journeyCount"
                  name="Journeys"
                  fill="#0F766E"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="durationHours"
                  name="Hours"
                  fill="#94A3B8"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Yearly Comparison & Travel Mode Breakdown */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-[#E5E8EE] bg-white p-6 lg:col-span-7">
          <h2 className="text-base font-semibold text-[#0F172A]">
            Yearly Distance Comparison
          </h2>
          <p className="mt-0.5 text-xs text-[#526072]">
            Year-over-year travel totals and averages
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E5E8EE] text-xs font-medium text-[#526072]">
                  <th className="pb-2.5 pr-4">Year</th>
                  <th className="pb-2.5 pr-4 text-right">Distance</th>
                  <th className="pb-2.5 pr-4 text-right">Journeys</th>
                  <th className="pb-2.5 pr-4 text-right">Avg / Trip</th>
                  <th className="pb-2.5 pr-4 text-right">Travel Time</th>
                  <th className="pb-2.5 text-right">Longest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8EE] font-mono text-xs tabular-nums">
                {yearlyComparison.map((row) => (
                  <tr key={row.year} className="hover:bg-[#F8FAFC]">
                    <td className="py-3 pr-4 font-sans text-sm font-semibold text-[#0F172A]">
                      {row.year}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold text-[#0F172A]">
                      {row.distanceKm.toFixed(1)} km
                    </td>
                    <td className="py-3 pr-4 text-right text-[#475569]">
                      {row.journeyCount}
                    </td>
                    <td className="py-3 pr-4 text-right text-[#475569]">
                      {row.avgDistanceKm.toFixed(1)} km
                    </td>
                    <td className="py-3 pr-4 text-right text-[#475569]">
                      {row.durationHours.toFixed(1)} hrs
                    </td>
                    <td className="py-3 text-right text-[#475569]">
                      {row.longestDistanceKm.toFixed(1)} km
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-[#E5E8EE] bg-white p-6 lg:col-span-5">
          <h2 className="text-base font-semibold text-[#0F172A]">
            Travel Mode Distribution
          </h2>
          <p className="mt-0.5 text-xs text-[#526072]">
            Share of total recorded distance by mode
          </p>

          <div className="mt-5 space-y-4">
            {activityBreakdown.map((item) => (
              <div key={item.activity}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-[#0F172A]">
                    {ACTIVITY_META[item.activity].label} · {item.journeyCount}{' '}
                    {item.journeyCount === 1 ? 'trip' : 'trips'}
                  </span>
                  <span className="font-mono text-[#526072] tabular-nums">
                    {item.distanceKm.toFixed(1)} km ({item.sharePercent}%)
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, item.sharePercent)}%`,
                      backgroundColor: ACTIVITY_META[item.activity].strokeColor,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Longest Journey Records */}
      <section className="rounded-xl border border-[#E5E8EE] bg-white p-6">
        <h2 className="text-base font-semibold text-[#0F172A]">
          Longest Journey Records
        </h2>
        <p className="mt-0.5 text-xs text-[#526072]">
          Top personal journeys ranked by total recorded distance
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5E8EE] text-xs font-medium text-[#526072]">
                <th className="pb-2.5 pr-4">Journey</th>
                <th className="pb-2.5 pr-4">Mode</th>
                <th className="pb-2.5 pr-4">Date</th>
                <th className="pb-2.5 pr-4 text-right">Distance</th>
                <th className="pb-2.5 pr-4 text-right">Duration</th>
                <th className="pb-2.5 pr-4 text-right">Avg Speed</th>
                <th className="pb-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E8EE] text-xs">
              {longestRecords.map((journey, index) => (
                <tr key={journey.id} className="hover:bg-[#F8FAFC]">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-[#0F172A]">
                      {index + 1}. {journey.title}
                    </p>
                    <p className="text-[#64748B]">
                      {journey.startLocation} → {journey.endLocation}
                    </p>
                  </td>
                  <td className="py-3 pr-4 text-[#475569]">
                    {ACTIVITY_META[journey.activity].label}
                  </td>
                  <td className="py-3 pr-4 font-mono text-[#526072] tabular-nums whitespace-nowrap">
                    {formatDateShort(journey.startTime)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono font-semibold text-[#0F172A] tabular-nums whitespace-nowrap">
                    {formatDistanceKm(journey.stats.totalDistanceKm)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-[#475569] tabular-nums whitespace-nowrap">
                    {formatDuration(journey.stats.totalDurationSec)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-[#475569] tabular-nums whitespace-nowrap">
                    {formatSpeedKmh(journey.stats.avgSpeedKmh)}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectJourney(journey.id)}
                      className="inline-flex items-center gap-0.5 font-medium text-[#1D4ED8] hover:underline whitespace-nowrap"
                    >
                      <span>Inspect</span>
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
