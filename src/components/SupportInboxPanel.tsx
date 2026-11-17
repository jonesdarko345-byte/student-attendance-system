import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ContactMessage, ContactMessageCategory, ContactMessageStatus } from '../types';
import { CONTACT_CATEGORIES } from './ContactReviewModal';
import {
  Mail,
  Inbox,
  Star,
  Search,
  CheckCircle2,
  Clock,
  Trash2,
  ExternalLink,
  Save,
  AlertCircle,
  BookOpen,
  CalendarDays,
  UserCheck,
  Filter,
  MessageSquare,
  Settings2
} from 'lucide-react';

function getCategoryMeta(category: ContactMessageCategory) {
  return (
    CONTACT_CATEGORIES.find((c) => c.id === category) || {
      id: category,
      label: 'General Inquiry',
      shortDesc: '',
      icon: MessageSquare,
      defaultSubject: ''
    }
  );
}

function getStatusBadge(status: ContactMessageStatus) {
  switch (status) {
    case 'new':
      return {
        label: 'New',
        classes:
          'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
      };
    case 'in_review':
      return {
        label: 'In Review',
        classes:
          'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800'
      };
    case 'resolved':
      return {
        label: 'Resolved',
        classes:
          'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
      };
  }
}

function buildReplyMailtoHref(msg: ContactMessage): string {
  const subject = msg.subject.toLowerCase().startsWith('re:')
    ? msg.subject
    : `Re: ${msg.subject}`;
  const dateLabel = new Date(msg.createdAt).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const bodyLines = [
    `Hello ${msg.senderName},`,
    '',
    'Thank you for reaching out to the UENR ITDS Department Administration.',
    '',
    '[Write your response here]',
    '',
    'Best regards,',
    'Head of Department · UENR ITDS Attendance Portal',
    '',
    `--- Original Message (${dateLabel}) ---`,
    `Category: ${getCategoryMeta(msg.category).label}`,
    ...(msg.courseCode ? [`Course: ${msg.courseCode}`] : []),
    ...(msg.sessionDate ? [`Session Date: ${msg.sessionDate}`] : []),
    `Message:`,
    msg.message
  ];

  return `mailto:${encodeURIComponent(msg.senderEmail)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
}

export const SupportInboxPanel: React.FC = () => {
  const {
    contactMessages,
    supportSettings,
    updateSupportSettings,
    updateContactMessage,
    deleteContactMessage
  } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | ContactMessageStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ContactMessageCategory>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [adminNoteDraft, setAdminNoteDraft] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Admin Support Email setting bar
  const [emailInput, setEmailInput] = useState<string>(supportSettings.adminEmail);
  const [isSavingEmail, setIsSavingEmail] = useState<boolean>(false);
  const [emailFeedback, setEmailFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setEmailInput(supportSettings.adminEmail);
  }, [supportSettings.adminEmail]);

  const metrics = useMemo(() => {
    const total = contactMessages.length;
    const unread = contactMessages.filter((m) => m.status === 'new').length;
    const inReview = contactMessages.filter((m) => m.status === 'in_review').length;
    const resolved = contactMessages.filter((m) => m.status === 'resolved').length;
    const rated = contactMessages.filter((m) => typeof m.rating === 'number' && m.rating > 0);
    const avgRating =
      rated.length > 0
        ? (rated.reduce((acc, m) => acc + (m.rating || 0), 0) / rated.length).toFixed(1)
        : null;

    return { total, unread, inReview, resolved, ratedCount: rated.length, avgRating };
  }, [contactMessages]);

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contactMessages.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        m.senderName.toLowerCase().includes(q) ||
        m.senderEmail.toLowerCase().includes(q) ||
        m.subject.toLowerCase().includes(q) ||
        m.message.toLowerCase().includes(q) ||
        (m.courseCode && m.courseCode.toLowerCase().includes(q))
      );
    });
  }, [contactMessages, searchQuery, statusFilter, categoryFilter]);

  const selectedMessage = useMemo(() => {
    if (filteredMessages.length === 0) return null;
    if (selectedId) {
      const found = filteredMessages.find((m) => m.id === selectedId);
      if (found) return found;
    }
    return filteredMessages[0];
  }, [filteredMessages, selectedId]);

  useEffect(() => {
    setAdminNoteDraft(selectedMessage?.adminNote || '');
    setConfirmDeleteId(null);
  }, [selectedMessage?.id, selectedMessage?.adminNote]);

  const handleSaveAdminEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailFeedback(null);
    setIsSavingEmail(true);
    try {
      await updateSupportSettings({ adminEmail: emailInput });
      setEmailFeedback({
        type: 'success',
        text: `Support target email saved as ${emailInput.trim()}`
      });
    } catch (err) {
      setEmailFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not update support email.'
      });
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleStatusChange = async (msg: ContactMessage, nextStatus: ContactMessageStatus) => {
    await updateContactMessage(msg.id, { status: nextStatus });
  };

  const handleSaveNote = async () => {
    if (!selectedMessage) return;
    setIsSavingNote(true);
    try {
      await updateContactMessage(selectedMessage.id, { adminNote: adminNoteDraft });
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleReplyLinkClick = () => {
    if (!selectedMessage) return;
    updateContactMessage(selectedMessage.id, {
      markReplied: true,
      ...(selectedMessage.status === 'new' ? { status: 'in_review' } : {})
    });
  };

  const handleDelete = async (id: string) => {
    await deleteContactMessage(id);
    setConfirmDeleteId(null);
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="space-y-4">
      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Submissions
            </span>
            <Inbox className="w-4 h-4 text-[#007c82] dark:text-teal-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1.5 tabular-nums">
            {metrics.total}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {metrics.inReview} currently in review
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Unread (New)
            </span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1.5 tabular-nums">
            {metrics.unread}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Awaiting HOD triage or reply
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Resolved Cases
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1.5 tabular-nums">
            {metrics.resolved}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Closed inquiries &amp; handled reviews
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Portal Rating
            </span>
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1.5 tabular-nums">
            {metrics.avgRating ? (
              <>
                {metrics.avgRating}{' '}
                <span className="text-sm font-bold text-slate-400">/ 5</span>
              </>
            ) : (
              '—'
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {metrics.ratedCount > 0
              ? `Based on ${metrics.ratedCount} rated review${metrics.ratedCount === 1 ? '' : 's'}`
              : 'No star ratings submitted yet'}
          </p>
        </div>
      </div>

      {/* Admin Support Email Config Card */}
      <form
        onSubmit={handleSaveAdminEmail}
        className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-[#007c82] dark:text-teal-400 shrink-0">
            <Settings2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
              Destination Email for Direct Mail (`mailto:`)
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Used when staff or students click &ldquo;Open in Email App&rdquo; in the Contact &amp; Review dialog.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <input
            type="email"
            required
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              if (emailFeedback) setEmailFeedback(null);
            }}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono font-semibold text-slate-900 dark:text-white min-w-[230px] focus:outline-none focus:ring-2 focus:ring-[#007c82]"
            placeholder="admin@uenr.edu.gh"
          />
          <button
            type="submit"
            disabled={isSavingEmail || emailInput.trim() === supportSettings.adminEmail}
            className="px-4 py-2 rounded-xl bg-[#003b5c] hover:bg-[#004e75] disabled:opacity-50 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingEmail ? 'Saving...' : 'Save Admin Email'}</span>
          </button>
        </div>
      </form>

      {emailFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            emailFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {emailFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{emailFeedback.text}</span>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by sender name, email, course code, subject, or message..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007c82]"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {(['all', 'new', 'in_review', 'resolved'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {st === 'all'
                  ? 'All'
                  : st === 'new'
                  ? `New (${metrics.unread})`
                  : st === 'in_review'
                  ? 'In Review'
                  : 'Resolved'}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | ContactMessageCategory)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
            >
              <option value="all">All Categories</option>
              {CONTACT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Master-Detail Inbox View */}
      {filteredMessages.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-black text-slate-800 dark:text-white">
            {contactMessages.length === 0
              ? 'No Contact Messages or Reviews Yet'
              : 'No Messages Match Current Filters'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            {contactMessages.length === 0
              ? 'When students, lecturers, class reps, or guests submit a question or star-rated review via Contact & Review, it will appear here in real time.'
              : 'Try clearing the search query or switching the status/category filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Message List */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-[640px] overflow-y-auto">
            {filteredMessages.map((msg) => {
              const isSelected = selectedMessage?.id === msg.id;
              const statusMeta = getStatusBadge(msg.status);
              const catMeta = getCategoryMeta(msg.category);
              const dateText = new Date(msg.createdAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => setSelectedId(msg.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer space-y-1.5 ${
                    isSelected
                      ? 'bg-teal-50/80 dark:bg-teal-950/40 border-l-4 border-l-[#007c82]'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {msg.senderName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${statusMeta.classes}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-1">
                    {msg.subject}
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-snug">
                    {msg.message}
                  </p>

                  <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-slate-400 dark:text-slate-500">
                    <span className="font-semibold text-[#007c82] dark:text-teal-400 truncate">
                      {catMeta.label}
                      {msg.courseCode ? ` · ${msg.courseCode}` : ''}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 tabular-nums">
                      {typeof msg.rating === 'number' && msg.rating > 0 && (
                        <span className="text-amber-500 font-bold">
                          ★ {msg.rating}/5
                        </span>
                      )}
                      <span>{dateText}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Message Detail Panel */}
          {selectedMessage && (
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-4">
              {/* Top Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        getStatusBadge(selectedMessage.status).classes
                      }`}
                    >
                      {getStatusBadge(selectedMessage.status).label}
                    </span>
                    <span className="text-[11px] font-bold text-[#007c82] dark:text-teal-400">
                      {getCategoryMeta(selectedMessage.category).label}
                    </span>
                    <span className="text-[11px] text-slate-400">·</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                      {selectedMessage.senderRole.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug">
                    {selectedMessage.subject}
                  </h3>
                  <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 flex-wrap tabular-nums">
                    <span className="font-bold">{selectedMessage.senderName}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-[#007c82] dark:text-teal-400">
                      {selectedMessage.senderEmail}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(selectedMessage.createdAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>

                {/* Reply by Email CTA */}
                <a
                  href={buildReplyMailtoHref(selectedMessage)}
                  onClick={handleReplyLinkClick}
                  className="px-4 py-2.5 rounded-xl bg-[#007c82] hover:bg-[#00666b] text-white text-xs font-bold shadow-sm inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  <span>Reply by Email</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Optional Context Strip */}
              {(selectedMessage.courseCode ||
                selectedMessage.sessionDate ||
                (typeof selectedMessage.rating === 'number' && selectedMessage.rating > 0)) && (
                <div className="flex items-center gap-4 flex-wrap text-xs bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 tabular-nums">
                  {typeof selectedMessage.rating === 'number' && selectedMessage.rating > 0 && (
                    <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      <span>
                        {'★'.repeat(selectedMessage.rating)}
                        {'☆'.repeat(5 - selectedMessage.rating)} ({selectedMessage.rating}/5)
                      </span>
                    </div>
                  )}
                  {selectedMessage.courseCode && (
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-semibold">
                      <BookOpen className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
                      <span>Course: {selectedMessage.courseCode}</span>
                    </div>
                  )}
                  {selectedMessage.sessionDate && (
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-semibold">
                      <CalendarDays className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
                      <span>Session Date: {selectedMessage.sessionDate}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Message Body */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs sm:text-[13px] text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                {selectedMessage.message}
              </div>

              {/* Replied Audit Meta */}
              {selectedMessage.repliedAt && (
                <div className="flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>
                    Email reply opened by {selectedMessage.repliedBy || 'HOD'} on{' '}
                    {new Date(selectedMessage.repliedAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              )}

              {/* Status Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mr-1">
                    Status:
                  </span>
                  {(['new', 'in_review', 'resolved'] as ContactMessageStatus[]).map((st) => {
                    const active = selectedMessage.status === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleStatusChange(selectedMessage, st)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                          active
                            ? 'bg-[#003b5c] text-white border-[#003b5c] shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {st === 'new' ? 'New' : st === 'in_review' ? 'In Review' : 'Resolved'}
                      </button>
                    );
                  })}
                </div>

                {/* Delete Confirmation */}
                <div>
                  {confirmDeleteId === selectedMessage.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedMessage.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selectedMessage.id)}
                      className="px-3 py-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Internal HOD Resolution Note */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label
                  htmlFor="hod-admin-note"
                  className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                >
                  Internal Admin / HOD Note (private to HOD)
                </label>
                <textarea
                  id="hod-admin-note"
                  rows={2}
                  maxLength={1000}
                  value={adminNoteDraft}
                  onChange={(e) => setAdminNoteDraft(e.target.value)}
                  placeholder="Record resolution steps, follow-up actions, or verification outcome..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isSavingNote || adminNoteDraft === (selectedMessage.adminNote || '')}
                    onClick={handleSaveNote}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingNote ? 'Saving...' : 'Save Admin Note'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
