import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Student, DEFAULT_STREAMS } from '../types';
import { BiometricEnrollment } from '../components/BiometricEnrollment';
import { AuthorizedPersonnelPanel } from '../components/AuthorizedPersonnelPanel';
import {
  Users,
  UserPlus,
  Fingerprint,
  Trash2,
  Search,
  Upload,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  GraduationCap,
  RotateCcw,
  Sparkles,
  Sliders,
  ShieldCheck,
  Layers,
  Filter,
  Edit2,
  ArrowUpRight,
  ArrowUpDown,
  ArrowUpAZ,
  ArrowDownAZ,
  CheckSquare,
  Square,
  Check,
  TrendingUp,
  X,
  ChevronRight,
  Sparkle,
  Loader2,
  FileSpreadsheet,
  FileText,
  Plus,
  Mail
} from 'lucide-react';
import { parseStudentRoster, generateSampleStudents, parseUploadedFile, generateInstitutionalEmail, detectCohortHints } from '../utils/studentParser';
import { streamsMatch } from '../utils/timetableHelper';

export type StudentSortOption = 'name-asc' | 'name-desc' | 'index-asc' | 'index-desc' | 'level-asc';

export const Admin: React.FC = () => {
  const {
    students,
    addStudent,
    batchAddStudents,
    updateStudent,
    batchUpdateStudents,
    batchPromoteStudents,
    promoteAllLevels,
    removeStudent,
    deleteStudentsByFilter,
    clearAllStudents,
    updateAllStudentEmailsToNameBased,
    authorizedUsers,
    currentUser,
    verifiedRole,
    setActiveTab,
    setHodAdminTab,
    adminSubTab,
    setAdminSubTab,
    cloudSyncError
  } = useApp();

  // Delete Specific Cohort / Level / Stream Modal
  const [showDeleteCohortModal, setShowDeleteCohortModal] = useState<boolean>(false);
  const [deleteTargetType, setDeleteTargetType] = useState<'level' | 'stream' | 'both'>('level');
  const [targetDeleteLevel, setTargetDeleteLevel] = useState<string>('Level 100');
  const [targetDeleteStream, setTargetDeleteStream] = useState<string>('IT A');
  const [isDeletingCohort, setIsDeletingCohort] = useState<boolean>(false);

  const [selectedStudentForBio, setSelectedStudentForBio] = useState<Student | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<string>('all');
  const [selectedStreamFilter, setSelectedStreamFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<StudentSortOption>('name-asc');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string>('');

  // Auto-dismiss toast message
  React.useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(''), 4500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Keep Students page scoped to Roster (and Class Rep assignment for Lecturers only)
  useEffect(() => {
    const allowAuthorizedHere = verifiedRole === 'lecturer';
    if (adminSubTab !== 'roster' && !(allowAuthorizedHere && adminSubTab === 'authorized')) {
      setAdminSubTab('roster');
    }
  }, [adminSubTab, verifiedRole, setAdminSubTab]);

  // Add single student form modal & tab
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addModalTab, setAddModalTab] = useState<'single' | 'batch' | 'promote'>('single');
  const [name, setName] = useState<string>('');
  const [indexNumber, setIndexNumber] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [program, setProgram] = useState<string>('BSc Information Technology');
  const [level, setLevel] = useState<string>('Level 100');
  const [stream, setStream] = useState<string>('IT A');
  const [formError, setFormError] = useState<string>('');

  // Single Student Edit Modal
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editIndexNumber, setEditIndexNumber] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editProgram, setEditProgram] = useState<string>('BSc Information Technology');
  const [editLevel, setEditLevel] = useState<string>('Level 100');
  const [editStream, setEditStream] = useState<string>('IT A');
  const [editError, setEditError] = useState<string>('');
  const [editSuccessMsg, setEditSuccessMsg] = useState<string>('');

  // Batch Promote & Progression Modal
  const [showPromoteModal, setShowPromoteModal] = useState<boolean>(false);
  const [promoteMode, setPromoteMode] = useState<'progression' | 'custom'>('progression');
  const [promoteStreamFilter, setPromoteStreamFilter] = useState<string>('all');
  const [promoteSuccessMsg, setPromoteSuccessMsg] = useState<string>('');
  const [isPromoting, setIsPromoting] = useState<boolean>(false);

  // Custom batch edit state
  const [customFilterLevel, setCustomFilterLevel] = useState<string>('all');
  const [customFilterStream, setCustomFilterStream] = useState<string>('all');
  const [customTargetLevel, setCustomTargetLevel] = useState<string>('keep');
  const [customTargetStream, setCustomTargetStream] = useState<string>('keep');
  const [customTargetProgram, setCustomTargetProgram] = useState<string>('keep');

  // Batch import modal & editing filters
  const [showBatchModal, setShowBatchModal] = useState<boolean>(false);
  const [batchText, setBatchText] = useState<string>('');
  const [batchDefaultStream, setBatchDefaultStream] = useState<string>('IT A');
  const [batchDefaultLevel, setBatchDefaultLevel] = useState<string>('Level 100');
  const [batchClearExisting, setBatchClearExisting] = useState<boolean>(false);
  const [batchUpdateDuplicates, setBatchUpdateDuplicates] = useState<boolean>(true);
  const [batchResultMsg, setBatchResultMsg] = useState<string>('');
  const [isBatchImporting, setIsBatchImporting] = useState<boolean>(false);

  // Editable Batch Records & Filtering
  interface EditableBatchRow {
    id: string;
    name: string;
    indexNumber: string;
    email: string;
    level: string;
    stream: string;
    program: string;
    isModified?: boolean;
  }

  const [batchRecords, setBatchRecords] = useState<EditableBatchRow[]>([]);
  const [batchViewMode, setBatchViewMode] = useState<'editor' | 'raw'>('editor');
  const [batchSearchQuery, setBatchSearchQuery] = useState<string>('');
  const [batchFilterStream, setBatchFilterStream] = useState<string>('all');
  const [batchFilterLevel, setBatchFilterLevel] = useState<string>('all');
  const [bulkStreamTarget, setBulkStreamTarget] = useState<string>('IT A');
  const [bulkLevelTarget, setBulkLevelTarget] = useState<string>('Level 100');

  // Live parsed preview of batchText
  const parsedBatch = useMemo(() => {
    return parseStudentRoster(batchText, {
      defaultLevel: batchDefaultLevel,
      defaultStream: batchDefaultStream
    });
  }, [batchText, batchDefaultLevel, batchDefaultStream]);

  // Synchronize batchRecords whenever batchText is updated
  useEffect(() => {
    if (parsedBatch.valid.length > 0) {
      setBatchRecords(
        parsedBatch.valid.map((r, idx) => ({
          ...r,
          id: `batch-${idx}-${r.indexNumber || Math.random().toString(36).substr(2, 5)}`
        }))
      );
    } else if (!batchText.trim()) {
      setBatchRecords([]);
    }
  }, [parsedBatch, batchText]);

  // Filtered batch records based on search query, stream filter, and level filter
  const filteredBatchRecords = useMemo(() => {
    return batchRecords.filter((rec) => {
      if (batchSearchQuery.trim()) {
        const q = batchSearchQuery.toLowerCase();
        const matchName = rec.name.toLowerCase().includes(q);
        const matchIndex = rec.indexNumber.toLowerCase().includes(q);
        const matchEmail = (rec.email || '').toLowerCase().includes(q);
        if (!matchName && !matchIndex && !matchEmail) return false;
      }
      if (batchFilterStream !== 'all' && rec.stream !== batchFilterStream) {
        return false;
      }
      if (batchFilterLevel !== 'all' && rec.level !== batchFilterLevel) {
        return false;
      }
      return true;
    });
  }, [batchRecords, batchSearchQuery, batchFilterStream, batchFilterLevel]);

  // Dynamic Academic Levels & Streams collection
  const DEFAULT_LEVELS = ['Level 100', 'Level 200', 'Level 300', 'Level 400'] as const;

  const availableLevels = useMemo(() => {
    const set = new Set<string>(DEFAULT_LEVELS);
    students.forEach((s) => {
      if (s.level) set.add(s.level);
    });
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '') || '0', 10);
      const numB = parseInt(b.replace(/\D/g, '') || '0', 10);
      if (numA && numB) return numA - numB;
      return a.localeCompare(b);
    });
  }, [students]);

  const availableStreams = useMemo(() => {
    return Array.from(
      new Set([
        ...DEFAULT_STREAMS,
        ...students.map((s) => s.stream).filter((st): st is string => Boolean(st))
      ])
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  // If enrolling biometrics for a student, render BiometricEnrollment view
  if (selectedStudentForBio) {
    const updatedStudent = students.find((s) => s.id === selectedStudentForBio.id) || selectedStudentForBio;
    return (
      <BiometricEnrollment
        student={updatedStudent}
        onBack={() => setSelectedStudentForBio(null)}
      />
    );
  }

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !indexNumber.trim()) {
      setFormError('Please provide both full name and index number.');
      return;
    }

    const cleanIdx = indexNumber.toUpperCase().trim();
    if (students.some((s) => s.indexNumber === cleanIdx)) {
      setFormError(`A student with index number "${cleanIdx}" is already registered in the class roster.`);
      return;
    }

    try {
      await addStudent({
        name: name.trim(),
        indexNumber: cleanIdx,
        email: email.trim() || generateInstitutionalEmail(name.trim(), cleanIdx),
        program,
        level,
        stream
      });

      // Switch stream filter if needed so newly registered student is immediately visible
      if (selectedStreamFilter !== 'all' && selectedStreamFilter !== stream) {
        setSelectedStreamFilter(stream);
      }

      setToastMessage(`🎉 Student ${name.trim()} (${cleanIdx}) successfully registered into ${stream}!`);
      setName('');
      setIndexNumber('');
      setEmail('');
      setFormError('');
      setShowAddModal(false);
    } catch (err) {
      console.error('Add student error:', err);
      setFormError('Could not save student. Please verify your connection.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBatchResultMsg(`Reading "${file.name}"...`);
    try {
      const nameHints = detectCohortHints(file.name);
      const effectiveLevel = nameHints.level && batchDefaultLevel === 'Level 100'
        ? nameHints.level
        : batchDefaultLevel;
      const effectiveStream = nameHints.stream && batchDefaultStream === 'IT A'
        ? nameHints.stream
        : batchDefaultStream;

      const { text, result, detectedHints } = await parseUploadedFile(file, {
        defaultLevel: effectiveLevel,
        defaultStream: effectiveStream
      });

      const hintedLevel = detectedHints?.level || nameHints.level;
      const hintedStream = detectedHints?.stream || nameHints.stream;
      if (hintedLevel && hintedLevel !== batchDefaultLevel) {
        setBatchDefaultLevel(hintedLevel);
      }
      if (hintedStream && hintedStream !== batchDefaultStream) {
        setBatchDefaultStream(hintedStream);
      }

      setBatchText(text);
      if (result.valid.length > 0) {
        setBatchRecords(
          result.valid.map((r, idx) => ({
            ...r,
            level: r.level || hintedLevel || effectiveLevel,
            stream: r.stream || hintedStream || effectiveStream,
            id: `file-${Date.now()}-${idx}`
          }))
        );
        setBatchViewMode('editor');
        const skippedNote = result.invalidLines.length > 0
          ? ` (${result.invalidLines.length} line(s) skipped — check Raw Text if any are missing)`
          : '';
        setBatchResultMsg(`✅ Loaded "${file.name}": recognized ${result.valid.length} valid student(s)${skippedNote}. Review below and click Register Now.`);
      } else {
        setBatchResultMsg(`⚠️ Loaded "${file.name}", but could not automatically detect student names or index numbers. Switch to Raw Text below to inspect or verify columns.`);
      }
    } catch (err) {
      console.error('File read error:', err);
      setBatchResultMsg('Failed to read file. Please ensure it is a valid Excel (.xlsx, .xls) or CSV/Text file.');
    }
    e.target.value = '';
  };

  const handleLoadSample = () => {
    const sample = generateSampleStudents(100, batchDefaultStream);
    setBatchText(sample);
    const parsed = parseStudentRoster(sample, {
      defaultLevel: batchDefaultLevel,
      defaultStream: batchDefaultStream
    });
    setBatchRecords(
      parsed.valid.map((r, idx) => ({
        ...r,
        id: `sample-${Date.now()}-${idx}`
      }))
    );
    setBatchViewMode('editor');
    setBatchResultMsg('Loaded 100 sample student records. Use editing filters below to test filtering, bulk edits, or registering!');
  };

  // Bulk Edit Actions for Filtered Batch Records
  const handleBulkSetStream = (targetStream: string) => {
    const targetIds = new Set(filteredBatchRecords.map((r) => r.id));
    setBatchRecords((prev) =>
      prev.map((r) => (targetIds.has(r.id) ? { ...r, stream: targetStream, isModified: true } : r))
    );
    setToastMessage(`Updated stream to "${targetStream}" for ${targetIds.size} student(s) in batch.`);
  };

  const handleBulkSetLevel = (targetLevel: string) => {
    const targetIds = new Set(filteredBatchRecords.map((r) => r.id));
    setBatchRecords((prev) =>
      prev.map((r) => (targetIds.has(r.id) ? { ...r, level: targetLevel, isModified: true } : r))
    );
    setToastMessage(`Updated academic level to "${targetLevel}" for ${targetIds.size} student(s) in batch.`);
  };

  const handleFormatNames = () => {
    const toTitleCase = (str: string) =>
      str
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

    const targetIds = new Set(filteredBatchRecords.map((r) => r.id));
    setBatchRecords((prev) =>
      prev.map((r) => {
        if (!targetIds.has(r.id)) return r;
        const formattedName = toTitleCase(r.name);
        return {
          ...r,
          name: formattedName,
          email: generateInstitutionalEmail(formattedName, r.indexNumber),
          isModified: true
        };
      })
    );
    setToastMessage(`Formatted ${targetIds.size} student name(s) and synced institutional emails.`);
  };

  const handleEditBatchRow = (id: string, field: keyof EditableBatchRow, value: string) => {
    setBatchRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value, isModified: true };
        if (field === 'name') {
          updated.email = generateInstitutionalEmail(value, updated.indexNumber);
        }
        return updated;
      })
    );
  };

  const handleDeleteBatchRow = (id: string) => {
    setBatchRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDeleteFilteredRows = () => {
    const targetIds = new Set(filteredBatchRecords.map((r) => r.id));
    if (confirm(`Remove the ${targetIds.size} filtered record(s) from the import batch?`)) {
      setBatchRecords((prev) => prev.filter((r) => !targetIds.has(r.id)));
      setToastMessage(`Removed ${targetIds.size} filtered record(s) from batch.`);
    }
  };

  const handleAddBatchRow = () => {
    const newRow: EditableBatchRow = {
      id: `manual-${Date.now()}`,
      name: '',
      indexNumber: '',
      email: '',
      level: batchFilterLevel !== 'all' ? batchFilterLevel : batchDefaultLevel,
      stream: batchFilterStream !== 'all' ? batchFilterStream : batchDefaultStream,
      program: 'BSc Information Technology',
      isModified: true
    };
    setBatchRecords((prev) => [newRow, ...prev]);
  };

  const handleBatchImport = async (recordsToImport = batchRecords) => {
    const validRecords = recordsToImport.filter(
      (r) => r.name.trim() && r.indexNumber.trim()
    );

    if (validRecords.length === 0) {
      setBatchResultMsg('No valid students with both Name and Index Number found to register.');
      return;
    }

    setIsBatchImporting(true);
    setBatchResultMsg(`Registering ${validRecords.length} student records to Cloud Firestore...`);

    const revealImportedCohort = () => {
      setSearchQuery('');
      const importedLevels = Array.from(new Set<string>(validRecords.map((r) => r.level || batchDefaultLevel)));
      const importedStreams = Array.from(new Set<string>(validRecords.map((r) => r.stream || batchDefaultStream)));

      if (selectedLevelFilter !== 'all' && !importedLevels.includes(selectedLevelFilter)) {
        setSelectedLevelFilter(importedLevels.length === 1 ? importedLevels[0] : 'all');
      }
      if (selectedStreamFilter !== 'all' && !importedStreams.some((st) => streamsMatch(st, selectedStreamFilter))) {
        setSelectedStreamFilter(importedStreams.length === 1 ? importedStreams[0] : 'all');
      }
    };

    try {
      const count = await batchAddStudents(validRecords, {
        clearExisting: batchClearExisting,
        updateDuplicates: batchUpdateDuplicates
      });

      const successNotice = `🎉 Successfully registered ${count} student(s) and synced to Cloud Firestore!`;
      setBatchResultMsg(successNotice);
      setToastMessage(successNotice);
      setBatchText('');
      setBatchRecords([]);
      revealImportedCohort();

      setTimeout(() => {
        setShowBatchModal(false);
        setShowAddModal(false);
        setBatchResultMsg('');
        setIsBatchImporting(false);
      }, 1500);
    } catch (err) {
      console.error('Batch import error:', err);
      revealImportedCohort();
      const errDetail = err instanceof Error ? err.message : 'Cloud sync error';
      setBatchResultMsg(
        `Notice: Students were added locally, but Cloud Firestore sync failed (${errDetail}). Please check your connection or permissions and click Force Cloud Sync.`
      );
      setIsBatchImporting(false);
    }
  };

  const renderBatchImportContent = (onClose: () => void) => {
    const totalRecords = batchRecords.length;
    const filteredCount = filteredBatchRecords.length;
    const isFilterActive =
      batchSearchQuery.trim() !== '' ||
      batchFilterStream !== 'all' ||
      batchFilterLevel !== 'all';

    return (
      <div className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto touch-scroll">
        {batchResultMsg && (
          <div
            className={`p-3 rounded-xl border font-semibold flex items-center gap-2 ${
              batchResultMsg.includes('Failed') || batchResultMsg.includes('No valid') || batchResultMsg.includes('Notice')
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                : 'bg-teal-50 dark:bg-teal-950/50 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{batchResultMsg}</span>
          </div>
        )}

        {/* Quick Tools Toolbar: Upload Excel, 100 Sample, Clear */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100/70 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="px-3 py-1.5 rounded-lg bg-[#007c82] hover:bg-[#00666b] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Upload Excel (.xlsx, .xls) / CSV</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.tsv,.tab,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleLoadSample}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all"
              title="Loads 100 realistic Ghanaian university students for instant testing"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>⚡ Load 100 Sample Students</span>
            </button>
          </div>

          {(batchText || totalRecords > 0) && (
            <button
              type="button"
              onClick={() => {
                setBatchText('');
                setBatchRecords([]);
                setBatchResultMsg('');
                setBatchSearchQuery('');
                setBatchFilterStream('all');
                setBatchFilterLevel('all');
              }}
              className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              Clear All Records
            </button>
          )}
        </div>

        {/* Default Cohort & Import Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-850 p-3 rounded-xl border border-slate-200 dark:border-slate-750">
          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
              Default Stream / Class Division:
            </label>
            <select
              value={batchDefaultStream}
              onChange={(e) => setBatchDefaultStream(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-teal-300 dark:border-teal-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#007c82] dark:text-teal-300 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
            >
              <option value="IT A">IT A (Division A)</option>
              <option value="IT B">IT B (Division B)</option>
              <option value="IT C">IT C (Division C)</option>
              <option value="IT D">IT D (Division D)</option>
              <option value="IT E">IT E (Division E)</option>
            </select>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">Assigned if row does not specify a stream</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
              Default Academic Level:
            </label>
            <select
              value={batchDefaultLevel}
              onChange={(e) => setBatchDefaultLevel(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
            >
              <option value="Level 100">Level 100 (Year 1)</option>
              <option value="Level 200">Level 200 (Year 2)</option>
              <option value="Level 300">Level 300 (Year 3)</option>
              <option value="Level 400">Level 400 (Final Year)</option>
            </select>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">Assigned if row does not specify a level</span>
          </div>
        </div>

        {/* Options: Overwrite & Fresh start */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={batchUpdateDuplicates}
              onChange={(e) => setBatchUpdateDuplicates(e.target.checked)}
              className="rounded text-[#007c82] focus:ring-[#007c82]"
            />
            <span>Update existing students if index number already registered</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 cursor-pointer">
            <input
              type="checkbox"
              checked={batchClearExisting}
              onChange={(e) => setBatchClearExisting(e.target.checked)}
              className="rounded text-rose-600 focus:ring-rose-500"
            />
            <span>Clear roster before import (Fresh Start)</span>
          </label>
        </div>

        {/* View Mode Toggle: Interactive Filter & Edit Workspace vs Raw Text Input */}
        {totalRecords > 0 && (
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 pt-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setBatchViewMode('editor')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  batchViewMode === 'editor'
                    ? 'bg-[#007c82] text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Editing & Filter Mode ({totalRecords})</span>
              </button>

              <button
                type="button"
                onClick={() => setBatchViewMode('raw')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  batchViewMode === 'raw'
                    ? 'bg-[#007c82] text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Raw Text / Source Data</span>
              </button>
            </div>

            <span className="text-[11px] text-slate-500 font-mono">
              {totalRecords} student records loaded
            </span>
          </div>
        )}

        {/* View 1: Raw Textarea Mode */}
        {(batchViewMode === 'raw' || totalRecords === 0) && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Paste Roster Data (Excel, CSV, or Text):
              </label>
              <span className="text-[11px] text-slate-500 font-mono">
                {batchText.trim() ? `${batchText.trim().split('\n').length} line(s)` : 'Universal format supported'}
              </span>
            </div>
            <textarea
              rows={totalRecords > 0 ? 5 : 7}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={`Kwame Mensah, UEB3100122\nUEB3100222, Ama Serwaa\n1. Kofi Osei  UEB3100322  IT A\n(Or copy directly from Excel or Google Sheets columns)`}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
            />
          </div>
        )}

        {/* View 2: Interactive Editing Filters Workspace */}
        {totalRecords > 0 && (
          <div className="space-y-3">
            {/* Editing Filters Header & Controls Bar */}
            <div className="p-3 bg-gradient-to-r from-teal-50/70 via-slate-50 to-amber-50/40 dark:from-teal-950/20 dark:via-slate-850 dark:to-amber-950/20 border border-teal-200/80 dark:border-teal-800/60 rounded-xl space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-[#007c82] dark:text-teal-400" />
                  <span className="font-bold text-xs text-slate-900 dark:text-white">
                    Batch Editing Filters
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#007c82]/10 text-[#007c82] dark:text-teal-300 font-mono text-[10px] font-bold">
                    {filteredCount} matching
                  </span>
                </div>

                {isFilterActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setBatchSearchQuery('');
                      setBatchFilterStream('all');
                      setBatchFilterLevel('all');
                    }}
                    className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Filters</span>
                  </button>
                )}
              </div>

              {/* Filter Inputs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* Search Filter */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name, index, email..."
                    value={batchSearchQuery}
                    onChange={(e) => setBatchSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  />
                </div>

                {/* Stream Filter */}
                <div>
                  <select
                    value={batchFilterStream}
                    onChange={(e) => setBatchFilterStream(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-[#007c82] dark:text-teal-300 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  >
                    <option value="all">Filter: All Streams ({totalRecords})</option>
                    <option value="IT A">Filter: IT A</option>
                    <option value="IT B">Filter: IT B</option>
                    <option value="IT C">Filter: IT C</option>
                    <option value="IT D">Filter: IT D</option>
                    <option value="IT E">Filter: IT E</option>
                  </select>
                </div>

                {/* Level Filter */}
                <div>
                  <select
                    value={batchFilterLevel}
                    onChange={(e) => setBatchFilterLevel(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-amber-800 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  >
                    <option value="all">Filter: All Levels</option>
                    <option value="Level 100">Filter: Level 100</option>
                    <option value="Level 200">Filter: Level 200</option>
                    <option value="Level 300">Filter: Level 300</option>
                    <option value="Level 400">Filter: Level 400</option>
                  </select>
                </div>
              </div>

              {/* Bulk Modifier Tools for Filtered Records */}
              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Apply to Filtered ({filteredCount}):
                  </span>

                  {/* Bulk Set Stream */}
                  <div className="flex items-center gap-1">
                    <select
                      value={bulkStreamTarget}
                      onChange={(e) => setBulkStreamTarget(e.target.value)}
                      className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-1 text-[11px] font-bold text-[#007c82]"
                    >
                      <option value="IT A">IT A</option>
                      <option value="IT B">IT B</option>
                      <option value="IT C">IT C</option>
                      <option value="IT D">IT D</option>
                      <option value="IT E">IT E</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleBulkSetStream(bulkStreamTarget)}
                      disabled={filteredCount === 0}
                      className="px-2 py-1 rounded bg-[#007c82] hover:bg-[#00666b] disabled:opacity-40 text-white font-bold cursor-pointer"
                      title="Set this stream for all currently filtered students"
                    >
                      Set Stream
                    </button>
                  </div>

                  {/* Bulk Set Level */}
                  <div className="flex items-center gap-1">
                    <select
                      value={bulkLevelTarget}
                      onChange={(e) => setBulkLevelTarget(e.target.value)}
                      className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300"
                    >
                      <option value="Level 100">L100</option>
                      <option value="Level 200">L200</option>
                      <option value="Level 300">L300</option>
                      <option value="Level 400">L400</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleBulkSetLevel(bulkLevelTarget)}
                      disabled={filteredCount === 0}
                      className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-bold cursor-pointer"
                      title="Set this level for all currently filtered students"
                    >
                      Set Level
                    </button>
                  </div>

                  {/* Title Case Names */}
                  <button
                    type="button"
                    onClick={handleFormatNames}
                    disabled={filteredCount === 0}
                    className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold cursor-pointer"
                    title="Clean up and capitalize all names to Title Case"
                  >
                    Format Names
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAddBatchRow}
                    className="px-2 py-1 rounded bg-teal-50 dark:bg-teal-950/60 text-[#007c82] dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-bold hover:bg-teal-100 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Student</span>
                  </button>

                  {isFilterActive && filteredCount > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteFilteredRows}
                      className="px-2 py-1 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-800 font-semibold cursor-pointer"
                    >
                      Remove Filtered ({filteredCount})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Editable Students Table */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-850 shadow-xs">
              <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>
                  Editable Student List ({filteredCount} of {totalRecords} displayed):
                </span>
                <span className="text-[10px] text-slate-500">
                  Click any cell to edit Name, Index, Level, or Stream directly
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {filteredBatchRecords.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No students match the current filters.
                    <button
                      type="button"
                      onClick={() => {
                        setBatchSearchQuery('');
                        setBatchFilterStream('all');
                        setBatchFilterLevel('all');
                      }}
                      className="ml-2 text-[#007c82] dark:text-teal-400 underline font-bold"
                    >
                      Clear Filters
                    </button>
                  </div>
                ) : (
                  filteredBatchRecords.map((row, idx) => (
                    <div
                      key={row.id}
                      className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Left: Index #, Editable Name, Editable Index Number */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-mono text-slate-400 text-[10px] w-6 shrink-0">
                          #{idx + 1}
                        </span>

                        <div className="flex-1 min-w-[140px]">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => handleEditBatchRow(row.id, 'name', e.target.value)}
                            placeholder="Student Full Name"
                            className="w-full px-2 py-1 text-xs font-bold rounded border border-slate-200 dark:border-slate-700 focus:border-[#007c82] bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                          />
                        </div>

                        <div className="w-32 shrink-0">
                          <input
                            type="text"
                            value={row.indexNumber}
                            onChange={(e) => handleEditBatchRow(row.id, 'indexNumber', e.target.value.toUpperCase())}
                            placeholder="Index Number"
                            className="w-full px-2 py-1 text-xs font-mono font-bold uppercase rounded border border-slate-200 dark:border-slate-700 focus:border-[#007c82] bg-white dark:bg-slate-800 text-[#007c82] dark:text-teal-300 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Right: Editable Level, Editable Stream, Delete Button */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <select
                          value={row.level}
                          onChange={(e) => handleEditBatchRow(row.id, 'level', e.target.value)}
                          className="px-2 py-1 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[11px] font-bold font-mono focus:outline-none"
                        >
                          <option value="Level 100">L100</option>
                          <option value="Level 200">L200</option>
                          <option value="Level 300">L300</option>
                          <option value="Level 400">L400</option>
                        </select>

                        <select
                          value={row.stream}
                          onChange={(e) => handleEditBatchRow(row.id, 'stream', e.target.value)}
                          className="px-2 py-1 rounded border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 text-[#007c82] dark:text-teal-300 text-[11px] font-bold font-mono focus:outline-none"
                        >
                          <option value="IT A">IT A</option>
                          <option value="IT B">IT B</option>
                          <option value="IT C">IT C</option>
                          <option value="IT D">IT D</option>
                          <option value="IT E">IT E</option>
                        </select>

                        {row.isModified && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                            Edited
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteBatchRow(row.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                          title="Remove this student from import batch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer Action Buttons */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {totalRecords > 0 ? (
              <span>
                <strong className="text-slate-800 dark:text-slate-200">{totalRecords}</strong> total student(s) ready to import
                {isFilterActive && (
                  <span className="text-[#007c82] dark:text-teal-400 ml-1">
                    ({filteredCount} currently filtered)
                  </span>
                )}
              </span>
            ) : (
              <span>No students ready for import yet</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isBatchImporting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl cursor-pointer"
            >
              Cancel
            </button>

            {/* Option to register only the filtered set if active */}
            {isFilterActive && filteredCount > 0 && filteredCount < totalRecords && (
              <button
                type="button"
                onClick={() => handleBatchImport(filteredBatchRecords)}
                disabled={isBatchImporting}
                className="px-4 py-2 text-xs font-bold text-[#007c82] dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 border border-teal-300 dark:border-teal-700 rounded-xl hover:bg-teal-100 dark:hover:bg-teal-900/60 shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Register Filtered ({filteredCount}) Only</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleBatchImport(batchRecords)}
              disabled={isBatchImporting || totalRecords === 0}
              className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-sm flex items-center gap-2 cursor-pointer transition-all active:scale-95 ${
                totalRecords > 0 && !isBatchImporting
                  ? 'bg-[#007c82] hover:bg-[#00666b]'
                  : 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed'
              }`}
            >
              {isBatchImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registering {totalRecords} Students...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>
                    {totalRecords > 0
                      ? `Register ${totalRecords} Student${totalRecords > 1 ? 's' : ''} Now`
                      : 'Import Records'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const getNextLevel = (current?: string): string => {
    const lvl = current || 'Level 100';
    if (lvl === 'Level 100') return 'Level 200';
    if (lvl === 'Level 200') return 'Level 300';
    if (lvl === 'Level 300') return 'Level 400';
    if (lvl === 'Level 400') return 'Alumni / Completed';
    return 'Level 200';
  };

  // Open Edit Student Modal
  const openEditStudent = (student: Student) => {
    setEditingStudent(student);
    setEditName(student.name);
    setEditIndexNumber(student.indexNumber);
    const idxSlug = (student.indexNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const currentPrefix = (student.email || '').toLowerCase().split('@')[0];
    const emailToUse = (!student.email || currentPrefix === idxSlug)
      ? generateInstitutionalEmail(student.name, student.indexNumber)
      : student.email;
    setEditEmail(emailToUse);
    setEditProgram(student.program || 'BSc Information Technology');
    setEditLevel(student.level || 'Level 100');
    setEditStream(student.stream || 'IT A');
    setEditError('');
    setEditSuccessMsg('');
  };

  // Save Single Student Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    if (!editName.trim() || !editIndexNumber.trim()) {
      setEditError('Please enter both student full name and index number.');
      return;
    }

    const cleanIdx = editIndexNumber.toUpperCase().trim();
    const isDuplicate = students.some(
      (s) => s.id !== editingStudent.id && s.indexNumber === cleanIdx
    );
    if (isDuplicate) {
      setEditError(`Index number "${cleanIdx}" is already assigned to another student.`);
      return;
    }

    try {
      await updateStudent(editingStudent.id, {
        name: editName.trim(),
        indexNumber: cleanIdx,
        email: editEmail.trim() || generateInstitutionalEmail(editName.trim(), cleanIdx),
        program: editProgram,
        level: editLevel,
        stream: editStream
      });
      setEditSuccessMsg(`Successfully updated ${editName.trim()} (${cleanIdx}).`);
      setTimeout(() => {
        setEditingStudent(null);
        setEditSuccessMsg('');
      }, 1000);
    } catch (err) {
      setEditError('Failed to save student changes. Please try again.');
      console.warn('Edit student error:', err);
    }
  };

  // Quick 1-click promote for single student
  const handleQuickPromoteSingle = async (student: Student) => {
    const next = getNextLevel(student.level);
    if (confirm(`Promote ${student.name} (${student.indexNumber}) from ${student.level || 'Level 100'} to ${next}?`)) {
      await updateStudent(student.id, { level: next });
    }
  };

  // Cohort level promotion (e.g. Level 100 -> Level 200)
  const handleCohortPromotion = async (fromLvl: string, toLvl: string) => {
    setIsPromoting(true);
    setPromoteSuccessMsg('');
    try {
      const count = await batchPromoteStudents(fromLvl, toLvl, promoteStreamFilter);
      if (count > 0) {
        const streamNote = promoteStreamFilter !== 'all' ? ` in ${promoteStreamFilter}` : '';
        setPromoteSuccessMsg(`🎉 Successfully promoted ${count} student(s) from ${fromLvl} to ${toLvl}${streamNote}!`);
      } else {
        setPromoteSuccessMsg(`No students currently found in ${fromLvl}${promoteStreamFilter !== 'all' ? ` for stream ${promoteStreamFilter}` : ''}.`);
      }
    } catch (err) {
      setPromoteSuccessMsg('Could not complete batch promotion. Please check your data.');
      console.warn('Batch promote error:', err);
    } finally {
      setIsPromoting(false);
    }
  };

  // Full academic progression (+1 to all)
  const handlePromoteAllCohorts = async () => {
    if (students.length === 0) return;
    if (
      !confirm(
        `Advance all ${students.length} students to the next academic level?\n\n• Level 100 ➔ Level 200\n• Level 200 ➔ Level 300\n• Level 300 ➔ Level 400\n• Level 400 ➔ Alumni / Completed`
      )
    ) {
      return;
    }

    setIsPromoting(true);
    setPromoteSuccessMsg('');
    try {
      const { count } = await promoteAllLevels();
      setPromoteSuccessMsg(`🎓 Class-wide academic progression complete! Promoted ${count} students to their next level.`);
    } catch (err) {
      setPromoteSuccessMsg('Failed to run full progression. Please try again.');
      console.warn('Progression notice:', err);
    } finally {
      setIsPromoting(false);
    }
  };

  // Custom batch edit
  const handleCustomBatchUpdate = async () => {
    const matching = students.filter((s) => {
      const matchLvl = customFilterLevel === 'all' || (s.level || 'Level 100') === customFilterLevel;
      const matchStrm = customFilterStream === 'all' || (s.stream || 'IT A') === customFilterStream;
      return matchLvl && matchStrm;
    });

    if (matching.length === 0) {
      setPromoteSuccessMsg('No students matched your selected criteria.');
      return;
    }

    const updates: Partial<Student> = {};
    if (customTargetLevel !== 'keep') updates.level = customTargetLevel;
    if (customTargetStream !== 'keep') updates.stream = customTargetStream;
    if (customTargetProgram !== 'keep') updates.program = customTargetProgram;

    if (Object.keys(updates).length === 0) {
      setPromoteSuccessMsg('Please choose at least one field to change.');
      return;
    }

    setIsPromoting(true);
    try {
      const ids = matching.map((s) => s.id);
      const count = await batchUpdateStudents(ids, updates);
      setPromoteSuccessMsg(`✓ Successfully updated ${count} student(s) with selected attributes.`);
    } catch (err) {
      setPromoteSuccessMsg('Could not complete custom batch update.');
      console.warn('Custom batch update error:', err);
    } finally {
      setIsPromoting(false);
    }
  };

  // Check if any student currently has an index-number-based email
  const hasIndexBasedEmails = useMemo(() => {
    return students.some((s) => {
      const idxSlug = (s.indexNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const prefix = (s.email || '').toLowerCase().split('@')[0];
      return !s.email || prefix === idxSlug;
    });
  }, [students]);

  // One-click sync all students' emails with their names
  const handleSyncEmailsFromNames = async () => {
    const updatedCount = await updateAllStudentEmailsToNameBased();
    if (updatedCount > 0) {
      setToastMessage(`🎉 Synced ${updatedCount} student email(s) with their names (e.g. firstname.lastname@uenr.edu.gh)!`);
    } else {
      setToastMessage(`All student emails are already up-to-date with their names.`);
    }
  };

  const handleDelete = (student: Student) => {
    if (confirm(`Remove student ${student.name} (${student.indexNumber}) from the class roster?`)) {
      removeStudent(student.id);
      setSelectedStudentIds((prev) => prev.filter((id) => id !== student.id));
    }
  };

  const handleClearAll = () => {
    if (students.length === 0) return;
    if (
      confirm(
        `Are you sure you want to remove ALL ${students.length} students from the roster? This cannot be undone.`
      )
    ) {
      clearAllStudents();
      setSelectedStudentIds([]);
    }
  };

  // Helper to extract numeric level for consistent level ordering (100 -> 200 -> 300 -> 400)
  const extractLevelNumber = (lvl?: string) => {
    if (!lvl) return 100;
    const match = lvl.match(/\d+/);
    return match ? parseInt(match[0], 10) : 999;
  };

  // Sorting and filtering: Strictly sort first by Level, then by Stream, then by name/index
  const sortedAndFilteredStudents = useMemo(() => {
    const filtered = students.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.indexNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLevel =
        selectedLevelFilter === 'all' || (s.level || 'Level 100') === selectedLevelFilter;
      const matchesStream =
        selectedStreamFilter === 'all' || streamsMatch(s.stream || 'IT A', selectedStreamFilter);
      return matchesSearch && matchesLevel && matchesStream;
    });

    return [...filtered].sort((a, b) => {
      // 1. PRIMARY SORT: Always sort by Academic Level first (Level 100 before Level 200, etc.)
      const levelDiff = extractLevelNumber(a.level) - extractLevelNumber(b.level);
      if (levelDiff !== 0) return levelDiff;

      // 2. SECONDARY SORT: Always sort by Stream (IT A before IT B, etc.)
      const streamDiff = (a.stream || 'IT A').localeCompare(b.stream || 'IT A', undefined, { numeric: true });
      if (streamDiff !== 0) return streamDiff;

      // 3. TERTIARY SORT: User-selected sorting within the same Level & Stream
      if (sortBy === 'name-desc') {
        return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
      }
      if (sortBy === 'index-asc') {
        return a.indexNumber.localeCompare(b.indexNumber, undefined, { numeric: true });
      }
      if (sortBy === 'index-desc') {
        return b.indexNumber.localeCompare(a.indexNumber, undefined, { numeric: true });
      }
      // default: 'name-asc' or 'level-asc'
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [students, searchQuery, selectedLevelFilter, selectedStreamFilter, sortBy]);

  // Multi-selection helpers
  const isAllSelected =
    sortedAndFilteredStudents.length > 0 &&
    sortedAndFilteredStudents.every((s) => selectedStudentIds.includes(s.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(sortedAndFilteredStudents.map((s) => s.id));
    }
  };

  const toggleSelectStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Bulk actions on selected
  const handleBatchPromoteSelected = async (targetLevel: string) => {
    if (selectedStudentIds.length === 0) return;
    await batchUpdateStudents(selectedStudentIds, { level: targetLevel });
    setSelectedStudentIds([]);
  };

  const handleBatchAdvanceSelected = async () => {
    if (selectedStudentIds.length === 0) return;
    const selectedStudents = students.filter((s) => selectedStudentIds.includes(s.id));
    for (const st of selectedStudents) {
      const next = getNextLevel(st.level);
      await updateStudent(st.id, { level: next });
    }
    setSelectedStudentIds([]);
  };

  const handleBatchStreamSelected = async (targetStream: string) => {
    if (selectedStudentIds.length === 0) return;
    await batchUpdateStudents(selectedStudentIds, { stream: targetStream });
    setSelectedStudentIds([]);
  };

  const handleBatchDeleteSelected = async () => {
    if (selectedStudentIds.length === 0) return;
    if (confirm(`Remove the ${selectedStudentIds.length} selected students from the roster?`)) {
      for (const id of selectedStudentIds) {
        await removeStudent(id);
      }
      setSelectedStudentIds([]);
    }
  };

  const openDeleteForCohort = (lvl?: string, st?: string) => {
    if (lvl && st && lvl !== 'all' && st !== 'all') {
      setDeleteTargetType('both');
      setTargetDeleteLevel(lvl);
      setTargetDeleteStream(st);
    } else if (lvl && lvl !== 'all' && (!st || st === 'all')) {
      setDeleteTargetType('level');
      setTargetDeleteLevel(lvl);
    } else if (st && st !== 'all' && (!lvl || lvl === 'all')) {
      setDeleteTargetType('stream');
      setTargetDeleteStream(st);
    } else {
      setDeleteTargetType('level');
      setTargetDeleteLevel(availableLevels[0] || 'Level 100');
    }
    setShowDeleteCohortModal(true);
  };

  const studentsPendingDelete = useMemo(() => {
    if (!showDeleteCohortModal) return [];
    return students.filter((s) => {
      if (deleteTargetType === 'level') {
        return (s.level || 'Level 100') === targetDeleteLevel;
      }
      if (deleteTargetType === 'stream') {
        return (s.stream || 'IT A') === targetDeleteStream;
      }
      return (s.level || 'Level 100') === targetDeleteLevel && (s.stream || 'IT A') === targetDeleteStream;
    });
  }, [students, showDeleteCohortModal, deleteTargetType, targetDeleteLevel, targetDeleteStream]);

  const handleExecuteDeleteCohort = async () => {
    if (studentsPendingDelete.length === 0) return;
    const count = studentsPendingDelete.length;
    const label =
      deleteTargetType === 'level'
        ? targetDeleteLevel
        : deleteTargetType === 'stream'
        ? `Stream ${targetDeleteStream}`
        : `${targetDeleteLevel} (${targetDeleteStream})`;

    setIsDeletingCohort(true);
    await deleteStudentsByFilter({
      level: deleteTargetType === 'level' || deleteTargetType === 'both' ? targetDeleteLevel : undefined,
      stream: deleteTargetType === 'stream' || deleteTargetType === 'both' ? targetDeleteStream : undefined
    });
    setIsDeletingCohort(false);
    setShowDeleteCohortModal(false);
    setToastMessage(`Successfully deleted all ${count} students in ${label}. Other cohorts remain untouched.`);
  };

  // Cohort breakdown counts
  const cohortCounts = useMemo(() => {
    const streamScoped = students.filter(
      (s) => promoteStreamFilter === 'all' || (s.stream || 'IT A') === promoteStreamFilter
    );
    return {
      lvl100: streamScoped.filter((s) => (s.level || 'Level 100') === 'Level 100').length,
      lvl200: streamScoped.filter((s) => s.level === 'Level 200').length,
      lvl300: streamScoped.filter((s) => s.level === 'Level 300').length,
      lvl400: streamScoped.filter((s) => s.level === 'Level 400').length,
      total: streamScoped.length
    };
  }, [students, promoteStreamFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="bg-teal-50 dark:bg-teal-950/70 border-2 border-teal-500/60 dark:border-teal-500/50 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5 text-teal-900 dark:text-teal-200 text-sm font-bold">
            <CheckCircle2 className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage('')}
            className="p-1 rounded-lg text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {cloudSyncError && (
        <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-2xl p-3.5 text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{cloudSyncError}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#007c82] dark:text-teal-400 uppercase tracking-wider">
            <GraduationCap className="w-4 h-4" />
            Students &amp; Class Roster
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
            {verifiedRole === 'lecturer'
              ? 'Class Roster & Representatives'
              : 'Class Roster & Biometric Enrollment'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {verifiedRole === 'lecturer'
              ? 'Manage your course student roster, enroll biometrics, and appoint a Class Representative.'
              : 'Manage student class records, cohort levels, and biometric fingerprint enrollment.'}
          </p>
        </div>

        {/* Sub-tabs Navigation */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <button
              onClick={() => setAdminSubTab('roster')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                adminSubTab === 'roster'
                  ? 'bg-[#007c82] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Class Roster ({students.length})</span>
            </button>

            {verifiedRole === 'lecturer' && (
              <button
                onClick={() => setAdminSubTab('authorized')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  adminSubTab === 'authorized'
                    ? 'bg-[#007c82] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Class Representatives ({authorizedUsers.filter((u) => u.role === 'class_rep').length})</span>
              </button>
            )}
          </div>

          {verifiedRole === 'hod' && (
            <button
              type="button"
              onClick={() => {
                setHodAdminTab('audit');
                setActiveTab('hod_admin');
              }}
              className="px-3.5 py-2 rounded-xl bg-[#003b5c] hover:bg-[#002d47] text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              title="Open HOD-Exclusive Governance & Activity Logs"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-purple-300" />
              <span>HOD Governance &amp; Logs</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-teal-300" />
            </button>
          )}
        </div>
      </div>

      {/* Lecturer Sub-tab: Appoint & Manage Class Representatives */}
      {adminSubTab === 'authorized' && verifiedRole === 'lecturer' && <AuthorizedPersonnelPanel />}

      {/* Sub-tab 3: Student Roster */}
      {adminSubTab === 'roster' && (
        <div className="space-y-4">
          
          {/* Action Header for Roster */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-[#007c82] dark:text-teal-400 flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Registered Students</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/60 text-[#007c82] dark:text-teal-400 font-bold border border-teal-200 dark:border-teal-800">
                    Alphabetical (A-Z)
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {students.length === 0
                    ? 'No students registered. Add your class roster below.'
                    : `${students.length} student(s) currently registered in this class roster.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {students.length > 0 && (
                <>
                  {hasIndexBasedEmails && (
                    <button
                      onClick={handleSyncEmailsFromNames}
                      className="px-3.5 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      title="Sync student institutional emails from their full names (e.g. kwame.mensah@uenr.edu.gh)"
                    >
                      <Mail className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>Sync Emails to Names</span>
                    </button>
                  )}

                  <button
                    onClick={handleClearAll}
                    className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 hover:border-rose-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Clear all students"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All</span>
                  </button>

                  <button
                    onClick={() => openDeleteForCohort(selectedLevelFilter !== 'all' ? selectedLevelFilter : 'Level 100', selectedStreamFilter !== 'all' ? selectedStreamFilter : undefined)}
                    className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-slate-400 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                    title="Delete a specific academic level or stream alone at once without affecting others"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
                    <span>Delete Level / Stream</span>
                  </button>

                  <button
                    onClick={() => {
                      setPromoteSuccessMsg('');
                      setShowPromoteModal(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-teal-600 hover:from-amber-600 hover:to-teal-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
                    title="Promote Cohorts & Batch Edit Levels (e.g. Level 100 to 200)"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Promote / Batch Edit</span>
                  </button>
                </>
              )}

              <button
                onClick={() => setShowBatchModal(true)}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Batch Import</span>
              </button>

              <button
                onClick={() => {
                  setAddModalTab('single');
                  setFormError('');
                  setShowAddModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-[#003b5c] hover:bg-[#002d47] text-white text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Student</span>
              </button>
            </div>
          </div>

          {/* If No Students: Clean, Helpful Empty State */}
          {students.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-8 sm:p-12 text-center shadow-sm max-w-2xl mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-950/50 text-[#007c82] dark:text-teal-400 flex items-center justify-center mx-auto border border-teal-100 dark:border-teal-900/50 shadow-inner">
                <Users className="w-8 h-8" />
              </div>
              
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Your Class Roster is Clean</h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  You requested a fresh start with no pre-filled students. You can now add your own class students individually or import the entire class list at once.
                </p>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setAddModalTab('single');
                    setShowAddModal(true);
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#003b5c] hover:bg-[#002d47] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add First Student</span>
                </button>

                <button
                  onClick={() => setShowBatchModal(true)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-300 dark:border-slate-700 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Batch Import (CSV / Paste List)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
              
              {/* Hierarchical Student Divisions: Levels First, Then Streams */}
              <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-850 divide-y divide-slate-200/70 dark:divide-slate-800">
                {/* 1. Academic Level Divisions (Primary Division: 100, 200, 300, 400) */}
                <div className="px-4 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 mr-1 shrink-0">
                    <GraduationCap className="w-4 h-4 text-[#003b5c] dark:text-teal-400" />
                    <span>Academic Levels:</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedLevelFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      selectedLevelFilter === 'all'
                        ? 'bg-[#003b5c] text-white shadow-sm ring-1 ring-[#002840]'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    All Levels ({students.length})
                  </button>
                  {availableLevels.map((lvl) => {
                    const count = students.filter((s) => (s.level || 'Level 100') === lvl).length;
                    const isActive = selectedLevelFilter === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setSelectedLevelFilter(lvl)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-[#003b5c] text-white shadow-sm ring-1 ring-[#002840]'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <span>{lvl}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-teal-50 dark:bg-teal-950/60 text-[#007c82] dark:text-teal-300'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 2. Stream / Division Tabs (Secondary Division: A, B, C, etc., Scoped by Level) */}
                <div className="px-4 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none bg-slate-50/60 dark:bg-slate-900/40">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 mr-1 shrink-0">
                    <Layers className="w-4 h-4 text-[#007c82] dark:text-teal-400" />
                    <span>Class Streams:</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedStreamFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      selectedStreamFilter === 'all'
                        ? 'bg-[#007c82] text-white shadow-sm ring-1 ring-teal-700/20'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    All Streams ({
                      selectedLevelFilter === 'all'
                        ? students.length
                        : students.filter((s) => (s.level || 'Level 100') === selectedLevelFilter).length
                    })
                  </button>
                  {availableStreams.map((st) => {
                    const count = students.filter((s) => {
                      const matchesLevel =
                        selectedLevelFilter === 'all' || (s.level || 'Level 100') === selectedLevelFilter;
                      return matchesLevel && streamsMatch(s.stream || 'IT A', st);
                    }).length;
                    const isActive = selectedStreamFilter === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setSelectedStreamFilter(st)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-[#007c82] text-white shadow-sm ring-1 ring-teal-800'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <span>
                          {selectedLevelFilter !== 'all' ? `${selectedLevelFilter.replace('Level ', 'L')} - ${st}` : st}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}

                  {(selectedLevelFilter !== 'all' || selectedStreamFilter !== 'all') && (
                    <div className="ml-auto flex items-center gap-2 pl-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openDeleteForCohort(
                          selectedLevelFilter !== 'all' ? selectedLevelFilter : undefined,
                          selectedStreamFilter !== 'all' ? selectedStreamFilter : undefined
                        )}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 hover:border-rose-300 transition-colors shadow-xs cursor-pointer"
                        title="Delete only this currently selected division or level"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
                        <span>
                          Delete This {selectedLevelFilter !== 'all' && selectedStreamFilter !== 'all' ? `${selectedLevelFilter.replace('Level ', 'L')} ${selectedStreamFilter}` : selectedLevelFilter !== 'all' ? selectedLevelFilter : selectedStreamFilter}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLevelFilter('all');
                          setSelectedStreamFilter('all');
                        }}
                        className="text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 underline cursor-pointer whitespace-nowrap"
                      >
                        Reset Filters
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Filter and Sorting Toolbar */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-xl">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search student name or index number (UEB...)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                    />
                  </div>

                  {/* Sort Dropdown */}
                  <div className="flex items-center gap-1.5 shrink-0 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                    <span className="text-slate-400 font-medium">Sort:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as StudentSortOption)}
                      className="bg-transparent font-bold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="name-asc">Alphabetical (A → Z)</option>
                      <option value="name-desc">Alphabetical (Z → A)</option>
                      <option value="index-asc">Index No. (Ascending)</option>
                      <option value="index-desc">Index No. (Descending)</option>
                      <option value="level-asc">Academic Level (100-400)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end text-xs">
                  <div className="text-slate-500 dark:text-slate-400">
                    Showing <strong className="text-slate-800 dark:text-slate-200">{sortedAndFilteredStudents.length}</strong> of{' '}
                    <strong className="text-slate-800 dark:text-slate-200">{students.length}</strong> students
                    {(selectedLevelFilter !== 'all' || selectedStreamFilter !== 'all') && (
                      <span className="ml-1 text-[#007c82] dark:text-teal-400 font-bold">
                        ({selectedLevelFilter !== 'all' ? selectedLevelFilter : 'All Levels'} · {selectedStreamFilter !== 'all' ? selectedStreamFilter : 'All Streams'})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Students List (Responsive Dual-View) */}
              
              {/* 1. Mobile Cards View (< 768px) */}
              <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                {sortedAndFilteredStudents.length === 0 ? (
                  <div className="py-12 px-4 text-center text-slate-400 dark:text-slate-500 text-xs">
                    No matching students found for &quot;{searchQuery}&quot;
                    {selectedLevelFilter !== 'all' ? ` in ${selectedLevelFilter}` : ''}
                    {selectedStreamFilter !== 'all' ? ` (Stream ${selectedStreamFilter})` : ''}.
                  </div>
                ) : (
                  sortedAndFilteredStudents.map((student, idx) => {
                    const fingerCount = student.enrolledFingers?.length || 0;
                    const isSelected = selectedStudentIds.includes(student.id);

                    const currentCohortLevel = student.level || 'Level 100';
                    const currentCohortStream = student.stream || 'IT A';
                    const prevStudent = idx > 0 ? sortedAndFilteredStudents[idx - 1] : null;
                    const isNewCohort =
                      !prevStudent ||
                      (prevStudent.level || 'Level 100') !== currentCohortLevel ||
                      (prevStudent.stream || 'IT A') !== currentCohortStream;
                    const cohortCount = sortedAndFilteredStudents.filter(
                      (s) =>
                        (s.level || 'Level 100') === currentCohortLevel &&
                        (s.stream || 'IT A') === currentCohortStream
                    ).length;

                    return (
                      <React.Fragment key={`${student.id}-${idx}`}>
                        {isNewCohort && (
                          <div className="pt-3 pb-1 px-1">
                            <div className="p-3 bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-850 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between shadow-xs">
                              <div className="flex items-center gap-2">
                                <GraduationCap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                                  {currentCohortLevel}
                                </span>
                                <span className="text-slate-300 dark:text-slate-600">·</span>
                                <span className="px-2 py-0.5 rounded-md bg-[#003b5c] text-white text-[10px] font-black font-mono">
                                  Division {currentCohortStream}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                  {cohortCount} student{cohortCount === 1 ? '' : 's'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openDeleteForCohort(currentCohortLevel, currentCohortStream)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 border border-rose-200 dark:border-rose-800"
                                  title={`Delete all ${cohortCount} students in ${currentCohortLevel} ${currentCohortStream}`}
                                >
                                  <Trash2 className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        <div
                          className="p-4 space-y-3 transition-colors bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 font-semibold">
                                  #{idx + 1}
                                </span>
                                <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                  {student.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                <span>{student.program}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Level Badge */}
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-bold font-mono">
                                {student.level || 'Level 100'}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-[#007c82] dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[11px] font-black font-mono">
                                {student.stream || 'IT A'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                              {student.indexNumber}
                            </span>

                            <div>
                              {fingerCount > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  {fingerCount}/10 Fingers Enrolled
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-medium">
                                  <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  Not Enrolled
                                </span>
                              )}
                            </div>
                          </div>

                          {student.email && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {student.email}
                            </div>
                          )}

                          {/* Touch-Friendly Action Buttons */}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => openEditStudent(student)}
                              className="h-11 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                              title="Edit Student Information & Level"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedStudentForBio(student)}
                              className="flex-1 h-11 rounded-xl bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-[#007c82] dark:text-teal-400 border border-teal-200 dark:border-teal-800 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                            >
                              <Fingerprint className="w-4 h-4 text-[#007c82] dark:text-teal-400" />
                              <span>{fingerCount > 0 ? 'Edit Biometrics' : 'Enroll Biometrics'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(student)}
                              className="h-11 px-3 rounded-xl text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 transition-all flex items-center justify-center cursor-pointer active:scale-95"
                              title="Remove Student"
                              aria-label={`Remove ${student.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>

              {/* 2. Desktop Table View (>= 768px) */}
              <div className="hidden md:block overflow-x-auto touch-scroll">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <th className="py-3.5 px-3 w-12 font-mono text-center">#</th>
                      <th
                        className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 select-none"
                        onClick={() =>
                          setSortBy((prev) => (prev === 'name-asc' ? 'name-desc' : 'name-asc'))
                        }
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Student Name</span>
                          {sortBy === 'name-asc' && <ArrowUpAZ className="w-3.5 h-3.5 text-[#007c82]" />}
                          {sortBy === 'name-desc' && <ArrowDownAZ className="w-3.5 h-3.5 text-[#007c82]" />}
                          {sortBy !== 'name-asc' && sortBy !== 'name-desc' && (
                            <ArrowUpDown className="w-3 h-3 text-slate-300" />
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 select-none"
                        onClick={() =>
                          setSortBy((prev) => (prev === 'level-asc' ? 'name-asc' : 'level-asc'))
                        }
                      >
                        <div className="flex items-center gap-1">
                          <span>Level</span>
                          {sortBy === 'level-asc' && <ArrowUpDown className="w-3.5 h-3.5 text-[#007c82]" />}
                        </div>
                      </th>
                      <th className="py-3.5 px-4">Stream</th>
                      <th
                        className="py-3.5 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 select-none"
                        onClick={() =>
                          setSortBy((prev) => (prev === 'index-asc' ? 'index-desc' : 'index-asc'))
                        }
                      >
                        <div className="flex items-center gap-1">
                          <span>Index Number</span>
                          {sortBy === 'index-asc' && <ArrowUpAZ className="w-3.5 h-3.5 text-[#007c82]" />}
                          {sortBy === 'index-desc' && <ArrowDownAZ className="w-3.5 h-3.5 text-[#007c82]" />}
                        </div>
                      </th>
                      <th className="py-3.5 px-4">Email / Contact</th>
                      <th className="py-3.5 px-4">Biometric Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                    {sortedAndFilteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 dark:text-slate-500">
                          No matching students found for &quot;{searchQuery}&quot;
                          {selectedLevelFilter !== 'all' ? ` in ${selectedLevelFilter}` : ''}
                          {selectedStreamFilter !== 'all' ? ` (Stream ${selectedStreamFilter})` : ''}.
                        </td>
                      </tr>
                    ) : (
                      sortedAndFilteredStudents.map((student, idx) => {
                        const fingerCount = student.enrolledFingers?.length || 0;

                        const currentCohortLevel = student.level || 'Level 100';
                        const currentCohortStream = student.stream || 'IT A';
                        const prevStudent = idx > 0 ? sortedAndFilteredStudents[idx - 1] : null;
                        const isNewCohort =
                          !prevStudent ||
                          (prevStudent.level || 'Level 100') !== currentCohortLevel ||
                          (prevStudent.stream || 'IT A') !== currentCohortStream;
                        const cohortCount = sortedAndFilteredStudents.filter(
                          (s) =>
                            (s.level || 'Level 100') === currentCohortLevel &&
                            (s.stream || 'IT A') === currentCohortStream
                        ).length;

                        return (
                          <React.Fragment key={`${student.id}-${idx}`}>
                            {isNewCohort && (
                              <tr className="bg-gradient-to-r from-slate-100/95 via-slate-50/90 to-slate-100/95 dark:from-slate-800/95 dark:via-slate-850 dark:to-slate-800/95 border-y-2 border-slate-200 dark:border-slate-700/80">
                                <td colSpan={8} className="py-2.5 px-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <GraduationCap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                      <span className="text-slate-900 dark:text-white font-extrabold text-xs tracking-tight">
                                        {currentCohortLevel}
                                      </span>
                                      <span className="text-slate-300 dark:text-slate-600">·</span>
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#003b5c] text-white text-[11px] font-black font-mono shadow-xs">
                                        <Layers className="w-3 h-3 text-teal-300" />
                                        Division {currentCohortStream}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                        {cohortCount} student{cohortCount === 1 ? '' : 's'} in this division
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => openDeleteForCohort(currentCohortLevel, currentCohortStream)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/80 border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer shadow-xs"
                                        title={`Delete all ${cohortCount} students in ${currentCohortLevel} Division ${currentCohortStream} alone`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                                        <span>Delete Division</span>
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}

                            <tr
                              key={`${student.id}-row-${idx}`}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                            >
                            <td className="py-3.5 px-3 text-center font-mono text-xs text-slate-400 dark:text-slate-500">
                              {idx + 1}
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 dark:text-white">{student.name}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">{student.program}</div>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold font-mono">
                                  {student.level || 'Level 100'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleQuickPromoteSingle(student)}
                                  className="p-1 rounded text-slate-400 hover:text-[#007c82] hover:bg-teal-50 dark:hover:bg-teal-950/50 transition-colors cursor-pointer"
                                  title={`Advance to ${getNextLevel(student.level)}`}
                                >
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>

                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-teal-50 dark:bg-teal-950/60 text-[#007c82] dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-black font-mono">
                                {student.stream || 'IT A'}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300">
                              {student.indexNumber}
                            </td>

                            <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 text-xs">
                              {student.email}
                            </td>

                            <td className="py-3.5 px-4">
                              {fingerCount > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  {fingerCount}/10 Fingers Enrolled
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-medium">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                  Not Enrolled
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => openEditStudent(student)}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                  title="Edit Student (Name, Index, Level, Stream)"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                  <span>Edit</span>
                                </button>

                                <button
                                  onClick={() => setSelectedStudentForBio(student)}
                                  className="px-2.5 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-[#007c82] dark:text-teal-400 border border-teal-200 dark:border-teal-800 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                  title="Enroll Fingerprints"
                                >
                                  <Fingerprint className="w-3.5 h-3.5" />
                                  <span>{fingerCount > 0 ? 'Bio' : 'Enroll'}</span>
                                </button>

                                <button
                                  onClick={() => handleDelete(student)}
                                  className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                                  title="Delete Student"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sticky / Floating Batch Actions Bar when items are selected */}
          {selectedStudentIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 dark:bg-slate-850/95 text-white backdrop-blur-md px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 flex flex-wrap items-center gap-3 animate-in slide-in-from-bottom duration-200 max-w-[95vw]">
              <div className="flex items-center gap-2 font-bold text-xs pr-2 border-r border-slate-700">
                <span className="w-5 h-5 rounded-full bg-[#007c82] text-white flex items-center justify-center text-[10px]">
                  {selectedStudentIds.length}
                </span>
                <span>Selected</span>
              </div>

              {/* Batch Level Promotion Controls */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 hidden sm:inline">Set Level:</span>
                <button
                  onClick={() => handleBatchPromoteSelected('Level 100')}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold cursor-pointer"
                >
                  L100
                </button>
                <button
                  onClick={() => handleBatchPromoteSelected('Level 200')}
                  className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold cursor-pointer shadow-xs"
                >
                  ➔ L200
                </button>
                <button
                  onClick={() => handleBatchPromoteSelected('Level 300')}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold cursor-pointer"
                >
                  L300
                </button>
                <button
                  onClick={() => handleBatchPromoteSelected('Level 400')}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold cursor-pointer"
                >
                  L400
                </button>
                <button
                  onClick={handleBatchAdvanceSelected}
                  className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold cursor-pointer flex items-center gap-1 shadow-xs"
                  title="Advance each selected student by +1 Level"
                >
                  <ArrowUpRight className="w-3 h-3" />
                  <span>+1 Level</span>
                </button>
              </div>

              {/* Batch Stream Change */}
              <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2">
                <span className="text-[11px] text-slate-400 hidden md:inline">Stream:</span>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBatchStreamSelected(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-[11px] font-bold text-teal-300 focus:outline-none cursor-pointer"
                  defaultValue=""
                >
                  <option value="" disabled>Move Stream...</option>
                  <option value="IT A">Move to IT A</option>
                  <option value="IT B">Move to IT B</option>
                  <option value="IT C">Move to IT C</option>
                  <option value="IT D">Move to IT D</option>
                  <option value="IT E">Move to IT E</option>
                </select>
              </div>

              {/* Delete and Deselect */}
              <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2">
                <button
                  onClick={handleBatchDeleteSelected}
                  className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/60 transition-colors cursor-pointer"
                  title="Delete Selected Students"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedStudentIds([])}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Clear Selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Student Modal (with Single Student, Batch Import, and Batch Promote tabs) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className={`bg-white dark:bg-slate-900 rounded-2xl w-[95vw] ${
            addModalTab === 'batch' ? 'sm:max-w-4xl lg:max-w-5xl' : 'sm:max-w-xl'
          } my-auto max-h-[92vh] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-all duration-200`}>
            <div className="bg-[#003b5c] p-4 sm:p-5 text-white shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base sm:text-lg">Student Management & Enrollment</h3>
                  <p className="text-xs text-slate-200 mt-0.5">
                    Add new students, import roster lists, or promote cohorts (e.g. Level 100 to 200).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Tabs */}
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-white/15 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setAddModalTab('single')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    addModalTab === 'single'
                      ? 'bg-white text-[#003b5c] shadow-xs'
                      : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Single Student</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAddModalTab('batch')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    addModalTab === 'batch'
                      ? 'bg-white text-[#003b5c] shadow-xs'
                      : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Batch Import (Excel / CSV)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAddModalTab('promote')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    addModalTab === 'promote'
                      ? 'bg-amber-400 text-slate-900 shadow-xs font-black'
                      : 'text-amber-200 hover:bg-white/10'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Promote / Batch Edit</span>
                </button>
              </div>
            </div>

            {/* Tab 1: Single Student Form */}
            {addModalTab === 'single' && (
              <form onSubmit={handleAddStudent} className="p-4 sm:p-6 space-y-4 overflow-y-auto touch-scroll">
                {formError && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-xs text-rose-700 dark:text-rose-300 font-medium">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Samuel Nana Yaw"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Index Number *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UEB3101522"
                    value={indexNumber}
                    onChange={(e) => setIndexNumber(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Institutional Email
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Generated from student name
                    </span>
                  </div>
                  <input
                    type="email"
                    placeholder={name.trim() ? generateInstitutionalEmail(name) : 'e.g. kwame.mensah@uenr.edu.gh'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Program
                    </label>
                    <select
                      value={program}
                      onChange={(e) => setProgram(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                    >
                      <option value="BSc Information Technology">BSc Information Technology</option>
                      <option value="BSc Computer Science">BSc Computer Science</option>
                      <option value="BSc Computer Engineering">BSc Computer Engineering</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Academic Level
                    </label>
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                    >
                      <option value="Level 100">Level 100</option>
                      <option value="Level 200">Level 200</option>
                      <option value="Level 300">Level 300</option>
                      <option value="Level 400">Level 400</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Stream / Division *
                    </label>
                    <select
                      value={stream}
                      onChange={(e) => setStream(e.target.value)}
                      className="w-full bg-teal-50/70 dark:bg-teal-950/40 border border-teal-300 dark:border-teal-700 rounded-xl px-2.5 py-2 text-xs font-bold text-[#007c82] dark:text-teal-300 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                    >
                      <option value="IT A">IT A</option>
                      <option value="IT B">IT B</option>
                      <option value="IT C">IT C</option>
                      <option value="IT D">IT D</option>
                      <option value="IT E">IT E</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-[#007c82] hover:bg-[#00666b] rounded-xl shadow-sm cursor-pointer"
                  >
                    Save Student
                  </button>
                </div>
              </form>
            )}

            {/* Tab 2: Batch Import Form */}
            {addModalTab === 'batch' && renderBatchImportContent(() => setShowAddModal(false))}

            {/* Tab 3: Batch Promote & Edit Form Embedded */}
            {addModalTab === 'promote' && (
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto touch-scroll">
                {promoteSuccessMsg && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-xs text-emerald-800 dark:text-emerald-300 font-semibold animate-in fade-in">
                    {promoteSuccessMsg}
                  </div>
                )}

                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-850 p-3 rounded-xl border border-slate-200 dark:border-slate-750">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Division Scope:</span>
                    <p className="text-[11px] text-slate-500">Apply promotions across all or specific stream</p>
                  </div>
                  <select
                    value={promoteStreamFilter}
                    onChange={(e) => setPromoteStreamFilter(e.target.value)}
                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-[#007c82] focus:outline-none"
                  >
                    <option value="all">All Divisions</option>
                    <option value="IT A">IT A</option>
                    <option value="IT B">IT B</option>
                    <option value="IT C">IT C</option>
                    <option value="IT D">IT D</option>
                    <option value="IT E">IT E</option>
                  </select>
                </div>

                {/* Cohort Progression Cards */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Quick Cohort Promotions
                  </h4>

                  {/* Level 100 to 200 */}
                  <div className="p-3 rounded-xl bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        Level 100 ➔ Level 200
                      </div>
                      <div className="text-[11px] text-amber-700 dark:text-amber-300">
                        {cohortCounts.lvl100} student(s) currently in Level 100
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isPromoting || cohortCounts.lvl100 === 0}
                      onClick={() => handleCohortPromotion('Level 100', 'Level 200')}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Promote to L200</span>
                    </button>
                  </div>

                  {/* Level 200 to 300 */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Level 200 ➔ Level 300
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {cohortCounts.lvl200} student(s) currently in Level 200
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isPromoting || cohortCounts.lvl200 === 0}
                      onClick={() => handleCohortPromotion('Level 200', 'Level 300')}
                      className="px-3 py-1.5 rounded-lg bg-[#007c82] hover:bg-[#00666b] disabled:opacity-50 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Promote to L300</span>
                    </button>
                  </div>

                  {/* Level 300 to 400 */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Level 300 ➔ Level 400
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {cohortCounts.lvl300} student(s) currently in Level 300
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isPromoting || cohortCounts.lvl300 === 0}
                      onClick={() => handleCohortPromotion('Level 300', 'Level 400')}
                      className="px-3 py-1.5 rounded-lg bg-[#007c82] hover:bg-[#00666b] disabled:opacity-50 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Promote to L400</span>
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={isPromoting || students.length === 0}
                    onClick={handlePromoteAllCohorts}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Advance All Levels (+1)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Single Student Edit Modal ("One by One" Edit & Promotion) */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-[94vw] sm:max-w-md my-auto max-h-[88vh] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-[#003b5c] to-[#007c82] p-4 sm:p-5 text-white shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-mono text-teal-200 uppercase tracking-wider font-bold">
                    Edit Student Record
                  </div>
                  <h3 className="font-bold text-base sm:text-lg truncate mt-0.5">{editingStudent.name}</h3>
                  <p className="text-xs text-slate-200 mt-0.5 font-mono">{editingStudent.indexNumber}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveEdit} className="p-4 sm:p-6 space-y-4 overflow-y-auto touch-scroll">
              {editError && (
                <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-xs text-rose-700 dark:text-rose-300 font-medium">
                  {editError}
                </div>
              )}

              {editSuccessMsg && (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-xs text-emerald-700 dark:text-emerald-300 font-bold">
                  {editSuccessMsg}
                </div>
              )}

              {/* Quick Promotion Button */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3 flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Quick Level Promotion:
                  </span>
                  <div className="text-[11px] text-amber-700 dark:text-amber-300">
                    Current: <strong>{editLevel}</strong> ➔ Next: <strong>{getNextLevel(editLevel)}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditLevel(getNextLevel(editLevel))}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 active:scale-95"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Advance Level</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Index Number *
                </label>
                <input
                  type="text"
                  value={editIndexNumber}
                  onChange={(e) => setEditIndexNumber(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Institutional Email
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Generated from student name
                  </span>
                </div>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder={editName.trim() ? generateInstitutionalEmail(editName, editIndexNumber) : 'e.g. kwame.mensah@uenr.edu.gh'}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Academic Level *
                  </label>
                  <select
                    value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value)}
                    className="w-full bg-amber-50/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl px-2.5 py-2 text-xs font-bold text-amber-800 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  >
                    <option value="Level 100">Level 100</option>
                    <option value="Level 200">Level 200</option>
                    <option value="Level 300">Level 300</option>
                    <option value="Level 400">Level 400</option>
                    <option value="Alumni / Completed">Alumni / Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Stream / Division *
                  </label>
                  <select
                    value={editStream}
                    onChange={(e) => setEditStream(e.target.value)}
                    className="w-full bg-teal-50/70 dark:bg-teal-950/40 border border-teal-300 dark:border-teal-700 rounded-xl px-2.5 py-2 text-xs font-bold text-[#007c82] dark:text-teal-300 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  >
                    <option value="IT A">IT A</option>
                    <option value="IT B">IT B</option>
                    <option value="IT C">IT C</option>
                    <option value="IT D">IT D</option>
                    <option value="IT E">IT E</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Program
                  </label>
                  <select
                    value={editProgram}
                    onChange={(e) => setEditProgram(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82]"
                  >
                    <option value="BSc Information Technology">BSc IT</option>
                    <option value="BSc Computer Science">BSc CS</option>
                    <option value="BSc Computer Engineering">BSc CE</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#007c82] hover:bg-[#00666b] rounded-xl shadow-sm cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cohort Progression & Batch Student Management Modal */}
      {showPromoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-[94vw] sm:max-w-xl my-auto max-h-[88vh] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-amber-600 to-teal-700 p-4 sm:p-5 text-white shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-amber-200 font-bold uppercase tracking-wider">
                    <TrendingUp className="w-4 h-4" />
                    <span>Academic Year Promotion & Batch Tools</span>
                  </div>
                  <h3 className="font-bold text-base sm:text-lg mt-0.5">Cohort Progression Center</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPromoteModal(false)}
                  className="p-1 rounded-lg text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-white/20">
                <button
                  type="button"
                  onClick={() => setPromoteMode('progression')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    promoteMode === 'progression'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  Cohort Progression (100 ➔ 200)
                </button>
                <button
                  type="button"
                  onClick={() => setPromoteMode('custom')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    promoteMode === 'custom'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  Custom Batch Edit
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto touch-scroll text-xs">
              {promoteSuccessMsg && (
                <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-emerald-800 dark:text-emerald-300 font-semibold animate-in fade-in">
                  {promoteSuccessMsg}
                </div>
              )}

              {promoteMode === 'progression' ? (
                <>
                  {/* Stream Filter */}
                  <div className="bg-slate-50 dark:bg-slate-850 p-3 rounded-xl border border-slate-200 dark:border-slate-750 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                        Target Division / Stream:
                      </label>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Promote students in all divisions or only in one division
                      </p>
                    </div>
                    <select
                      value={promoteStreamFilter}
                      onChange={(e) => setPromoteStreamFilter(e.target.value)}
                      className="bg-white dark:bg-slate-800 border border-teal-300 dark:border-teal-700 rounded-lg px-3 py-1.5 text-xs font-bold text-[#007c82] dark:text-teal-300 focus:outline-none"
                    >
                      <option value="all">All Streams ({students.length} students)</option>
                      <option value="IT A">IT A</option>
                      <option value="IT B">IT B</option>
                      <option value="IT C">IT C</option>
                      <option value="IT D">IT D</option>
                      <option value="IT E">IT E</option>
                    </select>
                  </div>

                  {/* Level Cohort Progression Cards */}
                  <div className="space-y-2.5">
                    {/* Level 100 -> 200 */}
                    <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-amber-100/60 dark:from-amber-950/40 dark:to-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-black text-amber-950 dark:text-amber-100">
                          <span>Level 100</span>
                          <ChevronRight className="w-4 h-4 text-amber-600" />
                          <span>Level 200</span>
                        </div>
                        <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                          Currently <strong>{cohortCounts.lvl100}</strong> student(s) enrolled in Level 100
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isPromoting || cohortCounts.lvl100 === 0}
                        onClick={() => handleCohortPromotion('Level 100', 'Level 200')}
                        className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs shadow-sm cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>Promote to L200</span>
                      </button>
                    </div>

                    {/* Level 200 -> 300 */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-black text-slate-900 dark:text-white">
                          <span>Level 200</span>
                          <ChevronRight className="w-4 h-4 text-teal-600" />
                          <span>Level 300</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Currently <strong>{cohortCounts.lvl200}</strong> student(s) enrolled in Level 200
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isPromoting || cohortCounts.lvl200 === 0}
                        onClick={() => handleCohortPromotion('Level 200', 'Level 300')}
                        className="px-3.5 py-2 rounded-xl bg-[#007c82] hover:bg-[#00666b] disabled:opacity-50 text-white font-bold text-xs shadow-sm cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>Promote to L300</span>
                      </button>
                    </div>

                    {/* Level 300 -> 400 */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-black text-slate-900 dark:text-white">
                          <span>Level 300</span>
                          <ChevronRight className="w-4 h-4 text-teal-600" />
                          <span>Level 400</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Currently <strong>{cohortCounts.lvl300}</strong> student(s) enrolled in Level 300
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isPromoting || cohortCounts.lvl300 === 0}
                        onClick={() => handleCohortPromotion('Level 300', 'Level 400')}
                        className="px-3.5 py-2 rounded-xl bg-[#007c82] hover:bg-[#00666b] disabled:opacity-50 text-white font-bold text-xs shadow-sm cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>Promote to L400</span>
                      </button>
                    </div>

                    {/* Level 400 -> Alumni */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-black text-slate-900 dark:text-white">
                          <span>Level 400</span>
                          <ChevronRight className="w-4 h-4 text-purple-600" />
                          <span>Alumni / Graduated</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Currently <strong>{cohortCounts.lvl400}</strong> final year student(s)
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isPromoting || cohortCounts.lvl400 === 0}
                        onClick={() => handleCohortPromotion('Level 400', 'Alumni / Completed')}
                        className="px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-bold text-xs shadow-sm cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                        <span>Mark Graduated</span>
                      </button>
                    </div>
                  </div>

                  {/* Advance All Master Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={isPromoting || students.length === 0}
                      onClick={handlePromoteAllCohorts}
                      className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs shadow-sm cursor-pointer flex items-center justify-center gap-2 active:scale-98 transition-all"
                    >
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Advance All Cohorts by +1 Level</span>
                    </button>
                  </div>
                </>
              ) : (
                /* Custom Batch Edit Mode */
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 space-y-3">
                    <div className="font-bold text-slate-900 dark:text-white">1. Select Target Students:</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Current Level:</label>
                        <select
                          value={customFilterLevel}
                          onChange={(e) => setCustomFilterLevel(e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-xs font-semibold"
                        >
                          <option value="all">All Levels</option>
                          <option value="Level 100">Level 100</option>
                          <option value="Level 200">Level 200</option>
                          <option value="Level 300">Level 300</option>
                          <option value="Level 400">Level 400</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">Current Stream:</label>
                        <select
                          value={customFilterStream}
                          onChange={(e) => setCustomFilterStream(e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-xs font-semibold"
                        >
                          <option value="all">All Streams</option>
                          <option value="IT A">IT A</option>
                          <option value="IT B">IT B</option>
                          <option value="IT C">IT C</option>
                          <option value="IT D">IT D</option>
                          <option value="IT E">IT E</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 space-y-3">
                    <div className="font-bold text-slate-900 dark:text-white">2. Set New Attributes:</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">New Level:</label>
                        <select
                          value={customTargetLevel}
                          onChange={(e) => setCustomTargetLevel(e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-xs font-semibold"
                        >
                          <option value="keep">— Keep Unchanged —</option>
                          <option value="Level 100">Level 100</option>
                          <option value="Level 200">Level 200</option>
                          <option value="Level 300">Level 300</option>
                          <option value="Level 400">Level 400</option>
                          <option value="Alumni / Completed">Alumni / Completed</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">New Stream:</label>
                        <select
                          value={customTargetStream}
                          onChange={(e) => setCustomTargetStream(e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-xs font-semibold"
                        >
                          <option value="keep">— Keep Unchanged —</option>
                          <option value="IT A">IT A</option>
                          <option value="IT B">IT B</option>
                          <option value="IT C">IT C</option>
                          <option value="IT D">IT D</option>
                          <option value="IT E">IT E</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">New Program:</label>
                        <select
                          value={customTargetProgram}
                          onChange={(e) => setCustomTargetProgram(e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-xs font-semibold"
                        >
                          <option value="keep">— Keep Unchanged —</option>
                          <option value="BSc Information Technology">BSc IT</option>
                          <option value="BSc Computer Science">BSc CS</option>
                          <option value="BSc Computer Engineering">BSc CE</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCustomBatchUpdate}
                    className="w-full py-2.5 rounded-xl bg-[#007c82] hover:bg-[#00666b] text-white font-bold text-xs shadow-sm cursor-pointer"
                  >
                    Apply Batch Changes
                  </button>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPromoteModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Batch Import Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-[95vw] sm:max-w-4xl lg:max-w-5xl my-auto max-h-[92vh] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="bg-[#003b5c] p-4 sm:p-5 text-white shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base sm:text-lg">Batch Register Students (100+ Students)</h3>
                  <p className="text-xs text-slate-200 mt-0.5">
                    Upload an Excel/CSV file or paste student records from Google Sheets, CSV, or list.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {renderBatchImportContent(() => setShowBatchModal(false))}
          </div>
        </div>
      )}

      {/* Delete Specific Cohort / Level / Stream Modal */}
      {showDeleteCohortModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#003b5c] via-[#00526e] to-[#007c82] p-4 sm:p-5 text-white flex items-center justify-between border-b border-[#002b45]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shadow-inner">
                  <Trash2 className="w-5 h-5 text-teal-200" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">Delete Specific Cohort / Division</h3>
                  <p className="text-xs text-teal-100/90">Remove only selected level or stream without affecting other students</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteCohortModal(false)}
                className="p-1 rounded-lg text-teal-100 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4 text-xs sm:text-sm">
              {/* Scope Selector: Level, Stream, or Combined */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  What would you like to delete?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteTargetType('level')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold text-xs ${
                      deleteTargetType === 'level'
                        ? 'bg-teal-50 dark:bg-teal-950/50 border-[#007c82] text-[#007c82] dark:text-teal-300 ring-2 ring-[#007c82]/25 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <GraduationCap className={`w-4 h-4 mx-auto mb-1 ${deleteTargetType === 'level' ? 'text-[#007c82] dark:text-teal-400' : 'text-slate-400'}`} />
                    <span>Entire Level</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteTargetType('stream')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold text-xs ${
                      deleteTargetType === 'stream'
                        ? 'bg-teal-50 dark:bg-teal-950/50 border-[#007c82] text-[#007c82] dark:text-teal-300 ring-2 ring-[#007c82]/25 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <Layers className={`w-4 h-4 mx-auto mb-1 ${deleteTargetType === 'stream' ? 'text-[#007c82] dark:text-teal-400' : 'text-slate-400'}`} />
                    <span>Entire Stream</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteTargetType('both')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold text-xs ${
                      deleteTargetType === 'both'
                        ? 'bg-teal-50 dark:bg-teal-950/50 border-[#007c82] text-[#007c82] dark:text-teal-300 ring-2 ring-[#007c82]/25 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <GraduationCap className={`w-3.5 h-3.5 ${deleteTargetType === 'both' ? 'text-[#007c82] dark:text-teal-400' : 'text-slate-400'}`} />
                      <Layers className={`w-3.5 h-3.5 ${deleteTargetType === 'both' ? 'text-[#007c82] dark:text-teal-400' : 'text-slate-400'}`} />
                    </div>
                    <span>Level + Stream</span>
                  </button>
                </div>
              </div>

              {/* Target Selections */}
              <div className="space-y-3 pt-1">
                {(deleteTargetType === 'level' || deleteTargetType === 'both') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Academic Level to Delete:
                    </label>
                    <select
                      value={targetDeleteLevel}
                      onChange={(e) => setTargetDeleteLevel(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82] cursor-pointer"
                    >
                      {availableLevels.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl} ({students.filter((s) => (s.level || 'Level 100') === lvl).length} total students)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(deleteTargetType === 'stream' || deleteTargetType === 'both') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Class Stream to Delete:
                    </label>
                    <select
                      value={targetDeleteStream}
                      onChange={(e) => setTargetDeleteStream(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#007c82] cursor-pointer"
                    >
                      {availableStreams.map((st) => (
                        <option key={st} value={st}>
                          {st} ({students.filter((s) => (s.stream || 'IT A') === st).length} total students)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Impact Summary Box */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>
                    {studentsPendingDelete.length} student{studentsPendingDelete.length === 1 ? '' : 's'} will be deleted
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {deleteTargetType === 'level'
                    ? `Only students registered under ${targetDeleteLevel} will be permanently removed. All other levels will be preserved.`
                    : deleteTargetType === 'stream'
                    ? `Only students in Stream ${targetDeleteStream} will be removed. All other streams will be preserved.`
                    : `Only students in ${targetDeleteLevel} Stream ${targetDeleteStream} will be removed. Neither other levels of ${targetDeleteStream} nor other streams of ${targetDeleteLevel} will be touched.`}
                </p>

                {studentsPendingDelete.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                      Preview of affected students:
                    </span>
                    <div className="max-h-24 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                      {studentsPendingDelete.slice(0, 10).map((s, sIdx) => (
                        <div key={`${s.id}-${sIdx}`} className="text-[11px] text-slate-700 dark:text-slate-300 flex items-center justify-between">
                          <span className="truncate font-medium">{s.name}</span>
                          <span className="font-mono text-[10px] text-slate-400 shrink-0 ml-2">{s.indexNumber}</span>
                        </div>
                      ))}
                      {studentsPendingDelete.length > 10 && (
                        <div className="text-[10px] font-bold text-teal-700 dark:text-teal-400 italic pt-0.5">
                          + {studentsPendingDelete.length - 10} more students
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteCohortModal(false)}
                  disabled={isDeletingCohort}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleExecuteDeleteCohort}
                  disabled={isDeletingCohort || studentsPendingDelete.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  {isDeletingCohort ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting {studentsPendingDelete.length} Students...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete {studentsPendingDelete.length} Students Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
