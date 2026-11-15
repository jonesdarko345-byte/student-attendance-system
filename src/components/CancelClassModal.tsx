import React, { useState, useEffect } from 'react';
import { Course, TimetableSlot } from '../types';
import { Ban, Calendar, Clock, MapPin, X, AlertCircle, CalendarClock } from 'lucide-react';

interface CancelClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: Course | null;
  date: string;
  slot?: TimetableSlot | null;
  stream?: string;
  onConfirm: (data: { reason: string; makeupNote?: string }) => Promise<void>;
}

const REASON_PRESETS = [
  'Lecturer away on official / faculty duties',
  'Illness or personal emergency',
  'Academic seminar / department meeting',
  'Public holiday or campus closure',
  'Lecture hall unavailable / technical issue'
];

export const CancelClassModal: React.FC<CancelClassModalProps> = ({
  isOpen,
  onClose,
  course,
  date,
  slot,
  stream,
  onConfirm
}) => {
  const [reason, setReason] = useState<string>('');
  const [makeupNote, setMakeupNote] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setMakeupNote('');
    setError('');
    setIsSubmitting(false);

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !course) return null;

  const formattedDate = (() => {
    try {
      return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return date;
    }
  })();

  const effectiveStream =
    stream && stream !== 'all' && stream !== 'All Streams'
      ? stream
      : slot?.stream && slot.stream !== 'all'
      ? slot.stream
      : 'All Divisions';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('Please enter or select a reason for cancelling this class session.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onConfirm({
        reason: trimmedReason.slice(0, 300),
        makeupNote: makeupNote.trim() ? makeupNote.trim().slice(0, 200) : undefined
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not cancel class session. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto overscroll-contain">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-5 sm:p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                Date-Specific Session Cancellation
              </span>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                Cancel Class for {course.code}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Session Summary */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-3.5 space-y-1.5 text-xs">
          <div className="font-bold text-slate-900 dark:text-white">
            {course.code} — {course.title}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Calendar className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
              {formattedDate}
            </span>
            {slot && (
              <>
                <span className="inline-flex items-center gap-1 font-mono">
                  <Clock className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
                  {slot.startTime} – {slot.endTime}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {slot.venue}
                </span>
              </>
            )}
            <span className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-[#007c82] dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-bold text-[11px]">
              {effectiveStream}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
            Only this date will be marked cancelled. Your weekly timetable for future weeks stays untouched, and students&apos; 75% attendance will not be penalized.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 p-3 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Reason Presets */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-700 dark:text-slate-300">
              Quick Reason Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                    reason === preset
                      ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-400 text-rose-800 dark:text-rose-200'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Reason Input */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Cancellation Reason *
            </label>
            <textarea
              rows={2}
              maxLength={300}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Lecturer attending Academic Board meeting; class postponed."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
            />
          </div>

          {/* Optional Makeup / Reschedule Note */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
              <span>Makeup / Reschedule Note (Optional)</span>
            </label>
            <input
              type="text"
              maxLength={200}
              value={makeupNote}
              onChange={(e) => setMakeupNote(e.target.value)}
              placeholder="e.g. Makeup lecture on Friday at 15:00 in LT 2"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82] text-xs"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
            >
              Keep Class Active
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <Ban className="w-4 h-4" />
              <span>{isSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
