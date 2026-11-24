import React, {useCallback, useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Compass,
  Crosshair,
  Layers,
  Maximize2,
  Minus,
  Navigation,
  Plus,
  RotateCw,
} from 'lucide-react';
import type {LatLngPoint, MapLayerType} from '../types/journey';
import {ACTIVITY_META, formatCoordinates, formatDuration} from '../utils/format';
import type {MapRouteSeries} from './InteractiveRouteMap';

interface LeafletRouteMapProps {
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
  initialCenter?: LatLngPoint;
}

const TILE_LAYERS = {
  roadmap: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 18,
  },
  terrain: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  },
};

export const LeafletRouteMap: React.FC<LeafletRouteMapProps> = ({
  routes,
  livePosition,
  liveAccuracyMeters,
  liveHeading = 0,
  replayPosition,
  replayHeading = 0,
  autoFollow = false,
  onAutoFollowChange,
  showStops = true,
  onSelectRoute,
  initialCenter = {lat: 37.7955, lng: -122.4126},
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const routesLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const liveMarkerRef = useRef<L.Marker | null>(null);
  const liveAccuracyCircleRef = useRef<L.Circle | null>(null);
  const replayMarkerRef = useRef<L.Marker | null>(null);
  const deviceMarkerRef = useRef<L.Marker | null>(null);

  const [mapLayer, setMapLayer] = useState<MapLayerType>('roadmap');
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [deviceLocation, setDeviceLocation] = useState<LatLngPoint | null>(null);
  const [locating, setLocating] = useState(false);

  // Initialize Leaflet map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [initialCenter.lat, initialCenter.lng],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });

    const tileConfig = TILE_LAYERS[mapLayer];
    const tileLayer = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: tileConfig.maxZoom,
      subdomains: 'abc',
    }).addTo(map);

    tileLayerRef.current = tileLayer;

    const routesGroup = L.layerGroup().addTo(map);
    routesLayerGroupRef.current = routesGroup;

    mapRef.current = map;

    // Handle user manual pan/zoom to disable auto-follow
    map.on('dragstart', () => {
      if (onAutoFollowChange) onAutoFollowChange(false);
    });

    // Invalidate size on container resize
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Auto-detect user current location if no routes exist yet
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: LatLngPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setDeviceLocation(coords);
          if (routes.length === 0 && !livePosition) {
            map.setView([coords.lat, coords.lng], 15);
          }
        },
        () => {
          // Non-blocking fallback
        },
        {enableHighAccuracy: true, timeout: 8000}
      );
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Tile Layer when layer type changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const tileConfig = TILE_LAYERS[mapLayer];
    const newTileLayer = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: tileConfig.maxZoom,
      subdomains: 'abc',
    }).addTo(map);

    tileLayerRef.current = newTileLayer;
  }, [mapLayer]);

  // Fit bounds to routes or center on live position
  const fitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const allLatLngs: L.LatLngExpression[] = [];

    routes.forEach((r) => {
      r.points.forEach((p) => allLatLngs.push([p.lat, p.lng]));
    });

    if (livePosition) {
      allLatLngs.push([livePosition.lat, livePosition.lng]);
    } else if (deviceLocation) {
      allLatLngs.push([deviceLocation.lat, deviceLocation.lng]);
    }

    if (replayPosition) {
      allLatLngs.push([replayPosition.lat, replayPosition.lng]);
    }

    if (allLatLngs.length > 1) {
      const bounds = L.latLngBounds(allLatLngs);
      map.fitBounds(bounds, {padding: [45, 45], maxZoom: 16});
    } else if (allLatLngs.length === 1) {
      map.setView(allLatLngs[0], 15);
    }
  }, [routes, livePosition, deviceLocation, replayPosition]);

  // Fit bounds on first route load
  useEffect(() => {
    if (routes.length > 0) {
      fitBounds();
    }
  }, [routes.length]);

  // Manual Locate Me handler
  const handleLocateMe = useCallback(() => {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const coords: LatLngPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setDeviceLocation(coords);
        if (mapRef.current) {
          mapRef.current.setView([coords.lat, coords.lng], 16, {animate: true});
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === 1) {
          alert('Location permission was denied. Please allow location permissions in your browser address bar.');
        } else {
          alert('Unable to retrieve location: ' + err.message);
        }
      },
      {enableHighAccuracy: true, timeout: 10000}
    );
  }, []);

  // Device Location Marker (standby location before recording)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!deviceLocation || livePosition) {
      if (deviceMarkerRef.current) {
        map.removeLayer(deviceMarkerRef.current);
        deviceMarkerRef.current = null;
      }
      return;
    }

    const pos: L.LatLngTuple = [deviceLocation.lat, deviceLocation.lng];
    if (!deviceMarkerRef.current) {
      const icon = L.divIcon({
        className: 'custom-device-marker',
        html: `
          <div style="position: relative; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background-color: rgba(59, 130, 246, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; width: 14px; height: 14px; border-radius: 50%; background-color: #2563EB; border: 2.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.35);"></div>
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker(pos, {icon, zIndexOffset: 1000}).addTo(map);
      marker.bindPopup('<strong>Your Current Location</strong>');
      deviceMarkerRef.current = marker;
    } else {
      deviceMarkerRef.current.setLatLng(pos);
    }
  }, [deviceLocation, livePosition]);

  // Draw Routes, Start/End Markers, and Stops
  useEffect(() => {
    const map = mapRef.current;
    const group = routesLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    routes.forEach((route) => {
      if (route.points.length === 0) return;

      const color = ACTIVITY_META[route.activity]?.strokeColor || '#1D4ED8';
      const isSelected = Boolean(route.selected);
      const isDimmed = Boolean(route.dimmed);

      const latlngs: L.LatLngTuple[] = route.points.map((p) => [p.lat, p.lng]);

      // Route Polyline
      const polyline = L.polyline(latlngs, {
        color,
        weight: isSelected ? 5.5 : 3.5,
        opacity: isDimmed ? 0.35 : 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      });

      if (onSelectRoute) {
        polyline.on('click', () => onSelectRoute(route.id));
      }

      polyline.addTo(group);

      if (isDimmed) return;

      // Start Marker (Green)
      const startPt = route.points[0];
      if (startPt) {
        const startIcon = L.divIcon({
          className: 'custom-start-marker',
          html: `<div style="background-color: #059669; width: 12px; height: 12px; border-radius: 50%; border: 2.5px solid #FFFFFF; box-shadow: 0 1px 4px rgba(0,0,0,0.4);"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const marker = L.marker([startPt.lat, startPt.lng], {icon: startIcon});
        marker.bindPopup(`<strong>Start:</strong> ${route.title}`);
        marker.addTo(group);
      }

      // End Marker (Red)
      const endPt = route.points[route.points.length - 1];
      if (endPt && route.points.length > 1 && !livePosition) {
        const endIcon = L.divIcon({
          className: 'custom-end-marker',
          html: `<div style="background-color: #DC2626; width: 12px; height: 12px; border-radius: 50%; border: 2.5px solid #FFFFFF; box-shadow: 0 1px 4px rgba(0,0,0,0.4);"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const marker = L.marker([endPt.lat, endPt.lng], {icon: endIcon});
        marker.bindPopup(`<strong>End:</strong> ${route.title}`);
        marker.addTo(group);
      }

      // Detected Stops
      if (showStops && route.stops) {
        route.stops.forEach((stop) => {
          const stopIcon = L.divIcon({
            className: 'custom-stop-marker',
            html: `<div style="background-color: #D97706; width: 10px; height: 10px; border-radius: 50%; border: 2px solid #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.35);"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
          const marker = L.marker([stop.lat, stop.lng], {icon: stopIcon});
          marker.bindPopup(`
            <div style="font-family: inherit; font-size: 13px; min-width: 150px;">
              <strong style="color: #0F172A; display: block; margin-bottom: 3px;">${stop.label}</strong>
              <div style="color: #64748B; font-size: 12px;">Stopped: ${formatDuration(stop.durationSec)}</div>
              <div style="color: #94A3B8; font-size: 11px; margin-top: 2px;">${formatCoordinates(stop.lat, stop.lng)}</div>
            </div>
          `);
          marker.addTo(group);
        });
      }
    });
  }, [routes, showStops, onSelectRoute, livePosition]);

  // Live Position Marker & Accuracy Circle (during active recording)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!livePosition) {
      if (liveMarkerRef.current) {
        map.removeLayer(liveMarkerRef.current);
        liveMarkerRef.current = null;
      }
      if (liveAccuracyCircleRef.current) {
        map.removeLayer(liveAccuracyCircleRef.current);
        liveAccuracyCircleRef.current = null;
      }
      return;
    }

    const pos: L.LatLngTuple = [livePosition.lat, livePosition.lng];

    // Live Marker with radar pulse
    if (!liveMarkerRef.current) {
      const liveIcon = L.divIcon({
        className: 'custom-live-marker',
        html: `
          <div style="position: relative; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background-color: rgba(59, 130, 246, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; width: 14px; height: 14px; border-radius: 50%; background-color: #2563EB; border: 2.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.35);"></div>
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      liveMarkerRef.current = L.marker(pos, {icon: liveIcon, zIndexOffset: 1000}).addTo(map);
    } else {
      liveMarkerRef.current.setLatLng(pos);
    }

    // Accuracy Circle
    if (liveAccuracyMeters && liveAccuracyMeters > 5) {
      if (!liveAccuracyCircleRef.current) {
        liveAccuracyCircleRef.current = L.circle(pos, {
          radius: liveAccuracyMeters,
          color: '#2563EB',
          weight: 1,
          opacity: 0.5,
          fillColor: '#3B82F6',
          fillOpacity: 0.12,
        }).addTo(map);
      } else {
        liveAccuracyCircleRef.current.setLatLng(pos);
        liveAccuracyCircleRef.current.setRadius(liveAccuracyMeters);
      }
    } else if (liveAccuracyCircleRef.current) {
      map.removeLayer(liveAccuracyCircleRef.current);
      liveAccuracyCircleRef.current = null;
    }

    if (autoFollow) {
      map.panTo(pos, {animate: true, duration: 0.8});
    }
  }, [livePosition, liveAccuracyMeters, autoFollow]);

  // Replay Position Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!replayPosition) {
      if (replayMarkerRef.current) {
        map.removeLayer(replayMarkerRef.current);
        replayMarkerRef.current = null;
      }
      return;
    }

    const pos: L.LatLngTuple = [replayPosition.lat, replayPosition.lng];

    if (!replayMarkerRef.current) {
      const replayIcon = L.divIcon({
        className: 'custom-replay-marker',
        html: `
          <div style="width: 18px; height: 18px; border-radius: 50%; background-color: #F59E0B; border: 3px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>
        `,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      replayMarkerRef.current = L.marker(pos, {icon: replayIcon, zIndexOffset: 999}).addTo(map);
    } else {
      replayMarkerRef.current.setLatLng(pos);
    }
  }, [replayPosition]);

  return (
    <div className="relative h-full w-full">
      {/* Map DOM Element */}
      <div ref={containerRef} className="h-full w-full z-0" />

      {/* Top Left: OpenStreetMap Live Status Badge */}
      <div className="absolute left-3 top-3 z-[400] flex items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm">
        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>OpenStreetMap Live Tiles</span>
      </div>

      {/* Top Right: Layer Switcher Menu */}
      <div className="absolute right-3 top-3 z-[400] flex flex-col items-end">
        <button
          type="button"
          onClick={() => setShowLayerMenu((prev) => !prev)}
          className="flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          title="Switch map layer"
        >
          <Layers className="h-3.5 w-3.5 text-blue-600" />
          <span className="capitalize">{mapLayer}</span>
        </button>

        {showLayerMenu && (
          <div className="mt-1 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
            {(['roadmap', 'satellite', 'terrain'] as MapLayerType[]).map((layer) => (
              <button
                key={layer}
                type="button"
                onClick={() => {
                  setMapLayer(layer);
                  setShowLayerMenu(false);
                }}
                className={`rounded px-3 py-1 text-left text-xs font-medium transition ${
                  mapLayer === layer
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {layer === 'roadmap'
                  ? '🗺️ Street Map (OSM)'
                  : layer === 'satellite'
                    ? '🛰️ Satellite (Esri)'
                    : '⛰️ Terrain / Voyager'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Right: Zoom & Reset Controls */}
      <div className="absolute bottom-4 right-4 z-[400] flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
          title="Zoom In"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
          title="Zoom Out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={fitBounds}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
          title="Fit Routes to Screen"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (livePosition) {
              if (onAutoFollowChange) onAutoFollowChange(!autoFollow);
              mapRef.current?.panTo([livePosition.lat, livePosition.lng]);
            } else {
              handleLocateMe();
            }
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm transition ${
            autoFollow || locating
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-[#CBD5E1] bg-white text-slate-700 hover:bg-slate-50'
          }`}
          title="Locate My Position / Center Map"
        >
          <Crosshair className={`h-4 w-4 ${locating ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
