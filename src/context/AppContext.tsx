import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Student,
  Course,
  TimetableSlot,
  AttendanceRecord,
  CancelledClass,
  AuditLog,
  SemesterConfig,
  CurrentUser,
  AuthorizedUser,
  UserRole,
  AutoLoggingSettings,
  GpsGeofenceSettings
} from '../types';
import { DEFAULT_UENR_GEOFENCE } from '../utils/geofence';
import {
  INITIAL_COURSES,
  INITIAL_TIMETABLE,
  INITIAL_AUTHORIZED_USERS,
  INITIAL_SEMESTER,
  OFFICIAL_L200_COURSES,
  OFFICIAL_L200_TIMETABLE
} from '../data/mockData';
import {
  db,
  auth,
  activeFirestoreDatabaseId,
  signInWithGoogle,
  logOut,
  onAuthStateChanged,
  testFirestoreConnection,
  handleFirestoreError,
  OperationType,
  FirebaseUser
} from '../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  query,
  limit,
  where
} from 'firebase/firestore';
import {
  saveTimetableToOfflineStorage,
  loadTimetableFromOfflineStorage,
  getOfflineCacheStatus,
  getNetworkStatus,
  OFFLINE_CACHE_KEYS
} from '../utils/offlineCache';
import { generateInstitutionalEmail } from '../utils/studentParser';
import { streamsMatch } from '../utils/timetableHelper';

export type NavigationTab = 'home' | 'attendance' | 'timetable' | 'admin' | 'reports';
export type AdminSubTab = 'roster' | 'authorized' | 'database' | 'audit' | 'autologging';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface AttendanceLaunchTarget {
  courseId?: string;
  stream?: string;
  level?: string;
  date?: string;
  slotId?: string;
  viewMode?: 'manual' | 'biometric' | 'gps';
}

interface AppContextType {
  students: Student[];
  courses: Course[];
  timetable: TimetableSlot[];
  attendanceRecords: AttendanceRecord[];
  cancelledClasses: CancelledClass[];
  auditLogs: AuditLog[];
  semester: SemesterConfig;
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  attendanceLaunchTarget: AttendanceLaunchTarget | null;
  launchAttendanceSession: (target?: AttendanceLaunchTarget) => void;
  clearAttendanceLaunchTarget: () => void;
  adminSubTab: AdminSubTab;
  setAdminSubTab: (tab: AdminSubTab) => void;
  openDatabaseTab: () => void;
  currentUser: CurrentUser;
  setCurrentUser: React.Dispatch<React.SetStateAction<CurrentUser>>;
  isRoleMenuOpen: boolean;
  setIsRoleMenuOpen: (open: boolean) => void;

  // Theme & Accessibility in Low-Light
  theme: ThemeMode;
  isDarkMode: boolean;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;

  // Offline & Service Worker Caching State
  isOnline: boolean;
  isPoorConnection: boolean;
  offlineCacheInfo: {
    isCached: boolean;
    cachedAtText: string;
    totalSlots: number;
    totalCourses: number;
  };
  saveTimetableOffline: () => boolean;

  // Access Control & Auth
  firebaseUser: FirebaseUser | null;
  isAuthLoading: boolean;
  isCloudConnected: boolean;
  isAuthorized: boolean;
  verifiedRole: UserRole | null;
  isLecturerCourseScoped: boolean;
  authorizedUsers: AuthorizedUser[];
  loginWithGoogle: (forcePrompt?: boolean) => Promise<void>;
  logoutUser: () => Promise<void>;
  switchAccount: () => Promise<void>;
  addAuthorizedUser: (user: Omit<AuthorizedUser, 'id' | 'addedAt'>) => Promise<void>;
  updateAuthorizedUser: (id: string, updates: Partial<Omit<AuthorizedUser, 'id' | 'email' | 'addedAt'>>) => Promise<void>;
  removeAuthorizedUser: (id: string) => Promise<void>;

  // Sync state
  isSyncing: boolean;
  cloudSyncError: string | null;

  // Database Management Actions
  forceSyncCloudDatabase: () => Promise<{ success: boolean; count: number; error?: string }>;
  pingDatabaseLatency: () => Promise<{ connected: boolean; latencyMs: number }>;
  exportDatabaseJSON: () => string;
  importDatabaseJSON: (jsonStr: string) => Promise<{ success: boolean; count: number; error?: string }>;
  seedSampleCoursesIfEmpty: () => Promise<void>;
  loadOfficialL200Timetable: (overwriteExisting?: boolean) => Promise<{ success: boolean; coursesCount: number; slotsCount: number }>;

  // Student actions
  addStudent: (student: Omit<Student, 'id' | 'createdAt' | 'enrolledFingers'>) => Promise<void>;
  batchAddStudents: (
    students: Array<{ name: string; indexNumber: string; email?: string; stream?: string; level?: string; program?: string }>,
    options?: { clearExisting?: boolean; updateDuplicates?: boolean }
  ) => Promise<number>;
  updateStudent: (id: string, updates: Partial<Student>) => Promise<void>;
  batchUpdateStudents: (studentIds: string[], updates: Partial<Pick<Student, 'level' | 'stream' | 'program'>>) => Promise<number>;
  batchPromoteStudents: (fromLevel: string, toLevel: string, streamFilter?: string) => Promise<number>;
  promoteAllLevels: () => Promise<{ count: number }>;
  removeStudent: (id: string) => Promise<void>;
  deleteStudentsByFilter: (filter: { level?: string; stream?: string; ids?: string[] }) => Promise<number>;
  clearAllStudents: () => Promise<void>;
  enrollStudentFingers: (id: string, fingers: string[]) => Promise<void>;
  updateAllStudentEmailsToNameBased: () => Promise<number>;

  // Course actions
  addCourse: (course: Omit<Course, 'id'>) => Promise<void>;
  updateCourse: (id: string, updates: Partial<Course>) => Promise<void>;
  removeCourse: (id: string) => Promise<void>;
  clearAllCourses: () => Promise<void>;

  // Timetable actions
  addTimetableSlot: (slot: Omit<TimetableSlot, 'id'>) => Promise<void>;
  updateTimetableSlot: (id: string, updates: Partial<TimetableSlot>) => Promise<void>;
  removeTimetableSlot: (id: string) => Promise<void>;
  clearAllTimetableSlots: () => Promise<void>;
  assignCourseWithSchedule: (
    courseData: { code: string; title: string; creditHours?: number; lecturer?: string; department?: string },
    schedule: { dayOfWeek: number; startTime: string; endTime: string; venue: string; stream?: string }
  ) => Promise<{ courseId: string; slotId: string }>;

  // Attendance actions
  getAttendanceForSession: (date: string, courseId: string, stream?: string) => AttendanceRecord | undefined;
  saveAttendance: (
    date: string,
    courseId: string,
    records: Record<string, 'present' | 'absent'>,
    biometricVerifiedIds?: string[],
    finalize?: boolean,
    stream?: string,
    gpsVerifiedIds?: string[]
  ) => Promise<void>;
  unlockAttendance: (date: string, courseId: string, stream?: string) => Promise<void>;
  checkInStudentWithIndex: (
    indexNumber: string,
    date: string,
    courseId: string,
    stream?: string,
    gpsMeta?: { gpsVerified?: boolean; distanceMeters?: number }
  ) => Promise<{
    success: boolean;
    message: string;
    student?: Student;
    course?: Course;
    stats?: { attended: number; total: number; percentage: number; isEligible: boolean };
    alreadyCheckedIn?: boolean;
  }>;

  // Date-specific Class Cancellation actions
  cancelClassSession: (input: {
    date: string;
    courseId: string;
    timetableSlotId?: string;
    stream?: string;
    reason: string;
    makeupNote?: string;
  }) => Promise<boolean>;
  restoreCancelledClass: (cancelId: string) => Promise<boolean>;
  getCancellationForSession: (params: {
    date: string;
    courseId: string;
    slotId?: string;
    stream?: string;
  }) => CancelledClass | undefined;

  // GPS Geofence Config
  geofenceSettings: GpsGeofenceSettings;
  updateGeofenceSettings: (updates: Partial<GpsGeofenceSettings>) => Promise<void>;

  // Audit & Auto-Logging actions
  addAuditLog: (action: string, details: string, type: AuditLog['type']) => Promise<void>;
  autoLoggingSettings: AutoLoggingSettings;
  updateAutoLoggingSettings: (updates: Partial<AutoLoggingSettings>) => Promise<void>;

  // Reset
  resetToDefaults: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  STUDENTS: 'uenr_students_v3_clean',
  COURSES: 'uenr_courses_v3_custom',
  TIMETABLE: 'uenr_timetable_v3_custom',
  ATTENDANCE: 'uenr_attendance_v2',
  CANCELLED_CLASSES: 'uenr_cancelled_classes_v1',
  AUDIT_LOGS: 'uenr_audit_logs_v2',
  SEMESTER: 'uenr_semester_v3_2026',
  AUTHORIZED: 'uenr_authorized_users_v2'
};

const DUMMY_COURSE_IDS = ['crs-1', 'crs-2', 'crs-3', 'crs-4', 'crs-5'];
const DUMMY_SLOT_IDS = ['tt-1', 'tt-2', 'tt-3', 'tt-4', 'tt-5'];

const MASTER_HOD_EMAIL = 'jonesdarko345@gmail.com';

const GUEST_USER: CurrentUser = {
  name: 'Guest',
  email: '',
  role: 'class_rep',
  department: 'Department of Information Technology'
};

const clearSensitiveStorage = () => {
  try {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(OFFLINE_CACHE_KEYS.TIMETABLE_SNAPSHOT);
    localStorage.removeItem(OFFLINE_CACHE_KEYS.LAST_CACHED_AT);
    localStorage.removeItem('uenr_auto_signin');
    localStorage.removeItem('uenr_current_user_profile');
    localStorage.removeItem('uenr_geofence_settings');
  } catch {
    // ignore
  }
};

