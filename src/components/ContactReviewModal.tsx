import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ContactMessage, ContactMessageCategory, ContactSenderRole } from '../types';
import {
  Mail,
  MessageSquare,
  Star,
  Send,
  X,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  UserCheck,
  CalendarDays,
  BookOpen,
  ShieldCheck,
  Sparkles,
  Wrench,
  HelpCircle,
  Users
} from 'lucide-react';

interface CategoryMeta {
  id: ContactMessageCategory;
  label: string;
  shortDesc: string;
  icon: React.FC<{ className?: string }>;
  defaultSubject: string;
}

export const CONTACT_CATEGORIES: CategoryMeta[] = [
  {
    id: 'missing_student',
    label: 'Missing Student',
    shortDesc: 'Report an unlisted index number or wrong stream',
    icon: Users,
    defaultSubject: 'Missing Student Roster Request'
  },
  {
    id: 'attendance_dispute',
    label: 'Attendance Dispute',
    shortDesc: 'Query a roll call record or check-in issue',
    icon: CalendarDays,
    defaultSubject: 'Attendance Record Inquiry'
  },
  {
    id: 'access_request',
    label: 'Staff / Rep Access',
    shortDesc: 'Request portal authorization or course scope',
    icon: UserCheck,
    defaultSubject: 'Portal Access Authorization Request'
  },
  {
    id: 'review_feedback',
    label: 'Portal Review',
    shortDesc: 'Rate the portal experience & suggest improvements',
    icon: Sparkles,
    defaultSubject: 'Portal Experience Review & Feedback'
  },
  {
    id: 'bug_technical',
    label: 'Technical Issue',
    shortDesc: 'Report a glitch, sync delay, or display bug',
    icon: Wrench,
    defaultSubject: 'Technical Issue Report'
  },
  {
    id: 'general',
    label: 'General Inquiry',
    shortDesc: 'Any other question for the HOD / Admin',
    icon: HelpCircle,
    defaultSubject: 'General Inquiry to Department Admin'
  }
];

const ROLE_OPTIONS: { id: ContactSenderRole; label: string }[] = [
  { id: 'student', label: 'Student' },
  { id: 'class_rep', label: 'Class Representative' },
  { id: 'lecturer', label: 'Course Lecturer' },
  { id: 'hod', label: 'HOD / Department Admin' },
  { id: 'guest', label: 'Guest / Visitor' }
];

export function buildAdminMailtoHref(params: {
  adminEmail: string;
  senderName: string;
  senderEmail: string;
  senderRole: ContactSenderRole;
  category: ContactMessageCategory;
  subject: string;
  message: string;
  rating?: number | null;
  courseCode?: string | null;
  sessionDate?: string | null;
  messageId?: string;
}): string {
  const categoryLabel =
    CONTACT_CATEGORIES.find((c) => c.id === params.category)?.label || params.category;
  const roleLabel = ROLE_OPTIONS.find((r) => r.id === params.senderRole)?.label || params.senderRole;

  const subjectLine = `[UENR Attendance · ${categoryLabel}] ${params.subject || 'Support Inquiry'}`;
  const lines = [
    `Hello UENR ITDS Department Admin,`,
    '',
    params.message || '(Write your message here)',
    '',
    '--- Sender Details ---',
    `Name: ${params.senderName || 'Not provided'}`,
    `Reply Email: ${params.senderEmail || 'Not provided'}`,
    `Role: ${roleLabel}`,
    `Category: ${categoryLabel}`
  ];

  if (params.courseCode) lines.push(`Course Code: ${params.courseCode}`);
  if (params.sessionDate) lines.push(`Session Date: ${params.sessionDate}`);
  if (typeof params.rating === 'number' && params.rating > 0) {
    lines.push(`Portal Rating: ${'★'.repeat(params.rating)}${'☆'.repeat(5 - params.rating)} (${params.rating}/5)`);
  }
  if (params.messageId) {
    lines.push(`Portal Inbox Ref: ${params.messageId}`);
  }

  return `mailto:${encodeURIComponent(params.adminEmail)}?subject=${encodeURIComponent(
    subjectLine
  )}&body=${encodeURIComponent(lines.join('\n'))}`;
}

