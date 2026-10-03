import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  Student,
  Course,
  TimetableSlot,
  AttendanceRecord,
  AuditLog,
  SemesterConfig,
  CurrentUser,
  AuthorizedUser,
  UserRole,
  AutoLoggingSettings
} from '../types';
import {
  INITIAL_STUDENTS,
  INITIAL_COURSES,
  INITIAL_TIMETABLE,
  INITIAL_ATTENDANCE,
  INITIAL_AUTHORIZED_USERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_SEMESTER
} from '../data/mockData';
import {
  db,
  auth,
  signInWithGoogle,
  logOut,
  silentSignInAnonymously,
  onAuthStateChanged,
  testFirestoreConnection,
  handleFirestoreError,
  OperationType,
  FirebaseUser
} from '../lib/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  query,
  limit
} from 'firebase/firestore';
import {
  saveTimetableToOfflineStorage,
  loadTimetableFromOfflineStorage,
  getOfflineCacheStatus,
  getNetworkStatus
} from '../utils/offlineCache';
import { generateInstitutionalEmail } from '../utils/studentParser';

export type NavigationTab = 'home' | 'attendance' | 'timetable' | 'admin' | 'reports';
export type AdminSubTab = 'roster' | 'authorized' | 'database' | 'audit' | 'autologging';
export type ThemeMode = 'light' | 'dark' | 'system';

interface AppContextType {
  students: Student[];
  courses: Course[];
  timetable: TimetableSlot[];
  attendanceRecords: AttendanceRecord[];
  auditLogs: AuditLog[];
  semester: SemesterConfig;
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
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
  authorizedUsers: AuthorizedUser[];
  loginWithGoogle: (forcePrompt?: boolean) => Promise<void>;
  logoutUser: () => Promise<void>;
  switchAccount: () => Promise<void>;
  isAutoSignIn: boolean;
  toggleAutoSignIn: (enable?: boolean) => void;
  autoSignInAsMaster: () => void;
  addAuthorizedUser: (user: Omit<AuthorizedUser, 'id' | 'addedAt'>) => Promise<void>;
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
    stream?: string
  ) => Promise<void>;
  unlockAttendance: (date: string, courseId: string, stream?: string) => Promise<void>;

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
  AUDIT_LOGS: 'uenr_audit_logs_v2',
  SEMESTER: 'uenr_semester_v3_2026',
  AUTHORIZED: 'uenr_authorized_users_v2'
};

const DUMMY_COURSE_IDS = ['crs-1', 'crs-2', 'crs-3', 'crs-4', 'crs-5'];
const DUMMY_SLOT_IDS = ['tt-1', 'tt-2', 'tt-3', 'tt-4', 'tt-5'];