export const matchAttendanceStream = (recordStream?: string, requestedStream?: string): boolean => {
  return streamsMatch(recordStream, requestedStream);
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');
  const [attendanceLaunchTarget, setAttendanceLaunchTarget] = useState<AttendanceLaunchTarget | null>(null);
  const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>('roster');
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState<boolean>(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);

  const launchAttendanceSession = useCallback((target?: AttendanceLaunchTarget) => {
    setAttendanceLaunchTarget(target || null);
    setActiveTab('attendance');
  }, []);

  const clearAttendanceLaunchTarget = useCallback(() => {
    setAttendanceLaunchTarget(null);
  }, []);

  const openDatabaseTab = useCallback(() => {
    setActiveTab('admin');
    setAdminSubTab('database');
  }, []);

  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>([]);
  const [verifiedRole, setVerifiedRole] = useState<UserRole | null>(null);
  const [verifiedAssignedCourseIds, setVerifiedAssignedCourseIds] = useState<string[] | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [currentUser, setCurrentUserState] = useState<CurrentUser>(GUEST_USER);

  const verifiedAssignedCourseIdsKey = useMemo(
    () => (verifiedAssignedCourseIds ? [...verifiedAssignedCourseIds].sort().join(',') : 'ALL'),
    [verifiedAssignedCourseIds]
  );

  // Enforce role ceiling: no user can elevate above their verifiedRole
  const setCurrentUser: React.Dispatch<React.SetStateAction<CurrentUser>> = useCallback(
    (updater) => {
      setCurrentUserState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (!verifiedRole) return GUEST_USER;
        const allowedRoles: UserRole[] =
          verifiedRole === 'hod'
            ? ['hod', 'lecturer', 'class_rep']
            : verifiedRole === 'lecturer'
            ? ['lecturer', 'class_rep']
            : ['class_rep'];
        const safeRole = allowedRoles.includes(next.role) ? next.role : verifiedRole;
        return { ...next, role: safeRole };
      });
    },
    [verifiedRole]
  );

  // Auto Logging & Automation Settings
  const [autoLoggingSettings, setAutoLoggingSettings] = useState<AutoLoggingSettings>(() => {
    const defaults: AutoLoggingSettings = {
      autoLogBiometricScanSuccess: true,
      autoLogBiometricScanFailure: true,
      autoLogSessionDrafts: true,
      autoLogFinalizedSessions: true,
      autoFinalizeOnClassEnd: false,
      autoFinalizeGracePeriodMinutes: 15,
      autoMarkAbsentOnFinalize: true,
      autoFlagLateArrivals: true,
      lateThresholdMinutes: 15,
      autoAlertAttendanceDeficit: true,
      autoLogAuthLogins: true,
      autoLogRoleChanges: true,
      autoLogRosterModifications: true,
      autoLogTimetableChanges: true,
      autoLogReportExports: true,
      autoLogOfflineSync: true,
      logRetentionDays: 90,
      autoPruneOldLogs: false,
      realtimeCloudSync: true
    };
    try {
      const saved = localStorage.getItem('uenr_auto_logging_settings');
      if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return defaults;
  });

  const updateAutoLoggingSettings = async (updates: Partial<AutoLoggingSettings>) => {
    setAutoLoggingSettings((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem('uenr_auto_logging_settings', JSON.stringify(next));
      } catch (e) {
        console.warn('Could not persist auto logging settings:', e);
      }
      return next;
    });

    if (isAuthorized && (verifiedRole === 'hod' || verifiedRole === 'lecturer')) {
      try {
        await setDoc(doc(db, 'systemSettings', 'autoLogging'), { ...autoLoggingSettings, ...updates }, { merge: true });
      } catch (err) {
        console.warn('[Firestore] systemSettings autoLogging sync notice:', err);
      }
    }
  };

  // Persistent Campus / Hall GPS Geofence Settings
  const defaultGeofenceSettings: GpsGeofenceSettings = {
    enabled: DEFAULT_UENR_GEOFENCE.enabled,
    campusName: DEFAULT_UENR_GEOFENCE.campusName,
    latitude: DEFAULT_UENR_GEOFENCE.latitude,
    longitude: DEFAULT_UENR_GEOFENCE.longitude,
    radiusMeters: DEFAULT_UENR_GEOFENCE.radiusMeters,
    rollingPinEnabled: true
  };

  const [geofenceSettings, setGeofenceSettings] = useState<GpsGeofenceSettings>(() => {
    try {
      const saved = localStorage.getItem('uenr_geofence_settings');
      if (saved) return { ...defaultGeofenceSettings, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return defaultGeofenceSettings;
  });

  const updateGeofenceSettings = async (updates: Partial<GpsGeofenceSettings>) => {
    const nextSettings: GpsGeofenceSettings = {
      ...geofenceSettings,
      ...updates,
      enabled: (updates.radiusMeters ?? geofenceSettings.radiusMeters) > 0,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || currentUser?.email || 'Academic Staff'
    };

    setGeofenceSettings(nextSettings);
    try {
      if (isAuthorized) {
        localStorage.setItem('uenr_geofence_settings', JSON.stringify(nextSettings));
      }
    } catch (e) {
      console.warn('Could not persist geofence settings locally:', e);
    }

    if (isAuthorized && (verifiedRole === 'hod' || verifiedRole === 'lecturer')) {
      try {
        await setDoc(doc(db, 'systemSettings', 'geofence'), nextSettings, { merge: true });
      } catch (err) {
        console.warn('[Firestore] systemSettings geofence sync notice:', err);
      }
    }
  };

  // Alphabetical sort helper
  const sortAlphabetically = <T extends { name: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  };

  // Robust Deduplication Helper (prevents React duplicate key errors)
  const deduplicateStudents = (items: Student[]): Student[] => {
    const seenIds = new Set<string>();
    const seenIndexes = new Set<string>();
    const result: Student[] = [];

    for (const s of items) {
      if (!s || !s.id) continue;
      const cleanId = s.id.trim();
      const cleanIdx = (s.indexNumber || '').trim().toUpperCase();

      if (cleanId && seenIds.has(cleanId)) continue;
      if (cleanIdx && seenIndexes.has(cleanIdx)) continue;

      if (cleanId) seenIds.add(cleanId);
      if (cleanIdx) seenIndexes.add(cleanIdx);
      result.push(s);
    }

    return sortAlphabetically(result);
  };

  // All academic & personnel collections start strictly empty until verified authorization completes
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [cancelledClasses, setCancelledClasses] = useState<CancelledClass[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [semester] = useState<SemesterConfig>(() => {
    try {
      localStorage.removeItem('uenr_semester_v2');
      const saved = localStorage.getItem(STORAGE_KEYS.SEMESTER);
      if (saved) {
        const parsed: SemesterConfig = JSON.parse(saved);
        if (parsed.academicYear === '2026/2027') return parsed;
      }
      localStorage.setItem(STORAGE_KEYS.SEMESTER, JSON.stringify(INITIAL_SEMESTER));
      return INITIAL_SEMESTER;
    } catch {
      return INITIAL_SEMESTER;
    }
  });

  // Global Theme & Low-Light Accessibility
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('uenr_theme_mode') as ThemeMode;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    }
    return 'light';
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('uenr_theme_mode');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const calculateIsDark = () => {
      if (theme === 'dark') return true;
      if (theme === 'light') return false;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    };

    const dark = calculateIsDark();
    setIsDarkMode(dark);

    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    try {
      localStorage.setItem('uenr_theme_mode', theme);
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', dark ? '#020617' : '#003b5c');
      }
    } catch (e) {
      console.warn('Unable to persist theme state:', e);
    }

    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        setIsDarkMode(e.matches);
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      };
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const currentlyDark =
        prev === 'dark' ||
        (prev === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      return currentlyDark ? 'light' : 'dark';
    });
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
  }, []);

  // Offline & Real-Time Network Quality State
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isPoorConnection, setIsPoorConnection] = useState<boolean>(() => {
    const status = getNetworkStatus();
    return status.isPoorConnection;
  });
  const [offlineCacheInfo, setOfflineCacheInfo] = useState(() => getOfflineCacheStatus());

  // Listen to network changes (online/offline events + connection speed)
  useEffect(() => {
    const handleNetworkChange = () => {
      const status = getNetworkStatus();
      setIsOnline(status.isOnline);
      setIsPoorConnection(status.isPoorConnection);
      if (!status.isOnline) {
        setIsCloudConnected(false);
      } else {
        testFirestoreConnection().then((connected) => {
          setIsCloudConnected(connected);
        });
      }
    };

    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    const nav = navigator as unknown as { connection?: EventTarget };
    if (nav.connection && typeof nav.connection.addEventListener === 'function') {
      nav.connection.addEventListener('change', handleNetworkChange);
    }

    return () => {
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
      if (nav.connection && typeof nav.connection.removeEventListener === 'function') {
        nav.connection.removeEventListener('change', handleNetworkChange);
      }
    };
  }, []);

  // Explicit action for users/students to save or refresh offline cache
  const saveTimetableOffline = useCallback(() => {
    const success = saveTimetableToOfflineStorage(timetable, courses, semester);
    if (success) {
      setOfflineCacheInfo(getOfflineCacheStatus());
    }
    return success;
  }, [timetable, courses, semester]);

  // Persist local offline cache ONLY when user is verified & authorized
  useEffect(() => {
    if (!isAuthorized) return;
    try {
      localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
    } catch {}
  }, [students, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;
    try {
      localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(courses));
    } catch {}
  }, [courses, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;
    try {
      localStorage.setItem(STORAGE_KEYS.TIMETABLE, JSON.stringify(timetable));
      saveTimetableToOfflineStorage(timetable, courses, semester);
      setOfflineCacheInfo(getOfflineCacheStatus());
    } catch {}
  }, [timetable, courses, semester, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;
    try {
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendanceRecords));
    } catch {}
  }, [attendanceRecords, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;
    try {
      localStorage.setItem(STORAGE_KEYS.CANCELLED_CLASSES, JSON.stringify(cancelledClasses));
    } catch {}
  }, [cancelledClasses, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;
    try {
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(auditLogs));
    } catch {}
  }, [auditLogs, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;
    try {
      localStorage.setItem(STORAGE_KEYS.AUTHORIZED, JSON.stringify(authorizedUsers));
    } catch {}
  }, [authorizedUsers, isAuthorized]);

  // Test Firestore Connection on App Boot (single health-check doc only)
  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      testFirestoreConnection().then((connected) => {
        if (isMounted) setIsCloudConnected(connected);
      });
    }, 1000);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const isSeedingRef = useRef(false);
  const isClearingRosterRef = useRef(false);
  const hasStudentsSnapshotRef = useRef(false);
  const hasCoursesSnapshotRef = useRef(false);
  const hasAttendanceSnapshotRef = useRef(false);
  const processedQrTicketsRef = useRef<Set<string>>(new Set());
  const pendingQrTicketsRef = useRef<Array<Record<string, any>>>([]);

  const wipeUnauthorizedState = useCallback(() => {
    hasStudentsSnapshotRef.current = false;
    hasCoursesSnapshotRef.current = false;
    hasAttendanceSnapshotRef.current = false;
    processedQrTicketsRef.current.clear();
    pendingQrTicketsRef.current = [];
    setVerifiedAssignedCourseIds(null);
    setStudents([]);
    setCourses([]);
    setTimetable([]);
    setAttendanceRecords([]);
    setCancelledClasses([]);
    setAuditLogs([]);
    setAuthorizedUsers([]);
    clearSensitiveStorage();
  }, []);

  // Clean up any old mock records from Firestore & sync authorizedEmails index (HOD only)
  const initializeFirestore = useCallback(async (role: UserRole) => {
    if (role !== 'hod' || isSeedingRef.current || !auth.currentUser || auth.currentUser.isAnonymous) return;
    isSeedingRef.current = true;
    setIsSyncing(true);

    try {
      const mockIds = ['std-1', 'std-2', 'std-3', 'std-4', 'std-5', 'std-6', 'std-7', 'std-8', 'std-9', 'std-10', 'std-11', 'std-12'];
      const batch = writeBatch(db);
      let needsCommit = false;

      for (const id of mockIds) {
        batch.delete(doc(db, 'students', id));
        needsCommit = true;
      }

      // Purge duplicate student documents in Firestore if any exist
      try {
        const studentSnap = await getDocs(collection(db, 'students'));
        const seenIndices = new Map<string, string>();
        studentSnap.forEach((d) => {
          const data = d.data();
          const cleanIdx = (data.indexNumber || '').toUpperCase().trim();
          if (cleanIdx) {
            if (seenIndices.has(cleanIdx)) {
              batch.delete(doc(db, 'students', d.id));
              needsCommit = true;
            } else {
              seenIndices.set(cleanIdx, d.id);
            }
          }
        });
      } catch (e) {
        console.warn('Student deduplication check note:', e);
      }

      for (const cid of DUMMY_COURSE_IDS) {
        batch.delete(doc(db, 'courses', cid));
        needsCommit = true;
      }

      for (const tid of DUMMY_SLOT_IDS) {
        batch.delete(doc(db, 'timetable', tid));
        needsCommit = true;
      }

      batch.delete(doc(db, 'authorizedUsers', 'auth-2'));
      batch.delete(doc(db, 'authorizedUsers', 'auth-3'));
      needsCommit = true;

      // Load courses to backfill legacy courseAssigned text to assignedCourseIds when needed
      let catalogCourses: Course[] = [];
      try {
        const coursesSnap = await getDocs(collection(db, 'courses'));
        coursesSnap.forEach((d) => catalogCourses.push(d.data() as Course));
      } catch {}

      const authSnap = await getDocs(collection(db, 'authorizedUsers'));
      if (authSnap.empty) {
        INITIAL_AUTHORIZED_USERS.forEach((authUser) => {
          const cleanEmail = authUser.email.toLowerCase().trim();
          batch.set(doc(db, 'authorizedUsers', authUser.id), authUser);
          batch.set(doc(db, 'authorizedEmails', cleanEmail), {
            email: cleanEmail,
            name: authUser.name,
            role: authUser.role,
            department: authUser.department || 'Department of Information Technology',
            addedAt: authUser.addedAt
          });
          needsCommit = true;
        });
      } else {
        // Ensure every authorized user also has an email-indexed lookup doc for rule verification
        authSnap.forEach((d) => {
          const u = d.data() as AuthorizedUser;
          const cleanEmail = (u.email || '').toLowerCase().trim();
          if (
            cleanEmail &&
            cleanEmail !== 'dr.asante@uenr.edu.gh' &&
            cleanEmail !== 'classrep.it300@uenr.edu.gh' &&
            ['hod', 'lecturer', 'class_rep'].includes(u.role)
          ) {
            let resolvedIds = Array.isArray(u.assignedCourseIds) ? u.assignedCourseIds : undefined;
            if (u.role === 'lecturer' && !resolvedIds && u.courseAssigned && catalogCourses.length > 0) {
              const tokens = u.courseAssigned
                .split(/[,;/|]+/)
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean);
              resolvedIds = catalogCourses
                .filter((c) =>
                  tokens.some(
                    (tok) =>
                      c.id.toLowerCase() === tok ||
                      c.code.toLowerCase() === tok ||
                      c.title.toLowerCase() === tok ||
                      c.code.toLowerCase().includes(tok) ||
                      tok.includes(c.code.toLowerCase())
                  )
                )
                .map((c) => c.id);
              if (resolvedIds.length > 0) {
                batch.set(doc(db, 'authorizedUsers', u.id), { assignedCourseIds: resolvedIds }, { merge: true });
              }
            }

            batch.set(
              doc(db, 'authorizedEmails', cleanEmail),
              {
                email: cleanEmail,
                name: u.name || 'Academic Personnel',
                role: u.role,
                department: u.department || 'Department of Information Technology',
                ...(u.courseAssigned !== undefined ? { courseAssigned: u.courseAssigned } : {}),
                ...(resolvedIds !== undefined ? { assignedCourseIds: resolvedIds } : {}),
                addedAt: u.addedAt || new Date().toISOString().split('T')[0]
              },
              { merge: true }
            );
            needsCommit = true;
          }
        });
      }

      if (needsCommit) {
        await batch.commit();
      }
    } catch (error) {
      console.warn('[Firestore] Initialization check note:', error);
    } finally {
      setIsSyncing(false);
      isSeedingRef.current = false;
    }
  }, []);

  // Listen to Firebase Auth state & strictly verify authorization before exposing any data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      // Unauthenticated or anonymous QR-check-in sessions NEVER get staff portal access
      if (!user || user.isAnonymous) {
        setVerifiedRole(null);
        setVerifiedAssignedCourseIds(null);
        setIsAuthorized(false);
        setCurrentUserState(GUEST_USER);
        wipeUnauthorizedState();
        setIsAuthLoading(false);
        return;
      }

      setIsAuthLoading(true);
      setIsCloudConnected(true);

      const userEmail = (user.email || '').toLowerCase().trim();
      const isMasterHod = userEmail === MASTER_HOD_EMAIL.toLowerCase() && user.emailVerified !== false;

      let resolvedRole: UserRole | null = null;
      let resolvedName = user.displayName || (userEmail ? userEmail.split('@')[0] : 'Academic Staff');
      let resolvedDept = 'Department of Information Technology';
      let resolvedAssignedCourseIds: string[] | null = null;

      if (isMasterHod) {
        resolvedRole = 'hod';
        resolvedName = 'Jones Darko';
      } else if (userEmail && user.emailVerified) {
        try {
          const emailSnap = await getDoc(doc(db, 'authorizedEmails', userEmail));
          if (emailSnap.exists()) {
            const data = emailSnap.data() as {
              role?: UserRole;
              name?: string;
              department?: string;
              assignedCourseIds?: string[];
            };
            if (data.role && ['hod', 'lecturer', 'class_rep'].includes(data.role)) {
              resolvedRole = data.role;
              resolvedName = user.displayName || data.name || resolvedName;
              resolvedDept = data.department || resolvedDept;
              if (data.role === 'lecturer') {
                resolvedAssignedCourseIds = Array.isArray(data.assignedCourseIds)
                  ? data.assignedCourseIds.filter((cid) => typeof cid === 'string' && cid.trim().length > 0)
                  : [];
              }
            }
          }
        } catch (err) {
          console.warn('[Auth] Authorization lookup blocked or unavailable:', err);
        }
      }

      if (resolvedRole) {
        if (resolvedName === 'Dr. Jones Darko') {
          resolvedName = 'Jones Darko';
        }
        setVerifiedRole(resolvedRole);
        setVerifiedAssignedCourseIds(resolvedAssignedCourseIds);
        setIsAuthorized(true);
        setCurrentUserState({
          name: resolvedName,
          email: user.email || userEmail,
          role: resolvedRole,
          department: resolvedDept,
          ...(resolvedAssignedCourseIds ? { assignedCourseIds: resolvedAssignedCourseIds } : {}),
          photoURL: user.photoURL || undefined,
          uid: user.uid
        });
        setIsAuthLoading(false);
        await initializeFirestore(resolvedRole);
      } else {
        // Signed-in Google user is NOT on the HOD's authorized registry
        setVerifiedRole(null);
        setVerifiedAssignedCourseIds(null);
        setIsAuthorized(false);
        setCurrentUserState({
          name: user.displayName || 'Unauthorized Account',
          email: user.email || '',
          role: 'class_rep',
          department: ''
        });
        wipeUnauthorizedState();
        setIsAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, [initializeFirestore, wipeUnauthorizedState]);

  // Ref to latest checkInStudentWithIndex for processing student QR check-in tickets
  const checkInStudentWithIndexRef = useRef<
    (
      indexNumber: string,
      date: string,
      courseId: string,
      stream?: string,
      gpsMeta?: { gpsVerified?: boolean; distanceMeters?: number }
    ) => Promise<{
      success: boolean;
      message: string;
      student?: Student;
      course?: Course;
      stats?: { attended: number; total: number; percentage: number; isEligible: boolean };
      alreadyCheckedIn?: boolean;
    }>
  >(async () => ({ success: false, message: 'Initializing...' }));

  const processPendingQrTickets = useCallback(async () => {
    if (!isAuthorized) return;
    if (!hasStudentsSnapshotRef.current || !hasCoursesSnapshotRef.current || !hasAttendanceSnapshotRef.current) {
      return;
    }
    const queue = [...pendingQrTicketsRef.current];
    if (queue.length === 0) return;

    for (const ticket of queue) {
      const ticketId = ticket.id as string;
      const ticketCourseId = String(ticket.courseId || '');
      if (verifiedRole === 'lecturer' && !(verifiedAssignedCourseIds || []).includes(ticketCourseId)) {
        continue;
      }
      if (!ticketId || processedQrTicketsRef.current.has(ticketId)) continue;
      processedQrTicketsRef.current.add(ticketId);

      try {
        const res = await checkInStudentWithIndexRef.current(
          String(ticket.indexNumber || ''),
          String(ticket.date || ''),
          ticketCourseId,
          ticket.stream ? String(ticket.stream) : undefined,
          {
            gpsVerified: Boolean(ticket.gpsVerified),
            distanceMeters: typeof ticket.distanceMeters === 'number' ? ticket.distanceMeters : undefined
          }
        );

        await updateDoc(doc(db, 'qrCheckIns', ticketId), {
          status: res.success ? 'confirmed' : 'rejected',
          message: res.message,
          studentName: res.student?.name || null,
          studentIndex: res.student?.indexNumber || null,
          alreadyCheckedIn: Boolean(res.alreadyCheckedIn),
          stats: res.stats || null
        });
      } catch (err) {
        console.warn('[Firestore] Failed processing QR check-in ticket:', ticketId, err);
        processedQrTicketsRef.current.delete(ticketId);
      }
    }
  }, [isAuthorized, verifiedRole, verifiedAssignedCourseIds]);

  // Re-run pending QR tickets once snapshots hydrate
  useEffect(() => {
    if (isAuthorized && pendingQrTicketsRef.current.length > 0) {
      processPendingQrTickets();
    }
  }, [isAuthorized, students, courses, attendanceRecords, processPendingQrTickets]);

  // STRICTLY GATED Real-time Firestore Listeners: NEVER run unless isAuthorized === true
  useEffect(() => {
    if (!isAuthorized || !firebaseUser || firebaseUser.isAnonymous || !verifiedRole) {
      return;
    }

    const isLecturer = verifiedRole === 'lecturer';
    const allowedIds = (verifiedAssignedCourseIds || []).slice(0, 30);

    // Hydrate offline fallback cache (filtered by assigned courses for Lecturers)
    try {
      const savedStudents = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (savedStudents) {
        const parsed: Student[] = JSON.parse(savedStudents);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setStudents(deduplicateStudents(parsed));
        }
      }
      const offlineSnapshot = loadTimetableFromOfflineStorage();
      if (offlineSnapshot && offlineSnapshot.courses?.length > 0) {
        setCourses(
          isLecturer
            ? offlineSnapshot.courses.filter((c: Course) => allowedIds.includes(c.id))
            : offlineSnapshot.courses
        );
        setTimetable(
          isLecturer
            ? offlineSnapshot.timetable.filter((t: TimetableSlot) => allowedIds.includes(t.courseId))
            : offlineSnapshot.timetable
        );
      } else {
        const savedCourses = localStorage.getItem(STORAGE_KEYS.COURSES);
        if (savedCourses) {
          const parsedCourses: Course[] = JSON.parse(savedCourses);
          setCourses(isLecturer ? parsedCourses.filter((c) => allowedIds.includes(c.id)) : parsedCourses);
        }
        const savedTimetable = localStorage.getItem(STORAGE_KEYS.TIMETABLE);
        if (savedTimetable) {
          const parsedSlots: TimetableSlot[] = JSON.parse(savedTimetable);
          setTimetable(isLecturer ? parsedSlots.filter((t) => allowedIds.includes(t.courseId)) : parsedSlots);
        }
      }
      const savedAtt = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
      if (savedAtt) {
        const parsedAtt: AttendanceRecord[] = JSON.parse(savedAtt);
        setAttendanceRecords(isLecturer ? parsedAtt.filter((r) => allowedIds.includes(r.courseId)) : parsedAtt);
      }
      const savedCancelled = localStorage.getItem(STORAGE_KEYS.CANCELLED_CLASSES);
      if (savedCancelled) {
        const parsedCancelled: CancelledClass[] = JSON.parse(savedCancelled);
        setCancelledClasses(isLecturer ? parsedCancelled.filter((c) => allowedIds.includes(c.courseId)) : parsedCancelled);
      }
      const savedLogs = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (savedLogs) setAuditLogs(JSON.parse(savedLogs));
      const savedAuth = localStorage.getItem(STORAGE_KEYS.AUTHORIZED);
      if (savedAuth) setAuthorizedUsers(JSON.parse(savedAuth));
    } catch {}

    setIsSyncing(true);
    setCloudSyncError(null);

    // 1. Students Listener
    const unsubStudents = onSnapshot(
      collection(db, 'students'),
      (snapshot) => {
        hasStudentsSnapshotRef.current = true;
        const list: Student[] = [];
        snapshot.forEach((d) => {
          const s = d.data() as Student;
          if (!['std-1', 'std-2', 'std-3', 'std-4', 'std-5', 'std-6', 'std-7', 'std-8', 'std-9', 'std-10', 'std-11', 'std-12'].includes(s.id)) {
            const idxSlug = (s.indexNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const emailPrefix = (s.email || '').toLowerCase().split('@')[0];
            const cleanEmail = (!s.email || emailPrefix === idxSlug)
              ? generateInstitutionalEmail(s.name, s.indexNumber)
              : s.email;
            list.push({ ...s, email: cleanEmail });
          }
        });

        if (list.length > 0) {
          setStudents((currentLocal) => {
            if (isClearingRosterRef.current) return [];
            const cloudIndexMap = new Map<string, Student>();
            list.forEach((s) => cloudIndexMap.set(s.indexNumber.toUpperCase().trim(), s));

            const combined: Student[] = [...list];
            currentLocal.forEach((loc) => {
              const locKey = loc.indexNumber.toUpperCase().trim();
              if (!cloudIndexMap.has(locKey)) {
                combined.push(loc);
              }
            });
            return deduplicateStudents(combined);
          });
        } else {
          setStudents((currentLocal) => {
            if (currentLocal.length > 0 && !isClearingRosterRef.current) {
              const batch = writeBatch(db);
              currentLocal.slice(0, 450).forEach((st) => {
                batch.set(doc(db, 'students', st.id), st);
              });
              batch.commit().catch(() => {});
              return deduplicateStudents(currentLocal);
            }
            return [];
          });
        }
        setIsSyncing(false);
        setIsCloudConnected(true);
      },
      (error) => {
        setIsSyncing(false);
        setCloudSyncError('Failed to synchronize students');
        console.warn('[Firestore] Students listener sync notice:', error);
      }
    );

    // 2. Courses Listener (scoped via `in` query for Lecturers)
    let unsubCourses = () => {};
    if (isLecturer && allowedIds.length === 0) {
      hasCoursesSnapshotRef.current = true;
      setCourses([]);
    } else {
      const coursesQuery = isLecturer
        ? query(collection(db, 'courses'), where('id', 'in', allowedIds))
        : collection(db, 'courses');

      unsubCourses = onSnapshot(
        coursesQuery,
        (snapshot) => {
          hasCoursesSnapshotRef.current = true;
          const list: Course[] = [];
          snapshot.forEach((d) => {
            const c = d.data() as Course;
            if (!DUMMY_COURSE_IDS.includes(c.id)) {
              list.push(c);
            }
          });
          if (list.length > 0) {
            setCourses(list);
          } else if (verifiedRole === 'hod') {
            setCourses((current) => {
              if (current.length > 0) {
                const batch = writeBatch(db);
                current.forEach((c) => batch.set(doc(db, 'courses', c.id), c));
                batch.commit().catch(() => {});
                return current;
              }
              return OFFICIAL_L200_COURSES;
            });
          } else {
            setCourses([]);
          }
        },
        (error) => {
          console.warn('[Firestore] Courses listener sync notice:', error);
        }
      );
    }

    // 3. Timetable Listener (scoped via `in` query for Lecturers)
    let unsubTimetable = () => {};
    if (isLecturer && allowedIds.length === 0) {
      setTimetable([]);
    } else {
      const timetableQuery = isLecturer
        ? query(collection(db, 'timetable'), where('courseId', 'in', allowedIds))
        : collection(db, 'timetable');

      unsubTimetable = onSnapshot(
        timetableQuery,
        (snapshot) => {
          const list: TimetableSlot[] = [];
          snapshot.forEach((d) => {
            const t = d.data() as TimetableSlot;
            if (!DUMMY_SLOT_IDS.includes(t.id) && !DUMMY_COURSE_IDS.includes(t.courseId)) {
              list.push(t);
            }
          });
          if (list.length > 0) {
            setTimetable(list);
          } else if (verifiedRole === 'hod') {
            setTimetable((current) => {
              if (current.length > 0) {
                const batch = writeBatch(db);
                current.forEach((t) => batch.set(doc(db, 'timetable', t.id), t));
                batch.commit().catch(() => {});
                return current;
              }
              return OFFICIAL_L200_TIMETABLE;
            });
          } else {
            setTimetable([]);
          }
        },
        (error) => {
          console.warn('[Firestore] Timetable listener sync notice:', error);
        }
      );
    }

    // 4. Attendance Listener (scoped via `in` query for Lecturers)
    let unsubAttendance = () => {};
    if (isLecturer && allowedIds.length === 0) {
      hasAttendanceSnapshotRef.current = true;
      setAttendanceRecords([]);
    } else {
      const attendanceQuery = isLecturer
        ? query(collection(db, 'attendance'), where('courseId', 'in', allowedIds))
        : collection(db, 'attendance');

      unsubAttendance = onSnapshot(
        attendanceQuery,
        (snapshot) => {
          hasAttendanceSnapshotRef.current = true;
          const list: AttendanceRecord[] = [];
          snapshot.forEach((d) => list.push(d.data() as AttendanceRecord));
          setAttendanceRecords(list);
        },
        (error) => {
          console.warn('[Firestore] Attendance listener sync notice:', error);
        }
      );
    }

    // 4b. Cancelled Classes Listener (scoped via `in` query for Lecturers)
    let unsubCancelled = () => {};
    if (isLecturer && allowedIds.length === 0) {
      setCancelledClasses([]);
    } else {
      const cancelledQuery = isLecturer
        ? query(collection(db, 'cancelledClasses'), where('courseId', 'in', allowedIds))
        : collection(db, 'cancelledClasses');

      unsubCancelled = onSnapshot(
        cancelledQuery,
        (snapshot) => {
          const list: CancelledClass[] = [];
          snapshot.forEach((d) => list.push(d.data() as CancelledClass));
          setCancelledClasses(list);
        },
        (error) => {
          console.warn('[Firestore] Cancelled classes listener sync notice:', error);
        }
      );
    }

    // 5. Audit Logs Listener
    const unsubLogs = onSnapshot(
      collection(db, 'auditLogs'),
      (snapshot) => {
        if (!snapshot.empty) {
          const list: AuditLog[] = [];
          snapshot.forEach((d) => list.push(d.data() as AuditLog));
          list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setAuditLogs(list);
        }
      },
      (error) => {
        console.warn('[Firestore] Audit logs sync notice:', error);
      }
    );

    // 6. Authorized Users Listener (with real-time revocation & live course-assignment sync)
    const unsubAuthUsers = onSnapshot(
      collection(db, 'authorizedUsers'),
      (snapshot) => {
        const list: AuthorizedUser[] = [];
        snapshot.forEach((d) => {
          const u = d.data() as AuthorizedUser;
          if (
            u.id === 'auth-3' ||
            u.email?.toLowerCase() === 'classrep.it300@uenr.edu.gh' ||
            u.name?.toLowerCase().includes('kofi mensah') ||
            u.id === 'auth-2' ||
            u.email?.toLowerCase() === 'dr.asante@uenr.edu.gh'
          ) {
            if (verifiedRole === 'hod') {
              deleteDoc(doc(db, 'authorizedUsers', d.id)).catch(() => {});
            }
            return;
          }
          list.push(u);
        });
        setAuthorizedUsers(list.length > 0 ? list : INITIAL_AUTHORIZED_USERS);

        // If a non-master user was just revoked or had assigned courses updated while logged in, sync immediately
        const activeEmail = (firebaseUser.email || '').toLowerCase().trim();
        if (list.length > 0 && activeEmail && activeEmail !== MASTER_HOD_EMAIL.toLowerCase()) {
          const matchedUser = list.find((u) => u.email.toLowerCase().trim() === activeEmail);
          if (!matchedUser) {
            setVerifiedRole(null);
            setVerifiedAssignedCourseIds(null);
            setIsAuthorized(false);
            wipeUnauthorizedState();
          } else if (matchedUser.role === 'lecturer') {
            const nextIds = Array.isArray(matchedUser.assignedCourseIds)
              ? matchedUser.assignedCourseIds.filter((cid) => typeof cid === 'string' && cid.trim().length > 0)
              : [];
            const nextKey = [...nextIds].sort().join(',');
            if (nextKey !== verifiedAssignedCourseIdsKey) {
              setVerifiedAssignedCourseIds(nextIds);
              setCurrentUserState((prev) => ({ ...prev, assignedCourseIds: nextIds }));
            }
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'authorizedUsers');
      }
    );

    // 7. Auto Logging & Automation Settings Listener
    const unsubSettings = onSnapshot(
      doc(db, 'systemSettings', 'autoLogging'),
      (snapshot) => {
        if (snapshot.exists()) {
          const cloudData = snapshot.data() as Partial<AutoLoggingSettings>;
          setAutoLoggingSettings((prev) => ({ ...prev, ...cloudData }));
        }
      },
      (error) => {
        console.warn('[Firestore] System settings listen notice:', error);
      }
    );

    // 7b. GPS Geofence Configuration Listener
    const unsubGeofence = onSnapshot(
      doc(db, 'systemSettings', 'geofence'),
      (snapshot) => {
        if (snapshot.exists()) {
          const cloudGeo = snapshot.data() as Partial<GpsGeofenceSettings>;
          setGeofenceSettings((prev) => {
            const merged = { ...prev, ...cloudGeo };
            try {
              localStorage.setItem('uenr_geofence_settings', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      },
      (error) => {
        console.warn('[Firestore] Geofence settings listen notice:', error);
      }
    );

    // 8. Student QR Check-In Queue Listener (processes student check-in tickets securely)
    const unsubQrCheckIns = onSnapshot(
      query(collection(db, 'qrCheckIns'), where('status', '==', 'pending')),
      (snapshot) => {
        const pending: Array<Record<string, any>> = [];
        snapshot.forEach((d) => {
          pending.push({ id: d.id, ...d.data() });
        });
        pendingQrTicketsRef.current = pending;
        if (pending.length > 0) {
          processPendingQrTickets();
        }
      },
      (error) => {
        console.warn('[Firestore] QR Check-in queue notice:', error);
      }
    );

    return () => {
      unsubStudents();
      unsubCourses();
      unsubTimetable();
      unsubAttendance();
      unsubCancelled();
      unsubLogs();
      unsubAuthUsers();
      unsubSettings();
      unsubGeofence();
      unsubQrCheckIns();
    };
  }, [isAuthorized, firebaseUser, verifiedRole, verifiedAssignedCourseIdsKey, wipeUnauthorizedState, processPendingQrTickets]);

  // Auth Actions
  const loginWithGoogle = async (forcePrompt = false) => {
    try {
      await signInWithGoogle(forcePrompt);
    } catch (err) {
      console.error('Sign-in failed:', err);
      throw err;
    }
  };

  const switchAccount = async () => {
    try {
      wipeUnauthorizedState();
      setVerifiedRole(null);
      setIsAuthorized(false);
      await logOut();
      await signInWithGoogle(true);
    } catch (err) {
      console.error('Switch account failed:', err);
      throw err;
    }
  };

  const logoutUser = async () => {
    try {
      wipeUnauthorizedState();
      setVerifiedRole(null);
      setIsAuthorized(false);
      setCurrentUserState(GUEST_USER);
      await logOut();
    } catch (err) {
      console.error('Logout failed:', err);
      throw err;
    }
  };

  // Manage Authorized Users (HOD can assign Lecturer & Class Rep; Lecturer can assign Class Rep ONLY)
  const addAuthorizedUser = async (userData: Omit<AuthorizedUser, 'id' | 'addedAt'>) => {
    if (verifiedRole === 'class_rep' || currentUser.role === 'class_rep') {
      alert('Class Representatives do not have permission to authorize or assign personnel.');
      return;
    }
    if ((verifiedRole === 'lecturer' || currentUser.role === 'lecturer') && userData.role !== 'class_rep') {
      alert('Course Lecturers are only authorized to assign Class Representatives.');
      return;
    }

    const cleanEmail = userData.email.toLowerCase().trim();
    const id = `auth-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const addedAt = new Date().toISOString().split('T')[0];

    const newUser: AuthorizedUser = {
      id,
      name: userData.name.trim(),
      email: cleanEmail,
      role: userData.role,
      department: userData.department || 'Department of Information Technology',
      ...(userData.courseAssigned ? { courseAssigned: userData.courseAssigned } : {}),
      ...(Array.isArray(userData.assignedCourseIds) ? { assignedCourseIds: userData.assignedCourseIds } : {}),
      ...(userData.level ? { level: userData.level } : {}),
      ...(userData.stream ? { stream: userData.stream } : {}),
      addedAt
    };

    setAuthorizedUsers((prev) => {
      const filtered = prev.filter((u) => u.email.toLowerCase() !== cleanEmail);
      return [...filtered, newUser];
    });

    await addAuditLog(
      'Authorized Personnel Added',
      `Assigned by ${currentUser.name} (${currentUser.role.toUpperCase()}): Granted ${newUser.role.toUpperCase()} access to ${newUser.name} (${cleanEmail})${newUser.courseAssigned ? ` [${newUser.courseAssigned}]` : ''}`,
      'timetable'
    );

    if (isAuthorized && firebaseUser && !firebaseUser.isAnonymous) {
      try {
        await setDoc(doc(db, 'authorizedUsers', newUser.id), newUser);
        await setDoc(doc(db, 'authorizedEmails', cleanEmail), {
          email: cleanEmail,
          name: newUser.name,
          role: newUser.role,
          department: newUser.department || 'Department of Information Technology',
          ...(newUser.courseAssigned ? { courseAssigned: newUser.courseAssigned } : {}),
          ...(Array.isArray(newUser.assignedCourseIds) ? { assignedCourseIds: newUser.assignedCourseIds } : {}),
          addedAt
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `authorizedUsers/${newUser.id}`);
      }
    }
  };

  const updateAuthorizedUser = async (
    id: string,
    updates: Partial<Omit<AuthorizedUser, 'id' | 'email' | 'addedAt'>>
  ) => {
    if (verifiedRole !== 'hod') {
      alert('Only the Head of Department (HOD) can update staff assignments.');
      return;
    }

    const existing = authorizedUsers.find((u) => u.id === id);
    if (!existing) return;

    const cleanEmail = existing.email.toLowerCase().trim();
    const rawUpdated: AuthorizedUser = {
      ...existing,
      ...updates,
      ...(updates.name ? { name: updates.name.trim() } : {})
    };

    if (rawUpdated.role !== 'lecturer') {
      delete rawUpdated.assignedCourseIds;
      delete rawUpdated.courseAssigned;
    }
    if (rawUpdated.role !== 'class_rep') {
      delete rawUpdated.level;
      delete rawUpdated.stream;
    }

    const updatedUser = Object.fromEntries(
      Object.entries(rawUpdated).filter(([, v]) => v !== undefined)
    ) as AuthorizedUser;

    setAuthorizedUsers((prev) => prev.map((u) => (u.id === id ? updatedUser : u)));

    await addAuditLog(
      'Personnel Assignment Updated',
      `Updated ${updatedUser.name} (${cleanEmail}) role=${updatedUser.role.toUpperCase()}${updatedUser.courseAssigned ? ` · Courses: ${updatedUser.courseAssigned}` : ''}`,
      'security'
    );

    if (isAuthorized && firebaseUser && !firebaseUser.isAnonymous) {
      try {
        await setDoc(doc(db, 'authorizedUsers', id), updatedUser);
        await setDoc(doc(db, 'authorizedEmails', cleanEmail), {
          email: cleanEmail,
          name: updatedUser.name,
          role: updatedUser.role,
          department: updatedUser.department || 'Department of Information Technology',
          ...(updatedUser.courseAssigned !== undefined ? { courseAssigned: updatedUser.courseAssigned } : {}),
          ...(updatedUser.assignedCourseIds !== undefined ? { assignedCourseIds: updatedUser.assignedCourseIds } : {}),
          addedAt: updatedUser.addedAt || new Date().toISOString().split('T')[0]
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `authorizedUsers/${id}`);
      }
    }
  };

  const removeAuthorizedUser = async (id: string) => {
    const toRemove = authorizedUsers.find((u) => u.id === id);
    if (toRemove?.email.toLowerCase() === MASTER_HOD_EMAIL.toLowerCase()) {
      alert('Cannot remove the primary Head of Department (HOD) account.');
      return;
    }

    if (verifiedRole === 'class_rep' || currentUser.role === 'class_rep') {
      alert('Class Representatives do not have permission to revoke personnel access.');
      return;
    }
    if ((verifiedRole === 'lecturer' || currentUser.role === 'lecturer') && toRemove?.role !== 'class_rep') {
      alert('Course Lecturers can only revoke Class Representatives.');
      return;
    }

    setAuthorizedUsers((prev) => prev.filter((u) => u.id !== id));
    if (toRemove) {
      await addAuditLog(
        'Access Revoked',
        `Revoked by ${currentUser.name} (${currentUser.role.toUpperCase()}): Revoked ${toRemove.role.toUpperCase()} access for ${toRemove.name} (${toRemove.email})`,
        'timetable'
      );
    }

    if (isAuthorized && firebaseUser && !firebaseUser.isAnonymous) {
      try {
        await deleteDoc(doc(db, 'authorizedUsers', id));
        if (toRemove?.email) {
          await deleteDoc(doc(db, 'authorizedEmails', toRemove.email.toLowerCase().trim()));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `authorizedUsers/${id}`);
      }
    }
  };

  // Audit Log Action
  const addAuditLog = async (action: string, details: string, type: AuditLog['type']) => {
    const newLog: AuditLog = {
      id: `log-${Date.now()}`,
      action,
      details,
      timestamp: new Date().toISOString(),
      user: currentUser.email || currentUser.name,
      type
    };

    setAuditLogs((prev) => [newLog, ...prev]);

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'auditLogs', newLog.id), newLog);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `auditLogs/${newLog.id}`);
      }
    }
  };

  // Student Actions
  const addStudent = async (studentData: Omit<Student, 'id' | 'createdAt' | 'enrolledFingers'>) => {
    const rawIdx = (studentData.indexNumber || '').toUpperCase().trim().slice(0, 30);
    const cleanName = (studentData.name || '').trim().slice(0, 100);
    if (!rawIdx || !cleanName) return;

    const cleanEmail = (
      studentData.email?.trim() ||
      generateInstitutionalEmail(cleanName, rawIdx)
    ).slice(0, 100);
    const safeDocId = `std-${rawIdx.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now().toString(36)}`;

    const newStudent: Student = {
      ...studentData,
      id: safeDocId,
      name: cleanName,
      indexNumber: rawIdx,
      email: cleanEmail,
      program: (studentData.program || 'BSc Information Technology').slice(0, 100),
      level: (studentData.level || 'Level 100').slice(0, 30),
      stream: (studentData.stream || 'IT A').slice(0, 30),
      enrolledFingers: [],
      createdAt: new Date().toISOString().split('T')[0]
    };

    setStudents((prev) => {
      const updated = sortAlphabetically([...prev, newStudent]);
      try {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(updated));
      } catch (e) {
        console.warn('LocalStorage save notice:', e);
      }
      return updated;
    });

    await addAuditLog('Student Enrolled', `Added ${newStudent.name} (${newStudent.indexNumber}) to class roster`, 'student');

    try {
      await setDoc(doc(db, 'students', newStudent.id), newStudent);
    } catch (error) {
      console.warn('[Firestore] Add student notice:', error);
    }
  };

  const batchAddStudents = async (
    incoming: Array<{ name: string; indexNumber: string; email?: string; stream?: string; level?: string; program?: string }>,
    options?: { clearExisting?: boolean; updateDuplicates?: boolean }
  ): Promise<number> => {
    const clearExisting = options?.clearExisting || false;
    const updateDuplicates = options?.updateDuplicates ?? true;

    // Collect base students
    let baseStudents: Student[] = clearExisting ? [] : students;
    if (!clearExisting) {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.STUDENTS);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > baseStudents.length) {
            baseStudents = parsed;
          }
        }
      } catch {
        // ignore
      }
    }

    const existingMap = new Map<string, Student>();
    baseStudents.forEach((s) => existingMap.set(s.indexNumber.toUpperCase().trim(), s));

    const finalRoster: Student[] = clearExisting ? [] : [...baseStudents];
    const docsToSaveInCloud: Student[] = [];
    let addedCount = 0;
    let updatedCount = 0;

    incoming.forEach((item, idx) => {
      const rawName = (item.name || '').trim();
      const rawIdx = (item.indexNumber || '').toUpperCase().trim();
      if (!rawName || !rawIdx) return;

      const cleanIdx = rawIdx.slice(0, 30);
      const cleanName = rawName.slice(0, 100);
      const cleanEmail = (
        item.email?.trim() ||
        generateInstitutionalEmail(cleanName, cleanIdx)
      ).slice(0, 100);

      const existingStudent = existingMap.get(cleanIdx);

      if (existingStudent) {
        if (updateDuplicates) {
          // Update properties if provided
          existingStudent.name = cleanName;
          if (item.level) existingStudent.level = item.level.slice(0, 30);
          if (item.stream) existingStudent.stream = item.stream.slice(0, 30);
          if (item.program) existingStudent.program = item.program.slice(0, 100);
          if (item.email) {
            existingStudent.email = cleanEmail;
          } else {
            const currentPrefix = (existingStudent.email || '').toLowerCase().split('@')[0];
            const idxSlug = cleanIdx.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!existingStudent.email || currentPrefix === idxSlug) {
              existingStudent.email = generateInstitutionalEmail(cleanName, cleanIdx);
            }
          }
          docsToSaveInCloud.push(existingStudent);
          updatedCount++;
        }
      } else {
        // Safe Firestore document ID conforming to isValidId: alphanumeric and hyphens
        const safeDocId = `std-${cleanIdx.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now().toString(36)}-${idx}`;
        const newStudent: Student = {
          id: safeDocId,
          name: cleanName,
          indexNumber: cleanIdx,
          email: cleanEmail,
          program: (item.program || 'BSc Information Technology').slice(0, 100),
          level: (item.level || 'Level 100').slice(0, 30),
          stream: (item.stream || 'IT A').slice(0, 30),
          enrolledFingers: [],
          createdAt: new Date().toISOString().split('T')[0]
        };

        existingMap.set(cleanIdx, newStudent);
        finalRoster.push(newStudent);
        docsToSaveInCloud.push(newStudent);
        addedCount++;
      }
    });

    if (docsToSaveInCloud.length > 0 || clearExisting) {
      // 1. Immediately update React state & localStorage for zero UI lag (sorted alphabetically and deduplicated)
      const sorted = deduplicateStudents(finalRoster);
      setStudents(sorted);
      try {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(sorted));
      } catch (e) {
        console.warn('LocalStorage save notice:', e);
      }

      await addAuditLog(
        'Batch Import',
        `Imported ${addedCount} student(s) into class roster (${updatedCount} updated)`,
        'student'
      );

      // 2. Persist to Firestore in safe chunked batches of 250 (Firestore limit is 500)
      try {
        if (clearExisting && baseStudents.length > 0) {
          for (let i = 0; i < baseStudents.length; i += 250) {
            const chunk = baseStudents.slice(i, i + 250);
            const batch = writeBatch(db);
            chunk.forEach((s) => batch.delete(doc(db, 'students', s.id)));
            await batch.commit();
          }
        }

        const CHUNK_SIZE = 250;
        for (let i = 0; i < docsToSaveInCloud.length; i += CHUNK_SIZE) {
          const chunk = docsToSaveInCloud.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach((student) => {
            batch.set(doc(db, 'students', student.id), student);
          });
          await batch.commit();
        }
        console.log(`[Firestore] Committed ${docsToSaveInCloud.length} batch students to Cloud Firestore.`);
      } catch (error) {
        console.warn('[Firestore] Batch save notice, data preserved in local storage:', error);
        setCloudSyncError('Cloud sync notice: Students stored locally, will sync to cloud.');
      }
    }
    return addedCount + updatedCount;
  };

  const updateStudent = async (id: string, updates: Partial<Student>) => {
    setStudents((prev) => {
      const updated = sortAlphabetically(prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
      try {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(updated));
      } catch (e) {
        console.warn('LocalStorage save notice:', e);
      }
      return updated;
    });

    const targetStudent = students.find((s) => s.id === id);
    if (targetStudent) {
      await addAuditLog('Student Updated', `Updated details for ${updates.name || targetStudent.name} (${updates.indexNumber || targetStudent.indexNumber})`, 'student');
    }

    try {
      await updateDoc(doc(db, 'students', id), updates);
    } catch (error) {
      console.warn(`[Firestore] Update student notice for ${id}:`, error);
    }
  };

  const batchUpdateStudents = async (
    studentIds: string[],
    updates: Partial<Pick<Student, 'level' | 'stream' | 'program'>>
  ): Promise<number> => {
    if (studentIds.length === 0) return 0;
    const targetSet = new Set(studentIds);

    setStudents((prev) => {
      const updated = sortAlphabetically(prev.map((s) => (targetSet.has(s.id) ? { ...s, ...updates } : s)));
      try {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(updated));
      } catch (e) {
        console.warn('LocalStorage save notice:', e);
      }
      return updated;
    });

    const changesText = Object.entries(updates)
      .map(([k, v]) => `${k} -> ${v}`)
      .join(', ');
    await addAuditLog('Batch Student Update', `Updated ${studentIds.length} student(s): ${changesText}`, 'student');

    try {
      const CHUNK_SIZE = 250;
      for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
        const chunk = studentIds.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((id) => {
          batch.update(doc(db, 'students', id), updates);
        });
        await batch.commit();
      }
    } catch (error) {
      console.warn('[Firestore] Batch student update notice:', error);
    }
    return studentIds.length;
  };

  const batchPromoteStudents = async (
    fromLevel: string,
    toLevel: string,
    streamFilter?: string
  ): Promise<number> => {
    const matching = students.filter((s) => {
      const matchLvl = (s.level || 'Level 100') === fromLevel;
      const matchStrm = !streamFilter || streamFilter === 'all' || (s.stream || 'IT A') === streamFilter;
      return matchLvl && matchStrm;
    });

    if (matching.length === 0) return 0;
    const ids = matching.map((s) => s.id);
    return await batchUpdateStudents(ids, { level: toLevel });
  };

  const promoteAllLevels = async (): Promise<{ count: number }> => {
    const progressionMap: Record<string, string> = {
      'Level 100': 'Level 200',
      'Level 200': 'Level 300',
      'Level 300': 'Level 400',
      'Level 400': 'Alumni / Completed'
    };

    let updatedCount = 0;
    const updated = students.map((s) => {
      const curr = s.level || 'Level 100';
      const next = progressionMap[curr];
      if (next) {
        updatedCount++;
        return { ...s, level: next };
      }
      return s;
    });

    if (updatedCount > 0) {
      const sorted = sortAlphabetically(updated);
      setStudents(sorted);
      try {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(sorted));
      } catch (e) {}

      await addAuditLog('Academic Progression', `Promoted ${updatedCount} students across levels`, 'student');

      try {
        const CHUNK_SIZE = 250;
        for (let i = 0; i < updated.length; i += CHUNK_SIZE) {
          const chunk = updated.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach((s) => {
            batch.update(doc(db, 'students', s.id), { level: s.level });
          });
          await batch.commit();
        }
      } catch (err) {
        console.warn('[Firestore] Batch promote notice:', err);
      }
    }
    return { count: updatedCount };
  };

  const removeStudent = async (id: string) => {
    const student = students.find((s) => s.id === id);
    setStudents((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      try {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(filtered));
      } catch (e) {}
      return filtered;
    });
    if (student) {
      await addAuditLog('Student Removed', `Removed ${student.name} (${student.indexNumber}) from class roster`, 'student');
    }

    try {
      await deleteDoc(doc(db, 'students', id));
    } catch (error) {
      console.warn(`[Firestore] Remove student notice for ${id}:`, error);
    }
  };

  // Delete students specifically by Level, Stream, or an array of student IDs
  const deleteStudentsByFilter = async (filter: { level?: string; stream?: string; ids?: string[] }): Promise<number> => {
    let toDeleteIds: string[] = [];
    if (filter.ids && filter.ids.length > 0) {
      toDeleteIds = filter.ids;
    } else {
      toDeleteIds = students
        .filter((s) => {
          const matchLevel = !filter.level || filter.level === 'all' || (s.level || 'Level 100') === filter.level;
          const matchStream = !filter.stream || filter.stream === 'all' || (s.stream || 'IT A') === filter.stream;
          return matchLevel && matchStream;
        })
        .map((s) => s.id);
    }

    if (toDeleteIds.length === 0) return 0;

    const count = toDeleteIds.length;
    const deleteSet = new Set(toDeleteIds);
    setStudents((prev) => {
      const remaining = prev.filter((s) => !deleteSet.has(s.id));
      try {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(remaining));
      } catch (e) {}
      return remaining;
    });

    const descParts: string[] = [];
    if (filter.level && filter.level !== 'all') descParts.push(filter.level);
    if (filter.stream && filter.stream !== 'all') descParts.push(filter.stream);
    const scopeDesc = descParts.length > 0 ? descParts.join(' ') : `${count} students`;

    await addAuditLog('Cohort Purged', `Deleted ${count} student records in ${scopeDesc}`, 'student');

    try {
      const CHUNK_SIZE = 250;
      for (let i = 0; i < toDeleteIds.length; i += CHUNK_SIZE) {
        const chunk = toDeleteIds.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((id) => {
          batch.delete(doc(db, 'students', id));
        });
        await batch.commit();
      }
    } catch (error) {
      console.warn('[Firestore] Batch delete error:', error);
    }

    return count;
  };

  // Clear all students so user has a completely blank slate for their class
  const clearAllStudents = async () => {
    isClearingRosterRef.current = true;
    const count = students.length;
    setStudents([]);
    try {
      localStorage.removeItem(STORAGE_KEYS.STUDENTS);
    } catch {}

    try {
      const snap = await getDocs(collection(db, 'students'));
      const batch = writeBatch(db);
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch (error) {
      console.warn('[Firestore] Clear students notice:', error);
    }

    await addAuditLog('Class Roster Cleared', `Cleared all ${count} student records from class roster`, 'student');
    setTimeout(() => {
      isClearingRosterRef.current = false;
    }, 2000);
  };

  const enrollStudentFingers = async (id: string, fingers: string[]) => {
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, enrolledFingers: fingers } : s)));
    const student = students.find((s) => s.id === id);
    if (student) {
      await addAuditLog('Biometrics Enrolled', `Enrolled ${fingers.length} finger(s) for ${student.name} (${student.indexNumber})`, 'biometric');
    }

    try {
      await updateDoc(doc(db, 'students', id), { enrolledFingers: fingers });
    } catch (error) {
      console.warn(`[Firestore] Enroll fingers notice for ${id}:`, error);
    }
  };

  const updateAllStudentEmailsToNameBased = async (): Promise<number> => {
    let count = 0;
    const batch = writeBatch(db);
    const updated = students.map((s) => {
      const idxSlug = (s.indexNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cur = (s.email || '').toLowerCase().trim();
      const isIndexBased =
        !cur ||
        cur === `${idxSlug}@uenr.edu.gh` ||
        cur.startsWith(idxSlug) ||
        cur === 'student@uenr.edu.gh';

      if (isIndexBased && s.name && s.name.trim()) {
        const newEmail = generateInstitutionalEmail(s.name, s.indexNumber);
        if (newEmail !== cur) {
          count++;
          const mod = { ...s, email: newEmail };
          batch.set(doc(db, 'students', s.id), mod, { merge: true });
          return mod;
        }
      }
      return s;
    });

    if (count > 0) {
      setStudents(updated);
      try {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(updated));
      } catch (e) {
        console.warn('LocalStorage save notice:', e);
      }
      try {
        await batch.commit();
      } catch (err) {
        console.warn('[Firestore] Batch commit email notice:', err);
      }
      await addAuditLog('Emails Updated', `Updated ${count} student email(s) to official name-based format`, 'student');
    }
    return count;
  };

  // Course Actions (HOD only)
  const addCourse = async (courseData: Omit<Course, 'id'>) => {
    if (verifiedRole !== 'hod') {
      alert('Only the Head of Department (HOD) can add department courses.');
      return;
    }
    const newCourse: Course = {
      ...courseData,
      id: `crs-${Date.now()}`
    };
    setCourses((prev) => [...prev, newCourse]);
    await addAuditLog('Course Added', `Added course ${newCourse.code} - ${newCourse.title}`, 'timetable');

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'courses', newCourse.id), newCourse);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `courses/${newCourse.id}`);
      }
    }
  };

  const updateCourse = async (id: string, updates: Partial<Course>) => {
    if (verifiedRole !== 'hod') {
      alert('Only the Head of Department (HOD) can modify course details.');
      return;
    }
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    await addAuditLog('Course Updated', `Updated course ${updates.code || id}`, 'timetable');

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'courses', id), updates);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `courses/${id}`);
      }
    }
  };

  const removeCourse = async (id: string) => {
    if (verifiedRole !== 'hod') {
      alert('Only the Head of Department (HOD) can remove courses.');
      return;
    }
    const course = courses.find((c) => c.id === id);
    setCourses((prev) => prev.filter((c) => c.id !== id));
    setTimetable((prev) => prev.filter((t) => t.courseId !== id));
    if (course) {
      await addAuditLog('Course Removed', `Deleted course ${course.code}`, 'timetable');
    }

    if (firebaseUser) {
      try {
        await deleteDoc(doc(db, 'courses', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `courses/${id}`);
      }
    }
  };

  const clearAllCourses = async () => {
    if (verifiedRole !== 'hod') {
      alert('Only the Head of Department (HOD) can clear all courses.');
      return;
    }
    const count = courses.length;
    setCourses([]);
    setTimetable([]);
    localStorage.removeItem(STORAGE_KEYS.COURSES);
    localStorage.removeItem(STORAGE_KEYS.TIMETABLE);

    if (firebaseUser) {
      try {
        const cSnap = await getDocs(collection(db, 'courses'));
        const tSnap = await getDocs(collection(db, 'timetable'));
        const batch = writeBatch(db);
        cSnap.forEach((d) => batch.delete(d.ref));
        tSnap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'courses');
      }
    }

    await addAuditLog('Courses Cleared', `Cleared all ${count} courses and their schedules`, 'timetable');
  };

  // Timetable Actions (Lecturers restricted to assigned courses)
  const addTimetableSlot = async (slotData: Omit<TimetableSlot, 'id'>) => {
    if (verifiedRole === 'lecturer' && !(verifiedAssignedCourseIds || []).includes(slotData.courseId)) {
      alert('You can only schedule lecture slots for your assigned courses.');
      return;
    }
    const newSlot: TimetableSlot = {
      ...slotData,
      id: `tt-${Date.now()}`
    };
    setTimetable((prev) => [...prev, newSlot]);
    const course = courses.find((c) => c.id === slotData.courseId);
    await addAuditLog('Timetable Updated', `Scheduled ${course?.code || 'Course'} on Day ${slotData.dayOfWeek} at ${slotData.startTime}`, 'timetable');

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'timetable', newSlot.id), newSlot);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `timetable/${newSlot.id}`);
      }
    }
  };

  const updateTimetableSlot = async (id: string, updates: Partial<TimetableSlot>) => {
    const existingSlot = timetable.find((t) => t.id === id);
    if (verifiedRole === 'lecturer') {
      const targetCourseId = updates.courseId || existingSlot?.courseId || '';
      if (!existingSlot || !(verifiedAssignedCourseIds || []).includes(existingSlot.courseId) || !(verifiedAssignedCourseIds || []).includes(targetCourseId)) {
        alert('You can only modify timetable slots for your assigned courses.');
        return;
      }
    }
    setTimetable((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    await addAuditLog('Timetable Updated', `Modified scheduled lecture slot`, 'timetable');

    if (firebaseUser) {
      try {
        await updateDoc(doc(db, 'timetable', id), updates);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `timetable/${id}`);
      }
    }
  };

  const removeTimetableSlot = async (id: string) => {
    const existingSlot = timetable.find((t) => t.id === id);
    if (verifiedRole === 'lecturer' && (!existingSlot || !(verifiedAssignedCourseIds || []).includes(existingSlot.courseId))) {
      alert('You can only remove timetable slots for your assigned courses.');
      return;
    }
    setTimetable((prev) => prev.filter((t) => t.id !== id));
    await addAuditLog('Timetable Updated', `Removed class timetable session slot`, 'timetable');

    if (firebaseUser) {
      try {
        await deleteDoc(doc(db, 'timetable', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `timetable/${id}`);
      }
    }
  };

  const clearAllTimetableSlots = async () => {
    if (verifiedRole !== 'hod') {
      alert('Only the Head of Department (HOD) can clear the entire timetable.');
      return;
    }
    const count = timetable.length;
    setTimetable([]);
    localStorage.removeItem(STORAGE_KEYS.TIMETABLE);

    if (firebaseUser) {
      try {
        const tSnap = await getDocs(collection(db, 'timetable'));
        const batch = writeBatch(db);
        tSnap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'timetable');
      }
    }

    await addAuditLog('Timetable Cleared', `Cleared all ${count} lecture slots`, 'timetable');
  };

  const assignCourseWithSchedule = async (
    courseData: { code: string; title: string; creditHours?: number; lecturer?: string; department?: string },
    schedule: { dayOfWeek: number; startTime: string; endTime: string; venue: string; stream?: string }
  ) => {
    if (verifiedRole !== 'hod') {
      throw new Error('Only the Head of Department (HOD) can create and assign new courses.');
    }
    let courseId: string;
    const existing = courses.find((c) => c.code.toLowerCase().trim() === courseData.code.toLowerCase().trim());
    if (existing) {
      courseId = existing.id;
    } else {
      courseId = `crs-${Date.now()}`;
      const newCourse: Course = {
        id: courseId,
        code: courseData.code.toUpperCase().trim(),
        title: courseData.title.trim(),
        creditHours: courseData.creditHours || 3,
        lecturer: courseData.lecturer?.trim() || 'Unassigned',
        department: courseData.department || 'Department of Information Technology'
      };
      setCourses((prev) => [...prev, newCourse]);
      if (firebaseUser) {
        try {
          await setDoc(doc(db, 'courses', courseId), newCourse);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `courses/${courseId}`);
        }
      }
    }

    const slotId = `tt-${Date.now()}`;
    const newSlot: TimetableSlot = {
      id: slotId,
      courseId,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      venue: schedule.venue,
      stream: schedule.stream && schedule.stream !== 'All Streams' ? schedule.stream : undefined
    };
    setTimetable((prev) => [...prev, newSlot]);
    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'timetable', slotId), newSlot);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `timetable/${slotId}`);
      }
    }
    const streamInfo = schedule.stream && schedule.stream !== 'All Streams' ? ` (${schedule.stream})` : '';
    await addAuditLog('Course Scheduled', `Assigned ${courseData.code}${streamInfo} to Day ${schedule.dayOfWeek}`, 'timetable');
    return { courseId, slotId };
  };

  // Attendance Actions

  const getAttendanceForSession = (date: string, courseId: string, stream?: string) => {
    return attendanceRecords.find(
      (r) => r.date === date && r.courseId === courseId && matchAttendanceStream(r.stream, stream)
    );
  };

  const getCancellationForSession = useCallback(
    ({
      date,
      courseId,
      slotId,
      stream
    }: {
      date: string;
      courseId: string;
      slotId?: string;
      stream?: string;
    }): CancelledClass | undefined => {
      if (!date || !courseId) return undefined;
      return cancelledClasses.find((c) => {
        if (c.date !== date || c.courseId !== courseId) return false;
        if (slotId && c.timetableSlotId && c.timetableSlotId === slotId) return true;
        if (!c.stream) return true;
        if (!stream || stream === 'all' || stream === 'All Streams') return false;
        return matchAttendanceStream(c.stream, stream);
      });
    },
    [cancelledClasses]
  );

  const cancelClassSession = async (input: {
    date: string;
    courseId: string;
    timetableSlotId?: string;
    stream?: string;
    reason: string;
    makeupNote?: string;
  }): Promise<boolean> => {
    if (verifiedRole === 'class_rep' || currentUser.role === 'class_rep') {
      alert('Only Course Lecturers or the Head of Department (HOD) can cancel a class session.');
      return false;
    }
    if (verifiedRole === 'lecturer' && !(verifiedAssignedCourseIds || []).includes(input.courseId)) {
      alert('Access denied: You can only cancel sessions for your assigned courses.');
      return false;
    }

    const cleanReason = input.reason.trim().slice(0, 300);
    if (!cleanReason) return false;

    const normalizedStream =
      input.stream && input.stream !== 'all' && input.stream !== 'All' && input.stream !== 'All Streams'
        ? input.stream.trim().slice(0, 40)
        : undefined;
    const scopeKey = input.timetableSlotId
      ? input.timetableSlotId.replace(/[^a-zA-Z0-9_-]/g, '_')
      : normalizedStream
      ? normalizedStream.replace(/[^a-zA-Z0-9_-]/g, '_')
      : 'all';
    const cancelId = `cancel-${input.date}-${input.courseId}-${scopeKey}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
    const cleanMakeup = input.makeupNote?.trim() ? input.makeupNote.trim().slice(0, 200) : undefined;

    const record: CancelledClass = {
      id: cancelId,
      date: input.date,
      courseId: input.courseId,
      ...(input.timetableSlotId ? { timetableSlotId: input.timetableSlotId } : {}),
      ...(normalizedStream ? { stream: normalizedStream } : {}),
      reason: cleanReason,
      ...(cleanMakeup ? { makeupNote: cleanMakeup } : {}),
      cancelledBy: (currentUser.name || 'Academic Staff').slice(0, 120),
      ...(currentUser.email ? { cancelledByEmail: currentUser.email.slice(0, 120) } : {}),
      cancelledAt: new Date().toISOString()
    };

    setCancelledClasses((prev) => {
      const filtered = prev.filter((c) => c.id !== cancelId);
      return [...filtered, record];
    });

    const course = courses.find((c) => c.id === input.courseId);
    const streamLabel = normalizedStream ? ` [${normalizedStream}]` : '';
    await addAuditLog(
      'Class Cancelled',
      `${course?.code || input.courseId}${streamLabel} on ${input.date} cancelled by ${record.cancelledBy}: ${cleanReason}${cleanMakeup ? ` (Makeup: ${cleanMakeup})` : ''}`,
      'timetable'
    );

    if (firebaseUser && !firebaseUser.isAnonymous) {
      try {
        await setDoc(doc(db, 'cancelledClasses', cancelId), record);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `cancelledClasses/${cancelId}`);
        return false;
      }
    }
    return true;
  };

  const restoreCancelledClass = async (cancelId: string): Promise<boolean> => {
    if (verifiedRole === 'class_rep' || currentUser.role === 'class_rep') {
      alert('Only Course Lecturers or the Head of Department (HOD) can restore a cancelled class.');
      return false;
    }
    const target = cancelledClasses.find((c) => c.id === cancelId);
    if (!target) return false;
    if (verifiedRole === 'lecturer' && !(verifiedAssignedCourseIds || []).includes(target.courseId)) {
      alert('Access denied: You can only restore sessions for your assigned courses.');
      return false;
    }

    setCancelledClasses((prev) => prev.filter((c) => c.id !== cancelId));
    const course = courses.find((c) => c.id === target.courseId);
    await addAuditLog(
      'Cancelled Class Restored',
      `Restored ${course?.code || target.courseId} session on ${target.date}`,
      'timetable'
    );

    if (firebaseUser && !firebaseUser.isAnonymous) {
      try {
        await deleteDoc(doc(db, 'cancelledClasses', cancelId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `cancelledClasses/${cancelId}`);
        return false;
      }
    }
    return true;
  };

  const saveAttendance = async (
    date: string,
    courseId: string,
    records: Record<string, 'present' | 'absent'>,
    biometricVerifiedIds: string[] = [],
    finalize: boolean = false,
    stream?: string,
    gpsVerifiedIds?: string[]
  ) => {
    if (verifiedRole === 'lecturer' && !(verifiedAssignedCourseIds || []).includes(courseId)) {
      alert('Access denied: You can only record attendance for your assigned courses.');
      return;
    }
    const activeCancellation = getCancellationForSession({ date, courseId, stream });
    if (activeCancellation) {
      alert(`This class session on ${date} was cancelled (${activeCancellation.reason}). Restore the class first if it is holding.`);
      return;
    }
    const course = courses.find((c) => c.id === courseId);
    const presentCount = Object.values(records).filter((s) => s === 'present').length;
    const absentCount = Object.values(records).filter((s) => s === 'absent').length;

    const normalizedStream = stream && stream !== 'All' && stream !== 'all' && stream !== 'All Streams' ? stream : undefined;

    const existingIdx = attendanceRecords.findIndex(
      (r) => r.date === date && r.courseId === courseId && matchAttendanceStream(r.stream, normalizedStream)
    );
    const streamSuffix = normalizedStream ? `-${normalizedStream.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
    const recordId = existingIdx >= 0 ? attendanceRecords[existingIdx].id : `att-${date}-${courseId}${streamSuffix}`;
    const resolvedGpsIds =
      gpsVerifiedIds !== undefined
        ? gpsVerifiedIds
        : existingIdx >= 0
        ? attendanceRecords[existingIdx].gpsVerifiedStudentIds || []
        : [];

    const updatedRecord: AttendanceRecord = {
      id: recordId,
      date,
      courseId,
      ...(normalizedStream ? { stream: normalizedStream } : {}),
      isFinalized: finalize,
      ...(finalize ? { finalizedAt: new Date().toISOString() } : {}),
      records,
      biometricVerifiedStudentIds: biometricVerifiedIds,
      gpsVerifiedStudentIds: resolvedGpsIds
    };

    setAttendanceRecords((prev) => {
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = updatedRecord;
        return copy;
      } else {
        return [...prev, updatedRecord];
      }
    });

    const streamLabel = normalizedStream ? ` [${normalizedStream}]` : '';

    if (finalize) {
      await addAuditLog(
        'Session Finalized',
        `Attendance for ${course?.code || 'course'}${streamLabel} on ${date} was finalized (${presentCount} Present, ${absentCount} Absent)`,
        'attendance'
      );
    } else {
      await addAuditLog(
        'Attendance Updated',
        `Saved draft attendance for ${course?.code || 'course'}${streamLabel} on ${date}`,
        'attendance'
      );
    }

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'attendance', recordId), updatedRecord);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `attendance/${recordId}`);
      }
    }
  };

  const unlockAttendance = async (date: string, courseId: string, stream?: string) => {
    const course = courses.find((c) => c.id === courseId);
    const normalizedStream = stream && stream !== 'All' && stream !== 'all' && stream !== 'All Streams' ? stream : undefined;
    const record = attendanceRecords.find(
      (r) => r.date === date && r.courseId === courseId && matchAttendanceStream(r.stream, normalizedStream)
    );

    setAttendanceRecords((prev) =>
      prev.map((r) =>
        r.date === date && r.courseId === courseId && matchAttendanceStream(r.stream, normalizedStream)
          ? { ...r, isFinalized: false }
          : r
      )
    );
    const streamLabel = normalizedStream ? ` [${normalizedStream}]` : '';
    await addAuditLog('Session Unlocked', `Unlocked attendance session for ${course?.code || 'course'}${streamLabel} on ${date}`, 'attendance');

    if (firebaseUser && record) {
      try {
        await updateDoc(doc(db, 'attendance', record.id), { isFinalized: false });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `attendance/${record.id}`);
      }
    }
  };

  const checkInStudentWithIndex = async (
    indexNumber: string,
    date: string,
    courseId: string,
    stream?: string,
    gpsMeta?: { gpsVerified?: boolean; distanceMeters?: number }
  ) => {
    if (verifiedRole === 'lecturer' && !(verifiedAssignedCourseIds || []).includes(courseId)) {
      return { success: false, message: 'Access denied: This course is not assigned to your lecturer account.' };
    }
    const activeCancellation = getCancellationForSession({ date, courseId, stream });
    if (activeCancellation) {
      return {
        success: false,
        message: `This class session on ${date} has been cancelled (${activeCancellation.reason}). No attendance is being recorded.`
      };
    }

    const cleanInput = indexNumber.trim().toUpperCase();
    const normalizedInput = cleanInput.replace(/[^A-Z0-9]/g, '');

    if (!cleanInput) {
      return { success: false, message: 'Please enter your student index number.' };
    }

    // Match student from roster
    const student = students.find((s) => {
      const sIndex = (s.indexNumber || '').trim().toUpperCase();
      const sNorm = sIndex.replace(/[^A-Z0-9]/g, '');
      return sIndex === cleanInput || sNorm === normalizedInput;
    });

    if (!student) {
      return {
        success: false,
        message: `Index number "${cleanInput}" was not found in the student roster. Please verify your index number (e.g. UEB3100122) or contact your course lecturer.`
      };
    }

    const course = courses.find((c) => c.id === courseId);
    const normalizedStream = stream && stream !== 'All' && stream !== 'all' && stream !== 'All Streams' ? stream : undefined;

    // Helper to calculate student's course attendance statistics
    const calculateStats = (isNowPresent: boolean) => {
      let attended = 0;
      let total = 0;
      attendanceRecords.forEach((r) => {
        if (r.courseId === courseId) {
          total++;
          if (r.records && r.records[student.id] === 'present') {
            attended++;
          }
        }
      });
      if (isNowPresent && !attendanceRecords.some((r) => r.date === date && r.courseId === courseId && r.records && r.records[student.id] === 'present')) {
        attended++;
        if (!attendanceRecords.some((r) => r.date === date && r.courseId === courseId)) {
          total++;
        }
      }
      total = Math.max(total, 1);
      const percentage = Math.round((attended / total) * 100);
      return {
        attended,
        total,
        percentage,
        isEligible: percentage >= 75
      };
    };

    // Find existing session locally
    const existingIdx = attendanceRecords.findIndex(
      (r) => r.date === date && r.courseId === courseId && matchAttendanceStream(r.stream, normalizedStream)
    );
    const existingRecord = existingIdx >= 0 ? attendanceRecords[existingIdx] : null;

    // Determine deterministic record ID for this lecture session
    const streamSuffix = normalizedStream ? `-${normalizedStream.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
    const recordId = existingRecord ? existingRecord.id : `att-${date}-${courseId}${streamSuffix}`;

    // Pre-check cloud session doc if available
    let cloudIsFinalized = false;
    let cloudRecords: Record<string, 'present' | 'absent'> = {};
    let cloudGpsIds: string[] = [];
    try {
      const snap = await getDoc(doc(db, 'attendance', recordId));
      if (snap.exists()) {
        const cData = snap.data() as AttendanceRecord;
        cloudIsFinalized = Boolean(cData.isFinalized);
        if (cData.records) {
          cloudRecords = cData.records;
        }
        if (Array.isArray(cData.gpsVerifiedStudentIds)) {
          cloudGpsIds = cData.gpsVerifiedStudentIds;
        }
      }
    } catch (e) {
      console.warn('[Firestore] Pre-fetch check notice (proceeding):', e);
    }

    if (cloudIsFinalized || existingRecord?.isFinalized) {
      return {
        success: false,
        message: 'This lecture attendance session has been finalized and locked by the lecturer. Check-in is now closed.'
      };
    }

    const baseGpsIds = Array.from(
      new Set([...(existingRecord?.gpsVerifiedStudentIds || []), ...cloudGpsIds])
    );
    const nextGpsIds = gpsMeta?.gpsVerified
      ? Array.from(new Set([...baseGpsIds, student.id]))
      : baseGpsIds;

    // Check if already marked present in either local state or cloud
    const wasAlreadyPresent = (existingRecord?.records?.[student.id] === 'present') || (cloudRecords[student.id] === 'present');
    if (wasAlreadyPresent) {
      if (gpsMeta?.gpsVerified && !baseGpsIds.includes(student.id)) {
        try {
          await setDoc(doc(db, 'attendance', recordId), { gpsVerifiedStudentIds: nextGpsIds }, { merge: true });
        } catch {}
      }
      const stats = calculateStats(false);
      return {
        success: true,
        alreadyCheckedIn: true,
        message: `${student.name} is already checked in for today's lecture.`,
        student,
        course,
        stats
      };
    }

    // Merge student as present
    const updatedRecords = {
      ...(existingRecord ? existingRecord.records : {}),
      ...cloudRecords,
      [student.id]: 'present' as const
    };

    const updatedRecord: AttendanceRecord = {
      id: recordId,
      date,
      courseId,
      ...(normalizedStream ? { stream: normalizedStream } : {}),
      isFinalized: false,
      records: updatedRecords,
      biometricVerifiedStudentIds: existingRecord ? existingRecord.biometricVerifiedStudentIds || [] : [],
      gpsVerifiedStudentIds: nextGpsIds
    };

    // 1. Commit directly to Firestore with { merge: true } so concurrent student submissions don't overwrite each other
    try {
      await setDoc(
        doc(db, 'attendance', recordId),
        {
          id: recordId,
          date,
          courseId,
          stream: normalizedStream || null,
          isFinalized: false,
          gpsVerifiedStudentIds: nextGpsIds,
          records: {
            [student.id]: 'present'
          }
        },
        { merge: true }
      );
    } catch (err: any) {
      console.error('[Firestore] QR Check-In Cloud Write Error:', err);
      return {
        success: false,
        message: 'Unable to sync attendance to the lecturer’s cloud session. Please verify your internet connection and try again.'
      };
    }

    // 2. Update local state and offline cache
    setAttendanceRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === recordId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedRecord;
        return copy;
      }
      return [...prev, updatedRecord];
    });

    try {
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify([...attendanceRecords.filter(r => r.id !== recordId), updatedRecord]));
    } catch (e) {}

    // 3. Write immutable audit log
    try {
      const gpsTag = gpsMeta?.gpsVerified
        ? ` [GPS Verified${typeof gpsMeta.distanceMeters === 'number' ? `, ~${gpsMeta.distanceMeters}m from hall` : ''}]`
        : '';
      await addAuditLog(
        gpsMeta?.gpsVerified ? 'GPS Check-In' : 'QR Check-In',
        `${student.name} (${student.indexNumber}) checked in for ${course?.code || 'lecture'}${gpsTag}`,
        'attendance'
      );
    } catch (e) {
      console.warn('Audit log write notice:', e);
    }

    const stats = calculateStats(true);
    return {
      success: true,
      alreadyCheckedIn: false,
      message: `Checked in successfully! You are marked present for ${course?.code || 'lecture'}.`,
      student,
      course,
      stats
    };
  };

  checkInStudentWithIndexRef.current = checkInStudentWithIndex;

  // Database Management Functions
  const forceSyncCloudDatabase = async (): Promise<{ success: boolean; count: number; error?: string }> => {
    setIsSyncing(true);
    try {
      const batch = writeBatch(db);
      let count = 0;

      students.forEach((s) => {
        batch.set(doc(db, 'students', s.id), s);
        count++;
      });

      courses.forEach((c) => {
        batch.set(doc(db, 'courses', c.id), c);
        count++;
      });

      timetable.forEach((t) => {
        batch.set(doc(db, 'timetable', t.id), t);
        count++;
      });

      attendanceRecords.forEach((a) => {
        batch.set(doc(db, 'attendance', a.id), a);
        count++;
      });

      authorizedUsers.forEach((u) => {
        batch.set(doc(db, 'authorizedUsers', u.id), u);
        count++;
        const cleanEmail = (u.email || '').toLowerCase().trim();
        if (cleanEmail) {
          batch.set(doc(db, 'authorizedEmails', cleanEmail), {
            email: cleanEmail,
            name: u.name,
            role: u.role,
            department: u.department || 'Department of Information Technology',
            addedAt: u.addedAt || new Date().toISOString().split('T')[0]
          });
          count++;
        }
      });

      auditLogs.slice(0, 30).forEach((l) => {
        batch.set(doc(db, 'auditLogs', l.id), l);
        count++;
      });

      if (count > 0) {
        await batch.commit();
      }
      setIsCloudConnected(true);
      await addAuditLog('Cloud Database Synchronized', `Synchronized ${count} record(s) to Firestore Cloud database`, 'student');
      return { success: true, count };
    } catch (err: any) {
      console.error('Force cloud sync error:', err);
      return { success: false, count: 0, error: err.message || 'Database synchronization failed' };
    } finally {
      setIsSyncing(false);
    }
  };

  const pingDatabaseLatency = async (): Promise<{ connected: boolean; latencyMs: number }> => {
    const start = performance.now();
    try {
      const connected = await testFirestoreConnection();
      const end = performance.now();
      return { connected, latencyMs: Math.max(1, Math.round(end - start)) };
    } catch {
      return { connected: false, latencyMs: 0 };
    }
  };

  const exportDatabaseJSON = (): string => {
    const dump = {
      app: 'UENR Biometric Course Attendance',
      databaseId: activeFirestoreDatabaseId,
      academicYear: semester.academicYear,
      semester: semester.semester,
      exportedAt: new Date().toISOString(),
      counts: {
        students: students.length,
        courses: courses.length,
        timetable: timetable.length,
        attendanceRecords: attendanceRecords.length,
        authorizedUsers: authorizedUsers.length,
        auditLogs: auditLogs.length
      },
      data: {
        students,
        courses,
        timetable,
        attendanceRecords,
        authorizedUsers,
        auditLogs
      }
    };
    return JSON.stringify(dump, null, 2);
  };

  const importDatabaseJSON = async (jsonStr: string): Promise<{ success: boolean; count: number; error?: string }> => {
    try {
      const parsed = JSON.parse(jsonStr);
      const data = parsed.data || parsed;
      let totalCount = 0;

      if (Array.isArray(data.students)) {
        setStudents(data.students);
        totalCount += data.students.length;
      }
      if (Array.isArray(data.courses)) {
        setCourses(data.courses);
        totalCount += data.courses.length;
      }
      if (Array.isArray(data.timetable)) {
        setTimetable(data.timetable);
        totalCount += data.timetable.length;
      }
      if (Array.isArray(data.attendanceRecords)) {
        setAttendanceRecords(data.attendanceRecords);
        totalCount += data.attendanceRecords.length;
      }
      if (Array.isArray(data.authorizedUsers)) {
        setAuthorizedUsers(data.authorizedUsers);
        totalCount += data.authorizedUsers.length;
      }

      if (firebaseUser) {
        try {
          const batch = writeBatch(db);
          if (Array.isArray(data.students)) {
            data.students.forEach((s: Student) => batch.set(doc(db, 'students', s.id), s));
          }
          if (Array.isArray(data.courses)) {
            data.courses.forEach((c: Course) => batch.set(doc(db, 'courses', c.id), c));
          }
          if (Array.isArray(data.timetable)) {
            data.timetable.forEach((t: TimetableSlot) => batch.set(doc(db, 'timetable', t.id), t));
          }
          if (Array.isArray(data.attendanceRecords)) {
            data.attendanceRecords.forEach((a: AttendanceRecord) => batch.set(doc(db, 'attendance', a.id), a));
          }
          await batch.commit();
        } catch (dbErr) {
          console.warn('[Firestore] Note syncing imported dump:', dbErr);
        }
      }

      await addAuditLog('Database Restored', `Restored snapshot with ${totalCount} records`, 'student');
      return { success: true, count: totalCount };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message || 'Invalid JSON file format' };
    }
  };

  const loadOfficialL200Timetable = async (overwriteExisting: boolean = false) => {
    if (verifiedRole !== 'hod') {
      return { success: false, coursesCount: courses.length, slotsCount: timetable.length };
    }
    try {
      setIsSyncing(true);
      const batch = writeBatch(db);

      if (overwriteExisting) {
        courses.forEach((c) => batch.delete(doc(db, 'courses', c.id)));
        timetable.forEach((s) => batch.delete(doc(db, 'timetable', s.id)));
      }

      OFFICIAL_L200_COURSES.forEach((c) => batch.set(doc(db, 'courses', c.id), c));
      OFFICIAL_L200_TIMETABLE.forEach((s) => batch.set(doc(db, 'timetable', s.id), s));

      setCourses(OFFICIAL_L200_COURSES);
      setTimetable(OFFICIAL_L200_TIMETABLE);

      try {
        localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(OFFICIAL_L200_COURSES));
        localStorage.setItem(STORAGE_KEYS.TIMETABLE, JSON.stringify(OFFICIAL_L200_TIMETABLE));
      } catch (e) {}

      await batch.commit();
      saveTimetableOffline();
      await addAuditLog(
        'L200 IT-A Timetable Synced',
        'Loaded official UENR 1st Semester 2026/2027 timetable for Level 200 Stream A (8 courses, 12 lecture/lab periods)',
        'timetable'
      );
      return { success: true, coursesCount: OFFICIAL_L200_COURSES.length, slotsCount: OFFICIAL_L200_TIMETABLE.length };
    } catch (err: any) {
      console.warn('Syncing official timetable note:', err);
      setCourses(OFFICIAL_L200_COURSES);
      setTimetable(OFFICIAL_L200_TIMETABLE);
      saveTimetableOffline();
      return { success: true, coursesCount: OFFICIAL_L200_COURSES.length, slotsCount: OFFICIAL_L200_TIMETABLE.length };
    } finally {
      setIsSyncing(false);
    }
  };

  const seedSampleCoursesIfEmpty = async () => {
    await loadOfficialL200Timetable(true);
  };

  const resetToDefaults = () => {
    setStudents([]);
    setCourses([]);
    setTimetable([]);
    setAttendanceRecords([]);
    setCancelledClasses([]);
    setAuthorizedUsers([]);
    clearSensitiveStorage();
  };

  const isLecturerCourseScoped = verifiedRole === 'lecturer';

  const scopedCourses = useMemo(() => {
    if (!isLecturerCourseScoped) return courses;
    const allowed = new Set(verifiedAssignedCourseIds || []);
    return courses.filter((c) => allowed.has(c.id));
  }, [isLecturerCourseScoped, courses, verifiedAssignedCourseIds]);

  const scopedTimetable = useMemo(() => {
    if (!isLecturerCourseScoped) return timetable;
    const allowed = new Set(verifiedAssignedCourseIds || []);
    return timetable.filter((t) => allowed.has(t.courseId));
  }, [isLecturerCourseScoped, timetable, verifiedAssignedCourseIds]);

  const scopedAttendanceRecords = useMemo(() => {
    if (!isLecturerCourseScoped) return attendanceRecords;
    const allowed = new Set(verifiedAssignedCourseIds || []);
    return attendanceRecords.filter((r) => allowed.has(r.courseId));
  }, [isLecturerCourseScoped, attendanceRecords, verifiedAssignedCourseIds]);

  const scopedCancelledClasses = useMemo(() => {
    if (!isLecturerCourseScoped) return cancelledClasses;
    const allowed = new Set(verifiedAssignedCourseIds || []);
    return cancelledClasses.filter((c) => allowed.has(c.courseId));
  }, [isLecturerCourseScoped, cancelledClasses, verifiedAssignedCourseIds]);

  return (
    <AppContext.Provider
      value={{
        students,
        courses: scopedCourses,
        timetable: scopedTimetable,
        attendanceRecords: scopedAttendanceRecords,
        cancelledClasses: scopedCancelledClasses,
        auditLogs,
        semester,
        activeTab,
        setActiveTab,
        attendanceLaunchTarget,
        launchAttendanceSession,
        clearAttendanceLaunchTarget,
        adminSubTab,
        setAdminSubTab,
        openDatabaseTab,
        currentUser,
        setCurrentUser,
        isRoleMenuOpen,
        setIsRoleMenuOpen,
        theme,
        isDarkMode,
        toggleTheme,
        setTheme,
        isOnline,
        isPoorConnection,
        offlineCacheInfo,
        saveTimetableOffline,
        firebaseUser,
        isAuthLoading,
        isCloudConnected,
        isAuthorized,
        verifiedRole,
        isLecturerCourseScoped,
        authorizedUsers,
        loginWithGoogle,
        logoutUser,
        switchAccount,
        addAuthorizedUser,
        updateAuthorizedUser,
        removeAuthorizedUser,
        isSyncing,
        cloudSyncError,
        forceSyncCloudDatabase,
        pingDatabaseLatency,
        exportDatabaseJSON,
        importDatabaseJSON,
        seedSampleCoursesIfEmpty,
        loadOfficialL200Timetable,
        addStudent,
        batchAddStudents,
        updateStudent,
        batchUpdateStudents,
        batchPromoteStudents,
        promoteAllLevels,
        removeStudent,
        deleteStudentsByFilter,
        clearAllStudents,
        enrollStudentFingers,
        updateAllStudentEmailsToNameBased,
        addCourse,
        updateCourse,
        removeCourse,
        clearAllCourses,
        addTimetableSlot,
        updateTimetableSlot,
        removeTimetableSlot,
        clearAllTimetableSlots,
        assignCourseWithSchedule,
        getAttendanceForSession,
        saveAttendance,
        unlockAttendance,
        checkInStudentWithIndex,
        cancelClassSession,
        restoreCancelledClass,
        getCancellationForSession,
        geofenceSettings,
        updateGeofenceSettings,
        addAuditLog,
        autoLoggingSettings,
        updateAutoLoggingSettings,
        resetToDefaults
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
