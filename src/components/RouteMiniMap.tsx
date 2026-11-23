import React, {useMemo} from 'react';
import type {DetectedStop, LatLngPoint, TravelActivity} from '../types/journey';
import {ACTIVITY_META} from '../utils/format';

interface RouteMiniMapProps {
  points: LatLngPoint[];
  stops?: DetectedStop[];
  activity: TravelActivity;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Lightweight, 100% offline-capable SVG route preview for journey history cards
 * and dashboard lists. Normalizes WGS-84 coordinates into a crisp cartographic box.
 */
export const RouteMiniMap: React.FC<RouteMiniMapProps> = ({
  points,
  stops = [],
  activity,
  width = 160,
  height = 88,
  className = '',
}) => {
  const strokeColor = ACTIVITY_META[activity].strokeColor;

  const projection = useMemo(() => {
    if (points.length === 0) return null;
    const pad = 12;

    let minLat = points[0].lat;
    let maxLat = points[0].lat;
    let minLng = points[0].lng;
    let maxLng = points[0].lng;

    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }

    const spanLat = Math.max(0.001, maxLat - minLat);
    const spanLng = Math.max(0.001, maxLng - minLng);

    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    // Preserve geographic aspect ratio using cos(midLat)
    const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
    const adjSpanLng = spanLng * Math.cos(midLatRad);
    const scale = Math.min(innerW / Math.max(0.0005, adjSpanLng), innerH / spanLat);

    const drawW = adjSpanLng * scale;
    const drawH = spanLat * scale;
    const offsetX = pad + (innerW - drawW) / 2;
    const offsetY = pad + (innerH - drawH) / 2;

    const project = (pt: LatLngPoint) => ({
      x: Number((offsetX + (pt.lng - minLng) * Math.cos(midLatRad) * scale).toFixed(1)),
      y: Number((offsetY + (maxLat - pt.lat) * scale).toFixed(1)),
    });

    // Downsample slightly for crisp rendering if very long
    const stride = Math.max(1, Math.floor(points.length / 80));
    const sampled: Array<{x: number; y: number}> = [];
    for (let i = 0; i < points.length; i += stride) {
      sampled.push(project(points[i]));
    }
    const lastProjected = project(points[points.length - 1]);
    if (
      sampled.length === 0 ||
      sampled[sampled.length - 1].x !== lastProjected.x ||
      sampled[sampled.length - 1].y !== lastProjected.y
    ) {
      sampled.push(lastProjected);
    }

    const pathData = sampled
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
      .join(' ');

    return {
      pathData,
      start: sampled[0],
      end: sampled[sampled.length - 1],
      stops: stops.map(project),
    };
  }, [points, stops, width, height]);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-[#E5E8EE] bg-[#F8FAFC] ${className}`}
      style={{width, height}}
      aria-hidden="true"
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block h-full w-full"
      >
        {/* Subtle cartographic grid lines */}
        <line x1={0} y1={height * 0.33} x2={width} y2={height * 0.33} stroke="#E2E8F0" strokeWidth={0.75} />
        <line x1={0} y1={height * 0.66} x2={width} y2={height * 0.66} stroke="#E2E8F0" strokeWidth={0.75} />
        <line x1={width * 0.33} y1={0} x2={width * 0.33} y2={height} stroke="#E2E8F0" strokeWidth={0.75} />
        <line x1={width * 0.66} y1={0} x2={width * 0.66} y2={height} stroke="#E2E8F0" strokeWidth={0.75} />

        {projection && (
          <>
            <path
              d={projection.pathData}
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {projection.stops.map((st, idx) => (
              <circle
                key={idx}
                cx={st.x}
                cy={st.y}
                r={3}
                fill="#D97706"
                stroke="#FFFFFF"
                strokeWidth={1.2}
              />
            ))}
            <circle
              cx={projection.start.x}
              cy={projection.start.y}
              r={3.5}
              fill="#059669"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
            <circle
              cx={projection.end.x}
              cy={projection.end.y}
              r={3.5}
              fill="#DC2626"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          </>
        )}
      </svg>
    </div>
  );
};
