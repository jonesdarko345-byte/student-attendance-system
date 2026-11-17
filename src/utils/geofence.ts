/**
 * UENR Campus Geofence & Anti-Proxy Location Engine
 * Ensures students are physically present on campus / lecture halls during QR roll-calls.
 */

export interface GeofenceConfig {
  enabled: boolean;
  campusName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  allowOnlineBypass: boolean;
}

// Toggle to quickly re-enable or pause GPS attendance & campus geofencing across the portal
export const GPS_ATTENDANCE_ENABLED = false;

// Official Verified Coordinates for University of Energy and Natural Resources (UENR) Main Campus, Sunyani, Ghana
// Location: Sunyani-Fiapre Road (Covers LTS 1, LTS 2, NEC, Pavilion, Engineering Complex, Science Blocks & Hostels)
export const DEFAULT_UENR_GEOFENCE: GeofenceConfig = {
  enabled: GPS_ATTENDANCE_ENABLED,
  campusName: 'UENR Main Campus (Sunyani)',
  latitude: 7.34949,
  longitude: -2.34350,
  radiusMeters: GPS_ATTENDANCE_ENABLED ? 2500 : 0, // 2.5km radius covers entire UENR Sunyani-Fiapre campus perimeter when enabled
  allowOnlineBypass: true
};

export interface CampusHallPreset {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  recommendedRadius: number;
}

export const UENR_HALL_PRESETS: CampusHallPreset[] = [
  {
    id: 'uenr-main',
    name: 'UENR Main Campus (Sunyani)',
    latitude: 7.34949,
    longitude: -2.34350,
    recommendedRadius: 2500
  },
  {
    id: 'uenr-academic',
    name: 'LTS / RCEES Academic Complex',
    latitude: 7.34890,
    longitude: -2.34410,
    recommendedRadius: 1500
  },
  {
    id: 'uenr-engineering',
    name: 'Engineering & IT Lab Block',
    latitude: 7.35020,
    longitude: -2.34280,
    recommendedRadius: 800
  }
];

/**
 * Calculates Great-Circle distance between two GPS coordinates using the Haversine formula in meters.
 */
export const calculateDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
};

export interface LocationVerificationResult {
  status: 'verified' | 'outside' | 'error' | 'permission_denied' | 'unsupported';
  isInside: boolean;
  distanceMeters?: number;
  accuracyMeters?: number;
  userCoords?: { latitude: number; longitude: number };
  message: string;
}

/**
 * Verifies if the user's current device coordinates fall within the UENR campus boundary.
 */
export const verifyCampusLocation = async (
  config: GeofenceConfig = DEFAULT_UENR_GEOFENCE
): Promise<LocationVerificationResult> => {
  if (!GPS_ATTENDANCE_ENABLED || !config.enabled || config.radiusMeters <= 0) {
    return {
      status: 'verified',
      isInside: true,
      distanceMeters: 0,
      message: 'GPS attendance verification is currently disabled.'
    };
  }

  if (typeof window === 'undefined' || !navigator.geolocation) {
    return {
      status: 'unsupported',
      isInside: false,
      message: 'Geolocation is not supported on this device browser.'
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLon = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 0);

        const dist = calculateDistanceMeters(
          userLat,
          userLon,
          config.latitude,
          config.longitude
        );

        // Allow tolerance equal to GPS accuracy radius up to 250m for dense concrete buildings like LTS 1
        const effectiveRadius = config.radiusMeters + Math.min(accuracy, 250);
        const isInside = dist <= effectiveRadius;

        if (isInside) {
          resolve({
            status: 'verified',
            isInside: true,
            distanceMeters: dist,
            accuracyMeters: accuracy,
            userCoords: { latitude: userLat, longitude: userLon },
            message: `Location Confirmed: Within ${config.campusName} (~${dist}m from campus center).`
          });
        } else {
          const km = (dist / 1000).toFixed(1);
          resolve({
            status: 'outside',
            isInside: false,
            distanceMeters: dist,
            accuracyMeters: accuracy,
            userCoords: { latitude: userLat, longitude: userLon },
            message: `Check-in Blocked: You are outside ${config.campusName} (~${km} km away). In-person attendance is required.`
          });
        }
      },
      (err) => {
        let msg = 'Unable to determine your physical location.';
        let status: 'permission_denied' | 'error' = 'error';

        if (err.code === err.PERMISSION_DENIED) {
          status = 'permission_denied';
          msg = 'Location access was denied. Please enable Location Services in your phone settings to verify your campus presence.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'GPS location is temporarily unavailable. If indoors in a lecture hall, use the Projector Override PIN.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Location detection timed out. Please check your phone GPS signal and retry.';
        }

        resolve({
          status,
          isInside: false,
          message: msg
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000
      }
    );
  });
};

/**
 * Generates an in-room rolling PIN that updates every 30 seconds on the projector screen.
 * This prevents students from WhatsApping or texting the PIN to friends in remote hostels,
 * because the PIN expires before the remote friend can use it!
 */
export const getRollingPin = (courseId: string, timeStepSeconds: number = 30): { pin: string; secondsRemaining: number } => {
  const now = Math.floor(Date.now() / 1000);
  const timeBlock = Math.floor(now / timeStepSeconds);
  const secondsRemaining = timeStepSeconds - (now % timeStepSeconds);

  let hash = 0;
  const str = `uenr-rot-${courseId}-${timeBlock}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const pin = String(Math.abs(hash % 9000) + 1000);
  return { pin, secondsRemaining };
};

/**
 * Validates a rolling PIN against the current or immediately previous 30-second window (grace period).
 */
export const validateRollingPin = (courseId: string, enteredPin: string, timeStepSeconds: number = 30): boolean => {
  const clean = enteredPin.trim();
  if (!clean || clean.length !== 4) return false;

  const now = Math.floor(Date.now() / 1000);
  const currentBlock = Math.floor(now / timeStepSeconds);
  const prevBlock = currentBlock - 1;

  for (const block of [currentBlock, prevBlock]) {
    let hash = 0;
    const str = `uenr-rot-${courseId}-${block}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const pin = String(Math.abs(hash % 9000) + 1000);
    if (clean === pin) return true;
  }
  return false;
};

/**
 * Generates an in-room daily backup PIN for physical projection fallback.
 */
export const getInRoomBackupPin = (dateStr: string, courseId: string): string => {
  let hash = 0;
  const str = `uenr-${dateStr}-${courseId}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const pin = Math.abs(hash % 9000) + 1000;
  return String(pin);
};
