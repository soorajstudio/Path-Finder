import type {GpsPoint, Journey, LatLngPoint, TravelActivity} from '../types/journey';
import {
  calculateBearing,
  computeJourneyStats,
  detectStops,
  haversineDistanceMeters,
} from '../utils/gpsMath';

interface WaypointSpec extends LatLngPoint {
  stopSec?: number;
  stopLabel?: string;
}

interface SeedSpec {
  id: string;
  title: string;
  activity: TravelActivity;
  dateIso: string;
  startLocation: string;
  endLocation: string;
  cruiseSpeedKmh: number;
  filteredJumpCount: number;
  recordedOffline?: boolean;
  waypoints: WaypointSpec[];
}

/**
 * Expands high-level geographic waypoints into realistic timestamped GPS tracks
 * with smooth speed curves, acceleration/deceleration, and genuine stop clusters.
 */
function buildJourneyFromWaypoints(spec: SeedSpec): Journey {
  const points: GpsPoint[] = [];
  let currentTs = new Date(spec.dateIso).getTime();

  const stopLabelsByTime: Array<{start: number; end: number; label: string}> = [];

  for (let i = 0; i < spec.waypoints.length; i++) {
    const wp = spec.waypoints[i];
    const nextWp = spec.waypoints[i + 1];

    // If this waypoint has a stop, insert stationary GPS points with tiny realistic drift (< 4m)
    if (wp.stopSec && wp.stopSec > 0) {
      const stopStart = currentTs;
      const samples = Math.max(4, Math.ceil(wp.stopSec / 15));
      const stepMs = (wp.stopSec * 1000) / samples;
      for (let s = 0; s <= samples; s++) {
        const wobbleLat = Math.sin(s * 1.7) * 0.000018;
        const wobbleLng = Math.cos(s * 1.3) * 0.000018;
        points.push({
          lat: Number((wp.lat + wobbleLat).toFixed(6)),
          lng: Number((wp.lng + wobbleLng).toFixed(6)),
          timestamp: Math.round(currentTs),
          speedKmh: s === 0 || s === samples ? 0.6 : 0,
          accuracyMeters: 6 + (s % 4),
          heading: points.length > 0 ? points[points.length - 1].heading : 0,
        });
        if (s < samples) {
          currentTs += stepMs;
        }
      }
      stopLabelsByTime.push({
        start: stopStart,
        end: currentTs,
        label: wp.stopLabel ?? 'Recorded Stop',
      });
    }

    if (!nextWp) {
      if (!wp.stopSec) {
        points.push({
          lat: wp.lat,
          lng: wp.lng,
          timestamp: Math.round(currentTs),
          speedKmh: 0,
          accuracyMeters: 5,
          heading: points.length > 0 ? points[points.length - 1].heading : 0,
        });
      }
      break;
    }

    const segDistM = haversineDistanceMeters(wp, nextWp);
    const bearing = Math.round(calculateBearing(wp, nextWp));
    const speedMps = Math.max(1.1, spec.cruiseSpeedKmh / 3.6);
    const segSec = Math.max(20, segDistM / speedMps);
    const subSteps = Math.max(6, Math.min(18, Math.round(segDistM / 350)));

    for (let k = 0; k < subSteps; k++) {
      const frac = k / subSteps;
      // Add mild speed modulation along the segment
      const mod = 0.85 + 0.3 * Math.sin(frac * Math.PI);
      const speedKmh = Number((spec.cruiseSpeedKmh * mod).toFixed(1));
      const lat = wp.lat + (nextWp.lat - wp.lat) * frac;
      const lng = wp.lng + (nextWp.lng - wp.lng) * frac;

      points.push({
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        timestamp: Math.round(currentTs),
        speedKmh: k === 0 && i === 0 ? 4.2 : speedKmh,
        accuracyMeters: 5 + ((i + k) % 7),
        heading: bearing,
      });

      currentTs += (segSec * 1000) / subSteps;
    }
  }

  const detectedStops = detectStops(points).map((stop, idx) => {
    const matched = stopLabelsByTime[idx];
    return matched ? {...stop, label: matched.label} : stop;
  });

  const stats = computeJourneyStats(points, detectedStops);

  return {
    id: spec.id,
    title: spec.title,
    activity: spec.activity,
    startTime: points[0].timestamp,
    endTime: points[points.length - 1].timestamp,
    startLocation: spec.startLocation,
    endLocation: spec.endLocation,
    points,
    stops: detectedStops,
    stats,
    filteredJumpCount: spec.filteredJumpCount,
    recordedOffline: spec.recordedOffline,
  };
}

