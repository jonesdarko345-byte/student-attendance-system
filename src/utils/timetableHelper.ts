import { TimetableSlot, Course, Student } from '../types';

/**
 * Converts a "HH:MM" 24-hour time string into minutes since midnight.
 */
export const timeStringToMinutes = (timeStr?: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
};

/**
 * Normalizes known stream/division aliases (e.g. "IT A", "L200 IT-A", "IT 200 A")
 * so timetable slots, student records, and attendance sessions align consistently.
 */
export const normalizeStreamKey = (stream?: string): string => {
  if (!stream) return '';
  const norm = stream.trim().toLowerCase().replace(/[\-_]+/g, ' ').replace(/\s+/g, ' ');
  if (norm === 'all' || norm === 'all streams') return 'all';

  // Extract division letter A-F for IT/Stream/Division/Level-prefixed labels
  // e.g. "IT A", "IT-A", "Stream A", "L200 IT-A", "L200 ITA", "IT 200 A", "Level 200 Stream A", "Division A"
  const match = norm.match(
    /^(?:(?:level\s*[1-4]00|l\s*[1-4]00|[1-4]00)\s*)?(?:it|stream|division|div|group|grp)?\s*([a-f])(?:\s*(?:level\s*[1-4]00|l\s*[1-4]00|[1-4]00))?$/i
  ) || norm.match(
    /^(?:level\s*[1-4]00|l\s*[1-4]00|[1-4]00)?\s*it\s*(?:level\s*[1-4]00|l\s*[1-4]00|[1-4]00)?\s*([a-f])$/i
  );
  if (match && match[1]) {
    return `it ${match[1].toLowerCase()}`;
  }
  return norm;
};

export const streamsMatch = (recordStream?: string, requestedStream?: string): boolean => {
  if (
    !requestedStream ||
    requestedStream === 'All' ||
    requestedStream === 'all' ||
    requestedStream === 'All Streams'
  ) {
    return true;
  }
  if (!recordStream || recordStream === 'all') return true;
  if (recordStream === requestedStream) return true;

  const normRec = normalizeStreamKey(recordStream);
  const normReq = normalizeStreamKey(requestedStream);
  if (normRec === normReq) return true;

  return false;
};

/**
 * Extracts the academic level (e.g. "Level 200") from a university course code
 * such as "INFT 251", "UENR 201", "IT 301", or "CS 105".
 */
export const inferLevelFromCourseCode = (code?: string): string | null => {
  if (!code) return null;
  const match = code.trim().match(/\b[A-Za-z]{2,8}\s*-?\s*([1-4])\d{2}\b/) || code.trim().match(/([1-4])\d{2}/);
  if (!match) return null;
  return `Level ${match[1]}00`;
};

/**
 * Extracts an academic level from a stream label if encoded (e.g. "L200 IT-A" -> "Level 200").
 */
export const inferLevelFromStream = (stream?: string): string | null => {
  if (!stream) return null;
  const match = stream.match(/(?:^|\b|L)([1-4])00\b/i);
  if (!match) return null;
  return `Level ${match[1]}00`;
};

/**
 * Resolves a YYYY-MM-DD date string in the current week for a target weekday (1=Mon..6=Sat).
 */
