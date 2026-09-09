export type OutputDay = "月" | "火" | "水" | "木" | "金" | "土";
export type OutputSemester = "spring" | "fall";
export type TimetableOutputScope = OutputSemester | "q1" | "q2" | "q3" | "q4";

/** Only the shared output fields are required; original course objects and all
 * their fields are retained so image and print output use the same information.
 */
export type OutputCourse = {
  id: string;
  title: string;
  term: string;
  quarters: number[];
  campus: string;
  room: string;
  instructors: string;
  slots: { day: string; period: number; label: string }[];
};

export type QuarterTimetable<C extends OutputCourse = OutputCourse> = {
  quarter: number;
  title: string;
  days: OutputDay[];
  periods: number[];
  rows: { period: number; cells: { day: OutputDay; courses: C[] }[] }[];
  extraCourses: C[];
};

const weekdays: OutputDay[] = ["月", "火", "水", "木", "金"];
const allDays: OutputDay[] = [...weekdays, "土"];
const scopeQuarters: Record<TimetableOutputScope, number[]> = {
  spring: [1, 2], fall: [3, 4], q1: [1], q2: [2], q3: [3], q4: [4],
};

export function quartersForOutput(scope: TimetableOutputScope): number[] {
  const quarters = scopeQuarters[scope];
  if (!quarters) throw new Error("出力する学期・クォーターを選択してください。");
  return [...quarters];
}

export function outputScopeLabel(scope: TimetableOutputScope): string {
  const quarters = quartersForOutput(scope);
  return scope === "spring" ? "前期（1Q・2Q）"
    : scope === "fall" ? "後期（3Q・4Q）" : `${quarters[0]}Q`;
}

/** A saved term assignment limits annual/intensive selections to that term.
 * Ordinary courses still require an exact quarter match: selecting fall must
 * never place a Q4 lecture on the Q3 weekly timetable.
 */
function isInQuarter(course: OutputCourse, quarter: number, assigned?: OutputSemester): boolean {
  const semester: OutputSemester = quarter <= 2 ? "spring" : "fall";
  if (assigned && assigned !== semester) return false;
  const isSpecial = course.term.includes("通年") || course.term.includes("集中");
  if (isSpecial && assigned) return true;
  const knownQuarters = course.quarters.filter((value) => Number.isInteger(value) && value >= 1 && value <= 4);
  if (knownQuarters.length) return knownQuarters.includes(quarter);
  // Keep undated selections visible in the separate list, rather than silently
  // omitting a chosen subject. A known term still restricts the visible pages.
  if (course.term.includes("前")) return semester === "spring";
  if (course.term.includes("後")) return semester === "fall";
  return true;
}

function hasWeeklySlots(course: OutputCourse): boolean {
  if (course.term.includes("集中") || course.slots.length === 0) return false;
  const knownQuarter = course.quarters.some((value) => Number.isInteger(value) && value >= 1 && value <= 4);
  if (!knownQuarter && !course.term.includes("通年")) return false;
  return course.slots.every((slot) =>
    allDays.includes(slot.day as OutputDay) && Number.isInteger(slot.period) && slot.period > 0);
}

/** Build one weekly timetable. Multi-slot and overlapping subjects stay visible
 * in every matching cell. Intensive/undated/unslotted subjects are listed once
 * below it, even when the source happens to contain a weekday/time for them.
 */
export function buildQuarterTimetable<C extends OutputCourse>(
  selectedCourses: C[],
  targetQuarter: number,
  assignments: Record<string, OutputSemester> = {},
): QuarterTimetable<C> {
  if (!Number.isInteger(targetQuarter) || targetQuarter < 1 || targetQuarter > 4) {
    throw new Error("出力するクォーターは1Q〜4Qから選択してください。");
  }
  const unique = selectedCourses.filter((course, index, courses) =>
    courses.findIndex((candidate) => candidate.id === course.id) === index);
  const included = unique.filter((course) => isInQuarter(course, targetQuarter, assignments[course.id]));
  const weekly = included.filter(hasWeeklySlots);
  const extraCourses = included.filter((course) => !hasWeeklySlots(course));
  const days = weekly.some((course) => course.slots.some((slot) => slot.day === "土"))
    ? [...allDays] : [...weekdays];
  const periods = [...new Set([1, 2, 3, 4, 5, ...weekly.flatMap((course) => course.slots.map((slot) => slot.period))])]
    .sort((a, b) => a - b);
  return {
    quarter: targetQuarter,
    title: `${targetQuarter}Q 時間割`,
    days,
    periods,
    rows: periods.map((period) => ({
      period,
      cells: days.map((day) => ({
        day,
        courses: weekly.filter((course) => course.slots.some((slot) => slot.day === day && slot.period === period)),
      })),
    })),
    extraCourses,
  };
}
