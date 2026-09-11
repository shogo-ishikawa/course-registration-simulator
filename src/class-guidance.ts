/** Only enter rules after checking the actual official class table.
 * Links being reachable is not evidence of a student/class assignment.
 */
export type ClassRule = {
  studentFrom?: string;
  studentTo?: string;
  studentRanges?: { from: string; to: string }[];
  classLabel: string;
  courseId: string;
  courseKey: string;
  quarters: number[];
  instructors: string;
  slots: string[];
  campus?: string;
  room?: string;
  sourcePage?: number;
  // Omitted for rules from the department's original sourceFile.
  sourceId?: string;
};

export type DepartmentGuidance = {
  guidanceUrl: string;
  classTableUrl: string;
  targetYear: number;
  verifiedAt: string | null;
  rules: ClassRule[];
  // A listed subject with no verified match must not use the single-candidate
  // fallback: the source may contain course-track conditions or exceptions.
  coveredCourseKeys?: string[];
  sourceFile?: string;
  sourceSha256?: string;
  sources?: Record<string, {
    kind: "pdf" | "instructor-instruction";
    title: string;
    verifiedAt: string;
    file?: string;
    sha256?: string;
  }>;
  studentNotes?: { courseKeys: string[]; message: string }[];
  reviewNotes?: { courseKey: string; reason: string; sourcePage: number }[];
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
  campus?: string;
  room?: string;
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
  const deferredMatches: { course: T; classLabel: string }[] = [];
  const blockedKeys: string[] = [];
  const result = <S extends string>(status: S) => ({ status, matches, deferredMatches, blockedKeys });
  if (!info || data.academicYear !== profile.academicYear || info.targetYear !== profile.year) {
    return result("out-of-scope");
  }
  if (!info.verifiedAt || !info.rules.length) return result("unverified");
  const number = normalizeStudentNumber(profile.studentNumber);
  if (!number) return result("empty");
  if (!/^\d{2}B\d{5}$/.test(number)) return result("invalid");
  const rules = info.rules.filter((rule) => {
    const ranges = rule.studentRanges ?? [{ from: rule.studentFrom ?? "", to: rule.studentTo ?? "" }];
    return ranges.some((range) => inStudentRange(number, range.from, range.to));
  });
  // Resolve across the whole year first. A verified assignment in 3Q must not
  // let the planner offer the same subject's 1Q/2Q classes for this student.
  for (const key of new Set([...rules.map((rule) => rule.courseKey), ...(info.coveredCourseKeys ?? [])])) {
    const group = rules.filter((rule) => rule.courseKey === key);
    // Ambiguous or stale entries always require manual selection. The snapshot
    // prevents a refreshed workbook silently changing the meaning of an old ID.
    if (group.length !== 1) {
      if (group.length || candidates.some((course) => course.key === key &&
        course.quarters.some((q) => profile.quarters.includes(q)))) blockedKeys.push(key);
      continue;
    }
    const rule = group[0];
    const course = candidates.find((candidate) => candidate.id === rule.courseId);
    if (!course || course.key !== key || course.year !== info.targetYear ||
      course.instructors !== rule.instructors ||
      (rule.campus !== undefined && course.campus !== rule.campus) ||
      (rule.room !== undefined && course.room !== rule.room) ||
      !sameItems(course.quarters, rule.quarters) ||
      !sameItems(course.slots.map((slot) => slot.label), rule.slots)) {
      blockedKeys.push(key);
      continue;
    }
    const target = rule.quarters.some((q) => profile.quarters.includes(q)) ? matches : deferredMatches;
    target.push({ course, classLabel: rule.classLabel });
  }
  return result(blockedKeys.length ? "needs-review" : matches.length || deferredMatches.length ? "matched" : "not-found");
}
