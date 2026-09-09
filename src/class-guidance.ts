/** Only enter rules after checking the actual official class table.
 * Links being reachable is not evidence of a student/class assignment.
 */
export type ClassRule = {
  studentFrom: string;
  studentTo: string;
  classLabel: string;
  courseId: string;
  courseKey: string;
  quarters: number[];
  instructors: string;
  slots: string[];
};

export type DepartmentGuidance = {
  guidanceUrl: string;
  classTableUrl: string;
  targetYear: number;
  verifiedAt: string | null;
  rules: ClassRule[];
};

export type GuidanceData = {
  academicYear: number;
  linksCheckedAt: string;
  departments: Record<string, DepartmentGuidance>;
};

type Candidate = {
  id: string;
  key: string;
  year: number | null;
  quarters: number[];
  instructors: string;
  slots: { label: string }[];
};

export function normalizeStudentNumber(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

function inStudentRange(value: string, from: string, to: string) {
  // Full identifiers, including admission year and department, must match.
  // Never guess a department or class from the final digits alone.
  const pattern = /^(\d{2}B\d{2})(\d{3})$/;
  const student = value.match(pattern);
  const start = from.match(pattern);
  const end = to.match(pattern);
  return Boolean(student && start && end && student[1] === start[1] &&
    student[1] === end[1] && Number(start[2]) <= Number(end[2]) &&
    Number(student[2]) >= Number(start[2]) && Number(student[2]) <= Number(end[2]));
}

function sameItems(a: (string | number)[], b: (string | number)[]) {
  return a.length === b.length && [...a].sort().every((value, i) => value === [...b].sort()[i]);
}

export function lookupClasses<T extends Candidate>(
  data: GuidanceData,
  profile: { department: string; year: number; academicYear: number; studentNumber: string; quarters: number[] },
  candidates: T[],
) {
  const info = data.departments[profile.department];
  const matches: { course: T; classLabel: string }[] = [];
  const blockedKeys: string[] = [];
  if (!info || data.academicYear !== profile.academicYear || info.targetYear !== profile.year) {
    return { status: "out-of-scope" as const, matches, blockedKeys };
  }
  if (!info.verifiedAt || !info.rules.length) return { status: "unverified" as const, matches, blockedKeys };
  const number = normalizeStudentNumber(profile.studentNumber);
  if (!number) return { status: "empty" as const, matches, blockedKeys };
  if (!/^\d{2}B\d{5}$/.test(number)) return { status: "invalid" as const, matches, blockedKeys };
  const rules = info.rules.filter((rule) =>
    inStudentRange(number, rule.studentFrom, rule.studentTo) &&
    rule.quarters.some((q) => profile.quarters.includes(q)),
  );
  for (const key of new Set(rules.map((rule) => rule.courseKey))) {
    const group = rules.filter((rule) => rule.courseKey === key);
    // Ambiguous or stale entries always require manual selection. The snapshot
    // prevents a refreshed workbook silently changing the meaning of an old ID.
    if (group.length !== 1) { blockedKeys.push(key); continue; }
    const rule = group[0];
    const course = candidates.find((candidate) => candidate.id === rule.courseId);
    if (!course || course.key !== key || course.year !== info.targetYear ||
      course.instructors !== rule.instructors ||
      !sameItems(course.quarters, rule.quarters) ||
      !sameItems(course.slots.map((slot) => slot.label), rule.slots)) {
      blockedKeys.push(key);
      continue;
    }
    matches.push({ course, classLabel: rule.classLabel });
  }
  return { status: blockedKeys.length ? "needs-review" as const : matches.length ? "matched" as const : "not-found" as const, matches, blockedKeys };
}
