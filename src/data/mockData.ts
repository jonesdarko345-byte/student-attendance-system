import { Student, Course, TimetableSlot, AttendanceRecord, AuditLog, SemesterConfig, AuthorizedUser } from '../types';

// The student roster starts clean so real class students can be imported or added
export const INITIAL_STUDENTS: Student[] = [];

// Official UENR Level 200 Semester 1 Courses (Department of Information Technology and Decision Sciences)
// Source: Level 200 Semester One Course Poster (Antwi-Oppong Led Administration)
export const OFFICIAL_L200_COURSES: Course[] = [
  {
    id: 'crs-inft-251',
    code: 'INFT 251',
    title: 'Information Technology Society',
    creditHours: 3,
    lecturer: 'B. N. A. Acquah',
    department: 'Department of Information Technology and Decision Sciences'
  },
  {
    id: 'crs-inft-253',
    code: 'INFT 253',
    title: 'Data Communication and Computer Networks',
    creditHours: 3,
    lecturer: 'A. N. A. Addy',
    department: 'Department of Information Technology and Decision Sciences'
  },
  {
    id: 'crs-inft-255',
    code: 'INFT 255',
    title: 'System Analysis and Design',
    creditHours: 3,
    lecturer: 'P. Sarfo-Manu',
    department: 'Department of Information Technology and Decision Sciences'
  },
  {
    id: 'crs-inft-257',
    code: 'INFT 257',
    title: 'Database Concepts and Design',
    creditHours: 3,
    lecturer: 'M. Opoku',
    department: 'Department of Information Technology and Decision Sciences'
  },
  {
    id: 'crs-inft-259',
    code: 'INFT 259',
    title: 'Data Structures and Algorithm',
    creditHours: 3,
    lecturer: 'S. O. Frimpong / J. Nkrumah',
    department: 'Department of Information Technology and Decision Sciences'
  },
  {
    id: 'crs-inft-261',
    code: 'INFT 261',
    title: 'Financial Accounting',
    creditHours: 3,
    lecturer: 'D. Berko / G. Kopri',
    department: 'Department of Information Technology and Decision Sciences'
  },
  {
    id: 'crs-uenr-201',
    code: 'UENR 201',
    title: 'Analytical Reading and Reasoning',
    creditHours: 2,
    lecturer: 'A. D. Nyarko Ansah',
    department: 'Languages and General Studies Department'
  },
  {
    id: 'crs-uenr-203',
    code: 'UENR 203',
    title: 'Science, Technology and Society',
    creditHours: 2,
    lecturer: 'R. B. Okyere',
    department: 'Languages and General Studies Department'
  }
];

// Official UENR L200 IT- A Weekly Lecture & Lab Slots (Provisional Timetable 1st Semester 2026/2027)
export const OFFICIAL_L200_TIMETABLE: TimetableSlot[] = [
  // MONDAY
  {
    id: 'tt-l200-mon-1',
    courseId: 'crs-inft-255',
    dayOfWeek: 1,
    startTime: '07:00',
    endTime: '08:55',
    venue: 'LTS 1',
    stream: 'L200 IT-A'
  },
  {
    id: 'tt-l200-mon-2',
    courseId: 'crs-inft-253',
    dayOfWeek: 1,
    startTime: '17:00',
    endTime: '17:55',
    venue: 'Online',
    stream: 'L200 IT-A'
  },

  // TUESDAY
  {
    id: 'tt-l200-tue-1',
    courseId: 'crs-inft-259',
    dayOfWeek: 2,
    startTime: '09:00',
    endTime: '10:55',
    venue: 'APP LAB 1',
    stream: 'L200 IT-A'
  },
  {
    id: 'tt-l200-tue-2',
    courseId: 'crs-inft-261',
    dayOfWeek: 2,
    startTime: '15:00',
    endTime: '16:55',
    venue: 'APP LAB 3',
    stream: 'L200 IT-A'
  },

  // WEDNESDAY
  {
    id: 'tt-l200-wed-1',
    courseId: 'crs-inft-251',
    dayOfWeek: 3,
    startTime: '07:00',
    endTime: '08:55',
    venue: 'LTS 1',
    stream: 'L200 IT-A'
  },
  {
    id: 'tt-l200-wed-2',
    courseId: 'crs-inft-257',
    dayOfWeek: 3,
    startTime: '13:00',
    endTime: '14:55',
    venue: 'LTS 1',
    stream: 'L200 IT-A'
  },
  {
    id: 'tt-l200-wed-3',
    courseId: 'crs-inft-253',
    dayOfWeek: 3,
    startTime: '17:00',
    endTime: '18:55',
    venue: 'APP LAB 1',
    stream: 'L200 IT-A'
  },

  // THURSDAY
  {
    id: 'tt-l200-thu-1',
    courseId: 'crs-uenr-203',
    dayOfWeek: 4,
    startTime: '07:00',
    endTime: '08:55',
    venue: 'Online',
    stream: 'L200 IT-A'
  },
  {
    id: 'tt-l200-thu-2',
    courseId: 'crs-inft-259',
    dayOfWeek: 4,
    startTime: '17:00',
    endTime: '17:55',
    venue: 'Online',
    stream: 'L200 IT-A'
  },

  // FRIDAY
  {
    id: 'tt-l200-fri-1',
    courseId: 'crs-inft-257',
    dayOfWeek: 5,
    startTime: '07:00',
    endTime: '07:55',
    venue: 'Online',
    stream: 'L200 IT-A'
  },
  {
    id: 'tt-l200-fri-2',
    courseId: 'crs-inft-261',
    dayOfWeek: 5,
    startTime: '08:00',
    endTime: '08:55',
    venue: 'Online',
    stream: 'L200 IT-A'
  },
  {
    id: 'tt-l200-fri-3',
    courseId: 'crs-uenr-201',
    dayOfWeek: 5,
    startTime: '13:00',
    endTime: '14:55',
    venue: 'Online',
    stream: 'L200 IT-A'
  }
];

// Initial defaults set to official L200 IT-A schedule
export const INITIAL_COURSES: Course[] = OFFICIAL_L200_COURSES;
export const INITIAL_TIMETABLE: TimetableSlot[] = OFFICIAL_L200_TIMETABLE;

// Attendance starts empty as sessions are recorded live
export const INITIAL_ATTENDANCE: AttendanceRecord[] = [];

// Whitelist of authorized staff and class reps
export const INITIAL_AUTHORIZED_USERS: AuthorizedUser[] = [
  {
    id: 'auth-1',
    email: 'jonesdarko345@gmail.com',
    name: 'Jones Darko',
    role: 'hod',
    department: 'Department of Information Technology and Decision Sciences',
    addedAt: '2025-01-10'
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    action: 'System Initialized',
    details: 'UENR ITDS Level 200 IT-A timetable and course catalog initialized.',
    timestamp: new Date().toISOString(),
    user: 'System',
    type: 'timetable'
  }
];

export const INITIAL_SEMESTER: SemesterConfig = {
  name: 'First Semester 2026/2027',
  academicYear: '2026/2027',
  semester: 'Semester 1',
  startDate: '2026-10-26',
  endDate: '2027-01-29',
  isActive: true
};