const SEED_SPECS: SeedSpec[] = [
  {
    id: 'jrn-2026-11-22-bay-drive',
    title: 'Golden Gate Coastal Drive',
    activity: 'car',
    dateIso: '2026-11-22T09:15:00-08:00',
    startLocation: 'San Francisco Marina',
    endLocation: 'Sausalito Waterfront',
    cruiseSpeedKmh: 48,
    filteredJumpCount: 2,
    waypoints: [
      {lat: 37.8044, lng: -122.4378},
      {lat: 37.8062, lng: -122.4488},
      {lat: 37.8076, lng: -122.4655},
      {lat: 37.8084, lng: -122.4754, stopSec: 95, stopLabel: 'Bridge Overlook Pullout'},
      {lat: 37.8199, lng: -122.4783},
      {lat: 37.8322, lng: -122.4801},
      {lat: 37.8448, lng: -122.4819},
      {lat: 37.8565, lng: -122.4828, stopSec: 130, stopLabel: 'Waterfront Stop'},
      {lat: 37.8591, lng: -122.4853},
    ],
  },
  {
    id: 'jrn-2026-11-20-caltrain',
    title: 'Peninsula Rail Commute',
    activity: 'train',
    dateIso: '2026-11-20T08:05:00-08:00',
    startLocation: 'San Francisco 4th & King',
    endLocation: 'San Mateo Station',
    cruiseSpeedKmh: 76,
    filteredJumpCount: 4,
    waypoints: [
      {lat: 37.7764, lng: -122.3943},
      {lat: 37.7574, lng: -122.3924},
      {lat: 37.7105, lng: -122.4018},
      {lat: 37.6559, lng: -122.4051, stopSec: 75, stopLabel: 'South SF Station'},
      {lat: 37.6001, lng: -122.3867, stopSec: 90, stopLabel: 'Millbrae Transfer'},
      {lat: 37.5798, lng: -122.3451},
      {lat: 37.5681, lng: -122.3239},
    ],
  },
  {
    id: 'jrn-2026-11-18-walk-embarcadero',
    title: 'Embarcadero Morning Walk',
    activity: 'walking',
    dateIso: '2026-11-18T07:30:00-08:00',
    startLocation: 'Ferry Building Promenade',
    endLocation: 'Aquatic Park Cove',
    cruiseSpeedKmh: 5.1,
    filteredJumpCount: 1,
    recordedOffline: true,
    waypoints: [
      {lat: 37.7955, lng: -122.3937},
      {lat: 37.8012, lng: -122.3982},
      {lat: 37.8063, lng: -122.4051, stopSec: 110, stopLabel: 'Pier Bench Rest'},
      {lat: 37.8087, lng: -122.4126},
      {lat: 37.8082, lng: -122.4209},
      {lat: 37.8065, lng: -122.4244},
    ],
  },
  {
    id: 'jrn-2026-11-14-moto-skyline',
    title: 'Skyline Ridge Motorcycle Loop',
    activity: 'motorcycle',
    dateIso: '2026-11-14T13:40:00-08:00',
    startLocation: 'Pacifica Coast Hwy',
    endLocation: 'Half Moon Bay Harbor',
    cruiseSpeedKmh: 62,
    filteredJumpCount: 3,
    recordedOffline: true,
    waypoints: [
      {lat: 37.6138, lng: -122.4869},
      {lat: 37.5841, lng: -122.4995},
      {lat: 37.5612, lng: -122.5123, stopSec: 185, stopLabel: 'Coastal Overlook'},
      {lat: 37.5301, lng: -122.5142},
      {lat: 37.5032, lng: -122.4834},
      {lat: 37.4636, lng: -122.4286},
    ],
  },
  {
    id: 'jrn-2026-10-28-bus-eastbay',
    title: 'Transbay Express Bus',
    activity: 'bus',
    dateIso: '2026-10-28T17:20:00-07:00',
    startLocation: 'Salesforce Transit Center',
    endLocation: 'Oakland Lake Merritt',
    cruiseSpeedKmh: 44,
    filteredJumpCount: 2,
    waypoints: [
      {lat: 37.7897, lng: -122.3962},
      {lat: 37.7918, lng: -122.3879},
      {lat: 37.7983, lng: -122.3778},
      {lat: 37.8112, lng: -122.3578},
      {lat: 37.8214, lng: -122.3235, stopSec: 65, stopLabel: 'Toll Plaza Queue'},
      {lat: 37.8135, lng: -122.2889},
      {lat: 37.8049, lng: -122.2641},
    ],
  },
  {
    id: 'jrn-2026-09-19-car-napa',
    title: 'Valley Highway Day Trip',
    activity: 'car',
    dateIso: '2026-09-19T10:00:00-07:00',
    startLocation: 'Berkeley Marina',
    endLocation: 'Napa Riverfront',
    cruiseSpeedKmh: 82,
    filteredJumpCount: 5,
    waypoints: [
      {lat: 37.8651, lng: -122.3135},
      {lat: 37.9358, lng: -122.3256},
      {lat: 38.0156, lng: -122.2854},
      {lat: 38.0752, lng: -122.2442, stopSec: 210, stopLabel: 'Bridge View Rest Area'},
      {lat: 38.1724, lng: -122.2562},
      {lat: 38.2975, lng: -122.2869},
    ],
  },
  {
    id: 'jrn-2026-07-12-train-san-jose',
    title: 'South Bay Corridor Express',
    activity: 'train',
    dateIso: '2026-07-12T11:10:00-07:00',
    startLocation: 'Palo Alto Station',
    endLocation: 'San Jose Diridon',
    cruiseSpeedKmh: 88,
    filteredJumpCount: 2,
    waypoints: [
      {lat: 37.4431, lng: -122.1648},
      {lat: 37.3944, lng: -122.0761, stopSec: 60, stopLabel: 'Mountain View Stop'},
      {lat: 37.3784, lng: -122.0308},
      {lat: 37.3531, lng: -121.9369},
      {lat: 37.3297, lng: -121.9025},
    ],
  },
  {
    id: 'jrn-2026-04-06-car-santa-cruz',
    title: 'Highway 17 Mountain Crossing',
    activity: 'car',
    dateIso: '2026-04-06T09:00:00-07:00',
    startLocation: 'Los Gatos Town Center',
    endLocation: 'Santa Cruz Wharf',
    cruiseSpeedKmh: 68,
    filteredJumpCount: 4,
    waypoints: [
      {lat: 37.2266, lng: -121.9747},
      {lat: 37.1852, lng: -121.9881},
      {lat: 37.1365, lng: -121.9815, stopSec: 120, stopLabel: 'Summit Road Turnout'},
      {lat: 37.0548, lng: -122.0124},
      {lat: 36.9741, lng: -122.0308},
    ],
  },
  {
    id: 'jrn-2025-11-15-car-monterey',
    title: 'Monterey Bay Coastal Route',
    activity: 'car',
    dateIso: '2025-11-15T10:30:00-08:00',
    startLocation: 'Santa Cruz Harbor',
    endLocation: 'Monterey Fisherman Wharf',
    cruiseSpeedKmh: 78,
    filteredJumpCount: 3,
    waypoints: [
      {lat: 36.9648, lng: -122.0012},
      {lat: 36.9012, lng: -121.8415},
      {lat: 36.8044, lng: -121.7869, stopSec: 160, stopLabel: 'Moss Landing Pullout'},
      {lat: 36.6844, lng: -121.8021},
      {lat: 36.6038, lng: -121.8935},
    ],
  },
  {
    id: 'jrn-2025-08-22-moto-marin',
    title: 'Marin Headlands Ridge Ride',
    activity: 'motorcycle',
    dateIso: '2025-08-22T15:00:00-07:00',
    startLocation: 'Mill Valley Depot',
    endLocation: 'Stinson Beach Overlook',
    cruiseSpeedKmh: 52,
    filteredJumpCount: 2,
    waypoints: [
      {lat: 37.906, lng: -122.545},
      {lat: 37.9022, lng: -122.5791},
      {lat: 37.9089, lng: -122.6122, stopSec: 140, stopLabel: 'Panoramic Turnout'},
      {lat: 37.8998, lng: -122.6442},
    ],
  },
  {
    id: 'jrn-2025-05-10-train-sacramento',
    title: 'Capitol Corridor Regional Rail',
    activity: 'train',
    dateIso: '2025-05-10T08:45:00-07:00',
    startLocation: 'Emeryville Station',
    endLocation: 'Davis Station',
    cruiseSpeedKmh: 94,
    filteredJumpCount: 3,
    waypoints: [
      {lat: 37.8404, lng: -122.2918},
      {lat: 38.0185, lng: -122.1381, stopSec: 80, stopLabel: 'Martinez Station'},
      {lat: 38.2432, lng: -122.0398},
      {lat: 38.5435, lng: -121.7377},
    ],
  },
];