export const resolveDateForWeekday = (targetDayOfWeek: number, referenceDate: Date = new Date()): string => {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const currentDay = ref.getDay(); // 0=Sun..6=Sat
  if (targetDayOfWeek >= 1 && targetDayOfWeek <= 6 && targetDayOfWeek !== currentDay) {
    const normalizedCurrent = currentDay === 0 ? 7 : currentDay;
    const diff = targetDayOfWeek - normalizedCurrent;
    ref.setDate(ref.getDate() + diff);
  }
  const yyyy = ref.getFullYear();
  const mm = String(ref.getMonth() + 1).padStart(2, '0');
  const dd = String(ref.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Determines whether a timetable slot is currently ongoing, upcoming, or has passed for today.
 */
export const getTimeSlotStatus = (
  slot: TimetableSlot,
  now: Date = new Date()
): 'ongoing' | 'upcoming' | 'passed' => {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMin = timeStringToMinutes(slot.startTime);
  const endMin = timeStringToMinutes(slot.endTime);

  // Ongoing with generous 20-minute pre-class arrival & 45-minute post-class roll-call buffer
  if (currentMinutes >= startMin - 20 && currentMinutes <= endMin + 45) {
    return 'ongoing';
  }
  if (currentMinutes < startMin - 20) {
    return 'upcoming';
  }
  return 'passed';
};

/**
 * Automatically determines the ongoing or most relevant timetable slot for the given date & time.
 * If class is in session, it automatically selects that active lecture slot.
 * If before class, it picks the next upcoming lecture slot today.
 * If after classes, it picks the last lecture slot of the day.
 */
export const getActiveTimetableSlot = (
  slots: TimetableSlot[],
  targetDateStr?: string,
  now: Date = new Date()
): TimetableSlot | null => {
  if (!slots || slots.length === 0) return null;

  const todayStr = now.toISOString().split('T')[0];
  const isTargetToday = !targetDateStr || targetDateStr === todayStr;

  // If viewing a past/future date, return the earliest scheduled lecture for that weekday
  if (!isTargetToday) {
    const sorted = [...slots].sort(
      (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
    );
    return sorted[0] || null;
  }

  // 1. Look for currently ONGOING lecture slot
  const ongoing = slots.find((s) => getTimeSlotStatus(s, now) === 'ongoing');
  if (ongoing) {
    return ongoing;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // 2. Look for the next UPCOMING lecture slot today
  const upcomingSlots = [...slots]
    .filter((s) => timeStringToMinutes(s.startTime) > currentMinutes)
    .sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));

  if (upcomingSlots.length > 0) {
    return upcomingSlots[0];
  }

  // 3. If all slots for today have passed, select the latest slot that ran today
  const sortedByLatest = [...slots].sort(
    (a, b) => timeStringToMinutes(b.startTime) - timeStringToMinutes(a.startTime)
  );

  return sortedByLatest[0] || slots[0];
};

export interface ResolvedCourseCohort {
  level: string;
  stream: string;
  slot: TimetableSlot | null;
  availableStreams: string[];
  matchedStudentsCount: number;
  source: 'slot' | 'roster' | 'course_code' | 'locked_rep' | 'default';
}

/**
 * Automatically resolves Academic Level and Class Stream/Division from a selected Course,
 * its Timetable schedule, and the Student roster so lecturers only have to pick a course.
 */
export const resolveCourseCohort = ({
  course,
  timetable,
  students,
  dayOfWeek,
  targetDate,
  preferredSlot,
  lockedStream
}: {
  course?: Course | null;
  timetable: TimetableSlot[];
  students: Student[];
  dayOfWeek: number;
  targetDate?: string;
  preferredSlot?: TimetableSlot | null;
  lockedStream?: string | null;
}): ResolvedCourseCohort => {
  if (!course) {
    return {
      level: 'all',
      stream: lockedStream || 'all',
      slot: null,
      availableStreams: [],
      matchedStudentsCount: students.length,
      source: lockedStream ? 'locked_rep' : 'default'
    };
  }

  // 1. Identify matching timetable slots for this course (today first, then any day)
  const slotsForCourseOnDay = timetable.filter(
    (s) =>
      s.courseId === course.id &&
      s.dayOfWeek === dayOfWeek &&
      (!lockedStream || streamsMatch(s.stream, lockedStream))
  );

  const slotsForCourseAnyDay = timetable.filter(
    (s) => s.courseId === course.id && (!lockedStream || streamsMatch(s.stream, lockedStream))
  );

  const matchedSlot =
    (preferredSlot && preferredSlot.courseId === course.id ? preferredSlot : null) ||
    getActiveTimetableSlot(slotsForCourseOnDay, targetDate) ||
    slotsForCourseAnyDay[0] ||
    null;

  // Distinct streams configured on timetable for this course
  const slotStreams = Array.from(
    new Set(
      slotsForCourseAnyDay
        .map((s) => s.stream?.trim())
        .filter((st): st is string => Boolean(st && st !== 'all'))
    )
  );

  // 2. Resolve Stream
  let resolvedStream = lockedStream || 'all';
  let source: ResolvedCourseCohort['source'] = lockedStream ? 'locked_rep' : 'default';

  if (!lockedStream) {
    if (matchedSlot?.stream && matchedSlot.stream !== 'all') {
      resolvedStream = matchedSlot.stream;
      source = 'slot';
    } else if (slotStreams.length === 1) {
      resolvedStream = slotStreams[0];
      source = 'slot';
    }
  }

  // 3. Resolve Academic Level from Course Code, Stream label, or matching Roster students
  let resolvedLevel = inferLevelFromCourseCode(course.code) || inferLevelFromStream(resolvedStream) || 'all';
  if (resolvedLevel !== 'all' && source === 'default') {
    source = 'course_code';
  }

  // If stream still 'all', inspect students matching the resolved level: if only 1 stream exists, pick it automatically
  if (!lockedStream && resolvedStream === 'all') {
    const levelScopedStudents = students.filter(
      (s) => resolvedLevel === 'all' || (s.level || 'Level 100') === resolvedLevel
    );
    const rosterStreams = Array.from(
      new Set(levelScopedStudents.map((s) => (s.stream || 'IT A').trim()).filter(Boolean))
    );
    if (rosterStreams.length === 1) {
      resolvedStream = rosterStreams[0];
      if (source === 'default') source = 'roster';
    }
  }

  // If level still 'all', inspect students matching resolvedStream
  if (resolvedLevel === 'all') {
    const streamScopedStudents = students.filter(
      (s) => resolvedStream === 'all' || streamsMatch(s.stream || 'IT A', resolvedStream)
    );
    const rosterLevels = Array.from(
      new Set(streamScopedStudents.map((s) => (s.level || 'Level 100').trim()).filter(Boolean))
    );
    if (rosterLevels.length === 1) {
      resolvedLevel = rosterLevels[0];
      if (source === 'default') source = 'roster';
    }
  }

  const matchedStudentsCount = students.filter((s) => {
    const lvlOk = resolvedLevel === 'all' || (s.level || 'Level 100') === resolvedLevel;
    const streamOk = resolvedStream === 'all' || streamsMatch(s.stream || 'IT A', resolvedStream);
    return lvlOk && streamOk;
  }).length;

  return {
    level: resolvedLevel,
    stream: resolvedStream,
    slot: matchedSlot,
    availableStreams: slotStreams,
    matchedStudentsCount,
    source
  };
};

