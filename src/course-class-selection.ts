type ClassCandidate = {
  id: string;
  key: string;
  year: number | null;
  quarters: number[];
  slots: { label: string; day?: string; period?: number }[];
};

type ClassLookup<T> = {
  status: string;
  matches: readonly { course: T; classLabel: string }[];
  deferredMatches: readonly { course: T; classLabel: string }[];
  blockedKeys: readonly string[];
};

function compareNumbers(a: number[], b: number[]) {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function orderedSlots(course: ClassCandidate) {
  return course.slots.map((slot) => {
    const day = slot.day ?? slot.label.slice(0, 1);
    const dayIndex = ["月", "火", "水", "木", "金", "土", "日"].indexOf(day);
    const period = slot.period ?? Number(slot.label.slice(1));
    return (dayIndex < 0 ? 7 : dayIndex) * 100 + (Number.isFinite(period) ? period : 99);
  }).sort((a, b) => a - b);
}

/** Choose a default class only after the student chooses the subject.
 * Candidates must already be filtered by department and eligible year, but
 * must include both semesters so an assigned quarter is never lost.
 * All alternatives stay available for a manual correction.
 */
export function buildCourseClassSelection<T extends ClassCandidate>({
  course,
  candidates,
  lookup,
  coveredCourseKeys,
}: {
  course: T;
  candidates: readonly T[];
  lookup: ClassLookup<T>;
  coveredCourseKeys: readonly string[] | ReadonlySet<string>;
}): { options: T[]; recommended: T | null; defaultCourse: T; isClassDivided: boolean } {
  const sameSubject = (candidate: T) => candidate.key === course.key && candidate.year === course.year;
  const byId = new Map(candidates.filter(sameSubject).map((candidate) => [candidate.id, candidate]));
  // A saved/manual selection remains selectable even if eligibility filters
  // no longer include it. Merely opening the chooser must not remove it.
  if (!byId.has(course.id)) byId.set(course.id, course);
  const options = [...byId.values()].sort((a, b) =>
    compareNumbers([...a.quarters].sort((x, y) => x - y), [...b.quarters].sort((x, y) => x - y)) ||
    compareNumbers(orderedSlots(a), orderedSlots(b)) || a.id.localeCompare(b.id));

  let recommended: T | null = null;
  if ((lookup.status === "matched" || lookup.status === "needs-review") && !lookup.blockedKeys.includes(course.key)) {
    const assignments = new Map([...lookup.matches, ...lookup.deferredMatches]
      .map((match) => match.course)
      .filter(sameSubject)
      .map((candidate) => [candidate.id, candidate]));
    if (assignments.size === 1) {
      const assigned = assignments.values().next().value;
      // A lookup against a broader/stale candidate list cannot introduce a
      // class that is absent from the actual chooser's eligible options.
      recommended = assigned ? byId.get(assigned.id) ?? null : null;
    }
  }

  return {
    options,
    recommended,
    defaultCourse: recommended ?? course,
    isClassDivided: new Set(coveredCourseKeys).has(course.key) || options.length > 1,
  };
}
