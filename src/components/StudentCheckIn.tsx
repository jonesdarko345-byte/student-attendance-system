import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  CheckCircle2,
  AlertCircle,
  QrCode,
  GraduationCap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  Clock,
  Calendar,
  RefreshCw,
  LogOut,
  ChevronLeft
} from 'lucide-react';

export const StudentCheckIn: React.FC = () => {
  const { courses, checkInStudentWithIndex, students } = useApp();

  // Parse URL query parameters
  const searchParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const courseIdParam = searchParams.get('courseId') || '';
  const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const streamParam = searchParams.get('stream') || 'L200 IT-A';

  const [indexNumber, setIndexNumber] = useState<string>('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courseIdParam);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checkInResult, setCheckInResult] = useState<{
    studentName: string;
    studentIndex: string;
    courseCode: string;
    courseTitle: string;
    alreadyCheckedIn: boolean;
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

  const activeCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];

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

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const result = await checkInStudentWithIndex(
        indexNumber,
        dateParam,
        activeCourse.id,
        streamParam
      );

      if (result.success && result.student && result.course) {
        setCheckInResult({
          studentName: result.student.name,
          studentIndex: result.student.indexNumber,
          courseCode: result.course.code,
          courseTitle: result.course.title,
          alreadyCheckedIn: Boolean(result.alreadyCheckedIn),
          stats: result.stats
        });
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
      url.searchParams.delete('checkin');
      url.searchParams.delete('courseId');
      url.searchParams.delete('date');
      url.searchParams.delete('stream');
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
            <p className="text-[10px] text-slate-300">Classroom Attendance Check-In</p>
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
                Live Lecture Check-In
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
              <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center shadow-md">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </div>

                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    {checkInResult.alreadyCheckedIn ? 'Already Checked In!' : 'Attendance Verified!'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {checkInResult.alreadyCheckedIn
                      ? 'You were already recorded present for this lecture.'
                      : 'You have been successfully marked present.'}
                  </p>
                </div>

                {/* Student Details Card */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2">
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
                    <span className="text-xs text-slate-500 font-semibold">Verification:</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Classroom QR · Verified
                    </span>
                  </div>
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

                <button
                  type="button"
                  onClick={() => {
                    setCheckInResult(null);
                    setIndexNumber('');
                  }}
                  className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  Check In Another Student
                </button>
              </div>
            ) : (
              /* Input Form */
              <form onSubmit={handleSubmit} className="space-y-4">
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
                  <span>{isLoading ? 'Verifying...' : 'Confirm & Check In'}</span>
                </button>

                <p className="text-[11px] text-slate-400 text-center pt-2">
                  ⚡ 5-Second Roll Call · University of Energy & Natural Resources
                </p>
              </form>
            )}
          </div>

        </div>
      </div>

      {/* Footer Info */}
      <div className="max-w-md w-full mx-auto text-center text-[11px] text-white/60 py-2">
        <p>Department of Information Technology & Decision Sciences · UENR</p>
      </div>

    </div>
  );
};