const MASTER_HOD_EMAIL = 'jonesdarko345@gmail.com';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');
  const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>('roster');
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState<boolean>(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);

  const openDatabaseTab = useCallback(() => {
    setActiveTab('admin');
    setAdminSubTab('database');
  }, []);

  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUTHORIZED);
      if (saved) {
        const parsed: AuthorizedUser[] = JSON.parse(saved);
        // Ensure legacy mock entries (auth-2, auth-3/Kofi Mensah) are completely purged
        const cleaned = parsed.filter(
          (u) =>
            u.id !== 'auth-2' &&
            u.id !== 'auth-3' &&
            u.email.toLowerCase() !== 'dr.asante@uenr.edu.gh' &&
            u.email.toLowerCase() !== 'classrep.it300@uenr.edu.gh' &&
            !u.name.toLowerCase().includes('kofi mensah')
        );
        return cleaned.length > 0 ? cleaned : INITIAL_AUTHORIZED_USERS;
      }
      return INITIAL_AUTHORIZED_USERS;
    } catch {
      return INITIAL_AUTHORIZED_USERS;
    }
  });

  // Auto Sign-in Engine (Remembers user identity without prompting for Gmail)
  const [isAutoSignIn, setIsAutoSignIn] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('uenr_auto_signin');
      // Default to true so user is automatically logged in without repeated Gmail account prompts
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [currentUser, setCurrentUser] = useState<CurrentUser>(() => {
    try {
      const saved = localStorage.getItem('uenr_current_user_profile');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return {
      name: 'Dr. Jones Darko',
      email: MASTER_HOD_EMAIL,
      role: 'hod',
      department: 'Department of Information Technology'
    };
  });

  // Automatically save current user profile to local storage whenever updated
  useEffect(() => {
    try {
      localStorage.setItem('uenr_current_user_profile', JSON.stringify(currentUser));
    } catch (e) {
      console.warn('Could not persist current user profile:', e);
    }
  }, [currentUser]);

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

    if (firebaseUser || auth.currentUser) {
      try {
        await setDoc(doc(db, 'systemSettings', 'autoLogging'), { ...autoLoggingSettings, ...updates }, { merge: true });
      } catch (err) {
        console.warn('[Firestore] systemSettings autoLogging sync notice:', err);
      }
    }
  };

  // Alphabetical sort helper
  const sortAlphabetically = <T extends { name: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  };

  // Students roster starts clean/empty
  const [students, setStudents] = useState<Student[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (saved) {
        const parsed: Student[] = JSON.parse(saved);
        // Ensure legacy mock students (std-1 through std-12) are completely purged
        const cleaned = parsed
          .filter(
            (s) => !['std-1', 'std-2', 'std-3', 'std-4', 'std-5', 'std-6', 'std-7', 'std-8', 'std-9', 'std-10', 'std-11', 'std-12'].includes(s.id)
          )
          .map((s) => {
            const idxSlug = (s.indexNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const emailPrefix = (s.email || '').toLowerCase().split('@')[0];
            if (!s.email || emailPrefix === idxSlug) {
              return { ...s, email: generateInstitutionalEmail(s.name, s.indexNumber) };
            }
            return s;
          });
        return sortAlphabetically(cleaned);
      }
      return sortAlphabetically(INITIAL_STUDENTS);
    } catch {
      return sortAlphabetically(INITIAL_STUDENTS);
    }
  });

  const [courses, setCourses] = useState<Course[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.COURSES) || localStorage.getItem('uenr_courses_v2');
      if (saved) {
        const parsed: Course[] = JSON.parse(saved);
        return parsed.filter((c) => !DUMMY_COURSE_IDS.includes(c.id));
      }
      return INITIAL_COURSES;
    } catch {
      return INITIAL_COURSES;
    }
  });

  const [timetable, setTimetable] = useState<TimetableSlot[]>(() => {
    try {
      // 1. Check dedicated offline snapshot first for instant offline readiness
      const offlineSnapshot = loadTimetableFromOfflineStorage();
      if (offlineSnapshot && Array.isArray(offlineSnapshot.timetable) && offlineSnapshot.timetable.length > 0) {
        return offlineSnapshot.timetable.filter(
          (t) => !DUMMY_SLOT_IDS.includes(t.id) && !DUMMY_COURSE_IDS.includes(t.courseId)
        );
      }

      // 2. Check standard local storage
      const saved = localStorage.getItem(STORAGE_KEYS.TIMETABLE) || localStorage.getItem('uenr_timetable_v2');
      if (saved) {
        const parsed: TimetableSlot[] = JSON.parse(saved);
        return parsed.filter(
          (t) => !DUMMY_SLOT_IDS.includes(t.id) && !DUMMY_COURSE_IDS.includes(t.courseId)
        );
      }
      return INITIAL_TIMETABLE;
    } catch {
      return INITIAL_TIMETABLE;
    }
  });

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
      return saved ? JSON.parse(saved) : INITIAL_ATTENDANCE;
    } catch {
      return INITIAL_ATTENDANCE;
    }
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
    } catch {
      return INITIAL_AUDIT_LOGS;
    }
  });

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

  // Check authorization status:
  // User is authorized if Auto Sign-In is enabled OR if signed in with an authorized email
  const isAuthorized = Boolean(
    isAutoSignIn ||
    (firebaseUser &&
      (firebaseUser.email?.toLowerCase() === MASTER_HOD_EMAIL.toLowerCase() ||
        authorizedUsers.some(
          (u) => u.email.toLowerCase() === firebaseUser.email?.toLowerCase()
        )))
  );

  // Local storage caching for offline resilience
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(courses));
  }, [courses]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TIMETABLE, JSON.stringify(timetable));
    // Automatically keep dedicated offline timetable cache fresh
    saveTimetableToOfflineStorage(timetable, courses, semester);
    setOfflineCacheInfo(getOfflineCacheStatus());
  }, [timetable, courses, semester]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendanceRecords));
  }, [attendanceRecords]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUTHORIZED, JSON.stringify(authorizedUsers));
  }, [authorizedUsers]);

  // Test Firestore Connection on App Boot
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

  // Initialize Firebase Auth (support anonymous session if not signed in with Google)
  useEffect(() => {
    if (!auth.currentUser) {
      silentSignInAnonymously().catch(() => {});
    }
  }, []);

  // Clean up any old mock students from Firestore if present & seed initial structure
  const initializeFirestore = useCallback(async () => {
    if (isSeedingRef.current || !auth.currentUser) return;
    isSeedingRef.current = true;
    setIsSyncing(true);

    try {
      // 1. Purge legacy mock students from Firestore if they exist
      const mockIds = ['std-1', 'std-2', 'std-3', 'std-4', 'std-5', 'std-6', 'std-7', 'std-8', 'std-9', 'std-10', 'std-11', 'std-12'];
      const batch = writeBatch(db);
      let needsCommit = false;

      for (const id of mockIds) {
        batch.delete(doc(db, 'students', id));
        needsCommit = true;
      }

      // 2. Purge legacy dummy courses and slots (crs-1..crs-5 and tt-1..tt-5)
      for (const cid of DUMMY_COURSE_IDS) {
        batch.delete(doc(db, 'courses', cid));
        needsCommit = true;
      }

      for (const tid of DUMMY_SLOT_IDS) {
        batch.delete(doc(db, 'timetable', tid));
        needsCommit = true;
      }

      // Purge legacy mock users auth-2 and auth-3 (Kofi Mensah) from Firestore if present
      batch.delete(doc(db, 'authorizedUsers', 'auth-2'));
      batch.delete(doc(db, 'authorizedUsers', 'auth-3'));
      needsCommit = true;

      // 3. Check and seed authorized users registry if empty
      const authSnap = await getDocs(query(collection(db, 'authorizedUsers'), limit(1)));
      if (authSnap.empty) {
        INITIAL_AUTHORIZED_USERS.forEach((authUser) => {
          batch.set(doc(db, 'authorizedUsers', authUser.id), authUser);
          needsCommit = true;
        });
      }

      if (needsCommit) {
        await batch.commit();
        console.log('[Firestore] UENR Portal initialized (mock records purged, ready for user courses).');
      }
    } catch (error) {
      console.warn('[Firestore] Initialization check note:', error);
    } finally {
      setIsSyncing(false);
      isSeedingRef.current = false;
    }
  }, []);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setIsAuthLoading(false);

      if (user) {
        setIsCloudConnected(true);
        if (!user.isAnonymous) {
          const userEmail = (user.email || '').toLowerCase();
          const isMasterHod = userEmail === MASTER_HOD_EMAIL.toLowerCase();

          // Check if user is in authorized list
          const matchedAuthorized = authorizedUsers.find(
            (u) => u.email.toLowerCase() === userEmail
          );

          let determinedRole: UserRole = 'lecturer';
          if (isMasterHod) {
            determinedRole = 'hod';
          } else if (matchedAuthorized) {
            determinedRole = matchedAuthorized.role;
          }

          const determinedName =
            user.displayName ||
            matchedAuthorized?.name ||
            (userEmail ? userEmail.split('@')[0] : 'Academic Staff');

          setCurrentUser({
            name: determinedName,
            email: user.email || '',
            role: determinedRole,
            department: matchedAuthorized?.department || 'Department of Information Technology',
            photoURL: user.photoURL || undefined,
            uid: user.uid
          });
        }

        // Initialize / clean cloud database
        await initializeFirestore();
      } else {
        // Fallback default
        setCurrentUser({
          name: 'Dr. Jones Darko',
          email: MASTER_HOD_EMAIL,
          role: 'hod',
          department: 'Department of Information Technology'
        });
      }
    });

    return () => unsubscribe();
  }, [authorizedUsers, initializeFirestore]);

  // 1. Real-time Firestore Listeners for Public Collections (Students, Courses, Timetable)
  // These run immediately upon app boot and don't require user login
  useEffect(() => {
    setIsSyncing(true);
    setCloudSyncError(null);

    // Students Listener (filters out legacy mock IDs and safeguards against wiping local rosters)
    const unsubStudents = onSnapshot(
      collection(db, 'students'),
      (snapshot) => {
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
          // Cloud database has confirmed records
          setStudents((currentLocal) => {
            if (isClearingRosterRef.current) return [];
            // Merge cloud list with any locally added students that are still in flight
            const cloudIndexMap = new Map<string, Student>();
            list.forEach((s) => cloudIndexMap.set(s.indexNumber.toUpperCase().trim(), s));

            const combined: Student[] = [...list];
            currentLocal.forEach((loc) => {
              const locKey = loc.indexNumber.toUpperCase().trim();
              if (!cloudIndexMap.has(locKey)) {
                combined.push(loc);
              }
            });
            const sorted = sortAlphabetically(combined);
            try {
              localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(sorted));
            } catch (e) {}
            return sorted;
          });
        } else {
          // Cloud snapshot has 0 records:
          // CRITICAL: Protect against wiping out valid locally imported students!
          setStudents((currentLocal) => {
            if (currentLocal.length > 0 && !isClearingRosterRef.current) {
              console.log(`[Firestore] Cloud roster empty; syncing ${currentLocal.length} local students to Cloud Firestore...`);
              const batch = writeBatch(db);
              currentLocal.slice(0, 450).forEach((st) => {
                batch.set(doc(db, 'students', st.id), st);
              });
              batch.commit().catch((err) => {
                console.warn('[Firestore] Syncing local students to cloud notice:', err);
              });
              return sortAlphabetically(currentLocal);
            }
            return [];
          });
        }
        setIsSyncing(false);
      },
      (error) => {
        setCloudSyncError('Failed to synchronize students');
        console.warn('[Firestore] Students listener sync notice:', error);
      }
    );

    // Courses Listener
    const unsubCourses = onSnapshot(
      collection(db, 'courses'),
      (snapshot) => {
        const list: Course[] = [];
        snapshot.forEach((d) => {
          const c = d.data() as Course;
          if (!DUMMY_COURSE_IDS.includes(c.id)) {
            list.push(c);
          }
        });
        setCourses(list);
      },
      (error) => {
        console.warn('[Firestore] Courses listener sync notice:', error);
      }
    );

    // Timetable Listener
    const unsubTimetable = onSnapshot(
      collection(db, 'timetable'),
      (snapshot) => {
        const list: TimetableSlot[] = [];
        snapshot.forEach((d) => {
          const t = d.data() as TimetableSlot;
          if (
            !DUMMY_SLOT_IDS.includes(t.id) &&
            !DUMMY_COURSE_IDS.includes(t.courseId)
          ) {
            list.push(t);
          }
        });
        setTimetable(list);
      },
      (error) => {
        console.warn('[Firestore] Timetable listener sync notice:', error);
      }
    );

    return () => {
      unsubStudents();
      unsubCourses();
      unsubTimetable();
    };
  }, []);

  // 2. Real-time Firestore Listeners for Authenticated Collections
  useEffect(() => {
    if (!firebaseUser) return;

    // 1. Authorized Users Listener
    const unsubAuthUsers = onSnapshot(
      collection(db, 'authorizedUsers'),
      (snapshot) => {
        if (!snapshot.empty) {
          const list: AuthorizedUser[] = [];
          snapshot.forEach((d) => {
            const u = d.data() as AuthorizedUser;
            // Purge legacy mock users (auth-2, auth-3/Kofi Mensah) if encountered from older snapshot
            if (
              u.id === 'auth-3' ||
              u.email?.toLowerCase() === 'classrep.it300@uenr.edu.gh' ||
              u.name?.toLowerCase().includes('kofi mensah') ||
              u.id === 'auth-2' ||
              u.email?.toLowerCase() === 'dr.asante@uenr.edu.gh'
            ) {
              deleteDoc(doc(db, 'authorizedUsers', d.id)).catch(() => {});
              return;
            }
            list.push(u);
          });
          setAuthorizedUsers(list.length > 0 ? list : INITIAL_AUTHORIZED_USERS);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'authorizedUsers');
      }
    );

    // 2. Attendance Listener
    const unsubAttendance = onSnapshot(
      collection(db, 'attendance'),
      (snapshot) => {
        const list: AttendanceRecord[] = [];
        snapshot.forEach((d) => list.push(d.data() as AttendanceRecord));
        setAttendanceRecords(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'attendance');
      }
    );

    // 3. Audit Logs Listener
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
        handleFirestoreError(error, OperationType.GET, 'auditLogs');
      }
    );

    // 4. Auto Logging & Automation Settings Listener
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

    return () => {
      unsubAuthUsers();
      unsubAttendance();
      unsubLogs();
      unsubSettings();
    };
  }, [firebaseUser]);

  // Auto Sign-in Engine Handlers
  const toggleAutoSignIn = useCallback((enable?: boolean) => {
    setIsAutoSignIn((prev) => {
      const next = enable !== undefined ? enable : !prev;
      try {
        localStorage.setItem('uenr_auto_signin', String(next));
      } catch (e) {
        console.warn('Unable to persist auto-signin preference:', e);
      }
      return next;
    });
  }, []);

  const autoSignInAsMaster = useCallback(() => {
    const masterProfile: CurrentUser = {
      name: 'Dr. Jones Darko',
      email: MASTER_HOD_EMAIL,
      role: 'hod',
      department: 'Department of Information Technology'
    };
    setCurrentUser(masterProfile);
    setIsAutoSignIn(true);
    try {
      localStorage.setItem('uenr_auto_signin', 'true');
      localStorage.setItem('uenr_current_user_profile', JSON.stringify(masterProfile));
    } catch (e) {
      console.warn('Unable to store master profile:', e);
    }
  }, []);

  // Auth Actions
  const loginWithGoogle = async (forcePrompt = false) => {
    try {
      setIsAuthLoading(true);
      await signInWithGoogle(forcePrompt);
      // Automatically remember session so user is never prompted repeatedly
      setIsAutoSignIn(true);
      try {
        localStorage.setItem('uenr_auto_signin', 'true');
      } catch (e) {
        console.warn(e);
      }
    } catch (err) {
      console.error('Sign-in failed:', err);
      throw err;
    } finally {
      setIsAuthLoading(false);
    }
  };

  const switchAccount = async () => {
    try {
      setIsAuthLoading(true);
      await logOut();
      // Force account prompt so user can select a different Gmail account
      await signInWithGoogle(true);
      setIsAutoSignIn(true);
      try {
        localStorage.setItem('uenr_auto_signin', 'true');
      } catch (e) {
        console.warn(e);
      }
    } catch (err) {
      console.error('Switch account failed:', err);
      throw err;
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logoutUser = async () => {
    try {
      setIsAutoSignIn(false);
      try {
        localStorage.setItem('uenr_auto_signin', 'false');
      } catch (e) {
        console.warn(e);
      }
      await logOut();
    } catch (err) {
      console.error('Logout failed:', err);
      throw err;
    }
  };

  // Manage Authorized Users (HOD can assign Lecturer & Class Rep; Lecturer can assign Class Rep ONLY)
  const addAuthorizedUser = async (userData: Omit<AuthorizedUser, 'id' | 'addedAt'>) => {
    // Institutional RBAC policy:
    // - Class Reps have zero assignment privileges
    // - Lecturers can assign Class Representatives ONLY
    // - HODs can assign Course Lecturers and Class Representatives
    if (currentUser.role === 'class_rep') {
      alert('Class Representatives do not have permission to authorize or assign personnel.');
      return;
    }
    if (currentUser.role === 'lecturer' && userData.role !== 'class_rep') {
      alert('Course Lecturers are only authorized to assign Class Representatives.');
      return;
    }

    const cleanEmail = userData.email.toLowerCase().trim();
    const id = `auth-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const newUser: AuthorizedUser = {
      ...userData,
      id,
      email: cleanEmail,
      addedAt: new Date().toISOString().split('T')[0]
    };

    setAuthorizedUsers((prev) => {
      const filtered = prev.filter((u) => u.email.toLowerCase() !== cleanEmail);
      return [...filtered, newUser];
    });

    await addAuditLog(
      'Authorized Personnel Added',
      `Assigned by ${currentUser.name} (${currentUser.role.toUpperCase()}): Granted ${newUser.role.toUpperCase()} access to ${newUser.name} (${cleanEmail})`,
      'timetable'
    );

    if (firebaseUser) {
      try {
        await setDoc(doc(db, 'authorizedUsers', newUser.id), newUser);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `authorizedUsers/${newUser.id}`);
      }
    }
  };

  const removeAuthorizedUser = async (id: string) => {
    const toRemove = authorizedUsers.find((u) => u.id === id);
    if (toRemove?.email.toLowerCase() === MASTER_HOD_EMAIL.toLowerCase()) {
      alert('Cannot remove the primary Head of Department (HOD) account.');
      return;
    }

    // Role-based revocation policy:
    // - Class Reps cannot revoke anyone
    // - Lecturers can ONLY revoke Class Representatives
    // - HODs can revoke Lecturers and Class Representatives
    if (currentUser.role === 'class_rep') {
      alert('Class Representatives do not have permission to revoke personnel access.');
      return;
    }
    if (currentUser.role === 'lecturer' && toRemove?.role !== 'class_rep') {
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

    if (firebaseUser) {
      try {
        await deleteDoc(doc(db, 'authorizedUsers', id));
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
      // 1. Immediately update React state & localStorage for zero UI lag (sorted alphabetically)
      const sorted = sortAlphabetically(finalRoster);
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

  // Course Actions
  const addCourse = async (courseData: Omit<Course, 'id'>) => {
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

  // Timetable Actions
  const addTimetableSlot = async (slotData: Omit<TimetableSlot, 'id'>) => {
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
  const matchAttendanceStream = (recordStream?: string, requestedStream?: string) => {
    if (!requestedStream || requestedStream === 'All' || requestedStream === 'All Streams') {
      return !recordStream || recordStream === 'All' || recordStream === 'All Streams';
    }
    return recordStream === requestedStream;
  };

  const getAttendanceForSession = (date: string, courseId: string, stream?: string) => {
    return attendanceRecords.find(
      (r) => r.date === date && r.courseId === courseId && matchAttendanceStream(r.stream, stream)
    );
  };

  const saveAttendance = async (
    date: string,
    courseId: string,
    records: Record<string, 'present' | 'absent'>,
    biometricVerifiedIds: string[] = [],
    finalize: boolean = false,
    stream?: string
  ) => {
    const course = courses.find((c) => c.id === courseId);
    const presentCount = Object.values(records).filter((s) => s === 'present').length;
    const absentCount = Object.values(records).filter((s) => s === 'absent').length;

    const normalizedStream = stream && stream !== 'All' && stream !== 'All Streams' ? stream : undefined;

    const existingIdx = attendanceRecords.findIndex(
      (r) => r.date === date && r.courseId === courseId && matchAttendanceStream(r.stream, normalizedStream)
    );
    const streamSuffix = normalizedStream ? `-${normalizedStream.replace(/\s+/g, '_')}` : '';
    const recordId = existingIdx >= 0 ? attendanceRecords[existingIdx].id : `att-${date}-${courseId}${streamSuffix}`;

    const updatedRecord: AttendanceRecord = {
      id: recordId,
      date,
      courseId,
      stream: normalizedStream,
      isFinalized: finalize,
      finalizedAt: finalize ? new Date().toISOString() : undefined,
      records,
      biometricVerifiedStudentIds: biometricVerifiedIds
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
    const normalizedStream = stream && stream !== 'All' && stream !== 'All Streams' ? stream : undefined;
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
      databaseId: 'ai-studio-uenrcourseattend-0141d0d1-23f9-4db8-bf59-093984467c04',
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

  const seedSampleCoursesIfEmpty = async () => {
    const sampleCourses: Course[] = [
      { id: `crs-${Date.now()}-1`, code: 'IT 301', title: 'Web Technologies & Development', creditHours: 3, lecturer: 'Dr. Kwabena Asante', department: 'Information Technology' },
      { id: `crs-${Date.now()}-2`, code: 'IT 303', title: 'Database Systems & Administration', creditHours: 3, lecturer: 'Dr. Afia Osei', department: 'Information Technology' },
      { id: `crs-${Date.now()}-3`, code: 'IT 305', title: 'Operating Systems & Cloud Arch', creditHours: 3, lecturer: 'Ing. Emmanuel Mensah', department: 'Computer Science' },
      { id: `crs-${Date.now()}-4`, code: 'IT 307', title: 'Computer Networks & Security', creditHours: 3, lecturer: 'Dr. Seth Boateng', department: 'Information Technology' }
    ];

    const sampleSlots: TimetableSlot[] = [
      { id: `tt-${Date.now()}-1`, courseId: sampleCourses[0].id, dayOfWeek: 1, startTime: '08:00', endTime: '10:00', venue: 'LT 2 · Sunyani Campus' },
      { id: `tt-${Date.now()}-2`, courseId: sampleCourses[1].id, dayOfWeek: 2, startTime: '10:00', endTime: '12:00', venue: 'IT Computer Lab 1' },
      { id: `tt-${Date.now()}-3`, courseId: sampleCourses[2].id, dayOfWeek: 3, startTime: '13:00', endTime: '15:00', venue: 'Engineering Block Rm 14' },
      { id: `tt-${Date.now()}-4`, courseId: sampleCourses[3].id, dayOfWeek: 4, startTime: '09:00', endTime: '11:00', venue: 'LT 1 · Sunyani Campus' }
    ];

    setCourses(sampleCourses);
    setTimetable(sampleSlots);

    if (firebaseUser) {
      try {
        const batch = writeBatch(db);
        sampleCourses.forEach((c) => batch.set(doc(db, 'courses', c.id), c));
        sampleSlots.forEach((s) => batch.set(doc(db, 'timetable', s.id), s));
        await batch.commit();
      } catch (err) {
        console.warn('Seeding cloud note:', err);
      }
    }
    await addAuditLog('Curriculum Seeded', 'Loaded 4 standard BSc IT Level 300 courses & weekly schedule', 'timetable');
  };

  const resetToDefaults = () => {
    setStudents([]);
    setCourses(INITIAL_COURSES);
    setTimetable(INITIAL_TIMETABLE);
    setAttendanceRecords([]);
    setAuthorizedUsers(INITIAL_AUTHORIZED_USERS);
    localStorage.clear();
  };

  return (
    <AppContext.Provider
      value={{
        students,
        courses,
        timetable,
        attendanceRecords,
        auditLogs,
        semester,
        activeTab,
        setActiveTab,
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
        authorizedUsers,
        loginWithGoogle,
        logoutUser,
        switchAccount,
        isAutoSignIn,
        toggleAutoSignIn,
        autoSignInAsMaster,
        addAuthorizedUser,
        removeAuthorizedUser,
        isSyncing,
        cloudSyncError,
        forceSyncCloudDatabase,
        pingDatabaseLatency,
        exportDatabaseJSON,
        importDatabaseJSON,
        seedSampleCoursesIfEmpty,
        addStudent,
        batchAddStudents,
        updateStudent,
        batchUpdateStudents,
        batchPromoteStudents,
        promoteAllLevels,
        removeStudent,
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
