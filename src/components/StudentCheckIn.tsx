import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { auth, db, silentSignInAnonymously } from '../lib/firebase';
import { doc, setDoc, onSnapshot, enableNetwork } from 'firebase/firestore';
import {
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Lock,
  Smartphone,
  MapPin,
  KeyRound,
  ShieldAlert,
  Navigation,
  X
} from 'lucide-react';
import {
  verifyCampusLocation,
  DEFAULT_UENR_GEOFENCE,
  getInRoomBackupPin,
  validateRollingPin,
  GPS_ATTENDANCE_ENABLED
} from '../utils/geofence';

type LocationState = 'checking' | 'verified' | 'outside' | 'denied' | 'pin_unlocked' | 'bypassed' | 'error';

function generateSecureHex(byteLength = 16): string {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const arr = new Uint8Array(byteLength);
    window.crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.padEnd(byteLength * 2, '0').slice(0, byteLength * 2);
}

function getOrCreateGuestSessionId(): string {
  const storageKey = 'uenr_qr_guest_session_id';
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing && /^[a-zA-Z0-9_-]{16,128}$/.test(existing)) {
      return existing;
    }
    const created = `guest-${generateSecureHex(16)}`;
    localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return `guest-${generateSecureHex(16)}`;
  }
}

export const StudentCheckIn: React.FC = () => {
  const { courses, isAuthorized, checkInStudentWithIndex } = useApp();

  // Parse URL query parameters
  const searchParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const courseIdParam = searchParams.get('courseId') || '';
  const codeParam = searchParams.get('code') || '';
  const titleParam = searchParams.get('title') || '';
  const lecturerParam = searchParams.get('lecturer') || '';
  const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const streamParam = searchParams.get('stream') || 'L200 IT-A';
  const rawGeoParam = searchParams.get('geo') ?? '2500';
  const geoParam = GPS_ATTENDANCE_ENABLED ? rawGeoParam : '0';
  const pinParam = searchParams.get('pin') || '';
  const latParam = searchParams.get('lat') || '';
  const lngParam = searchParams.get('lng') || '';
  const pinModeParam = searchParams.get('pinMode') || 'rolling';

  const [indexNumber, setIndexNumber] = useState<string>('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courseIdParam);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDeviceLocked, setIsDeviceLocked] = useState<boolean>(false);

  // Geofence & Location state
  const [locStatus, setLocStatus] = useState<LocationState>(geoParam === '0' ? 'bypassed' : 'checking');
  const [locDetails, setLocDetails] = useState<{
    dist?: number;
    acc?: number;
    msg?: string;
  }>({});
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const [checkInResult, setCheckInResult] = useState<{
    studentName: string;
    studentIndex: string;
    courseCode: string;
    courseTitle: string;
    alreadyCheckedIn: boolean;
    checkedInAt?: string;
    stats?: {
      attended: number;
      total: number;
      percentage: number;
      isEligible: boolean;
    };
  } | null>(null);

  // Sync course selection if courseIdParam changes
  useEffect(() => {
    if (courseIdParam) {
      setSelectedCourseId(courseIdParam);
    } else if (courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courseIdParam, courses, selectedCourseId]);

  const activeCourse = useMemo(() => {
    const target = (selectedCourseId || courseIdParam || '').trim().toLowerCase();
    if (courses && courses.length > 0) {
      if (!target) return courses[0];
      return (
        courses.find((c) => c.id.toLowerCase() === target) ||
        courses.find((c) => c.code.toLowerCase().replace(/\s+/g, '') === target.replace(/\s+/g, '')) ||
        courses.find((c) => c.id.toLowerCase().includes(target)) ||
        courses[0]
      );
    }
    if (courseIdParam) {
      return {
        id: courseIdParam,
        code: codeParam || courseIdParam,
        title: titleParam || 'Classroom Lecture Session',
        creditHours: 3,
        lecturer: lecturerParam || 'Course Lecturer',
        department: 'Department of Information Technology'
      };
    }
    return null;
  }, [courses, selectedCourseId, courseIdParam, codeParam, titleParam, lecturerParam]);

  // Device Lock Check: verify if this physical device already submitted attendance for this lecture session
  useEffect(() => {
    const courseId = activeCourse?.id || courseIdParam;
    if (!courseId || !dateParam) return;

    const deviceLockKey = `uenr_device_lock_${courseId}_${dateParam}`;
    try {
      const stored = localStorage.getItem(deviceLockKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.studentIndex) {
          setCheckInResult(parsed);
          setIsDeviceLocked(true);
        }
      }
    } catch (err) {
      console.warn('Error reading device lock status:', err);
    }
  }, [activeCourse, courseIdParam, dateParam]);

  // Geofence Verification Runner
  const performLocationCheck = async () => {
    if (!GPS_ATTENDANCE_ENABLED || geoParam === '0') {
      setLocStatus('bypassed');
      return;
    }

    setLocStatus('checking');
    try {
      const targetLat = latParam ? parseFloat(latParam) : DEFAULT_UENR_GEOFENCE.latitude;
      const targetLng = lngParam ? parseFloat(lngParam) : DEFAULT_UENR_GEOFENCE.longitude;
      const targetRadius = Number(geoParam) || 2500;

      const res = await verifyCampusLocation({
        ...DEFAULT_UENR_GEOFENCE,
        latitude: targetLat,
        longitude: targetLng,
        radiusMeters: targetRadius
      });

      setLocDetails({
        dist: res.distanceMeters,
        acc: res.accuracyMeters,
        msg: res.message
      });

      if (res.status === 'verified') {
        setLocStatus('verified');
      } else if (res.status === 'outside') {
        setLocStatus('outside');
      } else if (res.status === 'permission_denied') {
        setLocStatus('denied');
      } else {
        setLocStatus('error');
      }
    } catch (err: any) {
      setLocStatus('error');
      setLocDetails({ msg: err.message || 'Could not verify location' });
    }
  };

  useEffect(() => {
    performLocationCheck();
  }, [geoParam]);

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    const clean = enteredPin.trim();
    if (!clean) {
      setPinError('Please enter the 4-digit PIN shown on the projector screen.');
      return;
    }

    if (pinModeParam === 'off') {
      setPinError('In-room PIN override is disabled for this session. Physical GPS verification is required.');
      return;
    }

    // Hard Anti-Cheating rule: if the device was confirmed to be outside campus, PIN cannot override it
    if (locStatus === 'outside') {
      setPinError('PIN override locked: Your device GPS confirmed you are outside UENR campus.');
      return;
    }

    const isRollingValid = activeCourse ? validateRollingPin(activeCourse.id, clean, 30) : false;
    const isStaticValid = clean === (pinParam || (activeCourse ? getInRoomBackupPin(dateParam, activeCourse.id) : ''));

    if (isRollingValid || isStaticValid) {
      setLocStatus('pin_unlocked');
      setShowPinModal(false);
      setEnteredPin('');
      if (errorMsg) setErrorMsg(null);
    } else {
      setPinError('Invalid or Expired PIN. The classroom PIN rotates every 30 seconds.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!indexNumber.trim()) {
      setErrorMsg('Please enter your student index number.');
      return;
    }

    if (!activeCourse) {
      setErrorMsg('No course selected for check-in.');
      return;
    }

    // Geofence & Physical Presence Validation
    if (GPS_ATTENDANCE_ENABLED && geoParam !== '0') {
      if (locStatus === 'checking') {
        setErrorMsg('Checking GPS location... Please wait a moment while we verify campus presence.');
        return;
      }
      if (locStatus === 'outside') {
        const kmAway = locDetails.dist ? `(~${(locDetails.dist / 1000).toFixed(1)} km away)` : '';
        setErrorMsg(
          `Location Verification Failed: You appear to be outside UENR Sunyani campus ${kmAway}. Anti-hostel protection requires physical campus presence. If sitting inside a lecture hall with poor GPS, enter the Projector PIN.`
        );
        return;
      }
      if (locStatus === 'denied' || locStatus === 'error') {
        setErrorMsg(
          'Location permission is required to verify physical campus presence. Please enable GPS permissions or enter the Projector PIN.'
        );
        return;
      }
    }

    const deviceLockKey = `uenr_device_lock_${activeCourse.id}_${dateParam}`;

    // Anti-proxy guard: check if device already completed a check-in
    try {
      const existingSubmission = localStorage.getItem(deviceLockKey);
      if (existingSubmission) {
        const parsed = JSON.parse(existingSubmission);
        setErrorMsg(
          `This smartphone is already locked to student ${parsed.studentName || parsed.studentIndex}. Multiple check-ins from the same physical device are prohibited to maintain academic integrity.`
        );
        return;
      }
    } catch (e) {}

    setIsLoading(true);
    setErrorMsg(null);

    try {
      let result: {
        success: boolean;
        message: string;
        student?: { name: string; indexNumber: string };
        course?: { code: string; title: string };
        stats?: { attended: number; total: number; percentage: number; isEligible: boolean };
        alreadyCheckedIn?: boolean;
      };

      if (isAuthorized) {
        result = await checkInStudentWithIndex(
          indexNumber,
          dateParam,
          activeCourse.id,
          streamParam,
          {
            gpsVerified: GPS_ATTENDANCE_ENABLED && locStatus === 'verified',
            distanceMeters: GPS_ATTENDANCE_ENABLED && typeof locDetails.dist === 'number' ? locDetails.dist : undefined
          }
        );
      } else {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          throw new Error('You appear to be offline. Please check your mobile data or campus Wi-Fi and try again.');
        }

        let submitterUid = auth.currentUser?.uid || '';
        if (!submitterUid) {
          let anonUnavailable = false;
          try {
            anonUnavailable = sessionStorage.getItem('uenr_anon_auth_unavailable') === '1';
          } catch {}

          if (!anonUnavailable) {
            const anonUser = await silentSignInAnonymously();
            if (anonUser?.uid) {
              submitterUid = anonUser.uid;
            } else {
              try {
                sessionStorage.setItem('uenr_anon_auth_unavailable', '1');
              } catch {}
            }
          }
        }

        if (!submitterUid) {
          submitterUid = getOrCreateGuestSessionId();
        }

        await enableNetwork(db).catch(() => {});

        const cleanIndex = indexNumber.trim().toUpperCase().slice(0, 30);
        const ticketId = `chk-${Date.now()}-${generateSecureHex(16)}`.slice(0, 64);
        const ticketRef = doc(db, 'qrCheckIns', ticketId);

        await setDoc(ticketRef, {
          id: ticketId,
          submitterUid,
          indexNumber: cleanIndex,
          courseId: activeCourse.id.slice(0, 60),
          courseCode: (activeCourse.code || '').slice(0, 30),
          courseTitle: (activeCourse.title || '').slice(0, 150),
          date: dateParam.slice(0, 20),
          stream: (streamParam || 'L200 IT-A').slice(0, 40),
          status: 'pending',
          gpsVerified: GPS_ATTENDANCE_ENABLED && locStatus === 'verified',
          distanceMeters: GPS_ATTENDANCE_ENABLED && typeof locDetails.dist === 'number' ? locDetails.dist : null,
          createdAt: new Date().toISOString()
        });

        result = await new Promise((resolve) => {
          let settled = false;
          let unsub = () => {};
          const timeoutId = setTimeout(() => {
            if (!settled) {
              settled = true;
              unsub();
              resolve({
                success: false,
                message: 'No active lecturer terminal responded in time. Please confirm your lecturer has the classroom QR session open and try again.'
              });
            }
          }, 15000);

          unsub = onSnapshot(
            ticketRef,
            (snap) => {
              if (!snap.exists() || settled) return;
              const data = snap.data();
              if (data.status === 'confirmed') {
                settled = true;
                clearTimeout(timeoutId);
                unsub();
                resolve({
                  success: true,
                  message: data.message || 'Checked in successfully!',
                  alreadyCheckedIn: Boolean(data.alreadyCheckedIn),
                  student: {
                    name: data.studentName || cleanIndex,
                    indexNumber: data.studentIndex || cleanIndex
                  },
                  course: {
                    code: activeCourse.code,
                    title: activeCourse.title
                  },
                  stats: data.stats || undefined
                });
              } else if (data.status === 'rejected') {
                settled = true;
                clearTimeout(timeoutId);
                unsub();
                resolve({
                  success: false,
                  message: data.message || 'Check-in rejected. Please verify your index number.'
                });
              }
            },
            (err) => {
              if (!settled) {
                settled = true;
                clearTimeout(timeoutId);
                unsub();
                resolve({
                  success: false,
                  message: err.message || 'Unable to verify check-in with the cloud session.'
                });
              }
            }
          );
        });
      }

      if (result.success && result.student && result.course) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const submissionData = {
          studentName: result.student.name,
          studentIndex: result.student.indexNumber,
          courseCode: result.course.code,
          courseTitle: result.course.title,
          alreadyCheckedIn: Boolean(result.alreadyCheckedIn),
          checkedInAt: timestamp,
          stats: result.stats
        };

        // Lock this physical device to this student check-in
        try {
          localStorage.setItem(deviceLockKey, JSON.stringify(submissionData));
        } catch (e) {}

        setCheckInResult(submissionData);
        setIsDeviceLocked(true);
      } else {
        setErrorMsg(result.message || 'Check-in failed. Please verify your index number.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit check-in. Please check your internet connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReturnToPortal = () => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      window.location.href = url.pathname;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#00243a] via-[#003b5c] to-[#005a78] flex flex-col justify-between p-3 sm:p-6 text-slate-100">
      
      {/* Top Header */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between py-2 text-white/80">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white p-1 flex items-center justify-center shadow-xs">
            <img src="/assets/uenr_logo.jpg" alt="UENR" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-xs font-black tracking-wide text-white uppercase">UENR ITDS Portal</h1>
            <p className="text-[10px] text-slate-300">Classroom Attendance Verification</p>
          </div>
        </div>
        <button
          onClick={handleReturnToPortal}
          className="text-[11px] font-bold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
        >
          Staff Login
        </button>
      </div>

      {/* Main Card Container */}
      <div className="max-w-md w-full mx-auto my-auto py-4">
        <div className="bg-white text-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-white/20">
          
          {/* Lecture Banner */}
          <div className="bg-[#003b5c] p-5 sm:p-6 text-white relative">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#8dc63f] bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                Live Classroom Check-In
              </span>
              <span className="text-xs text-slate-300 font-semibold">
                {streamParam}
              </span>
            </div>

            {activeCourse ? (
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                  {activeCourse.code}: {activeCourse.title}
                </h2>
                <div className="flex items-center gap-2 flex-wrap text-xs text-slate-200 mt-2">
                  <span>Lecturer: <strong>{activeCourse.lecturer}</strong></span>
                  <span>•</span>
                  <span>Date: <strong>{dateParam}</strong></span>
                </div>
              </div>
            ) : (
              <p className="text-sm font-bold text-slate-200">No Course Active</p>
            )}
          </div>

          {/* Form or Result View */}
          <div className="p-5 sm:p-7">
            {checkInResult ? (
              /* Success / Result Screen */
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center shadow-md">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </div>

                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    {checkInResult.alreadyCheckedIn ? 'Already Checked In!' : 'Attendance Verified!'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {checkInResult.alreadyCheckedIn
                      ? 'Your attendance has been recorded for this lecture.'
                      : 'You have been successfully marked present on the lecturer’s screen.'}
                  </p>
                </div>

                {/* Student Details Card */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-semibold">Student Name:</span>
                    <span className="text-xs font-bold text-slate-900">{checkInResult.studentName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-semibold">Index Number:</span>
                    <span className="text-xs font-mono font-bold text-[#007c82]">{checkInResult.studentIndex}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-semibold">Course:</span>
                    <span className="text-xs font-bold text-slate-800">{checkInResult.courseCode}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-semibold">Cloud Verification:</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Live Synced · Confirmed
                    </span>
                  </div>
                  {checkInResult.checkedInAt && (
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/80 text-slate-500">
                      <span>Time Recorded:</span>
                      <span className="font-mono font-bold text-slate-700">{checkInResult.checkedInAt}</span>
                    </div>
                  )}
                </div>

                {/* 75% Attendance Progress Meter */}
                {checkInResult.stats && (
                  <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200 text-left space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#007c82]">
                        Semester Course Attendance
                      </span>
                      <span className="text-xs font-black text-[#007c82]">
                        {checkInResult.stats.percentage}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          checkInResult.stats.isEligible ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(checkInResult.stats.percentage, 100)}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1">
                      <span>{checkInResult.stats.attended} of {checkInResult.stats.total} lectures attended</span>
                      <span className={`font-bold ${checkInResult.stats.isEligible ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {checkInResult.stats.isEligible ? 'Eligible for Exam' : 'Below 75% Threshold'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Anti-Proxy Device Lock & Integrity Banner (Cheat Prevention) */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-left space-y-2 text-slate-200 shadow-md">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">
                        Anti-Proxy Device Lock Active
                      </h4>
                      <p className="text-[10px] text-emerald-400 font-semibold">
                        Locked to {checkInResult.studentIndex}
                      </p>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    To maintain strict academic integrity and prevent proxy roll call, this smartphone is locked to a single student submission for this lecture session. You cannot check in on behalf of other students.
                  </p>

                  <div className="pt-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800">
                    <span className="flex items-center gap-1">
                      <Smartphone className="w-3 h-3 text-slate-400" />
                      Device ID Registered
                    </span>
                    <span className="text-emerald-400 font-bold">✓ 1 Student / 1 Device Policy</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 text-center pt-1">
                  Keep this confirmation screen open if requested by your course lecturer.
                </p>
              </div>
            ) : (
              /* Input Form */
              <form onSubmit={handleSubmit} className="space-y-4">
                {!courseIdParam && courses.length > 0 && (
                  <div className="text-left space-y-1 pb-1">
                    <label
                      htmlFor="student-course-select"
                      className="block text-xs font-black uppercase tracking-wider text-slate-700"
                    >
                      Lecture Course
                    </label>
                    <select
                      id="student-course-select"
                      value={selectedCourseId}
                      onChange={(e) => setSelectedCourseId(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-300 focus:border-[#007c82] rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800"
                    >
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code}: {c.title} ({c.lecturer})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Anti-Hostel Geofence & Campus Presence Status Banner */}
                {geoParam !== '0' && (
                  <div className="space-y-2">
                    {locStatus === 'checking' && (
                      <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-800 text-xs flex items-center justify-between gap-2 shadow-xs animate-pulse">
                        <div className="flex items-center gap-2">
                          <Navigation className="w-4 h-4 text-sky-600 animate-spin" />
                          <span className="font-semibold">Verifying UENR Campus presence via GPS...</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-sky-600 bg-sky-100 px-2 py-0.5 rounded-md">
                          Locating
                        </span>
                      </div>
                    )}

                    {locStatus === 'verified' && (
                      <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 shadow-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="truncate">
                            <span className="font-extrabold block text-emerald-950">Campus Presence Verified</span>
                            <span className="text-[10px] text-emerald-700">
                              Within UENR Sunyani {locDetails.dist !== undefined ? `(~${locDetails.dist}m from center)` : ''}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300 shrink-0">
                          ✓ On-Campus
                        </span>
                      </div>
                    )}

                    {locStatus === 'pin_unlocked' && (
                      <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 shadow-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <KeyRound className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div>
                            <span className="font-extrabold block text-emerald-950">Projector PIN Verified</span>
                            <span className="text-[10px] text-emerald-700">In-room attendance unlocked for this session</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300 shrink-0">
                          ✓ Room Verified
                        </span>
                      </div>
                    )}

                    {locStatus === 'bypassed' && (
                      <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium">Online Session / Campus Geofence Bypassed</span>
                      </div>
                    )}

                    {locStatus === 'outside' && (
                      <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-950 text-xs space-y-2.5 text-left shadow-sm">
                        <div className="flex items-start gap-2.5">
                          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-black text-rose-900 text-xs uppercase tracking-wide">
                              Outside UENR Campus · Check-in Blocked
                            </h4>
                            <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                              You are detected ~{locDetails.dist ? (locDetails.dist / 1000).toFixed(1) : '?'} km away. Anti-hostel protection requires students to be physically on campus to mark roll call.
                            </p>
                            <p className="text-[10px] text-slate-600 mt-1.5 bg-white/80 p-2 rounded-xl border border-rose-200">
                              🔒 <strong>Anti-Cheat Protection:</strong> Forwarded PINs from friends cannot override a verified remote GPS location. You must be on campus.
                            </p>
                          </div>
                        </div>

                        <div className="pt-1 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={performLocationCheck}
                            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Retry GPS Location</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {(locStatus === 'denied' || locStatus === 'error') && (
                      <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-200 text-amber-950 text-xs space-y-2.5 text-left shadow-sm">
                        <div className="flex items-start gap-2.5">
                          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-black text-amber-900 text-xs uppercase tracking-wide">
                              Location Permission Required
                            </h4>
                            <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                              Please allow browser GPS location access to confirm your presence on campus, or enter the in-room projector PIN.
                            </p>
                          </div>
                        </div>

                        <div className="pt-1.5 flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setShowPinModal(true)}
                            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-[#8dc63f]" />
                            <span>Sitting in Hall? Enter Projector PIN</span>
                          </button>

                          <button
                            type="button"
                            onClick={performLocationCheck}
                            className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Try GPS Again</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-left space-y-1">
                  <label
                    htmlFor="student-index-input"
                    className="block text-xs font-black uppercase tracking-wider text-slate-700"
                  >
                    Enter Student Index Number
                  </label>
                  <p className="text-xs text-slate-500">
                    Type your official UENR Index Number as registered in the department roster.
                  </p>
                </div>

                <div>
                  <input
                    id="student-index-input"
                    type="text"
                    value={indexNumber}
                    onChange={(e) => {
                      setIndexNumber(e.target.value.toUpperCase());
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="e.g. UEB3100122"
                    autoFocus
                    required
                    className="w-full bg-slate-50 border-2 border-slate-300 focus:border-[#007c82] rounded-2xl px-4 py-3.5 text-base sm:text-lg font-mono font-bold tracking-wider text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/10 transition-all text-center uppercase"
                  />
                </div>

                {errorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2 text-left animate-in fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !indexNumber.trim()}
                  className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-sm shadow-lg shadow-emerald-700/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{isLoading ? 'Verifying with Cloud...' : 'Confirm & Check In'}</span>
                </button>

                <div className="pt-2 text-center space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold border border-slate-200">
                    <ShieldCheck className="w-3 h-3 text-[#007c82]" />
                    <span>Single-Device Anti-Proxy Verification Active</span>
                  </div>
                  <p className="text-[11px] text-slate-400 pt-1">
                    ⚡ University of Energy & Natural Resources · ITDS
                  </p>
                </div>
              </form>
            )}
          </div>

        </div>
      </div>

      {/* In-Room Projector PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#003b5c] text-white flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-[#8dc63f]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">In-Room Projector PIN</h3>
                  <p className="text-[10px] text-slate-500">Physical Classroom Presence</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPinModal(false);
                  setPinError(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              If poor indoor GPS inside LTS 1, App Lab, or Engineering halls blocks your location, look at the <strong>classroom projector screen</strong> and enter the 4-digit PIN.
            </p>

            <form onSubmit={handleVerifyPin} className="space-y-3">
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={enteredPin}
                  onChange={(e) => {
                    setEnteredPin(e.target.value.replace(/\D/g, ''));
                    if (pinError) setPinError(null);
                  }}
                  placeholder="• • • •"
                  autoFocus
                  className="w-full text-center text-3xl font-mono font-black tracking-widest py-3 border-2 border-slate-300 focus:border-[#007c82] rounded-2xl focus:outline-none focus:ring-4 focus:ring-teal-500/10 text-slate-900"
                />
              </div>

              {pinError && (
                <p className="text-xs text-rose-600 font-bold text-center bg-rose-50 p-2 rounded-xl border border-rose-200">
                  {pinError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowPinModal(false);
                    setPinError(null);
                  }}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enteredPin.length < 4}
                  className="w-1/2 py-2.5 rounded-xl bg-[#007c82] hover:bg-[#00666b] disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                >
                  Unlock Check-In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="max-w-md w-full mx-auto text-center text-[11px] text-white/60 py-2">
        <p>Department of Information Technology & Decision Sciences · UENR</p>
      </div>

    </div>
  );
};