export const ContactReviewModal: React.FC = () => {
  const {
    isContactModalOpen,
    closeContactModal,
    contactDefaultCategory,
    contactPrefill,
    supportSettings,
    submitContactMessage,
    currentUser,
    firebaseUser,
    isAuthorized,
    verifiedRole
  } = useApp();

  const bodyRef = useRef<HTMLDivElement | null>(null);

  const [category, setCategory] = useState<ContactMessageCategory>('general');
  const [senderName, setSenderName] = useState<string>('');
  const [senderEmail, setSenderEmail] = useState<string>('');
  const [senderRole, setSenderRole] = useState<ContactSenderRole>('student');
  const [subject, setSubject] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [courseCode, setCourseCode] = useState<string>('');
  const [sessionDate, setSessionDate] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<ContactMessage | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);

  // Initialize fields each time the modal opens
  useEffect(() => {
    if (!isContactModalOpen) return;

    const initialCat = contactDefaultCategory || 'general';
    setCategory(initialCat);
    setSubmittedRecord(null);
    setErrorMsg(null);
    setCopiedEmail(false);

    if (isAuthorized && firebaseUser && !firebaseUser.isAnonymous) {
      setSenderName(currentUser.name || firebaseUser.displayName || '');
      setSenderEmail(firebaseUser.email || currentUser.email || '');
      setSenderRole(verifiedRole || currentUser.role || 'lecturer');
    } else if (firebaseUser && !firebaseUser.isAnonymous) {
      setSenderName(firebaseUser.displayName || '');
      setSenderEmail(firebaseUser.email || '');
      setSenderRole('guest');
    } else {
      const isCheckIn =
        typeof window !== 'undefined' && window.location.search.includes('checkin=');
      setSenderName('');
      setSenderEmail('');
      setSenderRole(isCheckIn ? 'student' : 'guest');
    }

    const catMeta = CONTACT_CATEGORIES.find((c) => c.id === initialCat);
    setSubject(contactPrefill?.subject || catMeta?.defaultSubject || '');
    setCourseCode(contactPrefill?.courseCode || '');
    setSessionDate(contactPrefill?.sessionDate || '');
    setMessage('');
    setRating(initialCat === 'review_feedback' ? 5 : 0);
    setHoverRating(0);
  }, [
    isContactModalOpen,
    contactDefaultCategory,
    contactPrefill,
    isAuthorized,
    firebaseUser,
    currentUser.name,
    currentUser.email,
    currentUser.role,
    verifiedRole
  ]);

  // Background scroll lock + Escape close
  useEffect(() => {
    if (!isContactModalOpen) return;

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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContactModal();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.paddingRight = prevBodyPaddingRight;
    };
  }, [isContactModalOpen, closeContactModal]);

  const adminEmail = supportSettings.adminEmail || 'jonesdarko345@gmail.com';
  const showContextFields = category === 'missing_student' || category === 'attendance_dispute';
  const showRatingProminently = category === 'review_feedback';

  const directMailtoHref = useMemo(() => {
    return buildAdminMailtoHref({
      adminEmail,
      senderName: submittedRecord?.senderName || senderName,
      senderEmail: submittedRecord?.senderEmail || senderEmail,
      senderRole: submittedRecord?.senderRole || senderRole,
      category: submittedRecord?.category || category,
      subject: submittedRecord?.subject || subject,
      message: submittedRecord?.message || message,
      rating: submittedRecord ? submittedRecord.rating : rating > 0 ? rating : null,
      courseCode: submittedRecord?.courseCode ?? (courseCode || null),
      sessionDate: submittedRecord?.sessionDate ?? (sessionDate || null),
      messageId: submittedRecord?.id
    });
  }, [
    adminEmail,
    submittedRecord,
    senderName,
    senderEmail,
    senderRole,
    category,
    subject,
    message,
    rating,
    courseCode,
    sessionDate
  ]);

  if (!isContactModalOpen) return null;

  const handleCategoryChange = (nextCat: ContactMessageCategory) => {
    const prevMeta = CONTACT_CATEGORIES.find((c) => c.id === category);
    const nextMeta = CONTACT_CATEGORIES.find((c) => c.id === nextCat);
    setCategory(nextCat);
    if (!subject.trim() || subject === prevMeta?.defaultSubject) {
      setSubject(nextMeta?.defaultSubject || '');
    }
    if (nextCat === 'review_feedback' && rating === 0) {
      setRating(5);
    }
    if (errorMsg) setErrorMsg(null);
  };

  const handleCopyAdminEmail = async () => {
    try {
      await navigator.clipboard.writeText(adminEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const saved = await submitContactMessage({
        senderName,
        senderEmail,
        senderRole,
        category,
        subject,
        message,
        rating: rating > 0 ? rating : null,
        courseCode: showContextFields && courseCode.trim() ? courseCode.trim() : null,
        sessionDate: showContextFields && sessionDate.trim() ? sessionDate.trim() : null
      });
      setSubmittedRecord(saved);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not send message to portal inbox. Please use the email button below.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeStars = hoverRating || rating;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={closeContactModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-review-modal-title"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[92dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#00243a] via-[#003b5c] to-[#007c82] p-5 sm:p-6 text-white flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-[#8dc63f]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 border border-white/20 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                  <ShieldCheck className="w-3 h-3" />
                  Direct to Department Admin
                </span>
              </div>
              <h2 id="contact-review-modal-title" className="text-lg sm:text-xl font-black mt-1 tracking-tight">
                Contact Admin &amp; Portal Review
              </h2>
              <p className="text-xs text-slate-200 mt-0.5">
                Message the HOD directly in-app or send via email to{' '}
                <span className="font-mono text-emerald-200">{adminEmail}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeContactModal}
            className="p-2 rounded-xl bg-black/20 hover:bg-black/35 text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label="Close Contact and Review dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          ref={bodyRef}
          className="p-5 sm:p-6 overflow-y-auto overscroll-contain space-y-5 text-xs text-slate-700 dark:text-slate-200"
        >
          {submittedRecord ? (
            /* Confirmation View */
            <div className="py-4 space-y-5 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center shadow-sm border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  Sent to HOD Admin Inbox!
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Your inquiry has been logged in the Department Admin Inbox and will be reviewed shortly. You will receive replies at{' '}
                  <strong className="font-mono text-[#007c82] dark:text-teal-400">
                    {submittedRecord.senderEmail}
                  </strong>
                  .
                </p>
              </div>

              {/* Summary Card */}
              <div className="max-w-md mx-auto p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-left space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Reference ID</span>
                  <span className="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                    {submittedRecord.id.slice(0, 22)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Category</span>
                  <span className="text-[11px] font-bold text-[#007c82] dark:text-teal-400">
                    {CONTACT_CATEGORIES.find((c) => c.id === submittedRecord.category)?.label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Subject</span>
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate max-w-[230px]">
                    {submittedRecord.subject}
                  </span>
                </div>
                {typeof submittedRecord.rating === 'number' && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Rating</span>
                    <span className="text-xs font-bold text-amber-500 tabular-nums">
                      {'★'.repeat(submittedRecord.rating)}
                      {'☆'.repeat(5 - submittedRecord.rating)} ({submittedRecord.rating}/5)
                    </span>
                  </div>
                )}
              </div>

              {/* Follow-up Email Option */}
              <div className="max-w-md mx-auto p-3.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/70 space-y-2.5">
                <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  Want an immediate copy in your Gmail / Email app or need to attach screenshots?
                </p>
                <a
                  href={directMailtoHref}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#007c82] hover:bg-[#00666b] text-white font-bold text-xs shadow-sm transition-all inline-flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  <span>Also Open in Email App ({adminEmail})</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedRecord(null);
                    setMessage('');
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  Send Another Message
                </button>
                <button
                  type="button"
                  onClick={closeContactModal}
                  className="px-5 py-2.5 rounded-xl bg-[#003b5c] hover:bg-[#004e75] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Submission Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Direct Email Strip */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-900/50 text-[#007c82] dark:text-teal-300 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Department Admin Email
                    </div>
                    <div className="text-xs font-mono font-bold text-slate-900 dark:text-white truncate">
                      {adminEmail}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyAdminEmail}
                    className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {copiedEmail ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <a
                    href={directMailtoHref}
                    className="px-2.5 py-1.5 rounded-xl bg-[#003b5c] hover:bg-[#004e75] text-white text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                    title="Open pre-filled message in your email app"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Email App</span>
                  </a>
                </div>
              </div>

              {/* Category Selector */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Topic / Inquiry Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CONTACT_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleCategoryChange(cat.id)}
                        className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-2 ${
                          isSelected
                            ? 'bg-teal-50 dark:bg-teal-950/50 border-[#007c82] dark:border-teal-500 ring-1 ring-[#007c82]/30 text-[#003b5c] dark:text-teal-200'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            isSelected ? 'text-[#007c82] dark:text-teal-400' : 'text-slate-400'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold leading-tight truncate">{cat.label}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                            {cat.shortDesc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Star Rating Bar */}
              <div
                className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                  showRatingProminently
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70'
                    : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span>
                      {showRatingProminently
                        ? 'Rate the UENR Attendance Portal'
                        : 'Optional Portal Experience Rating'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {rating > 0
                      ? `Selected ${rating} out of 5 stars`
                      : 'Click a star to include a rating with your message'}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(rating === star ? 0 : star)}
                      className="p-1.5 rounded-lg hover:bg-amber-100/70 dark:hover:bg-amber-900/40 transition-transform active:scale-90 cursor-pointer"
                      aria-label={`Rate ${star} out of 5 stars`}
                    >
                      <Star
                        className={`w-5 h-5 transition-colors ${
                          star <= activeStars
                            ? 'text-amber-500 fill-amber-400'
                            : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    </button>
                  ))}
                  {rating > 0 && (
                    <button
                      type="button"
                      onClick={() => setRating(0)}
                      className="ml-1 text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 px-1.5 py-1 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Sender Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="contact-sender-name"
                    className="block text-[11px] font-bold text-slate-600 dark:text-slate-300"
                  >
                    Your Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="contact-sender-name"
                    type="text"
                    required
                    maxLength={120}
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="e.g. Kwame Boateng"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="contact-sender-email"
                    className="block text-[11px] font-bold text-slate-600 dark:text-slate-300"
                  >
                    Reply Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="contact-sender-email"
                    type="email"
                    required
                    maxLength={120}
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="name@uenr.edu.gh"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="contact-sender-role"
                    className="block text-[11px] font-bold text-slate-600 dark:text-slate-300"
                  >
                    Your Role
                  </label>
                  <select
                    id="contact-sender-role"
                    value={senderRole}
                    onChange={(e) => setSenderRole(e.target.value as ContactSenderRole)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional Contextual Course / Date Inputs */}
              {showContextFields && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80">
                  <div className="space-y-1">
                    <label
                      htmlFor="contact-course-code"
                      className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
                      <span>Course Code / Stream (optional)</span>
                    </label>
                    <input
                      id="contact-course-code"
                      type="text"
                      maxLength={30}
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                      placeholder="e.g. INFT 253 · L200 IT-A"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="contact-session-date"
                      className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1"
                    >
                      <CalendarDays className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
                      <span>Lecture Date (optional)</span>
                    </label>
                    <input
                      id="contact-session-date"
                      type="date"
                      maxLength={25}
                      value={sessionDate}
                      onChange={(e) => setSessionDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                    />
                  </div>
                </div>
              )}

              {/* Subject */}
              <div className="space-y-1">
                <label
                  htmlFor="contact-subject"
                  className="block text-[11px] font-bold text-slate-600 dark:text-slate-300"
                >
                  Subject <span className="text-rose-500">*</span>
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  required
                  maxLength={160}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary of your message or review"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                />
              </div>

              {/* Message */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="contact-message"
                    className="block text-[11px] font-bold text-slate-600 dark:text-slate-300"
                  >
                    Message / Review Details <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                    {message.length}/2000
                  </span>
                </div>
                <textarea
                  id="contact-message"
                  required
                  rows={4}
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    category === 'missing_student'
                      ? 'Include student full name, UENR index number, level, and stream (e.g. Level 200 IT-A)...'
                      : category === 'review_feedback'
                      ? 'Share what works well and what features or improvements would help your department...'
                      : 'Describe your question, request, or discussion point for the Department Admin...'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Footer Actions */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={closeContactModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <a
                    href={directMailtoHref}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
                    <span>Email Directly</span>
                  </a>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-[#007c82] hover:bg-[#00666b] disabled:opacity-60 text-white text-xs font-bold shadow-md inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <MessageSquare className="w-4 h-4 animate-pulse" />
                        <span>Sending to Inbox...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit to Admin Inbox</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
