import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import { Course } from '../types';
import { useApp, matchAttendanceStream } from '../context/AppContext';
import { getActiveTimetableSlot, getTimeSlotStatus } from '../utils/timetableHelper';
import { getRollingPin, getInRoomBackupPin } from '../utils/geofence';
import {
  QrCode,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Users,
  ExternalLink,
  X,
  Sparkles,
  Calendar,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  BookOpen,
  Lock,
  KeyRound
} from 'lucide-react';

interface ClassroomQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: Course | null;
  date: string;
  stream?: string;
  onSelectCourse?: (courseId: string) => void;
}

export const ClassroomQRModal: React.FC<ClassroomQRModalProps> = ({
  isOpen,
  onClose,
  course,
  date,
  stream,
  onSelectCourse
}) => {
  const { students, courses, timetable, attendanceRecords, geofenceSettings, updateGeofenceSettings } = useApp();
  const [selectedCourseId, setSelectedCourseId] = useState<string>(course?.id || courses[0]?.id || '');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [rollingPinData, setRollingPinData] = useState<{ pin: string; secondsRemaining: number }>({
    pin: '1000',
    secondsRemaining: 30
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const geofenceRadius = geofenceSettings.radiusMeters;
  const rollingPinEnabled = geofenceSettings.rollingPinEnabled;

  const cleanStream = stream && stream !== 'all' && stream !== 'All Streams' ? stream : 'L200 IT-A';

  // Day of week calculation for today's scheduled slots
  const dateObj = new Date(`${date}T00:00:00`);
  const dayOfWeek = dateObj.getDay();
  const scheduledForToday = timetable.filter((t) => {
    if (t.dayOfWeek !== dayOfWeek) return false;
    if (!t.stream || cleanStream === 'all') return true;
    return matchAttendanceStream(t.stream, cleanStream);
  });

  // Automatically detect the active ongoing or next scheduled lecture slot (used only when no course is explicitly selected)
  const detectedActiveSlot = useMemo(() => {
    return getActiveTimetableSlot(scheduledForToday, date);
  }, [scheduledForToday, date]);

  // Synchronize with the lecturer's selected course first; only fall back to auto-detection if none was selected
  useEffect(() => {
    if (!isOpen) return;

    if (course?.id && courses.some((c) => c.id === course.id)) {
      setSelectedCourseId(course.id);
    } else if (detectedActiveSlot && courses.some((c) => c.id === detectedActiveSlot.courseId)) {
      setSelectedCourseId(detectedActiveSlot.courseId);
      if (onSelectCourse) {
        onSelectCourse(detectedActiveSlot.courseId);
      }
    } else if (courses.length > 0) {
      setSelectedCourseId((prev) => (prev && courses.some((c) => c.id === prev) ? prev : courses[0].id));
    }
  }, [isOpen, course?.id, detectedActiveSlot?.id, courses]);

  // Find the exact active course object
  const activeCourse = courses.find((c) => c.id === selectedCourseId) || course || courses[0];

  // Find scheduled slot matching the active course (if any)
  const activeCourseSlot = useMemo(() => {
    if (!activeCourse) return null;
    const matchingToday = scheduledForToday.filter((s) => s.courseId === activeCourse.id);
    return (
      getActiveTimetableSlot(matchingToday, date) ||
      timetable.find((t) => t.courseId === activeCourse.id && (!t.stream || cleanStream === 'all' || matchAttendanceStream(t.stream, cleanStream))) ||
      null
    );
  }, [scheduledForToday, timetable, activeCourse?.id, date, cleanStream]);

  const handleCourseSwitch = (newId: string) => {
    setSelectedCourseId(newId);
    if (onSelectCourse) {
      onSelectCourse(newId);
    }
  };

  // Live 30-Second Rolling PIN Updater (Prevents WhatsApp Forwarding)
  useEffect(() => {
    if (!isOpen || !activeCourse) return;
    const updatePin = () => {
      setRollingPinData(getRollingPin(activeCourse.id, 30));
    };
    updatePin();
    const timer = setInterval(updatePin, 1000);
    return () => clearInterval(timer);
  }, [isOpen, activeCourse?.id]);

  // Fallback static PIN
  const staticInRoomPin = useMemo(() => {
    if (!activeCourse) return '1000';
    return getInRoomBackupPin(date, activeCourse.id);
  }, [date, activeCourse?.id]);

  const activeDisplayPin = rollingPinEnabled ? rollingPinData.pin : staticInRoomPin;

  const handleCalibrateLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    setIsCalibrating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await updateGeofenceSettings({
          enabled: true,
          campusName: activeCourseSlot?.venue || detectedActiveSlot?.venue || 'Pinned Lecture Hall',
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          radiusMeters: geofenceRadius === 0 ? 800 : geofenceRadius
        });
        setIsCalibrating(false);
      },
      (err) => {
        console.warn('Calibration error:', err);
        setIsCalibrating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Build the direct check-in URL that students reach when scanning the QR
  const checkInUrl = typeof window !== 'undefined' && activeCourse
    ? `${window.location.origin}${window.location.pathname}?checkin=1&courseId=${encodeURIComponent(activeCourse.id)}&code=${encodeURIComponent(activeCourse.code)}&title=${encodeURIComponent(activeCourse.title)}&lecturer=${encodeURIComponent(activeCourse.lecturer || '')}&date=${encodeURIComponent(date)}&stream=${encodeURIComponent(cleanStream)}&geo=${geofenceRadius}&pinMode=${rollingPinEnabled ? 'rolling' : 'off'}&lat=${geofenceSettings.latitude}&lng=${geofenceSettings.longitude}`
    : '';

  useEffect(() => {
    if (!isOpen || !activeCourse) return;

    QRCode.toDataURL(checkInUrl, {
      width: 440,
      margin: 2,
      color: {
        dark: '#002b45',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error('QR Generation error:', err));
  }, [isOpen, checkInUrl, activeCourse]);

  // Track Fullscreen state
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleCopyLink = () => {
    if (navigator.clipboard && checkInUrl) {
      navigator.clipboard.writeText(checkInUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  if (!isOpen || !activeCourse) return null;

  // Real-time calculation of attendees for this live session
  const currentRecord = attendanceRecords.find(
    (r) =>
      r.date === date &&
      r.courseId === activeCourse.id &&
      matchAttendanceStream(r.stream, cleanStream)
  );

  const presentStudentIds = currentRecord
    ? Object.entries(currentRecord.records || {})
        .filter(([_, status]) => status === 'present')
        .map(([id]) => id)
    : [];

  const presentStudents = students.filter((s) => presentStudentIds.includes(s.id));
  const totalEnrolled = students.filter((s) => {
    if (cleanStream === 'all') return true;
    return !s.stream || s.stream === cleanStream || (cleanStream === 'L200 IT-A' && (s.stream === 'IT A' || s.stream === 'L200 IT-A'));
  }).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div
        ref={containerRef}
        className={`bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl overflow-hidden flex flex-col transition-all ${
          isFullscreen ? 'h-screen max-w-none rounded-none justify-between p-6' : 'max-h-[94vh]'
        }`}
      >
        {/* Top Header / Projector Bar */}
        <div className="bg-gradient-to-r from-[#00243a] via-[#003b5c] to-[#005a78] text-white p-4 sm:p-6 flex items-start sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white p-1.5 flex items-center justify-center shrink-0 shadow-md">
              <img
                src="/assets/uenr_logo.jpg"
                alt="UENR Emblem"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#8dc63f] bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                  Live Classroom Attendance
                </span>
                <span className="text-xs text-slate-300 font-semibold">
                  {cleanStream} · {date}
                </span>
              </div>

              {/* Course Title & Code */}
              <h2 className="text-lg sm:text-2xl font-black text-white mt-0.5">
                {activeCourse.code}: {activeCourse.title}
              </h2>

              {/* Lecturer Info */}
              <div className="flex items-center gap-2 flex-wrap text-xs text-slate-200 mt-1">
                <span className="inline-flex items-center gap-1.5 bg-white/10 px-2.5 py-0.5 rounded-md font-medium">
                  Lecturer: <strong className="text-white underline decoration-[#8dc63f] decoration-2">{activeCourse.lecturer || 'Unassigned'}</strong>
                </span>
                <span>•</span>
                <span className="text-slate-300">{activeCourse.department || 'Department of Information Technology & Decision Sciences'}</span>
              </div>

              {/* Selected Course Indicator & Optional Quick Switch */}
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 bg-emerald-950/80 border border-emerald-400/50 text-emerald-300 px-3 py-1.5 rounded-xl shadow-md">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                    {detectedActiveSlot?.courseId === activeCourse.id ? 'Active Slot:' : 'Selected Course:'}
                  </span>
                  <span className="text-xs font-black text-white">
                    {activeCourse.code}
                  </span>
                  {activeCourseSlot && (
                    <span className="text-[10px] font-mono text-emerald-200 bg-emerald-900/80 px-2 py-0.5 rounded-md border border-emerald-500/30">
                      {activeCourseSlot.startTime} – {activeCourseSlot.endTime} · {activeCourseSlot.venue}
                    </span>
                  )}
                  <select
                    value={activeCourse.id}
                    onChange={(e) => handleCourseSwitch(e.target.value)}
                    className="ml-1 bg-black/40 text-slate-200 text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/20 focus:outline-none cursor-pointer"
                    title="Switch projected course for this session"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#00243a] text-white">
                        {c.id === activeCourse.id ? `✓ ${c.code} – ${c.title}` : `Switch: ${c.code} – ${c.title} (${c.lecturer})`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Pills for Today's Scheduled Lectures */}
                {scheduledForToday.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-300 hidden sm:inline">Today's Schedule:</span>
                    {scheduledForToday.map((slot) => {
                      const c = courses.find((crs) => crs.id === slot.courseId);
                      if (!c) return null;
                      const isCurrent = c.id === activeCourse.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => handleCourseSwitch(c.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                            isCurrent
                              ? 'bg-[#8dc63f] text-slate-950 border-[#8dc63f] shadow-sm font-black ring-2 ring-emerald-300/40'
                              : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                          }`}
                          title={`Switch to ${c.code} (${c.lecturer})`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{c.code} ({slot.startTime})</span>
                          {isCurrent && <span className="text-[9px] uppercase bg-black/20 px-1 rounded-sm">Active</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen for Projector'}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
              title="Close QR Session"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="p-4 sm:p-8 flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          
          {/* Left / Center: Big QR Code on Display */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-4 sm:p-6 bg-white dark:bg-white rounded-3xl shadow-xl border-4 border-[#003b5c] max-w-sm sm:max-w-md w-full flex flex-col items-center justify-center">
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt={`Classroom Attendance QR Code for ${activeCourse.code}`}
                  className="w-full aspect-square max-w-[340px] sm:max-w-[380px] object-contain rounded-2xl"
                />
              ) : (
                <div className="w-72 h-72 flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-[#003b5c] border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              <div className="mt-2 text-center text-slate-900 font-extrabold text-xs sm:text-sm tracking-wide">
                Scan with phone camera for <strong>{activeCourse.code} ({activeCourse.lecturer})</strong>
              </div>
            </div>

            {/* Geofence & In-Room PIN Security Card for Classroom Projector */}
            <div className="w-full max-w-sm sm:max-w-md bg-gradient-to-r from-emerald-950/80 via-slate-900 to-[#002b45] border border-emerald-500/40 rounded-2xl p-3.5 text-left text-white shadow-lg space-y-2.5">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Anti-Hostel Geofence Active</span>
                  </div>
                </div>

                {/* Geofence Mode Selector */}
                <select
                  value={geofenceRadius}
                  onChange={(e) => updateGeofenceSettings({ radiusMeters: Number(e.target.value) })}
                  className="bg-black/60 text-[10px] font-bold text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-500/40 focus:outline-none cursor-pointer"
                  title="Radius around UENR Main Campus required to scan"
                >
                  <option value={2500}>UENR Campus & Halls (2.5 km)</option>
                  <option value={1500}>Academic Complex (1.5 km)</option>
                  <option value={800}>Strict Hall Vicinity (800m)</option>
                  <option value={500}>Single Lecture Hall (500m)</option>
                  <option value={0}>Bypass Geofence (Online / Off)</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <KeyRound className="w-3.5 h-3.5 text-[#8dc63f]" />
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-300">
                      In-Room Projector PIN
                    </span>
                    {rollingPinEnabled && (
                      <span className="text-[9px] font-mono font-black bg-emerald-500/20 text-[#8dc63f] px-1.5 py-0.5 rounded-full border border-emerald-500/30 animate-pulse">
                        ⏳ Rotates in {rollingPinData.secondsRemaining}s
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-300 line-clamp-1 mt-0.5">
                    {rollingPinEnabled
                      ? 'Anti-WhatsApp protection: Code auto-expires in 30s'
                      : 'PIN override disabled. Only physical GPS permitted.'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {rollingPinEnabled ? (
                    <div className="bg-slate-950 border-2 border-emerald-400/60 px-3.5 py-1 rounded-xl text-center shadow-inner">
                      <span className="font-mono text-xl sm:text-2xl font-black tracking-widest text-[#8dc63f] select-all">
                        {activeDisplayPin}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-slate-950/80 border border-slate-700 px-2.5 py-1 rounded-xl text-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">GPS Only</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => updateGeofenceSettings({ rollingPinEnabled: !rollingPinEnabled })}
                    className="p-1 rounded-lg bg-black/40 hover:bg-black/70 text-slate-300 text-[10px] border border-white/20 transition-all cursor-pointer"
                    title={rollingPinEnabled ? 'Click to disable PIN (GPS Only)' : 'Click to enable 30s Rolling PIN'}
                  >
                    {rollingPinEnabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>

              {/* Room Calibration Row */}
              <div className="flex items-center justify-between text-[10px] text-slate-300 pt-1.5 border-t border-white/10 flex-wrap gap-1">
                <span className="text-slate-400 truncate">
                  📍 {geofenceSettings.campusName}: {geofenceSettings.latitude.toFixed(5)}, {geofenceSettings.longitude.toFixed(5)}
                </span>
                <button
                  type="button"
                  onClick={handleCalibrateLocation}
                  disabled={isCalibrating}
                  className="px-2 py-0.5 rounded bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 font-bold border border-emerald-500/30 transition-all cursor-pointer disabled:opacity-50 text-[10px]"
                  title="Calibrate geofence center to your exact current lecture room GPS coordinates"
                >
                  {isCalibrating ? 'Calibrating...' : '🎯 Pin My Hall GPS'}
                </button>
              </div>
            </div>

            <div className="max-w-md space-y-1">
              <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                ⚡ Option A: Index Number Confirmation · {activeCourse.code}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Students scan the code, verify their campus location, enter their Index Number (e.g. <span className="font-mono font-bold text-[#007c82]">UEB3100122</span>), and get marked present instantly.
              </p>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied Link!' : 'Copy Check-In Link'}</span>
              </button>

              <a
                href={checkInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-[#007c82] hover:bg-[#00666b] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Test {activeCourse.code} Check-in</span>
              </a>
            </div>
          </div>

          {/* Right Column: Live Attendee Feed */}
          <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700 flex flex-col h-full min-h-[350px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  {activeCourse.code} Live Feed
                </span>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Real-Time Check-Ins
                </h3>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-[#007c82] dark:text-teal-400">
                  {presentStudents.length}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 block font-semibold">
                  {totalEnrolled > 0 ? `of ${totalEnrolled} present` : 'students'}
                </span>
              </div>
            </div>

            {/* List of checked in students */}
            <div className="flex-1 overflow-y-auto mt-4 space-y-2 pr-1 max-h-[360px]">
              {presentStudents.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500 space-y-2">
                  <Users className="w-8 h-8 opacity-40 animate-pulse" />
                  <p className="text-xs italic">
                    Waiting for students to scan the QR code for {activeCourse.code} ({activeCourse.lecturer})...
                  </p>
                </div>
              ) : (
                presentStudents.map((st, i) => (
                  <div
                    key={`${st.id}-${i}`}
                    className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 shadow-xs animate-in fade-in"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-200 dark:border-emerald-800">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {st.name}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {st.indexNumber}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 shrink-0 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verified</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer Summary */}
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                Scanner active for {activeCourse.code}
              </span>
              <button
                onClick={onClose}
                className="font-bold text-[#007c82] hover:underline cursor-pointer"
              >
                Done / Back to Session
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
