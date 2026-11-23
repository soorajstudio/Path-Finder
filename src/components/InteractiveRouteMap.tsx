import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiIsLoaded,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  Crosshair,
  Maximize2,
  Minus,
  Navigation,
  Plus,
  RotateCw,
  WifiOff,
} from 'lucide-react';
import type {
  DetectedStop,
  LatLngPoint,
  MapLayerType,
  TravelActivity,
} from '../types/journey';
import {ACTIVITY_META, formatCoordinates, formatDuration} from '../utils/format';

export interface MapRouteSeries {
  id: string;
  title: string;
  activity: TravelActivity;
  points: LatLngPoint[];
  stops: DetectedStop[];
  selected?: boolean;
  dimmed?: boolean;
}

interface InteractiveRouteMapProps {
  routes: MapRouteSeries[];
  livePosition?: LatLngPoint | null;
  liveAccuracyMeters?: number | null;
  liveHeading?: number;
  replayPosition?: LatLngPoint | null;
  replayHeading?: number;
  autoFollow?: boolean;
  onAutoFollowChange?: (follow: boolean) => void;
  showStops?: boolean;
  onSelectRoute?: (routeId: string) => void;
  heightClass?: string;
  isOnline?: boolean;
  hasApiKey?: boolean;
  quotaExceeded?: boolean;
  testId?: string;
}

const DEFAULT_CENTER: LatLngPoint = {lat: 37.7955, lng: -122.4126};

/**
 * Imperative Google Maps Polyline overlay using useMap + useMapsLibrary('maps')
 */
const GoogleRoutePolyline: React.FC<{
  path: LatLngPoint[];
  strokeColor: string;
  strokeWeight: number;
  strokeOpacity: number;
  zIndex?: number;
  onClick?: () => void;
}> = ({path, strokeColor, strokeWeight, strokeOpacity, zIndex = 1, onClick}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || path.length < 2) return;

    const polyline = new mapsLib.Polyline({
      path,
      strokeColor,
      strokeWeight,
      strokeOpacity,
      geodesic: true,
      zIndex,
      clickable: Boolean(onClick),
      map,
    });

    let listener: {remove: () => void} | null = null;
    if (onClick) {
      listener = polyline.addListener('click', onClick);
    }

    return () => {
      if (listener) listener.remove();
      polyline.setMap(null);
    };
  }, [map, mapsLib, path, strokeColor, strokeWeight, strokeOpacity, zIndex, onClick]);

  return null;
};

/**
 * Imperative GPS Accuracy Circle overlay
 */
const AccuracyCircleOverlay: React.FC<{
  center: LatLngPoint;
  radiusMeters: number;
}> = ({center, radiusMeters}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib) return;
    const circle = new mapsLib.Circle({
      center,
      radius: Math.max(5, radiusMeters),
      strokeColor: '#1D4ED8',
      strokeOpacity: 0.45,
      strokeWeight: 1.5,
      fillColor: '#3B82F6',
      fillOpacity: 0.14,
      clickable: false,
      map,
    });
    return () => {
      circle.setMap(null);
    };
  }, [map, mapsLib, center.lat, center.lng, radiusMeters]);

  return null;
};

/**
 * Clickable Detected Stop AdvancedMarker + anchored InfoWindow
 */
const StopAdvancedMarker: React.FC<{
  stop: DetectedStop;
  routeTitle: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}> = ({stop, routeTitle, isOpen, onToggle, onClose}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{lat: stop.lat, lng: stop.lng}}
        onClick={onToggle}
        title={`${stop.label} (${formatDuration(stop.durationSec)})`}
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#D97706] text-[10px] font-bold text-white shadow-sm">
          P
        </div>
      </AdvancedMarker>
      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={220}>
          <div className="p-1 text-slate-900">
            <p className="text-xs font-semibold text-slate-900">{stop.label}</p>
            <p className="mt-0.5 text-[11px] text-slate-600">{routeTitle}</p>
            <p className="mt-1 font-mono text-[11px] font-medium text-[#B45309] tabular-nums">
              Stopped {formatDuration(stop.durationSec)}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-slate-500 tabular-nums">
              {formatCoordinates(stop.lat, stop.lng)}
            </p>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

/**
 * Imperative camera controller for auto-follow, fit-bounds, zoom, and rotation
 */
