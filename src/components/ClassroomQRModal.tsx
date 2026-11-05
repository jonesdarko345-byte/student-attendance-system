import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Course } from '../types';
import { useApp } from '../context/AppContext';
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
  CheckCircle2
} from 'lucide-react';

interface ClassroomQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: Course | null;
  date: string;
  stream?: string;
}

export const ClassroomQRModal: React.FC<ClassroomQRModalProps> = ({
  isOpen,
  onClose,
  course,
  date,
  stream
}) => {
  const { students, attendanceRecords } = useApp();
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const cleanStream = stream && stream !== 'all' && stream !== 'All Streams' ? stream : 'L200 IT-A';

  // Build the direct check-in URL that students reach when scanning the QR
  const checkInUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?checkin=1&courseId=${course?.id || ''}&date=${date}&stream=${encodeURIComponent(cleanStream)}`
    : '';

  useEffect(() => {
    if (!isOpen || !course) return;

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
  }, [isOpen, checkInUrl, course]);

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

  if (!isOpen || !course) return null;

  // Real-time calculation of attendees for this live session
  const currentRecord = attendanceRecords.find(
    (r) =>
      r.date === date &&
      r.courseId === course.id &&
      (!r.stream || r.stream === cleanStream || cleanStream === 'all' || (cleanStream === 'L200 IT-A' && (r.stream === 'IT A' || r.stream === 'L200 IT-A')))
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
        <div className="bg-gradient-to-r from-[#00243a] via-[#003b5c] to-[#005a78] text-white p-4 sm:p-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
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
              <h2 className="text-lg sm:text-2xl font-black text-white mt-0.5">
                {course.code}: {course.title}
              </h2>
              <p className="text-xs text-slate-300 flex items-center gap-2 mt-0.5">
                <span>Lecturer: <strong>{course.lecturer}</strong></span>
                <span>•</span>
                <span>{course.department}</span>
              </p>
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
                  alt="Classroom Attendance QR Code"
                  className="w-full aspect-square max-w-[340px] sm:max-w-[380px] object-contain rounded-2xl"
                />
              ) : (
                <div className="w-72 h-72 flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-[#003b5c] border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              <div className="mt-2 text-center text-slate-900 font-extrabold text-xs sm:text-sm tracking-wide">
                Point your phone camera here to check in
              </div>
            </div>

            <div className="max-w-md space-y-1">
              <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                ⚡ Option A: Index Number Confirmation
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Students scan the code, enter their Index Number (e.g. <span className="font-mono font-bold text-[#007c82]">UEB3100122</span>), and get marked present instantly in ~5 seconds.
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
                <span>Test Student Check-in</span>
              </a>
            </div>
          </div>

          {/* Right Column: Live Attendee Feed */}
          <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700 flex flex-col h-full min-h-[350px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Live Attendance Feed
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
                    Waiting for students to scan the QR code and enter their index number...
                  </p>
                </div>
              ) : (
                presentStudents.map((st, i) => (
                  <div
                    key={st.id}
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
                Scanner active
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
