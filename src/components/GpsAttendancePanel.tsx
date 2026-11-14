import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { Course, Student } from '../types';
import {
  verifyCampusLocation,
  LocationVerificationResult,
  UENR_HALL_PRESETS,
  getRollingPin,
  DEFAULT_UENR_GEOFENCE
} from '../utils/geofence';
import {
  MapPin,
  Navigation,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  QrCode,
  Copy,
  Check,
  KeyRound,
  Crosshair,
  Users,
  Lock
} from 'lucide-react';

interface GpsAttendancePanelProps {
  date: string;
  course: Course;
  stream: string;
  venueHint?: string;
  students: Student[];
  sessionRecords: Record<string, 'present' | 'absent'>;
  biometricVerifiedIds: string[];
  gpsVerifiedIds: string[];
  isSessionFinalized: boolean;
  onOpenQRModal: () => void;
}

export const GpsAttendancePanel: React.FC<GpsAttendancePanelProps> = ({
  date,
  course,
  stream,
  venueHint,
  students,
  sessionRecords,
  biometricVerifiedIds,
  gpsVerifiedIds,
  isSessionFinalized,
  onOpenQRModal
}) => {
  const { geofenceSettings, updateGeofenceSettings, checkInStudentWithIndex, currentUser, verifiedRole } = useApp();

  const canManageGeofence =
    verifiedRole === 'hod' ||
    verifiedRole === 'lecturer' ||
    currentUser?.role === 'hod' ||
    currentUser?.role === 'lecturer';

  const [gpsResult, setGpsResult] = useState<LocationVerificationResult | null>(null);
  const [isCheckingGps, setIsCheckingGps] = useState<boolean>(false);
  const [isPinningHall, setIsPinningHall] = useState<boolean>(false);
  const [customHallName, setCustomHallName] = useState<string>(venueHint || geofenceSettings.campusName);
  const [calibrationFeedback, setCalibrationFeedback] = useState<string | null>(null);

  const [indexInput, setIndexInput] = useState<string>('');
  const [isCheckingIn, setIsCheckingIn] = useState<boolean>(false);
  const [checkInFeedback, setCheckInFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [rollingPinData, setRollingPinData] = useState<{ pin: string; secondsRemaining: number }>({
    pin: '1000',
    secondsRemaining: 30
  });

  useEffect(() => {
    setCustomHallName(venueHint || geofenceSettings.campusName);
  }, [venueHint, geofenceSettings.campusName]);

  useEffect(() => {
    const updatePin = () => {
      setRollingPinData(getRollingPin(course.id, 30));
    };
    updatePin();
    const timer = setInterval(updatePin, 1000);
    return () => clearInterval(timer);
  }, [course.id]);

  const runGpsCheck = useCallback(async () => {
    setIsCheckingGps(true);
    try {
      const result = await verifyCampusLocation({
        enabled: geofenceSettings.radiusMeters > 0,
        campusName: geofenceSettings.campusName,
        latitude: geofenceSettings.latitude,
        longitude: geofenceSettings.longitude,
        radiusMeters: geofenceSettings.radiusMeters,
        allowOnlineBypass: true
      });
      setGpsResult(result);
    } finally {
      setIsCheckingGps(false);
    }
  }, [geofenceSettings.campusName, geofenceSettings.latitude, geofenceSettings.longitude, geofenceSettings.radiusMeters]);

  useEffect(() => {
    if (geofenceSettings.radiusMeters > 0) {
      runGpsCheck();
    } else {
      setGpsResult(null);
    }
  }, [geofenceSettings.latitude, geofenceSettings.longitude, geofenceSettings.radiusMeters, runGpsCheck]);

  const handlePinCurrentHall = () => {
    if (!canManageGeofence) return;
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setCalibrationFeedback('GPS location services are unavailable on this browser.');
      return;
    }

    setIsPinningHall(true);
    setCalibrationFeedback(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const label = (customHallName || venueHint || 'Pinned Lecture Hall').trim();
        await updateGeofenceSettings({
          enabled: true,
          campusName: label,
          latitude: lat,
          longitude: lng,
          radiusMeters: geofenceSettings.radiusMeters === 0 ? 800 : geofenceSettings.radiusMeters
        });
        setIsPinningHall(false);
        setCalibrationFeedback(`Saved hall center "${label}" at ${lat}, ${lng}.`);
        setTimeout(() => setCalibrationFeedback(null), 5000);
      },
      (err) => {
        setIsPinningHall(false);
        setCalibrationFeedback(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Enable browser location access to pin this hall.'
            : 'Could not read current GPS coordinates. Try moving near a window or checking device GPS.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSelectPreset = async (presetId: string) => {
    if (!canManageGeofence) return;
    const preset = UENR_HALL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setCustomHallName(preset.name);
    await updateGeofenceSettings({
      enabled: true,
      campusName: preset.name,
      latitude: preset.latitude,
      longitude: preset.longitude,
      radiusMeters: preset.recommendedRadius
    });
    setCalibrationFeedback(`Perimeter set to ${preset.name} (${preset.recommendedRadius}m).`);
    setTimeout(() => setCalibrationFeedback(null), 4000);
  };

  const handleResetDefaultCampus = async () => {
    if (!canManageGeofence) return;
    setCustomHallName(DEFAULT_UENR_GEOFENCE.campusName);
    await updateGeofenceSettings({
      enabled: true,
      campusName: DEFAULT_UENR_GEOFENCE.campusName,
      latitude: DEFAULT_UENR_GEOFENCE.latitude,
      longitude: DEFAULT_UENR_GEOFENCE.longitude,
      radiusMeters: DEFAULT_UENR_GEOFENCE.radiusMeters
    });
  };

  const cleanStream = stream && stream !== 'all' && stream !== 'All Streams' ? stream : 'L200 IT-A';

  const checkInLink = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${window.location.pathname}?checkin=1&courseId=${encodeURIComponent(
      course.id
    )}&code=${encodeURIComponent(course.code)}&title=${encodeURIComponent(
      course.title
    )}&lecturer=${encodeURIComponent(course.lecturer || '')}&date=${encodeURIComponent(
      date
    )}&stream=${encodeURIComponent(cleanStream)}&geo=${geofenceSettings.radiusMeters}&pinMode=${
      geofenceSettings.rollingPinEnabled ? 'rolling' : 'off'
    }&lat=${geofenceSettings.latitude}&lng=${geofenceSettings.longitude}`;
  }, [course, date, cleanStream, geofenceSettings]);

  const handleCopyCheckInLink = () => {
    if (navigator.clipboard && checkInLink) {
      navigator.clipboard.writeText(checkInLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const canCheckInByGps =
    geofenceSettings.radiusMeters === 0 || (gpsResult !== null && gpsResult.status === 'verified');

  const handleGpsStudentCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSessionFinalized) {
      setCheckInFeedback({ type: 'error', text: 'This session is finalized and locked.' });
      return;
    }
    if (!indexInput.trim()) {
      setCheckInFeedback({ type: 'error', text: 'Enter a student index number first.' });
      return;
    }
    if (!canCheckInByGps) {
      setCheckInFeedback({
        type: 'error',
        text: 'Device GPS must be verified inside the campus/hall perimeter before recording a GPS check-in.'
      });
      return;
    }

    setIsCheckingIn(true);
    setCheckInFeedback(null);
    try {
      const res = await checkInStudentWithIndex(
        indexInput,
        date,
        course.id,
        stream === 'all' ? undefined : stream,
        {
          gpsVerified: geofenceSettings.radiusMeters > 0 ? Boolean(gpsResult?.isInside) : false,
          distanceMeters: gpsResult?.distanceMeters
        }
      );

      if (res.success) {
        setCheckInFeedback({
          type: 'success',
          text: `${res.student?.name} (${res.student?.indexNumber}) checked in${
            typeof gpsResult?.distanceMeters === 'number' ? ` · ${gpsResult.distanceMeters}m from center` : ''
          }.`
        });
        setIndexInput('');
      } else {
        setCheckInFeedback({ type: 'error', text: res.message });
      }
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Radar plot math (relative offset in SVG 200x200 box where perimeter circle radius = 72px)
  const radarPoint = useMemo(() => {
    if (!gpsResult?.userCoords || geofenceSettings.radiusMeters <= 0) return null;
    const dLatMeters = (gpsResult.userCoords.latitude - geofenceSettings.latitude) * 111320;
    const dLngMeters =
      (gpsResult.userCoords.longitude - geofenceSettings.longitude) *
      111320 *
      Math.cos((geofenceSettings.latitude * Math.PI) / 180);
    const dist = Math.hypot(dLatMeters, dLngMeters);
    const maxVisualRadius = 72;
    const scale = maxVisualRadius / Math.max(geofenceSettings.radiusMeters, 1);
    let px = dLngMeters * scale;
    let py = -dLatMeters * scale;
    const r = Math.hypot(px, py);
    if (r > 88) {
      px = (px / r) * 88;
      py = (py / r) * 88;
    }
    return {
      cx: 100 + px,
      cy: 100 + py,
      accuracyPx: Math.min(Math.max((gpsResult.accuracyMeters || 20) * scale, 6), 36),
      dist: Math.round(dist)
    };
  }, [gpsResult, geofenceSettings.latitude, geofenceSettings.longitude, geofenceSettings.radiusMeters]);

  const presentStudents = useMemo(
    () => students.filter((s) => sessionRecords[s.id] === 'present'),
    [students, sessionRecords]
  );

  const gpsCount = useMemo(
    () => presentStudents.filter((s) => gpsVerifiedIds.includes(s.id)).length,
    [presentStudents, gpsVerifiedIds]
  );

  const isBypassed = geofenceSettings.radiusMeters === 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Header Bar */}
      <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#007c82] dark:text-teal-400">
            <MapPin className="w-4 h-4" />
            <span>Campus GPS Geofence · {course.code}</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            GPS Perimeter &amp; Location-Verified Roll Call
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Pin your lecture hall GPS coordinates and enforce campus proximity for student QR and direct roll-call check-ins.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button
            type="button"
            onClick={runGpsCheck}
            disabled={isCheckingGps || isBypassed}
            className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingGps ? 'animate-spin' : ''}`} />
            <span>{isCheckingGps ? 'Checking GPS...' : 'Refresh My GPS'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenQRModal}
            className="px-4 py-2 rounded-xl bg-[#003b5c] hover:bg-[#002d47] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <QrCode className="w-3.5 h-3.5 text-[#8dc63f]" />
            <span>Open Projector QR + GPS Screen</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        {/* Left Column: Live GPS Telemetry, Radar & Hall Calibration */}
        <div className="lg:col-span-6 p-5 sm:p-6 space-y-5">
          {/* Status Summary Strip */}
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                Active Perimeter Status
              </span>
              <div className="mt-1 flex items-center gap-2">
                {isBypassed ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Geofence Bypassed (Online Mode)
                  </span>
                ) : gpsResult?.status === 'verified' ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Inside Campus / Hall Perimeter
                  </span>
                ) : gpsResult?.status === 'outside' ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-700 dark:text-rose-400">
                    <AlertTriangle className="w-4 h-4" />
                    Outside Perimeter ({((gpsResult.distanceMeters || 0) / 1000).toFixed(2)} km away)
                  </span>
                ) : gpsResult?.status === 'permission_denied' || gpsResult?.status === 'error' ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    Location Permission Needed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-700 dark:text-sky-400">
                    <Navigation className="w-4 h-4" />
                    Acquiring GPS Fix...
                  </span>
                )}
              </div>
            </div>

            <div className="text-right font-mono tabular-nums">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Allowed Radius</span>
              <span className="text-base font-bold text-slate-900 dark:text-white">
                {isBypassed
                  ? 'Off'
                  : geofenceSettings.radiusMeters >= 1000
                  ? `${(geofenceSettings.radiusMeters / 1000).toFixed(1)} km`
                  : `${geofenceSettings.radiusMeters} m`}
              </span>
            </div>
          </div>

          {/* Radar + Telemetry Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
            <div className="sm:col-span-5 flex flex-col items-center">
              <svg
                viewBox="0 0 200 200"
                className="w-44 h-44 rounded-2xl bg-slate-950 border border-slate-800"
                role="img"
                aria-label="Campus GPS Geofence Perimeter Radar"
              >
                {/* Grid Crosshairs */}
                <line x1="100" y1="8" x2="100" y2="192" stroke="#1e293b" strokeWidth="1" />
                <line x1="8" y1="100" x2="192" y2="100" stroke="#1e293b" strokeWidth="1" />
                {/* Inner reference rings */}
                <circle cx="100" cy="100" r="24" fill="none" stroke="#1e293b" strokeWidth="1" />
                <circle cx="100" cy="100" r="48" fill="none" stroke="#1e293b" strokeWidth="1" />
                {/* Active Perimeter Circle */}
                <circle
                  cx="100"
                  cy="100"
                  r="72"
                  fill={isBypassed ? 'rgba(148,163,184,0.06)' : 'rgba(16,185,129,0.09)'}
                  stroke={isBypassed ? '#64748b' : '#10b981'}
                  strokeWidth="1.5"
                  strokeDasharray={isBypassed ? '4 4' : 'none'}
                />
                {/* Pinned Hall Center */}
                <circle cx="100" cy="100" r="4" fill="#38bdf8" />
                <text x="100" y="18" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace">
                  N
                </text>
                {/* Live Device Position */}
                {radarPoint && !isBypassed && (
                  <>
                    <circle
                      cx={radarPoint.cx}
                      cy={radarPoint.cy}
                      r={radarPoint.accuracyPx}
                      fill={gpsResult?.isInside ? 'rgba(16,185,129,0.18)' : 'rgba(244,63,94,0.18)'}
                      stroke={gpsResult?.isInside ? '#34d399' : '#fb7185'}
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={radarPoint.cx}
                      cy={radarPoint.cy}
                      r="5"
                      fill={gpsResult?.isInside ? '#10b981' : '#f43f5e'}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  </>
                )}
              </svg>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Blue: Pinned Hall</span>
                <span aria-hidden="true">·</span>
                <span>Green/Red: Your Device</span>
              </div>
            </div>

            {/* Numeric Coordinate Readout */}
            <div className="sm:col-span-7 space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Pinned Hall</span>
                <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                  {geofenceSettings.campusName}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Target Coordinates</span>
                <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                  {geofenceSettings.latitude.toFixed(5)}, {geofenceSettings.longitude.toFixed(5)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Your Device GPS</span>
                <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                  {gpsResult?.userCoords
                    ? `${gpsResult.userCoords.latitude.toFixed(5)}, ${gpsResult.userCoords.longitude.toFixed(5)}`
                    : isBypassed
                    ? 'Bypassed'
                    : 'Not acquired'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Distance / Accuracy</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {typeof gpsResult?.distanceMeters === 'number'
                    ? `${gpsResult.distanceMeters}m away (±${gpsResult.accuracyMeters || 0}m)`
                    : '—'}
                </span>
              </div>

              {gpsResult?.message && gpsResult.status !== 'verified' && !isBypassed && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 pt-1 leading-relaxed">
                  {gpsResult.message} If you are physically inside a lecture hall and the default campus center shows far away, click <strong>Pin My Hall GPS</strong> below to set this room&apos;s exact coordinates.
                </p>
              )}
            </div>
          </div>

          {/* Hall Calibration & Radius Controls */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Hall Coordinates &amp; Perimeter Configuration
              </span>
              {!canManageGeofence && (
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Lecturer / HOD only
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Hall / Venue Label
                </label>
                <input
                  type="text"
                  value={customHallName}
                  onChange={(e) => setCustomHallName(e.target.value)}
                  disabled={!canManageGeofence}
                  placeholder="e.g. LTS 2 Lecture Hall"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007c82] disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Geofence Perimeter Radius
                </label>
                <select
                  value={geofenceSettings.radiusMeters}
                  onChange={(e) => updateGeofenceSettings({ radiusMeters: Number(e.target.value) })}
                  disabled={!canManageGeofence}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007c82] disabled:opacity-60 cursor-pointer"
                >
                  <option value={500}>500 m (Strict Single Hall)</option>
                  <option value={800}>800 m (Hall Vicinity)</option>
                  <option value={1500}>1.5 km (Academic Complex)</option>
                  <option value={2500}>2.5 km (Full UENR Campus)</option>
                  <option value={0}>Bypass Geofence (Online / Off)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePinCurrentHall}
                disabled={!canManageGeofence || isPinningHall}
                className="px-4 py-2 rounded-xl bg-[#007c82] hover:bg-[#00666b] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Crosshair className={`w-3.5 h-3.5 ${isPinningHall ? 'animate-spin' : ''}`} />
                <span>{isPinningHall ? 'Reading Room GPS...' : 'Pin My Hall GPS'}</span>
              </button>

              {UENR_HALL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  disabled={!canManageGeofence}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {preset.name.split(' (')[0]}
                </button>
              ))}

              <button
                type="button"
                onClick={handleResetDefaultCampus}
                disabled={!canManageGeofence}
                className="px-3 py-2 rounded-xl text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer disabled:opacity-50"
              >
                Reset Default
              </button>
            </div>

            {/* Rolling PIN Synchronization */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#007c82] dark:text-teal-400" />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    30s Rolling In-Room PIN
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    Stops WhatsApp PIN forwarding from off-campus students
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {geofenceSettings.rollingPinEnabled && (
                  <span className="font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white">
                    {rollingPinData.pin} ({rollingPinData.secondsRemaining}s)
                  </span>
                )}
                <button
                  type="button"
                  disabled={!canManageGeofence}
                  onClick={() =>
                    updateGeofenceSettings({ rollingPinEnabled: !geofenceSettings.rollingPinEnabled })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-50 ${
                    geofenceSettings.rollingPinEnabled
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {geofenceSettings.rollingPinEnabled ? 'Enabled' : 'GPS Only'}
                </button>
              </div>
            </div>

            {calibrationFeedback && (
              <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs font-semibold text-teal-800 dark:text-teal-300">
                {calibrationFeedback}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: GPS Roll-Call Check-In & Live Session List */}
        <div className="lg:col-span-6 p-5 sm:p-6 flex flex-col justify-between space-y-5 bg-slate-50/40 dark:bg-slate-900/40">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Direct GPS Check-In · {course.code}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Verify a student&apos;s attendance directly from this GPS-authenticated lecture terminal, or share the QR check-in link.
                </p>
              </div>
              <div className="text-right font-mono tabular-nums">
                <span className="text-lg font-bold text-[#007c82] dark:text-teal-400">{gpsCount}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">GPS verified</span>
              </div>
            </div>

            <form onSubmit={handleGpsStudentCheckIn} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={indexInput}
                onChange={(e) => {
                  setIndexInput(e.target.value.toUpperCase());
                  if (checkInFeedback) setCheckInFeedback(null);
                }}
                placeholder="Enter Index Number (e.g. UEB3100122)"
                disabled={isSessionFinalized}
                className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007c82] disabled:opacity-50 uppercase"
              />
              <button
                type="submit"
                disabled={isCheckingIn || isSessionFinalized || !indexInput.trim() || !canCheckInByGps}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isCheckingIn ? 'Recording...' : 'Mark GPS Present'}</span>
              </button>
            </form>

            {!canCheckInByGps && !isBypassed && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Direct GPS check-in unlocks once this terminal confirms it is inside the pinned perimeter (or pin your current hall GPS on the left).
              </p>
            )}

            {checkInFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold border ${
                  checkInFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}
              >
                {checkInFeedback.text}
              </div>
            )}

            {/* Quick Share / Launch Controls */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button
                type="button"
                onClick={handleCopyCheckInLink}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'GPS Check-In Link Copied' : 'Copy GPS Check-In Link'}</span>
              </button>
            </div>
          </div>

          {/* Present / GPS-Verified Roster Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Session Attendees ({presentStudents.length} / {students.length})
              </span>
              <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {date}
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {presentStudents.length === 0 ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400 space-y-2">
                  <Users className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    No students checked in yet for {course.code}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Students who scan the Classroom QR within the GPS perimeter or check in above will appear here immediately.
                  </p>
                </div>
              ) : (
                presentStudents.map((st, idx) => {
                  const isGps = gpsVerifiedIds.includes(st.id);
                  const isBio = biometricVerifiedIds.includes(st.id);
                  const methodLabel = isGps
                    ? 'GPS Verified'
                    : isBio
                    ? 'Bio-Verified'
                    : 'Manual Roll Call';
                  return (
                    <div
                      key={`${st.id}-${idx}`}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">{st.name}</div>
                        <div className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                          {st.indexNumber}
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-semibold shrink-0 flex items-center gap-1 ${
                          isGps
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : isBio
                            ? 'text-[#007c82] dark:text-teal-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {isGps && <MapPin className="w-3 h-3" />}
                        <span>{methodLabel}</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
