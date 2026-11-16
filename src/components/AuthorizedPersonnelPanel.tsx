import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { AuthorizedUser, UserRole } from '../types';
import {
  buildAuthorizationEmailSubject,
  sendAuthorizationGmailNotice
} from '../utils/gmailNotifier';
import {
  UserPlus,
  Trash2,
  Building2,
  GraduationCap,
  Users,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  BookOpen,
  Lock,
  Edit2,
  Search,
  Check,
  Clock,
  Mail,
  Send,
  AlertTriangle
} from 'lucide-react';

export const AuthorizedPersonnelPanel: React.FC = () => {
  const {
    authorizedUsers,
    addAuthorizedUser,
    updateAuthorizedUser,
    removeAuthorizedUser,
    markAuthorizationEmailSent,
    addAuditLog,
    currentUser,
    verifiedRole,
    courses
  } = useApp();

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthorizedUser | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('lecturer');
  const [department, setDepartment] = useState('Department of Information Technology');
  const [assignedInfo, setAssignedInfo] = useState('');
  const [assignedStream, setAssignedStream] = useState('IT A');
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [formError, setFormError] = useState('');

  // Two-step confirmation & explicit Gmail send prompt state
  const [emailPromptUser, setEmailPromptUser] = useState<AuthorizedUser | null>(null);
  const [isSendingGmail, setIsSendingGmail] = useState(false);
  const [gmailSendError, setGmailSendError] = useState<string | null>(null);
  const [panelToast, setPanelToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const effectiveRole = verifiedRole || currentUser.role;
  const isHod = effectiveRole === 'hod';
  const isLecturer = effectiveRole === 'lecturer';
  const isClassRep = effectiveRole === 'class_rep';
  const canAuthorize = isHod || isLecturer;

  // Lock background scroll while any modal is open
  useEffect(() => {
    if (!showModal && !emailPromptUser) return;
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
  }, [showModal, emailPromptUser]);

  const sortedCourses = useMemo(
    () => [...courses].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [courses]
  );

  const filteredModalCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    if (!q) return sortedCourses;
    return sortedCourses.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.lecturer || '').toLowerCase().includes(q)
    );
  }, [sortedCourses, courseSearch]);

  const resolveLegacyCourseIds = (courseAssignedText?: string): string[] => {
    if (!courseAssignedText || courses.length === 0) return [];
    const tokens = courseAssignedText
      .split(/[,;/]+/)
      .map((t) => t.trim().toUpperCase().replace(/\s+/g, ''))
      .filter(Boolean);
    return courses
      .filter((c) => {
        const cleanCode = c.code.toUpperCase().replace(/\s+/g, '');
        return tokens.some((t) => t === cleanCode || cleanCode.includes(t) || t.includes(cleanCode));
      })
      .map((c) => c.id);
  };

  const openAddModal = () => {
    setEditingUser(null);
    setFormError('');
    setName('');
    setEmail('');
    setDepartment('Department of Information Technology');
    setAssignedInfo('');
    setAssignedStream('IT A');
    setSelectedCourseIds([]);
    setCourseSearch('');
    setRole(isLecturer ? 'class_rep' : 'lecturer');
    setShowModal(true);
  };

  const openEditModal = (user: AuthorizedUser) => {
    if (!isHod) return;
    setEditingUser(user);
    setFormError('');
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setDepartment(user.department || 'Department of Information Technology');
    setAssignedInfo(user.level || '');
    setAssignedStream(user.stream || 'IT A');
    setCourseSearch('');
    if (user.role === 'lecturer') {
      const initialIds = Array.isArray(user.assignedCourseIds)
        ? user.assignedCourseIds.filter((id) => courses.some((c) => c.id === id))
        : resolveLegacyCourseIds(user.courseAssigned);
      setSelectedCourseIds(initialIds);
    } else {
      setSelectedCourseIds([]);
    }
    setShowModal(true);
  };

  const toggleCourseSelection = (courseId: string) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]
    );
  };

  const buildCourseSummary = (ids: string[]): string => {
    const picked = sortedCourses.filter((c) => ids.includes(c.id));
    if (picked.length === 0) return '';
    const rich = picked.map((c) => `${c.code} (${c.title})`).join(', ');
    if (rich.length <= 480) return rich;
    return picked.map((c) => c.code).join(', ').slice(0, 480);
  };

  const openGmailConfirmModal = (user: AuthorizedUser) => {
    setGmailSendError(null);
    setEmailPromptUser(user);
  };

  const handleConfirmSendGmail = async () => {
    if (!emailPromptUser) return;
    setGmailSendError(null);
    setIsSendingGmail(true);

    try {
      const resolvedCourseText =
        emailPromptUser.role === 'lecturer'
          ? emailPromptUser.courseAssigned ||
            (Array.isArray(emailPromptUser.assignedCourseIds)
              ? buildCourseSummary(emailPromptUser.assignedCourseIds)
              : '')
          : undefined;

      const result = await sendAuthorizationGmailNotice(
        {
          recipientName: emailPromptUser.name,
          recipientEmail: emailPromptUser.email,
          role: emailPromptUser.role,
          department: emailPromptUser.department,
          courseAssigned: resolvedCourseText,
          level: emailPromptUser.level,
          stream: emailPromptUser.stream,
          approvedByName: currentUser.name || 'Department Administration',
          approvedByEmail: currentUser.email
        },
        currentUser.email
      );

      if (!result.success) {
        setGmailSendError(result.error || 'Could not send Gmail notification.');
        return;
      }

      await markAuthorizationEmailSent(emailPromptUser.id);
      await addAuditLog(
        'Gmail Notice Dispatched',
        `Sent portal authorization notice via Gmail to ${emailPromptUser.name} (${emailPromptUser.email}) for ${emailPromptUser.role.toUpperCase()} confirmation.`,
        'security'
      );

      setPanelToast({
        type: 'success',
        message: `Authorization email delivered to ${emailPromptUser.email}'s Gmail inbox.`
      });
      setEmailPromptUser(null);
    } finally {
      setIsSendingGmail(false);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setPanelToast(null);

    if (isClassRep) {
      setFormError('Class Representatives do not have permission to assign personnel.');
      return;
    }

    const assignedRole: UserRole = isLecturer ? 'class_rep' : role;

    if (!name.trim() || (!editingUser && !email.trim())) {
      setFormError('Please enter both full name and Google email address.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!editingUser && (!cleanEmail.includes('@') || !cleanEmail.includes('.'))) {
      setFormError('Please enter a valid email address.');
      return;
    }

    if (!editingUser && authorizedUsers.some((u) => u.email.toLowerCase() === cleanEmail)) {
      setFormError('This email is already in the authorized registry.');
      return;
    }

    const derivedCourseSummary =
      assignedRole === 'lecturer' ? buildCourseSummary(selectedCourseIds) : undefined;

    let savedUser: AuthorizedUser | null = null;
    const wasDeclinedOrPending =
      editingUser && (editingUser.status === 'declined' || editingUser.status === 'pending');

    if (editingUser) {
      savedUser = await updateAuthorizedUser(editingUser.id, {
        name: name.trim(),
        role: assignedRole,
        department,
        ...(assignedRole === 'lecturer'
          ? {
              assignedCourseIds: selectedCourseIds,
              courseAssigned: derivedCourseSummary || ''
            }
          : {}),
        ...(assignedRole === 'class_rep'
          ? {
              level: assignedInfo.trim() || undefined,
              stream: assignedStream
            }
          : {})
      });
    } else {
      savedUser = await addAuthorizedUser({
        name: name.trim(),
        email: cleanEmail,
        role: assignedRole,
        department,
        ...(assignedRole === 'lecturer'
          ? {
              assignedCourseIds: selectedCourseIds,
              courseAssigned: derivedCourseSummary || ''
            }
          : {}),
        ...(assignedRole === 'class_rep'
          ? {
              level: assignedInfo.trim() || undefined,
              stream: assignedStream
            }
          : {})
      });
    }

    setEditingUser(null);
    setName('');
    setEmail('');
    setAssignedInfo('');
    setAssignedStream('IT A');
    setSelectedCourseIds([]);
    setCourseSearch('');
    setShowModal(false);

    // Explicitly offer to send the Gmail notification if new invite or corrected pending/declined record
    if (savedUser && (!editingUser || wasDeclinedOrPending)) {
      openGmailConfirmModal(savedUser);
    } else if (savedUser) {
      setPanelToast({
        type: 'success',
        message: `Updated ${savedUser.name}'s assignment successfully.`
      });
    }
  };

  const getRoleBadge = (userRole: UserRole) => {
    switch (userRole) {
      case 'hod':
        return {
          label: 'Head of Department (HOD)',
          icon: Building2,
          color: 'bg-purple-100 text-purple-800 border-purple-200'
        };
      case 'class_rep':
        return {
          label: 'Class Representative',
          icon: GraduationCap,
          color: 'bg-blue-100 text-blue-800 border-blue-200'
        };
      case 'lecturer':
      default:
        return {
          label: 'Course Lecturer',
          icon: Users,
          color: 'bg-emerald-100 text-emerald-800 border-emerald-200'
        };
    }
  };

  const getStatusBadge = (user: AuthorizedUser, isMasterUser: boolean) => {
    const status = isMasterUser ? 'active' : user.status || 'active';
    if (status === 'pending') {
      return {
        status,
        label: 'Pending Approval',
        icon: Clock,
        classes:
          'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800'
      };
    }
    if (status === 'declined') {
      return {
        status,
        label: 'Declined / Mismatch',
        icon: AlertTriangle,
        classes:
          'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800'
      };
    }
    return {
      status,
      label: 'Active',
      icon: CheckCircle2,
      classes:
        'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800'
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#003b5c] to-[#006080] rounded-2xl p-6 text-white shadow-md border border-teal-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 text-emerald-300">
            <KeyRound className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                Institutional Access Control
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 font-semibold">
                Two-Step Verified
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white">
              Authorized Personnel &amp; Portal Access
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 max-w-2xl leading-relaxed">
              Newly authorized Lecturers and Class Representatives receive a Gmail notice and must confirm their assignment upon Google Sign-In before accessing departmental records.
            </p>
          </div>
        </div>

        {canAuthorize ? (
          <button
            onClick={openAddModal}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer flex-shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>{isHod ? 'Authorize Personnel (Lecturer / Class Rep)' : 'Assign Class Representative'}</span>
          </button>
        ) : (
          <div className="px-3.5 py-2 bg-white/10 border border-white/20 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-300" />
            <span>Class Rep View (Read-Only)</span>
          </div>
        )}
      </div>

      {/* Inline Notification Toast */}
      {panelToast && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            panelToast.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {panelToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{panelToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setPanelToast(null)}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Access Rule Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-slate-800 dark:text-slate-100">Head of Department (HOD)</p>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold">Full Authority</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Authorizes <strong>Course Lecturers</strong> with specific courses, sends Gmail invitations, and oversees all records.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-slate-800 dark:text-slate-100">Course Lecturers</p>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold">Course Scoped</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Confirms course scope on first sign-in, manages attendance, and appoints <strong>Class Representatives</strong>.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-slate-800 dark:text-slate-100">Class Representatives</p>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold">Assigned by HOD/Lecturer</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Confirms division assignment upon sign-in and assists in taking roll calls &amp; biometric verification.
            </p>
          </div>
        </div>
      </div>

      {/* Whitelist Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Approved Access Registry</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {authorizedUsers.length} user(s) registered in institutional access control
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Firestore Sync Active
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800 uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-6">Name &amp; Google Email</th>
                <th className="py-3.5 px-6">Assigned Role</th>
                <th className="py-3.5 px-6">Department / Course Scope</th>
                <th className="py-3.5 px-6">Confirmation Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {authorizedUsers.map((user) => {
                const badge = getRoleBadge(user.role);
                const Icon = badge.icon;
                const isMasterUser = user.email.toLowerCase() === 'jonesdarko345@gmail.com';
                const statusInfo = getStatusBadge(user, isMasterUser);
                const StatusIcon = statusInfo.icon;
                const assignedCourses =
                  user.role === 'lecturer' && Array.isArray(user.assignedCourseIds)
                    ? courses.filter((c) => user.assignedCourseIds!.includes(c.id))
                    : [];

                return (
                  <tr key={user.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs border border-slate-200 dark:border-slate-700">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{user.name}</p>
                          <p className="text-slate-500 dark:text-slate-400 text-[11px] font-mono">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-6">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold border text-[11px] ${badge.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        <span>{badge.label}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-6">
                      <p className="text-slate-700 dark:text-slate-300 font-medium">{user.department || 'Department of Information Technology'}</p>
                      {user.role === 'lecturer' && (
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {assignedCourses.length > 0 ? (
                            assignedCourses.map((c) => (
                              <span
                                key={c.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-[#007c82] dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[10px] font-bold"
                                title={c.title}
                              >
                                <BookOpen className="w-2.5 h-2.5 shrink-0" />
                                {c.code}
                              </span>
                            ))
                          ) : user.courseAssigned && (!Array.isArray(user.assignedCourseIds) || user.assignedCourseIds.length > 0) ? (
                            <span className="text-[11px] text-teal-700 dark:text-teal-400 font-medium">
                              Assigned: {user.courseAssigned}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              No courses assigned
                              {isHod && (
                                <button
                                  type="button"
                                  onClick={() => openEditModal(user)}
                                  className="underline font-bold ml-1 cursor-pointer hover:text-amber-900 dark:hover:text-amber-100"
                                >
                                  Assign
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                      {(user.level || user.stream) && (
                        <p className="text-[11px] text-blue-700 dark:text-blue-400 font-medium mt-0.5">
                          {[user.level, user.stream].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </td>

                    <td className="py-3.5 px-6">
                      <div className="space-y-1">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusInfo.classes}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          <span>{statusInfo.label}</span>
                        </span>
                        {!isMasterUser && user.lastEmailSentAt && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            Gmail sent {new Date(user.lastEmailSentAt).toLocaleDateString()}
                          </p>
                        )}
                        {statusInfo.status === 'declined' && user.responseNote && (
                          <p className="text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50 px-2 py-1 rounded-lg max-w-xs">
                            "{user.responseNote}"
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-6 text-right">
                      {isMasterUser ? (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">Primary HOD</span>
                      ) : (isHod || (isLecturer && user.role === 'class_rep')) ? (
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openGmailConfirmModal(user)}
                            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors cursor-pointer"
                            title={user.lastEmailSentAt ? 'Resend Gmail notice' : 'Send Gmail notice'}
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                          {isHod && (
                            <button
                              type="button"
                              onClick={() => openEditModal(user)}
                              className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-[#007c82] dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors cursor-pointer"
                              title="Edit role & assigned courses"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Revoke portal access for ${user.name} (${user.email})?`)) {
                                removeAuthorizedUser(user.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                            title="Revoke access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : isLecturer ? (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">HOD Managed</span>
                      ) : (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">Protected</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Authorize / Edit Personnel Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 flex items-center justify-center">
                  {editingUser ? <Edit2 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {editingUser
                      ? `Edit Access: ${editingUser.name}`
                      : isLecturer
                      ? 'Assign Class Representative'
                      : 'Authorize New Personnel'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {editingUser
                      ? 'Update role details or assigned course permissions'
                      : isLecturer
                      ? 'Assign a student as Class Representative and notify their Gmail'
                      : 'Authorize personnel with two-step Gmail confirmation'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 pt-4 text-xs">
              {formError && (
                <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 p-3 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isLecturer ? 'Class Rep Full Name *' : 'Full Name *'}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isLecturer ? 'e.g. Akosua Serwaa' : 'e.g. Dr. Emmanuel Mensah or Akosua Serwaa'}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82] text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Google Email Address *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. lecturer@gmail.com or student@uenr.edu.gh"
                  required
                  disabled={Boolean(editingUser)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82] text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  {editingUser
                    ? 'Email is tied to the authorized Google account and cannot be changed.'
                    : 'Used both for Gmail authorization notice delivery and Google Sign-In.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">System Role *</label>
                  {isLecturer ? (
                    <div className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 text-xs font-bold flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                      <span>Class Rep (Lecturer Assigned)</span>
                    </div>
                  ) : (
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#007c82] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold"
                    >
                      <option value="lecturer">Lecturer (Assigned Courses Only)</option>
                      <option value="class_rep">Class Representative (In-class assistance)</option>
                      <option value="hod">Head of Department (Full Administrator)</option>
                    </select>
                  )}
                </div>

                {(isLecturer || role === 'class_rep') ? (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Class Level
                    </label>
                    <input
                      type="text"
                      value={assignedInfo}
                      onChange={(e) => setAssignedInfo(e.target.value)}
                      placeholder="e.g. Level 100, Level 200"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82] text-xs"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82] text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Lecturer Multi-Course Assignment Picker */}
              {isHod && role === 'lecturer' && (
                <div className="rounded-2xl border border-teal-200 dark:border-teal-800/80 bg-teal-50/40 dark:bg-teal-950/20 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
                      <span>Assigned Courses ({selectedCourseIds.length} selected)</span>
                    </label>
                    {sortedCourses.length > 0 && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setSelectedCourseIds(sortedCourses.map((c) => c.id))}
                          className="text-[#007c82] dark:text-teal-400 font-bold hover:underline cursor-pointer"
                        >
                          Select All
                        </button>
                        {selectedCourseIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedCourseIds([])}
                            className="text-slate-500 hover:text-rose-600 font-semibold cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {sortedCourses.length === 0 ? (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
                      No courses exist in the Timetable Catalog yet. You can save this lecturer now and assign courses after adding them in the Timetable tab.
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={courseSearch}
                          onChange={(e) => setCourseSearch(e.target.value)}
                          placeholder="Filter courses by code or title..."
                          className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                        />
                      </div>

                      <div className="max-h-44 overflow-y-auto overscroll-contain touch-pan-y space-y-1.5 pr-1">
                        {filteredModalCourses.length === 0 ? (
                          <p className="text-center py-4 text-[11px] text-slate-400">
                            No courses matching "{courseSearch}"
                          </p>
                        ) : (
                          filteredModalCourses.map((c) => {
                            const isChecked = selectedCourseIds.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => toggleCourseSelection(c.id)}
                                className={`w-full text-left px-3 py-2 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                  isChecked
                                    ? 'bg-teal-50 dark:bg-teal-950/60 border-[#007c82] dark:border-teal-500 text-slate-900 dark:text-white'
                                    : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-black text-[11px] text-[#007c82] dark:text-teal-300">
                                      {c.code}
                                    </span>
                                    <span className="font-semibold truncate">{c.title}</span>
                                  </div>
                                  {c.lecturer && c.lecturer !== 'Unassigned' && (
                                    <div className="text-[10px] text-slate-400 truncate">
                                      Catalog Lecturer: {c.lecturer}
                                    </div>
                                  )}
                                </div>
                                <div
                                  className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                    isChecked
                                      ? 'bg-[#007c82] border-[#007c82] text-white'
                                      : 'border-slate-300 dark:border-slate-600'
                                  }`}
                                >
                                  {isChecked && <Check className="w-3 h-3" />}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    When logged in and confirmed, this lecturer will only see and manage attendance, timetable slots, and reports for these selected courses.
                  </p>
                </div>
              )}

              {(isLecturer || role === 'class_rep') && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Assigned Class Division / Stream *
                    </label>
                    <select
                      value={assignedStream}
                      onChange={(e) => setAssignedStream(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/60 dark:bg-teal-950/40 text-[#007c82] dark:text-teal-300 font-bold focus:outline-none focus:ring-2 focus:ring-[#007c82] text-xs"
                    >
                      <option value="IT A">IT A (Division A)</option>
                      <option value="IT B">IT B (Division B)</option>
                      <option value="IT C">IT C (Division C)</option>
                      <option value="IT D">IT D (Division D)</option>
                      <option value="IT E">IT E (Division E)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Department</label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82] text-xs"
                    />
                  </div>
                </>
              )}

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#003b5c] hover:bg-[#004e75] text-white font-bold shadow-md cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>
                    {editingUser
                      ? 'Save Changes'
                      : isLecturer
                      ? 'Assign Class Representative'
                      : 'Authorize & Prepare Notice'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal Before Sending Gmail Notice */}
      {emailPromptUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-auto max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Confirm Gmail Notification
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Notify invitee inbox that portal approval is ready
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSendingGmail}
                onClick={() => setEmailPromptUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Recipient</p>
                <p className="font-bold text-slate-900 dark:text-white">{emailPromptUser.name}</p>
                <p className="font-mono text-slate-600 dark:text-slate-300">{emailPromptUser.email}</p>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Email Subject</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {buildAuthorizationEmailSubject({
                    recipientName: emailPromptUser.name,
                    recipientEmail: emailPromptUser.email,
                    role: emailPromptUser.role,
                    approvedByName: currentUser.name || 'Department Administration'
                  })}
                </p>
              </div>
              {emailPromptUser.courseAssigned && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Included Courses</p>
                  <p className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                    {emailPromptUser.courseAssigned}
                  </p>
                </div>
              )}
              {emailPromptUser.role === 'class_rep' && (emailPromptUser.level || emailPromptUser.stream) && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Class Assignment</p>
                  <p className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                    {[emailPromptUser.level, emailPromptUser.stream].filter(Boolean).join(' · ')}
                  </p>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              This will send an email from your signed-in Google account via Gmail API informing <strong>{emailPromptUser.name}</strong> to sign into this portal and approve access at their end.
            </p>

            {gmailSendError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
                {gmailSendError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isSendingGmail}
                onClick={() => setEmailPromptUser(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Skip for Now
              </button>
              <button
                type="button"
                disabled={isSendingGmail}
                onClick={handleConfirmSendGmail}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingGmail ? 'Sending via Gmail...' : 'Confirm & Send Gmail'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