export function createSeedJourneys(): Journey[] {
  return SEED_SPECS.map(buildJourneyFromWaypoints).sort(
    (a, b) => b.startTime - a.startTime
  );
}

/**
 * Deterministic live GPS simulation path along the San Francisco waterfront,
 * spaced at realistic ~15-18m increments per 1.2s tick (~45-54 km/h) so all genuine
 * points pass the speed/jump filter while one intentional 4km GPS glitch gets rejected.
 */
export const SIMULATED_LIVE_TRACK: Array<{
  lat: number;
  lng: number;
  speedKmh: number;
  accuracyMeters: number;
  isJumpGlitch?: boolean;
}> = [
  {lat: 37.7955, lng: -122.3937, speedKmh: 28.4, accuracyMeters: 6},
  {lat: 37.79564, lng: -122.39382, speedKmh: 36.2, accuracyMeters: 5},
  {lat: 37.79579, lng: -122.39395, speedKmh: 42.5, accuracyMeters: 6},
  {lat: 37.79595, lng: -122.39408, speedKmh: 46.8, accuracyMeters: 5},
  // Intentional unreasonable GPS teleport jump (~4.8 km in 1.2s — rejected by filterGpsPoint)
  {lat: 37.8390, lng: -122.4150, speedKmh: 120.0, accuracyMeters: 16, isJumpGlitch: true},
  {lat: 37.79612, lng: -122.39422, speedKmh: 48.2, accuracyMeters: 5},
  {lat: 37.79629, lng: -122.39437, speedKmh: 49.4, accuracyMeters: 6},
  {lat: 37.79647, lng: -122.39452, speedKmh: 45.1, accuracyMeters: 5},
  {lat: 37.79664, lng: -122.39467, speedKmh: 38.7, accuracyMeters: 6},
  {lat: 37.79680, lng: -122.39481, speedKmh: 26.0, accuracyMeters: 5},
  {lat: 37.79693, lng: -122.39494, speedKmh: 14.5, accuracyMeters: 6},
  {lat: 37.79702, lng: -122.39503, speedKmh: 0.2, accuracyMeters: 5},
  {lat: 37.79703, lng: -122.39504, speedKmh: 0.0, accuracyMeters: 5},
  {lat: 37.79717, lng: -122.39517, speedKmh: 31.4, accuracyMeters: 6},
  {lat: 37.79734, lng: -122.39532, speedKmh: 44.6, accuracyMeters: 5},
  {lat: 37.79752, lng: -122.39547, speedKmh: 50.2, accuracyMeters: 6},
  {lat: 37.79771, lng: -122.39562, speedKmh: 52.1, accuracyMeters: 5},
  {lat: 37.79790, lng: -122.39578, speedKmh: 47.9, accuracyMeters: 6},
  {lat: 37.79808, lng: -122.39594, speedKmh: 41.3, accuracyMeters: 5},
  {lat: 37.79825, lng: -122.39609, speedKmh: 35.8, accuracyMeters: 6},
];
