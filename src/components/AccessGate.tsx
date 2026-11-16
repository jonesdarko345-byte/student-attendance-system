import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';
import {
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Lock,
  QrCode,
  Fingerprint,
  BarChart3,
  Sun,
  Moon,
  RefreshCw,
  MapPin,
  CheckCircle2,
  MailCheck,
  BookOpen,
  GraduationCap,
  AlertTriangle,
  UserCheck,
  Info,
  X,
  Building2,
  Users,
  KeyRound
} from 'lucide-react';

export const AccessGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    firebaseUser,
    isAuthLoading,
    isAuthorized,
    pendingAuthorization,
    acceptPendingAuthorization,
    declinePendingAuthorization,
    loginWithGoogle,
    logoutUser,
    switchAccount,
    isDarkMode,
    toggleTheme
  } = useApp();

  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [isConfirmingAccess, setIsConfirmingAccess] = useState<boolean>(false);
  const [isDeclineFormOpen, setIsDeclineFormOpen] = useState<boolean>(false);
  const [declineNote, setDeclineNote] = useState<string>('');
  const [pendingActionError, setPendingActionError] = useState<string | null>(null);
  const [showAboutModal, setShowAboutModal] = useState<boolean>(false);
  const aboutModalBodyRef = useRef<HTMLDivElement | null>(null);

  // Lock background scroll & support Escape close when About modal is open
  useEffect(() => {
    if (!showAboutModal) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevBodyPaddingRight = body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - html.clientWidth;
    if (scrollbarWidth > 0) {
      const computedPadding = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${computedPadding + scrollbarWidth}px`;
    }

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';

    let lastTouchY = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAboutModal(false);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        lastTouchY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const scroller = aboutModalBodyRef.current;
      if (!scroller || !scroller.contains(e.target as Node)) {
        e.preventDefault();
        return;
      }
      if (scroller.scrollHeight <= scroller.clientHeight) {
        e.preventDefault();
        return;
      }
      const currentY = e.touches[0].clientY;
      const deltaY = lastTouchY - currentY;
      lastTouchY = currentY;
      const atTop = scroller.scrollTop <= 0 && deltaY < 0;
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 && deltaY > 0;
      if (atTop || atBottom) {
        e.preventDefault();
      }
    };

    const onWheel = (e: WheelEvent) => {
      const scroller = aboutModalBodyRef.current;
      if (!scroller || !scroller.contains(e.target as Node)) {
        e.preventDefault();
        return;
      }
      if (scroller.scrollHeight <= scroller.clientHeight) {
        e.preventDefault();
        return;
      }
      const atTop = scroller.scrollTop <= 0 && e.deltaY < 0;
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) {
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('wheel', onWheel);

      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.paddingRight = prevBodyPaddingRight;
    };
  }, [showAboutModal]);

  // 1. Authorized & confirmed verified personnel only
  if (firebaseUser && !firebaseUser.isAnonymous && isAuthorized) {
    return <>{children}</>;
  }

  // 2. Loading screen while Firebase Auth & authorization status resolve
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#f6fafb] dark:bg-slate-950 flex flex-col items-center justify-center p-4 transition-colors">
        <div className="flex flex-col items-center gap-4 bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 text-center max-w-sm w-full">
          <div className="w-16 h-16 rounded-2xl bg-[#003b5c] p-2 flex items-center justify-center shadow-md animate-pulse">
            <img src="/assets/uenr_logo.jpg" alt="UENR" className="w-full h-full object-contain" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#003b5c] dark:text-white">UENR Attendance Portal</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Verifying institutional credentials...
            </p>
          </div>
          <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mt-2"></div>
        </div>
      </div>
    );
  }

  const formatAuthErrorMessage = (err: unknown): string | null => {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return null;
    }
    if (code === 'auth/network-request-failed') {
      return 'Network request to Google Sign-In failed. Check your internet connection, ensure Google/Firebase domains are not blocked by an ad-blocker or VPN, refresh the page, and try again.';
    }
    if (code === 'auth/popup-blocked') {
      return 'The Google Sign-In popup was blocked by your browser. Please allow popups for this site and try again.';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'This domain is not currently listed under Authorized Domains in Firebase Authentication.';
    }
    return 'Sign-in could not be completed. Please allow popups and try again.';
  };

  const formatRoleLabel = (role: UserRole): string => {
    if (role === 'hod') return 'Head of Department (HOD)';
    if (role === 'class_rep') return 'Class Representative';
    return 'Course Lecturer';
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await loginWithGoogle(true);
    } catch (err: unknown) {
      const msg = formatAuthErrorMessage(err);
      if (msg) setAuthError(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleAcceptAuthorization = async () => {
    setPendingActionError(null);
    setIsConfirmingAccess(true);
    try {
      await acceptPendingAuthorization();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not activate your portal access. Please verify your internet connection and try again.';
      setPendingActionError(message);
    } finally {
      setIsConfirmingAccess(false);
    }
  };

  const handleDeclineAuthorization = async (e: React.FormEvent) => {
    e.preventDefault();
    setPendingActionError(null);
    setIsConfirmingAccess(true);
    try {
      await declinePendingAuthorization(declineNote);
      setIsDeclineFormOpen(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not submit your response. Please verify your internet connection and try again.';
      setPendingActionError(message);
    } finally {
      setIsConfirmingAccess(false);
    }
  };

  // 2b. Two-Step Confirmation Screen: HOD/Lecturer approved them, awaiting invitee's own approval
  if (firebaseUser && !firebaseUser.isAnonymous && !isAuthorized && pendingAuthorization) {
    const isDeclined = pendingAuthorization.status === 'declined';
    const roleLabel = formatRoleLabel(pendingAuthorization.role);
    const approverLabel =
      pendingAuthorization.invitedByName ||
      (pendingAuthorization.role === 'class_rep' ? 'Course Lecturer / HOD' : 'Head of Department');

    return (
      <div className="min-h-screen bg-[#f6fafb] dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900 dark:text-slate-100 transition-colors">
        <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
          <div
            className={`p-6 sm:p-7 text-white ${
              isDeclined
                ? 'bg-gradient-to-r from-amber-700 via-amber-600 to-orange-600'
                : 'bg-gradient-to-r from-[#00243a] via-[#003b5c] to-[#007c82]'
            }`}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-[11px] font-bold tracking-wide uppercase">
                {isDeclined ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-200" />
                    <span>Mismatch Reported · Awaiting Review</span>
                  </>
                ) : (
                  <>
                    <MailCheck className="w-3.5 h-3.5 text-emerald-300" />
                    <span>HOD Approval Received · Step 2 of 2</span>
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={toggleTheme}
                className="w-8 h-8 rounded-xl bg-black/20 hover:bg-black/35 border border-white/15 flex items-center justify-center cursor-pointer"
                title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-sky-100" />}
              </button>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                <UserCheck className="w-6 h-6 text-[#8dc63f]" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">
                  {isDeclined
                    ? 'Authorization Assignment Flagged'
                    : 'Confirm Your Departmental Authorization'}
                </h2>
                <p className="text-xs text-slate-100/90 mt-1 leading-relaxed">
                  {approverLabel} has authorized your Google account in the UENR ITDS Attendance Portal. Review your assignment details below and approve to activate access.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-7 space-y-5">
            {/* Assignment Summary Box */}
            <div className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Authorized Personnel</p>
                  <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                    {pendingAuthorization.name}
                  </p>
                  <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                    {pendingAuthorization.email}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950/60 text-[#007c82] dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-bold text-[11px] shrink-0">
                  {roleLabel}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Approved By</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{approverLabel}</p>
                  {pendingAuthorization.invitedBy && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                      {pendingAuthorization.invitedBy}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Department</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {pendingAuthorization.department || 'Department of Information Technology'}
                  </p>
                </div>
              </div>

              {pendingAuthorization.role === 'lecturer' && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
                    <BookOpen className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
                    <span>Assigned Course Scope</span>
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white leading-relaxed">
                    {pendingAuthorization.courseAssigned?.trim() ||
                      'Course schedule awaiting HOD assignment'}
                  </p>
                </div>
              )}

              {pendingAuthorization.role === 'class_rep' && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
                    <GraduationCap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Assigned Class Division</span>
                  </p>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {[pendingAuthorization.level, pendingAuthorization.stream].filter(Boolean).join(' · ') ||
                      'Departmental Class Roll Call Assistant'}
                  </p>
                </div>
              )}
            </div>

            {isDeclined && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold">You previously flagged or declined this assignment.</p>
                {pendingAuthorization.responseNote && (
                  <p className="text-amber-800 dark:text-amber-300">
                    Recorded note: "{pendingAuthorization.responseNote}"
                  </p>
                )}
                <p className="text-[11px] opacity-90">
                  Once the HOD updates your details—or if everything above is now accurate—click Approve &amp; Activate Portal Access below.
                </p>
              </div>
            )}

            {pendingActionError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
                {pendingActionError}
              </div>
            )}

            {isDeclineFormOpen ? (
              <form onSubmit={handleDeclineAuthorization} className="space-y-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  Reason or Course Mismatch Note (visible to HOD)
                </label>
                <textarea
                  value={declineNote}
                  onChange={(e) => setDeclineNote(e.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder="e.g. I teach INFT 255 rather than INFT 253, please reassign before activation."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isConfirmingAccess}
                    onClick={() => setIsDeclineFormOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isConfirmingAccess}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-60"
                  >
                    {isConfirmingAccess ? 'Submitting...' : 'Submit Decline / Mismatch'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={isConfirmingAccess}
                  onClick={handleAcceptAuthorization}
                  className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isConfirmingAccess
                      ? 'Activating Portal Access...'
                      : 'Approve & Activate Portal Access'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isConfirmingAccess}
                  onClick={() => setIsDeclineFormOpen(true)}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold text-xs transition-all cursor-pointer disabled:opacity-60"
                >
                  Flag Mismatch / Decline Assignment
                </button>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isSigningIn || isConfirmingAccess}
                onClick={async () => {
                  setAuthError(null);
                  setIsSigningIn(true);
                  try {
                    await switchAccount();
                  } catch (err: unknown) {
                    const msg = formatAuthErrorMessage(err);
                    if (msg) setAuthError(msg);
                  } finally {
                    setIsSigningIn(false);
                  }
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSigningIn ? 'animate-spin' : ''}`} />
                <span>Switch Account</span>
              </button>

              <button
                type="button"
                disabled={isConfirmingAccess}
                onClick={() => logoutUser()}
                className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Signed in with a Google account that is NOT authorized by HOD/Lecturer
  if (firebaseUser && !firebaseUser.isAnonymous && !isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900 dark:text-slate-100 transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-rose-200 dark:border-rose-900/60">
          <div className="bg-rose-600 p-6 text-center text-white">
            <div className="w-16 h-16 rounded-2xl bg-white/20 mx-auto flex items-center justify-center mb-3">
              <ShieldAlert className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold">Access Unauthorized</h2>
            <p className="text-xs text-rose-100 mt-1">
              Restricted to UENR HODs, Lecturers &amp; Class Representatives
            </p>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <p className="text-slate-500 dark:text-slate-400 font-medium">Signed-in account:</p>
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white break-all bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <span>{firebaseUser.email}</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                This Google account is not listed in the Department of Information Technology &amp; Decision Sciences authorized personnel registry. No student, course, or timetable records are accessible without authorization from the Head of Department or Course Lecturer.
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
                {authError}
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                disabled={isSigningIn}
                onClick={async () => {
                  setAuthError(null);
                  setIsSigningIn(true);
                  try {
                    await switchAccount();
                  } catch (err: unknown) {
                    const msg = formatAuthErrorMessage(err);
                    if (msg) setAuthError(msg);
                  } finally {
                    setIsSigningIn(false);
                  }
                }}
                className="w-full py-3 px-4 rounded-xl bg-[#003b5c] hover:bg-[#004e75] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${isSigningIn ? 'animate-spin' : ''}`} />
                <span>{isSigningIn ? 'Opening Account Picker...' : 'Switch Google Account'}</span>
              </button>

              <button
                type="button"
                onClick={() => logoutUser()}
                className="w-full py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out &amp; Return to Landing Page</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. Public Landing Page (Unauthenticated visitors see institutional UI only — ZERO private data)
  return (
    <div className="min-h-screen bg-[#f6fafb] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Public Institutional Header */}
      <header className="bg-[#003b5c] text-white border-b border-[#002840] shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white p-1 shadow-sm border border-emerald-400/40 flex items-center justify-center shrink-0">
              <img
                src="/assets/uenr_logo.jpg"
                alt="UENR Emblem"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="min-w-0">
              <h1 className="font-extrabold text-sm sm:text-lg tracking-tight text-white truncate">
                UENR Attendance Portal
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-300 font-medium truncate">
                Department of Information Technology &amp; Decision Sciences
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowAboutModal(true)}
              className="px-3 py-2 rounded-xl bg-black/20 hover:bg-black/35 border border-white/15 text-slate-100 hover:text-white text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
              title="About UENR Attendance Portal"
            >
              <Info className="w-3.5 h-3.5 text-emerald-300" />
              <span>About</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/25 hover:bg-black/40 border border-white/15 text-slate-200 hover:text-amber-300 transition-all cursor-pointer"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle light and dark mode"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-sky-200" />}
            </button>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="px-3.5 py-2 rounded-xl bg-[#007c82] hover:bg-[#00666b] text-white text-xs font-bold shadow-sm border border-teal-400/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-300" />
              <span>{isSigningIn ? 'Signing In...' : 'Staff Sign In'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Public Landing Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Hero Overview */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-[#007c82] dark:text-teal-300 text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>University of Energy &amp; Natural Resources · Sunyani</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#003b5c] dark:text-white leading-[1.12]">
              Biometric &amp; QR Course Attendance Management
            </h2>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              An institutional academic integrity platform for managing classroom roll calls, geofenced live QR check-ins, and 75% examination eligibility compliance across ITDS courses.
            </p>

            {/* Feature Highlights (Zero private data displayed) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-[#007c82] dark:text-teal-400 flex items-center justify-center shrink-0">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Live Classroom QR</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Anti-hostel campus geofencing with 30-second rolling projector PIN verification.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Biometric Verification</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Multi-finger scanner support and immutable audit trails for lecture sessions.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">75% Exam Compliance</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Automated eligibility tracking aligned with UENR academic regulations.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Role-Gated Security</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Protected database access strictly limited to HOD-authorized staff &amp; class reps.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Authorized Sign-In Card */}
          <div className="lg:col-span-5">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="bg-gradient-to-r from-[#00243a] via-[#003b5c] to-[#005a78] p-6 text-center text-white">
                <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 mx-auto flex items-center justify-center mb-3">
                  <Lock className="w-7 h-7 text-[#8dc63f]" />
                </div>
                <h3 className="text-lg font-black">Authorized Personnel Sign In</h3>
                <p className="text-xs text-slate-200 mt-1">
                  HOD, Course Lecturers &amp; Appointed Class Representatives
                </p>
              </div>

              <div className="p-6 sm:p-7 space-y-5">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
                  <p className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Protected Institutional Data</span>
                  </p>
                  <p>
                    Student rosters, course catalogs, timetables, and attendance logs are hidden from public view. Sign in with your authorized Google account to access the portal.
                  </p>
                </div>

                {authError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
                    {authError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn}
                  className="w-full py-3.5 px-4 rounded-2xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
                >
                  <div className="bg-white p-1 rounded-md">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                  </div>
                  <span>{isSigningIn ? 'Authenticating with Google...' : 'Sign In with Authorized Google Account'}</span>
                </button>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Attending a Lecture as a Student?
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Scan the live Classroom QR Code displayed on your lecture hall projector screen to mark your attendance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Public Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-4 px-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            University of Energy and Natural Resources · Department of Information Technology &amp; Decision Sciences
          </span>
          <button
            type="button"
            onClick={() => setShowAboutModal(true)}
            className="inline-flex items-center gap-1 font-bold text-[#007c82] dark:text-teal-400 hover:underline cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>About This Portal</span>
          </button>
        </div>
      </footer>

      {/* About Portal Modal */}
      {showAboutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150 touch-none overscroll-none"
          onClick={() => setShowAboutModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-portal-title"
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#00243a] via-[#003b5c] to-[#007c82] p-5 sm:p-6 text-white flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-white p-1.5 shadow-sm border border-emerald-400/40 flex items-center justify-center shrink-0">
                  <img
                    src="/assets/uenr_logo.jpg"
                    alt="UENR Emblem"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/15 border border-white/20 text-emerald-200">
                    <ShieldCheck className="w-3 h-3" />
                    UENR ITDS Academic System
                  </span>
                  <h3 id="about-portal-title" className="text-lg sm:text-xl font-black mt-1.5">
                    About UENR Attendance Portal
                  </h3>
                  <p className="text-xs text-slate-200 mt-0.5">
                    Department of Information Technology &amp; Decision Sciences · Sunyani
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                className="p-1.5 rounded-xl bg-black/20 hover:bg-black/35 text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
                aria-label="Close About dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div
              ref={aboutModalBodyRef}
              className="p-5 sm:p-6 overflow-y-auto overscroll-contain touch-pan-y space-y-5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed"
            >
              {/* Mission & Overview */}
              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#007c82] dark:text-teal-400" />
                  <span>Purpose &amp; Institutional Compliance</span>
                </h4>
                <p>
                  This portal is the official digital attendance and academic compliance platform built for the Department of Information Technology &amp; Decision Sciences at the University of Energy and Natural Resources (UENR). It replaces paper sign-in sheets with biometric verification, GPS-geofenced classroom QR check-ins, and automated <strong>75% examination eligibility tracking</strong>.
                </p>
              </div>

              {/* Who Uses It */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Who Uses This Portal</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80">
                    <div className="font-bold text-slate-900 dark:text-white">Head of Department (HOD)</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Supervises department compliance, approves staff access, and reviews immutable HOD activity logs.
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80">
                    <div className="font-bold text-slate-900 dark:text-white">Course Lecturers</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Run biometric or live QR attendance for assigned courses, manage cancellations, and appoint Class Reps.
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80">
                    <div className="font-bold text-slate-900 dark:text-white">Class Representatives</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Assist with in-class attendance roll calls for their authorized class division.
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60">
                    <div className="font-bold text-[#003b5c] dark:text-teal-300">Students (QR Check-In)</div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      No staff sign-in needed—simply scan the live classroom projector QR code and rolling PIN inside the hall.
                    </p>
                  </div>
                </div>
              </div>

              {/* 3-Step First-Time Staff Sign-In */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>How First-Time Staff Access Works</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70">
                    <span className="text-[10px] font-black uppercase text-[#007c82] dark:text-teal-400">Step 1</span>
                    <div className="font-bold text-slate-900 dark:text-white mt-0.5">Registry Approval</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Your HOD (or Lecturer for Class Reps) adds your Google email to the authorized roster.
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70">
                    <span className="text-[10px] font-black uppercase text-[#007c82] dark:text-teal-400">Step 2</span>
                    <div className="font-bold text-slate-900 dark:text-white mt-0.5">Google Sign-In</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Open the invite link or click Staff Sign In using that approved Google account.
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70">
                    <span className="text-[10px] font-black uppercase text-[#007c82] dark:text-teal-400">Step 3</span>
                    <div className="font-bold text-slate-900 dark:text-white mt-0.5">Confirm Role</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Review your role and assigned courses once at the gate to activate full access.
                    </p>
                  </div>
                </div>
              </div>

              {/* Privacy & Attribution */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Data Privacy &amp; Departmental Ownership</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Zero student names, index numbers, timetables, or attendance logs are accessible prior to verified sign-in. Developed by <strong>Jones Darko</strong> for the UENR IT Department · Support &amp; access requests:{' '}
                  <span className="font-mono text-[#007c82] dark:text-teal-400">jonesdarko345@gmail.com</span>.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/70 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => {
                  setShowAboutModal(false);
                  handleGoogleSignIn();
                }}
                className="px-4 py-2 rounded-xl bg-[#003b5c] hover:bg-[#004e75] text-white text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-300" />
                <span>Staff Sign In</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