const MapCameraController: React.FC<{
  routes: MapRouteSeries[];
  livePosition?: LatLngPoint | null;
  replayPosition?: LatLngPoint | null;
  autoFollow: boolean;
  fitTrigger: number;
  zoomDeltaTrigger: {seq: number; delta: number};
  heading: number;
}> = ({
  routes,
  livePosition,
  replayPosition,
  autoFollow,
  fitTrigger,
  zoomDeltaTrigger,
  heading,
}) => {
  const map = useMap();
  const coreLib = useMapsLibrary('core');

  // Fit bounds when routes selection changes or user taps Fit Route
  useEffect(() => {
    if (!map || !coreLib) return;
    if (livePosition && autoFollow) return;

    const activeRoutes = routes.some((r) => r.selected)
      ? routes.filter((r) => r.selected)
      : routes;

    const allPts: LatLngPoint[] = [];
    for (const r of activeRoutes) {
      for (const p of r.points) allPts.push(p);
    }
    if (livePosition) allPts.push(livePosition);
    if (allPts.length === 0) return;

    if (allPts.length === 1) {
      map.panTo(allPts[0]);
      map.setZoom(15);
      return;
    }

    const bounds = new coreLib.LatLngBounds();
    for (const p of allPts) bounds.extend(p);
    map.fitBounds(bounds, 56);
  }, [map, coreLib, fitTrigger]);

  // Follow live position when autoFollow is active, zooming in on initial street lock
  const hasZoomedLiveRef = React.useRef(false);
  useEffect(() => {
    if (!map || !autoFollow || !livePosition) return;
    map.panTo(livePosition);
    if (!hasZoomedLiveRef.current) {
      hasZoomedLiveRef.current = true;
      const currentZoom = map.getZoom() ?? 12;
      if (currentZoom < 15) {
        map.setZoom(16);
      }
    }
  }, [map, autoFollow, livePosition?.lat, livePosition?.lng]);

  // Follow replay marker gently if it leaves viewport
  useEffect(() => {
    if (!map || !replayPosition) return;
    const bounds = map.getBounds();
    if (bounds && !bounds.contains(replayPosition)) {
      map.panTo(replayPosition);
    }
  }, [map, replayPosition?.lat, replayPosition?.lng]);

  // Apply zoom button steps
  useEffect(() => {
    if (!map || zoomDeltaTrigger.seq === 0) return;
    const current = map.getZoom() ?? 13;
    map.setZoom(Math.min(20, Math.max(3, current + zoomDeltaTrigger.delta)));
  }, [map, zoomDeltaTrigger.seq, zoomDeltaTrigger.delta]);

  // Apply rotation heading
  useEffect(() => {
    if (!map) return;
    try {
      map.setHeading(heading);
    } catch {
      // Raster maps ignore setHeading; vector maps rotate cleanly
    }
  }, [map, heading]);

  return null;
};

/**
 * Offline / Fallback Interactive Vector Map when offline or Maps API unavailable
 */
