import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp, matchAttendanceStream } from '../context/AppContext';
import {
  getActiveTimetableSlot,
  resolveCourseCohort,
  streamsMatch
} from '../utils/timetableHelper';
import { DEFAULT_STREAMS, TimetableSlot } from '../types';
import { BiometricAttendance } from '../components/BiometricAttendance';
import { ClassroomQRModal } from '../components/ClassroomQRModal';
import { GpsAttendancePanel } from '../components/GpsAttendancePanel';
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Unlock,
  Fingerprint,
  Search,
  ShieldCheck,
  BookOpen,
  MapPin,
  Users,
  GraduationCap,
  Layers,
  QrCode,
  SlidersHorizontal,
  RotateCcw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export const Attendance: React.FC = () => {
  const {
    students,
    courses,
    timetable,
    attendanceRecords,
    saveAttendance,
    unlockAttendance,
    setActiveTab,
    attendanceLaunchTarget,
    clearAttendanceLaunchTarget,
    currentUser,
    geofenceSettings
  } = useApp();

  // Pick today's date (or last weekday if today is weekend)
  const getInitialDate = () => {
    const d = new Date();
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() - 2); // Friday if Sunday
    if (day === 6) d.setDate(d.getDate() - 1); // Friday if Saturday
    return d.toISOString().split('T')[0];
  };

  const userStream = currentUser?.role === 'class_rep' && currentUser?.stream ? currentUser.stream : null;

  const [selectedDate, setSelectedDate] = useState<string>(getInitialDate());
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedStream, setSelectedStream] = useState<string>(userStream || 'all');
  const [showCohortOverride, setShowCohortOverride] = useState<boolean>(false);
  const [isCohortManualOverride, setIsCohortManualOverride] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'manual' | 'biometric' | 'gps'>('manual');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sessionRecords, setSessionRecords] = useState<Record<string, 'present' | 'absent'>>({});
  const [biometricVerifiedIds, setBiometricVerifiedIds] = useState<string[]>([]);
  const [gpsVerifiedIds, setGpsVerifiedIds] = useState<string[]>([]);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');
  const [showQRModal, setShowQRModal] = useState<boolean>(false);

  const userInteractedRef = useRef<boolean>(false);

  // Synchronize stream if Class Rep logs in
  useEffect(() => {
    if (userStream) {
      setSelectedStream(userStream);
    }
  }, [userStream]);

  // Date parsing & Day of Week calculation
  const selectedDateObj = new Date(`${selectedDate}T00:00:00`);
  const dayOfWeek = selectedDateObj.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Scheduled slots for the selected day (filtered only if Class Rep is scoped to a stream)
  const scheduledSlotsForDay = useMemo(() => {
    return timetable.filter((slot) => {
      if (slot.dayOfWeek !== dayOfWeek) return false;
      if (userStream) return streamsMatch(slot.stream, userStream);
      return true;
    });
  }, [timetable, dayOfWeek, userStream]);

  // Unified helper: selecting a course automatically resolves its Level & Stream
  const applyCourseSelection = (
    courseId: string,
    options?: {
      date?: string;
      preferredSlot?: TimetableSlot | null;
      levelOverride?: string;
      streamOverride?: string;
      markUserAction?: boolean;
    }
  ) => {
    if (options?.markUserAction) {
      userInteractedRef.current = true;
    }

    const targetDate = options?.date || selectedDate;
    const targetDay = new Date(`${targetDate}T00:00:00`).getDay();
    setSelectedCourseId(courseId);

    if (!courseId) {
      setSelectedLevel('all');
      setSelectedStream(userStream || 'all');
      setIsCohortManualOverride(false);
      return;
    }

    const targetCourse = courses.find((c) => c.id === courseId) || null;
    const resolved = resolveCourseCohort({
      course: targetCourse,
      timetable,
      students,
      dayOfWeek: targetDay,
      targetDate,
      preferredSlot: options?.preferredSlot,
      lockedStream: userStream
    });

    setSelectedLevel(options?.levelOverride || resolved.level);
    setSelectedStream(userStream || options?.streamOverride || resolved.stream);
    setIsCohortManualOverride(Boolean(options?.levelOverride || options?.streamOverride));
  };

  // Consume deep-link launch context from Dashboard
  useEffect(() => {
    if (!attendanceLaunchTarget || courses.length === 0) return;

    const targetDate = attendanceLaunchTarget.date || selectedDate;
    if (attendanceLaunchTarget.date) {
      setSelectedDate(attendanceLaunchTarget.date);
    }
    if (attendanceLaunchTarget.viewMode) {
      setViewMode(attendanceLaunchTarget.viewMode);
    }

    const targetCourseId =
      attendanceLaunchTarget.courseId && courses.some((c) => c.id === attendanceLaunchTarget.courseId)
        ? attendanceLaunchTarget.courseId
        : courses[0]?.id || '';

    const preferredSlot = attendanceLaunchTarget.slotId
      ? timetable.find((s) => s.id === attendanceLaunchTarget.slotId) || null
      : null;

    applyCourseSelection(targetCourseId, {
      date: targetDate,
      preferredSlot,
      levelOverride: attendanceLaunchTarget.level,
      streamOverride: attendanceLaunchTarget.stream,
      markUserAction: true
    });
    setIsCohortManualOverride(false);
    clearAttendanceLaunchTarget();
  }, [attendanceLaunchTarget, courses, timetable]);

  // Only reset course if the currently selected course was deleted
  useEffect(() => {
    if (selectedCourseId && !courses.some((c) => c.id === selectedCourseId)) {
      setSelectedCourseId('');
    }
  }, [courses, selectedCourseId]);

  // Initial Smart Auto-Selection when opening Attendance directly (no deep-link target)
  useEffect(() => {
    if (attendanceLaunchTarget || courses.length === 0) return;
    if (userInteractedRef.current && selectedCourseId && courses.some((c) => c.id === selectedCourseId)) {
      return;
    }

    const slots = timetable.filter((slot) => {
      if (slot.dayOfWeek !== dayOfWeek) return false;
      if (userStream) return streamsMatch(slot.stream, userStream);
      return true;
    });

    if (slots.length > 0) {
      const activeSlot = getActiveTimetableSlot(slots, selectedDate);
      if (activeSlot && courses.some((c) => c.id === activeSlot.courseId)) {
        applyCourseSelection(activeSlot.courseId, {
          date: selectedDate,
          preferredSlot: activeSlot
        });
        return;
      }
    }

    if (!selectedCourseId || !courses.some((c) => c.id === selectedCourseId)) {
      applyCourseSelection(courses[0].id, { date: selectedDate });
    }
  }, [courses, timetable, userStream, attendanceLaunchTarget]);

  const handleDateChange = (newDate: string) => {
    userInteractedRef.current = true;
    setSelectedDate(newDate);
    const newDay = new Date(`${newDate}T00:00:00`).getDay();
    const daySlots = timetable.filter((slot) => {
      if (slot.dayOfWeek !== newDay) return false;
      if (userStream) return streamsMatch(slot.stream, userStream);
      return true;
    });
    const activeForNewDay = getActiveTimetableSlot(daySlots, newDate);
    if (activeForNewDay && courses.some((c) => c.id === activeForNewDay.courseId)) {
      applyCourseSelection(activeForNewDay.courseId, {
        date: newDate,
        preferredSlot: activeForNewDay,
        markUserAction: true
      });
    } else if (selectedCourseId) {
      applyCourseSelection(selectedCourseId, {
        date: newDate,
        markUserAction: true
      });
    }
  };

  // Helper to extract numeric level for sorting
  const extractLevelNumber = (lvl?: string) => {
    if (!lvl) return 100;
    const match = lvl.match(/\d+/);
    return match ? parseInt(match[0], 10) : 999;
  };

  // Filter students belonging to this stream / division (sorted strictly by Level, then by Stream, then by name)
  const streamStudents = useMemo(() => {
    const list = students.filter((s) => {
      const matchesLevel = selectedLevel === 'all' || (s.level || 'Level 100') === selectedLevel;
      const sStream = s.stream || 'IT A';
      const matchesStream = selectedStream === 'all' || streamsMatch(sStream, selectedStream);
      return matchesLevel && matchesStream;
    });
    return [...list].sort((a, b) => {
      const levelDiff = extractLevelNumber(a.level) - extractLevelNumber(b.level);
      if (levelDiff !== 0) return levelDiff;
      const streamDiff = (a.stream || 'IT A').localeCompare(b.stream || 'IT A', undefined, { numeric: true });
      if (streamDiff !== 0) return streamDiff;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [students, selectedLevel, selectedStream]);

  // Dynamic list of all known streams for the optional override selector
  const availableStreamOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_STREAMS);
    timetable.forEach((s) => {
      if (s.stream && s.stream !== 'all') set.add(s.stream);
    });
    students.forEach((s) => {
      if (s.stream && s.stream !== 'all') set.add(s.stream);
    });
    return Array.from(set);
  }, [timetable, students]);

  // Load existing attendance record for this date + course + stream
  const existingRecord = attendanceRecords.find((r) => {
    if (r.date !== selectedDate || r.courseId !== selectedCourseId) return false;
    return matchAttendanceStream(r.stream, selectedStream);
  });

  const isFinalized = existingRecord?.isFinalized || false;

  useEffect(() => {
    if (existingRecord) {
      setSessionRecords(existingRecord.records || {});
      setBiometricVerifiedIds(existingRecord.biometricVerifiedStudentIds || []);
      setGpsVerifiedIds(existingRecord.gpsVerifiedStudentIds || []);
    } else {
      // Default: empty or all absent for stream students
      const initial: Record<string, 'present' | 'absent'> = {};
      streamStudents.forEach((s) => {
        initial[s.id] = 'absent';
      });
      setSessionRecords(initial);
      setBiometricVerifiedIds([]);
      setGpsVerifiedIds([]);
    }
  }, [selectedDate, selectedCourseId, selectedStream, existingRecord, streamStudents.length]);

  const activeCourse = courses.find((c) => c.id === selectedCourseId);
  const activeCourseCohortInfo = useMemo(
    () =>
      resolveCourseCohort({
        course: activeCourse,
        timetable,
        students,
        dayOfWeek,
        targetDate: selectedDate,
        lockedStream: userStream
      }),
    [activeCourse, timetable, students, dayOfWeek, selectedDate, userStream]
  );

  const matchingSlotsForCourseToday = timetable.filter(
    (t) =>
      t.courseId === selectedCourseId &&
      t.dayOfWeek === dayOfWeek &&
      streamsMatch(t.stream, selectedStream)
  );
  const activeSlot =
    getActiveTimetableSlot(matchingSlotsForCourseToday, selectedDate) ||
    timetable.find((t) => t.courseId === selectedCourseId && t.dayOfWeek === dayOfWeek);

  // Handlers
  const handleMarkStatus = (studentId: string, status: 'present' | 'absent') => {
    if (isFinalized) return;
    setSessionRecords((prev) => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleMarkAll = (status: 'present' | 'absent') => {
    if (isFinalized) return;
    const updated: Record<string, 'present' | 'absent'> = { ...sessionRecords };
    streamStudents.forEach((s) => {
      updated[s.id] = status;
    });
    setSessionRecords(updated);
  };

  const handleBiometricMarked = (studentId: string) => {
    setSessionRecords((prev) => ({
      ...prev,
      [studentId]: 'present'
    }));
    setBiometricVerifiedIds((prev) => Array.from(new Set([...prev, studentId])));
    // Auto-save draft
    saveAttendance(
      selectedDate,
      selectedCourseId,
      { ...sessionRecords, [studentId]: 'present' },
      Array.from(new Set([...biometricVerifiedIds, studentId])),
      false,
      selectedStream === 'all' ? undefined : selectedStream,
      gpsVerifiedIds
    );
  };

  const handleSaveDraft = () => {
    saveAttendance(
      selectedDate,
      selectedCourseId,
      sessionRecords,
      biometricVerifiedIds,
      false,
      selectedStream === 'all' ? undefined : selectedStream,
      gpsVerifiedIds
    );
    setSaveSuccessMsg('Attendance draft saved successfully.');
    setTimeout(() => setSaveSuccessMsg(''), 3500);
  };

  const handleFinalize = () => {
    const streamName = selectedStream === 'all' ? 'All Divisions' : `Division ${selectedStream}`;
    if (confirm(`Finalize and lock attendance session for ${streamName}? Once finalized, manual and biometric edits are protected.`)) {
      saveAttendance(
        selectedDate,
        selectedCourseId,
        sessionRecords,
        biometricVerifiedIds,
        true,
        selectedStream === 'all' ? undefined : selectedStream,
        gpsVerifiedIds
      );
      setSaveSuccessMsg(`Attendance session for ${streamName} finalized and locked.`);
      setTimeout(() => setSaveSuccessMsg(''), 3500);
    }
  };

  const handleUnlock = () => {
    if (confirm('Unlock this session to allow modifications?')) {
      unlockAttendance(
        selectedDate,
        selectedCourseId,
        selectedStream === 'all' ? undefined : selectedStream
      );
      setSaveSuccessMsg('Session unlocked for edits.');
      setTimeout(() => setSaveSuccessMsg(''), 3500);
    }
  };

  // Filter students by search within the stream (maintains alphabetical order)
  const filteredStudents = useMemo(() => {
    return streamStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.indexNumber.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [streamStudents, searchQuery]);

  const presentCount = streamStudents.filter((s) => sessionRecords[s.id] === 'present').length;
  const absentCount = streamStudents.filter((s) => sessionRecords[s.id] === 'absent' || !sessionRecords[s.id]).length;
  const attendanceRate = streamStudents.length > 0 ? Math.round((presentCount / streamStudents.length) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Page Title & Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#007c82] dark:text-teal-400 uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            Class Attendance Session
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">Course Attendance Roster</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Record and finalize daily attendance for UENR degree courses. Weekends are automatically protected.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
          <button
            onClick={() => setViewMode('manual')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              viewMode === 'manual'
                ? 'bg-[#007c82] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Manual Checklist
          </button>
          <button
            onClick={() => setViewMode('biometric')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              viewMode === 'biometric'
                ? 'bg-[#007c82] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" />
            <span>Biometric Scanner</span>
          </button>
          <button
            onClick={() => setViewMode('gps')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              viewMode === 'gps'
                ? 'bg-[#007c82] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>GPS Attendance</span>
          </button>
        </div>

        {/* Live Projector QR Attendance Launch Button */}
        <button
          id="launch-classroom-qr-btn"
          onClick={() => setShowQRModal(true)}
          disabled={!activeCourse}
          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-teal-700 dark:hover:bg-teal-600 text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          title={`Display high-visibility live QR code for ${activeCourse?.code || 'lecture'} on classroom projector`}
        >
          <QrCode className="w-4 h-4 text-[#8dc63f] dark:text-emerald-300" />
          <span>Projector QR {activeCourse ? `(${activeCourse.code})` : 'Attendance'}</span>
        </button>
      </div>

      {/* Notice if no courses exist yet */}
      {courses.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-xs">
          <div>
            <strong className="block text-sm font-bold text-amber-950 dark:text-amber-100">No Courses Assigned Yet</strong>
            <span>You need to assign your course names and lecture days before taking class roll calls.</span>
          </div>
          <button
            onClick={() => setActiveTab('timetable')}
            className="px-4 py-2 rounded-xl bg-[#007c82] hover:bg-[#00666b] text-white font-bold transition-colors shadow-xs cursor-pointer shrink-0"
          >
            Go to Timetable to Assign Courses
          </button>
        </div>
      )}

      {/* Save / Status Toast Alert */}
      {saveSuccessMsg && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl p-3.5 flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-bold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          {saveSuccessMsg}
        </div>
      )}

      {/* Date & Course Selection Panel (Streamlined 1-Step Course-First Selector) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* 1. Primary Course Picker (Automatically resolves Level & Stream) */}
          <div className="lg:col-span-6">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
                Select Course to Mark
              </span>
              <span className="text-[10px] font-semibold text-[#007c82] dark:text-teal-400 normal-case">
                Auto-selects Level & Stream
              </span>
            </label>
            <select
              value={selectedCourseId}
              onChange={(e) => applyCourseSelection(e.target.value, { markUserAction: true })}
              disabled={courses.length === 0}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-[#007c82] disabled:opacity-50"
            >
              {courses.length === 0 ? (
                <option value="">No courses created yet</option>
              ) : (
                <>
                  <option value="">-- Choose Course / Lecture --</option>
                  {courses.map((course) => {
                    const isScheduledToday = timetable.some(
                      (t) => t.courseId === course.id && t.dayOfWeek === dayOfWeek
                    );
                    const lecturerText =
                      course.lecturer && course.lecturer !== 'Unassigned'
                        ? ` (${course.lecturer})`
                        : '';
                    return (
                      <option key={course.id} value={course.id}>
                        {course.code} – {course.title}{lecturerText}{isScheduledToday ? ' · Scheduled Today' : ''}
                      </option>
                    );
                  })}
                </>
              )}
            </select>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center justify-between gap-2">
              <span className="truncate">
                {activeCourse
                  ? activeCourse.lecturer && activeCourse.lecturer !== 'Unassigned'
                    ? `Lecturer: ${activeCourse.lecturer}`
                    : 'Lecturer: Unassigned (Assign in Timetable)'
                  : 'Pick any course to auto-load its matching class roster.'}
              </span>
            </div>

            {/* Quick-switch buttons for today's scheduled lectures */}
            {scheduledSlotsForDay.length > 0 && (
              <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mr-0.5">
                  Today:
                </span>
                {scheduledSlotsForDay.map((slot) => {
                  const c = courses.find((crs) => crs.id === slot.courseId);
                  if (!c) return null;
                  const isCurrent =
                    c.id === selectedCourseId &&
                    (!slot.stream || selectedStream === 'all' || streamsMatch(slot.stream, selectedStream));
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() =>
                        applyCourseSelection(c.id, {
                          preferredSlot: slot,
                          markUserAction: true
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 border whitespace-nowrap ${
                        isCurrent
                          ? 'bg-[#007c82] text-white border-[#007c82]'
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                      }`}
                      title={`${c.code}: ${c.title}${slot.stream ? ` · ${slot.stream}` : ''}`}
                    >
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>{c.code}</span>
                      <span className="opacity-75 font-mono text-[10px] tabular-nums">{slot.startTime}</span>
                      {slot.stream && (
                        <span className="opacity-80 text-[10px]">· {slot.stream}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Attendance Date */}
          <div className="lg:col-span-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
              Attendance Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-[#007c82]"
            />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 block">
              {selectedDateObj.toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              })}
            </span>
          </div>

          {/* 3. Session Status & Lock State */}
          <div className="lg:col-span-3 flex flex-col justify-between bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Session Status
              </span>
              {isFinalized && (
                <button
                  onClick={handleUnlock}
                  className="text-xs font-bold text-[#007c82] dark:text-teal-400 hover:underline cursor-pointer"
                >
                  Unlock
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              {isFinalized ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  Finalized & Locked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <Unlock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Open for Roll Call
                </span>
              )}
              <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                {streamStudents.length} student{streamStudents.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        {/* Auto-Detected Cohort Bar (Replaces mandatory manual Level + Stream dropdowns) */}
        {activeCourse && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-xs">
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                  <GraduationCap className="w-4 h-4 text-[#007c82] dark:text-teal-400 shrink-0" />
                  <span className="text-slate-500 dark:text-slate-400">Level:</span>
                  <strong className="text-slate-900 dark:text-white">
                    {selectedLevel === 'all' ? 'All Levels' : selectedLevel}
                  </strong>
                </div>

                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                  <Layers className="w-4 h-4 text-[#007c82] dark:text-teal-400 shrink-0" />
                  <span className="text-slate-500 dark:text-slate-400">Stream:</span>
                  <strong className="text-slate-900 dark:text-white">
                    {selectedStream === 'all' ? 'All Streams' : selectedStream}
                  </strong>
                </div>

                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                  <Users className="w-4 h-4 text-[#007c82] dark:text-teal-400 shrink-0" />
                  <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                    {streamStudents.length} student{streamStudents.length === 1 ? '' : 's'} matched
                  </span>
                </div>

                {!isWeekend && activeSlot && (
                  <div className="flex items-center gap-1.5 text-teal-800 dark:text-teal-300 font-medium">
                    <Clock className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400 shrink-0" />
                    <span className="tabular-nums">
                      {activeSlot.startTime} – {activeSlot.endTime} · {activeSlot.venue}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!userStream && isCohortManualOverride && (
                  <button
                    type="button"
                    onClick={() => {
                      applyCourseSelection(selectedCourseId, { markUserAction: true });
                      setShowCohortOverride(false);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#007c82] dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Auto
                  </button>
                )}

                {userStream ? (
                  <span className="text-[11px] font-semibold text-[#007c82] dark:text-teal-300 whitespace-nowrap">
                    Scoped to {userStream}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCohortOverride((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer whitespace-nowrap"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>{showCohortOverride ? 'Hide Filters' : 'Adjust Level / Stream'}</span>
                    {showCohortOverride ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* 1-click stream switcher when a course spans multiple streams on the timetable */}
            {!userStream && activeCourseCohortInfo.availableStreams.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-200/70 dark:border-slate-700/60 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 font-medium mr-1">Course Streams:</span>
                {activeCourseCohortInfo.availableStreams.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setSelectedStream(st);
                      setIsCohortManualOverride(false);
                    }}
                    className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer transition-colors ${
                      streamsMatch(selectedStream, st) && selectedStream !== 'all'
                        ? 'bg-[#007c82] text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {st}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStream('all');
                    setIsCohortManualOverride(false);
                  }}
                  className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer transition-colors ${
                    selectedStream === 'all'
                      ? 'bg-[#007c82] text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  All Streams
                </button>
              </div>
            )}

            {/* Optional Manual Level & Stream Override Drawer */}
            {!userStream && showCohortOverride && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Override Academic Level
                  </label>
                  <select
                    value={selectedLevel}
                    onChange={(e) => {
                      setSelectedLevel(e.target.value);
                      setIsCohortManualOverride(true);
                    }}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  >
                    <option value="all">All Levels</option>
                    <option value="Level 100">Level 100</option>
                    <option value="Level 200">Level 200</option>
                    <option value="Level 300">Level 300</option>
                    <option value="Level 400">Level 400</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Override Class Stream / Division
                  </label>
                  <select
                    value={selectedStream}
                    onChange={(e) => {
                      setSelectedStream(e.target.value);
                      setIsCohortManualOverride(true);
                    }}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  >
                    <option value="all">All Streams</option>
                    {availableStreamOptions.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Weekend Alert Message */}
        {isWeekend && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl p-3.5 flex items-center gap-3 text-amber-900 dark:text-amber-200 text-xs sm:text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <strong>Weekend Selected:</strong> Regular university timetable lectures are held on weekdays (Monday to Friday). Select a weekday or proceed only for a special makeup session.
            </div>
          </div>
        )}

        {/* Active Campus GPS Geofence Summary */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400 shrink-0" />
            <span>
              <strong>GPS Geofence:</strong>{' '}
              {geofenceSettings.radiusMeters > 0
                ? `${geofenceSettings.campusName} · Radius ${
                    geofenceSettings.radiusMeters >= 1000
                      ? `${(geofenceSettings.radiusMeters / 1000).toFixed(1)} km`
                      : `${geofenceSettings.radiusMeters} m`
                  }`
                : 'Bypassed (Online Mode)'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setViewMode('gps')}
            className="text-xs font-semibold text-[#007c82] dark:text-teal-400 hover:underline text-left sm:text-right cursor-pointer whitespace-nowrap"
          >
            {viewMode === 'gps' ? 'Viewing GPS Verification Panel' : 'Open GPS Verification & Hall Pinning →'}
          </button>
        </div>
      </div>

      {/* ACTIVE SESSION OR EMPTY STATE */}
      {!activeCourse ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 sm:p-14 text-center border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800/80 flex items-center justify-center mx-auto text-[#007c82] dark:text-teal-400 shadow-xs">
            <BookOpen className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              No Lecture Selected
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Pick a course above or tap one of today's scheduled sessions to automatically load its level and stream roster.
            </p>
          </div>
          {scheduledSlotsForDay.length > 0 && (
            <div className="pt-2 max-w-md mx-auto">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-2">
                Timetable Slots Configured for Today:
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {scheduledSlotsForDay.map((slot) => {
                  const c = courses.find((crs) => crs.id === slot.courseId);
                  if (!c) return null;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() =>
                        applyCourseSelection(c.id, {
                          preferredSlot: slot,
                          markUserAction: true
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#007c82]/10 hover:bg-[#007c82]/20 text-[#007c82] dark:text-teal-300 border border-[#007c82]/20 transition-all cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{c.code}: {slot.startTime} – {slot.endTime}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* BIOMETRIC MODE */}
          {viewMode === 'biometric' && (
            <BiometricAttendance
              date={selectedDate}
              course={activeCourse}
              presentStudentIds={Object.entries(sessionRecords)
                .filter(([, status]) => status === 'present')
                .map(([id]) => id)}
              isSessionFinalized={isFinalized}
              stream={selectedStream === 'all' ? undefined : selectedStream}
              onAttendanceMarked={handleBiometricMarked}
              onFinalizeSession={handleFinalize}
            />
          )}

          {/* GPS PERIMETER & LOCATION CHECK-IN MODE */}
          {viewMode === 'gps' && (
            <GpsAttendancePanel
              date={selectedDate}
              course={activeCourse}
              stream={selectedStream}
              venueHint={activeSlot?.venue}
              students={streamStudents}
              sessionRecords={sessionRecords}
              biometricVerifiedIds={biometricVerifiedIds}
              gpsVerifiedIds={gpsVerifiedIds}
              isSessionFinalized={isFinalized}
              onOpenQRModal={() => setShowQRModal(true)}
            />
          )}

          {/* MANUAL CHECKLIST MODE */}
          {viewMode === 'manual' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          
          {/* Header & Quick Action Bar */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            
            {/* Live Count Pills */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                {presentCount} Present
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 text-xs font-bold border border-rose-200 dark:border-rose-800">
                <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                {absentCount} Absent
              </div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Rate: <strong className="text-slate-800 dark:text-slate-200">{attendanceRate}%</strong> ({presentCount}/{streamStudents.length})
              </div>
            </div>

            {/* Quick Bulk Marking Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleMarkAll('present')}
                disabled={isFinalized}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Mark All Present
              </button>
              <button
                onClick={() => handleMarkAll('absent')}
                disabled={isFinalized}
                className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Mark All Absent
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <div className="relative max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search student name or index number (e.g. UEB310...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
              />
            </div>
          </div>

          {/* Students Attendance List (Responsive Dual-View) */}
          
          {/* 1. Mobile Cards View (< 768px) */}
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {streamStudents.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                <p className="font-bold text-sm text-slate-700 dark:text-slate-300">No students in this class division</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Please assign students in the <strong>Student Roster & Staff</strong> tab.
                </p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 dark:text-slate-500">
                No students found matching your search.
              </div>
            ) : (
              filteredStudents.map((student, idx) => {
                const status = sessionRecords[student.id] || 'absent';
                const isPresent = status === 'present';
                const isBiometricVerified = biometricVerifiedIds.includes(student.id);
                const isGpsVerified = gpsVerifiedIds.includes(student.id);
                const isEnrolled = student.enrolledFingers && student.enrolledFingers.length > 0;

                return (
                  <div
                    key={`${student.id}-${idx}`}
                    className={`p-3.5 space-y-3 transition-colors ${
                      isPresent
                        ? 'bg-emerald-50/30 dark:bg-emerald-950/20'
                        : 'bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 font-semibold">
                            #{idx + 1}
                          </span>
                          <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {student.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {student.program}
                        </div>
                      </div>

                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-[#007c82] dark:text-teal-300 border border-teal-200 dark:border-teal-800 shrink-0">
                        {student.stream || 'IT A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {student.indexNumber}
                      </span>

                      <div className="flex items-center gap-2">
                        {isGpsVerified && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            <MapPin className="w-3 h-3" />
                            GPS-Verified
                          </span>
                        )}
                        {isBiometricVerified ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 text-[10px] font-bold">
                            <Fingerprint className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                            Bio-Verified
                          </span>
                        ) : !isGpsVerified && isEnrolled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">
                            <Fingerprint className="w-3 h-3 text-slate-400" />
                            {student.enrolledFingers.length} finger(s)
                          </span>
                        ) : !isGpsVerified ? (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            Not Enrolled
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Touch-Friendly Action Buttons (Minimum 44px Height) */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleMarkStatus(student.id, 'present')}
                        disabled={isFinalized}
                        className={`h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 ${
                          isPresent
                            ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                        } disabled:opacity-50`}
                      >
                        <CheckCircle2 className={`w-4 h-4 ${isPresent ? 'text-white' : 'text-slate-400'}`} />
                        <span>Present</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMarkStatus(student.id, 'absent')}
                        disabled={isFinalized}
                        className={`h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 ${
                          !isPresent
                            ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-600/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                        } disabled:opacity-50`}
                      >
                        <XCircle className={`w-4 h-4 ${!isPresent ? 'text-white' : 'text-slate-400'}`} />
                        <span>Absent</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 2. Desktop Table View (>= 768px) */}
          <div className="hidden md:block overflow-x-auto touch-scroll">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4">Index Number</th>
                  <th className="py-3 px-4">Division</th>
                  <th className="py-3 px-4">Biometric Status</th>
                  <th className="py-3 px-4 text-center">Status Toggle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                {streamStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400">
                      <p className="font-bold text-sm text-slate-700 dark:text-slate-300">No students in this class division</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Please assign students to {selectedStream === 'all' ? 'divisions' : `Division ${selectedStream}`} in the <strong>Student Roster & Staff</strong> tab.
                      </p>
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-slate-500">
                      No students found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student, idx) => {
                    const status = sessionRecords[student.id] || 'absent';
                    const isPresent = status === 'present';
                    const isBiometricVerified = biometricVerifiedIds.includes(student.id);
                    const isGpsVerified = gpsVerifiedIds.includes(student.id);
                    const isEnrolled = student.enrolledFingers && student.enrolledFingers.length > 0;

                    return (
                      <tr
                        key={`${student.id}-${idx}`}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                          isPresent ? 'bg-emerald-50/20 dark:bg-emerald-950/20' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-400 dark:text-slate-500">
                          {idx + 1}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">{student.name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{student.program}</div>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {student.indexNumber}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-[#007c82] dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                            {student.stream || 'IT A'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isGpsVerified && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                <MapPin className="w-3 h-3" />
                                GPS-Verified
                              </span>
                            )}
                            {isBiometricVerified ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 text-[11px] font-bold">
                                <Fingerprint className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                                Bio-Verified
                              </span>
                            ) : !isGpsVerified && isEnrolled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px]">
                                <Fingerprint className="w-3 h-3 text-slate-400" />
                                {student.enrolledFingers.length} finger(s)
                              </span>
                            ) : !isGpsVerified ? (
                              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                Not Enrolled
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <button
                              onClick={() => handleMarkStatus(student.id, 'present')}
                              disabled={isFinalized}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                isPresent
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400'
                              } disabled:opacity-50`}
                            >
                              Present
                            </button>
                            <button
                              onClick={() => handleMarkStatus(student.id, 'absent')}
                              disabled={isFinalized}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                !isPresent
                                  ? 'bg-rose-600 text-white shadow-sm'
                                  : 'text-slate-600 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-400'
                              } disabled:opacity-50`}
                            >
                              Absent
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Save / Finalize Panel */}
          <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-600 dark:text-slate-400 text-center sm:text-left">
              {isFinalized ? (
                <span className="text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  Attendance for this date has already been saved and finalized.
                </span>
              ) : (
                <span>Mark all students before saving and finalizing the session.</span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {!isFinalized && (
                <button
                  onClick={handleSaveDraft}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors shadow-sm cursor-pointer"
                >
                  Save Draft
                </button>
              )}

              <button
                onClick={handleFinalize}
                disabled={isFinalized}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm cursor-pointer ${
                  isFinalized
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                    : 'bg-[#003b5c] hover:bg-[#002d47] text-white'
                }`}
              >
                {isFinalized ? 'Session Locked' : 'Finalize & Lock Attendance'}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Classroom Projector QR Modal */}
      <ClassroomQRModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        course={activeCourse || null}
        date={selectedDate}
        stream={selectedStream}
        onSelectCourse={(newId) => applyCourseSelection(newId, { markUserAction: true })}
      />
    </div>
  );
};