const OfflineVectorCanvas: React.FC<{
  routes: MapRouteSeries[];
  livePosition?: LatLngPoint | null;
  replayPosition?: LatLngPoint | null;
  showStops: boolean;
  reason: string;
}> = ({routes, livePosition, replayPosition, showStops, reason}) => {
  const allPoints = useMemo(() => {
    const pts: LatLngPoint[] = [];
    routes.forEach((r) => r.points.forEach((p) => pts.push(p)));
    if (livePosition) pts.push(livePosition);
    if (replayPosition) pts.push(replayPosition);
    return pts;
  }, [routes, livePosition, replayPosition]);

  const bounds = useMemo(() => {
    if (allPoints.length === 0) {
      return {minLat: 37.75, maxLat: 37.85, minLng: -122.49, maxLng: -122.36};
    }
    let minLat = allPoints[0].lat;
    let maxLat = allPoints[0].lat;
    let minLng = allPoints[0].lng;
    let maxLng = allPoints[0].lng;
    for (const p of allPoints) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const padLat = Math.max(0.002, (maxLat - minLat) * 0.14);
    const padLng = Math.max(0.002, (maxLng - minLng) * 0.14);
    return {
      minLat: minLat - padLat,
      maxLat: maxLat + padLat,
      minLng: minLng - padLng,
      maxLng: maxLng + padLng,
    };
  }, [allPoints]);

  const project = useCallback(
    (p: LatLngPoint) => {
      const x =
        ((p.lng - bounds.minLng) / Math.max(0.0001, bounds.maxLng - bounds.minLng)) *
        800;
      const y =
        ((bounds.maxLat - p.lat) / Math.max(0.0001, bounds.maxLat - bounds.minLat)) *
        480;
      return {x: Number(x.toFixed(1)), y: Number(y.toFixed(1))};
    },
    [bounds]
  );

  return (
    <div className="relative flex h-full w-full flex-col bg-[#F1F5F9]">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
        <WifiOff className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
        <span>{reason}</span>
      </div>
      <svg
        viewBox="0 0 800 480"
        className="h-full w-full"
        role="img"
        aria-label="Offline vector route map"
      >
        {/* Coordinate grid */}
        {[80, 160, 240, 320, 400].map((y) => (
          <line key={`h-${y}`} x1={0} y1={y} x2={800} y2={y} stroke="#E2E8F0" strokeWidth={1} />
        ))}
        {[133, 266, 400, 533, 666].map((x) => (
          <line key={`v-${x}`} x1={x} y1={0} x2={x} y2={480} stroke="#E2E8F0" strokeWidth={1} />
        ))}

        {routes.map((route) => {
          if (route.points.length === 0) return null;
          const color = ACTIVITY_META[route.activity].strokeColor;
          const pts = route.points.map(project);
          const d = pts
            .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
            .join(' ');
          return (
            <g key={route.id} opacity={route.dimmed ? 0.35 : 1}>
              {pts.length >= 2 && (
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={route.selected ? 4.5 : 3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {showStops &&
                route.stops.map((s) => {
                  const sp = project(s);
                  return (
                    <circle
                      key={s.id}
                      cx={sp.x}
                      cy={sp.y}
                      r={5}
                      fill="#D97706"
                      stroke="#FFFFFF"
                      strokeWidth={2}
                    />
                  );
                })}
              <circle
                cx={pts[0].x}
                cy={pts[0].y}
                r={6}
                fill="#059669"
                stroke="#FFFFFF"
                strokeWidth={2}
              />
              <circle
                cx={pts[pts.length - 1].x}
                cy={pts[pts.length - 1].y}
                r={6}
                fill="#DC2626"
                stroke="#FFFFFF"
                strokeWidth={2}
              />
            </g>
          );
        })}

        {livePosition && (() => {
          const lp = project(livePosition);
          return (
            <g>
              <circle cx={lp.x} cy={lp.y} r={16} fill="#1D4ED8" fillOpacity={0.18} />
              <circle
                cx={lp.x}
                cy={lp.y}
                r={7}
                fill="#1D4ED8"
                stroke="#FFFFFF"
                strokeWidth={2.5}
              />
            </g>
          );
        })()}

        {replayPosition && (() => {
          const rp = project(replayPosition);
          return (
            <circle
              cx={rp.x}
              cy={rp.y}
              r={8}
              fill="#0F172A"
              stroke="#FFFFFF"
              strokeWidth={2.5}
            />
          );
        })()}
      </svg>
    </div>
  );
};

const GoogleInteractiveMapInner: React.FC<{
  routes: MapRouteSeries[];
  livePosition: LatLngPoint | null;
  liveAccuracyMeters: number | null;
  liveHeading: number;
  replayPosition: LatLngPoint | null;
  replayHeading: number;
  autoFollow: boolean;
  onAutoFollowChange?: (follow: boolean) => void;
  showStops: boolean;
  onSelectRoute?: (routeId: string) => void;
  mapLayer: MapLayerType;
  setMapLayer: (layer: MapLayerType) => void;
  initialCenter: LatLngPoint;
}> = ({
  routes,
  livePosition,
  liveAccuracyMeters,
  liveHeading,
  replayPosition,
  replayHeading,
  autoFollow,
  onAutoFollowChange,
  showStops,
  onSelectRoute,
  mapLayer,
  setMapLayer,
  initialCenter,
}) => {
  const [heading, setHeading] = useState<number>(0);
  const [openStopId, setOpenStopId] = useState<string | null>(null);
  const [fitTrigger, setFitTrigger] = useState<number>(1);
  const [zoomDeltaTrigger, setZoomDeltaTrigger] = useState<{seq: number; delta: number}>({
    seq: 0,
    delta: 0,
  });

  const isLoaded = useApiIsLoaded();
  const loadingStatus = useApiLoadingStatus();

  const routeSignature = useMemo(
    () =>
      routes
        .map((r) => `${r.id}:${r.selected ? 1 : 0}:${r.points.length > 0 ? 1 : 0}`)
        .join('|'),
    [routes]
  );

  useEffect(() => {
    if (!autoFollow) {
      setFitTrigger((n) => n + 1);
    }
  }, [routeSignature, autoFollow]);

  if (
    loadingStatus === APILoadingStatus.FAILED ||
    loadingStatus === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <OfflineVectorCanvas
        routes={routes}
        livePosition={livePosition}
        replayPosition={replayPosition}
        showStops={showStops}
        reason="Map tiles temporarily unavailable — showing local GPS geometry"
      />
    );
  }

  return (
    <>
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#F8FAFC]/90">
          <p className="text-sm font-medium text-slate-600">Loading interactive map…</p>
        </div>
      )}

      <GoogleMap
        defaultCenter={initialCenter}
        defaultZoom={12}
        mapId="DEMO_MAP_ID"
        mapTypeId={mapLayer}
        gestureHandling="greedy"
        disableDefaultUI={true}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{width: '100%', height: '100%'}}
      >
        <MapCameraController
          routes={routes}
          livePosition={livePosition}
          replayPosition={replayPosition}
          autoFollow={autoFollow}
          fitTrigger={fitTrigger}
          zoomDeltaTrigger={zoomDeltaTrigger}
          heading={heading}
        />

        {routes.map((route) => {
          const color = ACTIVITY_META[route.activity].strokeColor;
          const startPt = route.points[0];
          const endPt = route.points[route.points.length - 1];
          const isSelected = Boolean(route.selected);
          const isDimmed = Boolean(route.dimmed);
          const isMultiOverview = routes.length > 1 && !routes.some((r) => r.selected);

          return (
            <React.Fragment key={route.id}>
              <GoogleRoutePolyline
                path={route.points}
                strokeColor={color}
                strokeWeight={isSelected ? 5 : 3.5}
                strokeOpacity={isDimmed ? 0.32 : 0.92}
                zIndex={isSelected ? 20 : 5}
                onClick={onSelectRoute ? () => onSelectRoute(route.id) : undefined}
              />

              {startPt && !isDimmed && (
                <AdvancedMarker position={startPt} title={`Start: ${route.title}`}>
                  {isMultiOverview ? (
                    <div className="h-3 w-3 rounded-full border-2 border-white bg-[#059669] shadow-sm" />
                  ) : (
                    <Pin
                      background="#059669"
                      borderColor="#047857"
                      glyphColor="#FFFFFF"
                      scale={isSelected ? 0.95 : 0.78}
                    />
                  )}
                </AdvancedMarker>
              )}

              {endPt && route.points.length > 1 && !livePosition && !isDimmed && (
                <AdvancedMarker position={endPt} title={`End: ${route.title}`}>
                  {isMultiOverview ? (
                    <div className="h-3 w-3 rounded-full border-2 border-white bg-[#DC2626] shadow-sm" />
                  ) : (
                    <Pin
                      background="#DC2626"
                      borderColor="#B91C1C"
                      glyphColor="#FFFFFF"
                      scale={isSelected ? 0.95 : 0.78}
                    />
                  )}
                </AdvancedMarker>
              )}

              {showStops &&
                !isDimmed &&
                (!isMultiOverview || isSelected) &&
                route.stops.map((stop) => (
                  <StopAdvancedMarker
                    key={stop.id}
                    stop={stop}
                    routeTitle={route.title}
                    isOpen={openStopId === stop.id}
                    onToggle={() =>
                      setOpenStopId((prev) => (prev === stop.id ? null : stop.id))
                    }
                    onClose={() => setOpenStopId(null)}
                  />
                ))}
            </React.Fragment>
          );
        })}

        {livePosition && liveAccuracyMeters && (
          <AccuracyCircleOverlay
            center={livePosition}
            radiusMeters={liveAccuracyMeters}
          />
        )}

        {livePosition && (
          <AdvancedMarker position={livePosition} title="Current GPS location">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#1D4ED8] text-white shadow-md"
              style={{transform: `rotate(${liveHeading}deg)`}}
            >
              <Navigation className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            </div>
          </AdvancedMarker>
        )}

        {replayPosition && (
          <AdvancedMarker position={replayPosition} title="Route replay position">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#0F172A] text-white shadow-lg"
              style={{transform: `rotate(${replayHeading}deg)`}}
            >
              <Navigation className="h-4 w-4 fill-current" aria-hidden="true" />
            </div>
          </AdvancedMarker>
        )}
      </GoogleMap>

      {/* Top-left Map Layer Switcher: Standard | Satellite | Terrain */}
      <div
        className="absolute left-3 top-3 z-20 inline-flex items-center gap-0.5 rounded-lg border border-[#E5E8EE] bg-white/95 p-1 shadow-sm backdrop-blur-sm"
        role="group"
        aria-label="Map layer view"
      >
        {(
          [
            {id: 'roadmap', label: 'Standard'},
            {id: 'satellite', label: 'Satellite'},
            {id: 'terrain', label: 'Terrain'},
          ] as const
        ).map((layer) => (
          <button
            key={layer.id}
            type="button"
            onClick={() => setMapLayer(layer.id)}
            className={`min-h-[34px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mapLayer === layer.id
                ? 'bg-[#0F172A] text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {layer.label}
          </button>
        ))}
      </div>

      {/* Right Map Controls: Zoom, Rotate, Fit Route, Auto-Follow */}
      <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
        <div className="flex flex-col overflow-hidden rounded-lg border border-[#E5E8EE] bg-white/95 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() =>
              setZoomDeltaTrigger((prev) => ({seq: prev.seq + 1, delta: 1}))
            }
            aria-label="Zoom in map"
            className="flex h-9 w-9 items-center justify-center border-b border-[#E5E8EE] text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() =>
              setZoomDeltaTrigger((prev) => ({seq: prev.seq + 1, delta: -1}))
            }
            aria-label="Zoom out map"
            className="flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col overflow-hidden rounded-lg border border-[#E5E8EE] bg-white/95 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setHeading((h) => (h + 45) % 360)}
            aria-label="Rotate map 45 degrees"
            title="Rotate map"
            className="flex h-9 w-9 items-center justify-center border-b border-[#E5E8EE] text-slate-700 transition-colors hover:bg-slate-100"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setHeading(0)}
            aria-label="Reset map north"
            title={`Heading ${heading}° — Reset north`}
            className="flex h-9 w-9 items-center justify-center border-b border-[#E5E8EE] text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Compass
              className="h-4 w-4 transition-transform"
              style={{transform: `rotate(${-heading}deg)`}}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={() => setFitTrigger((n) => n + 1)}
            aria-label="Fit route to view"
            title="Fit route to view"
            className="flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {onAutoFollowChange && (
          <button
            type="button"
            onClick={() => onAutoFollowChange(!autoFollow)}
            aria-label={
              autoFollow ? 'Disable auto-follow GPS' : 'Enable auto-follow GPS'
            }
            aria-pressed={autoFollow}
            title={autoFollow ? 'Auto-follow active' : 'Center & follow GPS'}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm transition-colors ${
              autoFollow
                ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white'
                : 'border-[#E5E8EE] bg-white/95 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Crosshair className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </>
  );
};

export const InteractiveRouteMap: React.FC<InteractiveRouteMapProps> = ({
  routes,
  livePosition = null,
  liveAccuracyMeters = null,
  liveHeading = 0,
  replayPosition = null,
  replayHeading = 0,
  autoFollow = false,
  onAutoFollowChange,
  showStops = true,
  onSelectRoute,
  heightClass = 'h-[460px]',
  isOnline = true,
  hasApiKey = true,
  quotaExceeded = false,
  testId = 'interactive-route-map',
}) => {
  const [mapLayer, setMapLayer] = useState<MapLayerType>('roadmap');

  const initialCenter = useMemo<LatLngPoint>(() => {
    if (livePosition) return livePosition;
    const selected = routes.find((r) => r.selected && r.points.length > 0);
    if (selected) return selected.points[0];
    const first = routes.find((r) => r.points.length > 0);
    if (first) return first.points[0];
    return DEFAULT_CENTER;
  }, [routes, livePosition]);

  const useOfflineFallback = !isOnline || !hasApiKey || quotaExceeded;

  const fallbackReason = !isOnline
    ? 'Offline vector map active — GPS recording continues locally'
    : quotaExceeded
      ? 'Vector route view active (Maps API quota reached)'
      : 'Local vector route view (configure Google Maps API key for tiles)';

  return (
    <div
      data-testid={testId}
      data-map-layer={mapLayer}
      className={`relative w-full overflow-hidden rounded-xl border border-[#E5E8EE] bg-[#F1F5F9] ${heightClass}`}
    >
      {useOfflineFallback ? (
        <OfflineVectorCanvas
          routes={routes}
          livePosition={livePosition}
          replayPosition={replayPosition}
          showStops={showStops}
          reason={fallbackReason}
        />
      ) : (
        <GoogleInteractiveMapInner
          routes={routes}
          livePosition={livePosition}
          liveAccuracyMeters={liveAccuracyMeters}
          liveHeading={liveHeading}
          replayPosition={replayPosition}
          replayHeading={replayHeading}
          autoFollow={autoFollow}
          onAutoFollowChange={onAutoFollowChange}
          showStops={showStops}
          onSelectRoute={onSelectRoute}
          mapLayer={mapLayer}
          setMapLayer={setMapLayer}
          initialCenter={initialCenter}
        />
      )}
    </div>
  );
};
