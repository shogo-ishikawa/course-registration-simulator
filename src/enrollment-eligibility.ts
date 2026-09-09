export type EnrollmentCapLimit = 20 | 22 | 24;
type EnrollmentSemester = "spring" | "fall";
type EligibilityCourse = { key: string; quarters: readonly number[] };

export const FALL_CALCULUS_RETAKE_MESSAGE =
  "後期の微分積分学Iは、前期に履修して単位を取得できなかった学生のみ再履修できます。単位取得済み・前期未履修の学生は追加できません。再履修の対象であることを確認してください。";

/** The first-year limit applies to both semesters. A saved or imported limit
 * must never enable relaxation for a first-year profile.
 */
export function isCapRelaxationEligible(year: number) {
  return Number.isInteger(year) && year >= 2;
}

export function effectiveCapLimit(year: number, requestedLimit: unknown): EnrollmentCapLimit {
  return isCapRelaxationEligible(year) && (requestedLimit === 22 || requestedLimit === 24)
    ? requestedLimit
    : 20;
}

export function normalizeCapLimits(
  year: number,
  requestedLimits?: Partial<Record<EnrollmentSemester, unknown>> | null,
): Record<EnrollmentSemester, EnrollmentCapLimit> {
  return {
    spring: effectiveCapLimit(year, requestedLimits?.spring),
    fall: effectiveCapLimit(year, requestedLimits?.fall),
  };
}

/** Use the normalized exact subject key, not a prefix: 微分積分学II must
 * remain unaffected. The course's actual quarters matter even if a student
 * opens a fall class while viewing the spring schedule.
 */
export function isFallCalculusRetakeCourse(course: EligibilityCourse) {
  return isCalculusI(course) &&
    course.quarters.some((quarter) => quarter === 3 || quarter === 4);
}

function isCalculusI(course: EligibilityCourse) {
  return course.key.normalize("NFKC").replace(/\s+/gu, "") === "微分積分学I";
}

/** A retained spring plan is history, not proof of credit. Once the student
 * explicitly confirms failing the spring course, it may coexist with one
 * fall retake. This exception must not permit two classes in the same term.
 */
export function areCalculusRetakePair(first: EligibilityCourse, second: EligibilityCourse) {
  if (!isCalculusI(first) || !isCalculusI(second)) return false;
  const isSpringOnly = (course: EligibilityCourse) => course.quarters.length > 0 &&
    course.quarters.every((quarter) => quarter === 1 || quarter === 2);
  const isFallOnly = (course: EligibilityCourse) => course.quarters.length > 0 &&
    course.quarters.every((quarter) => quarter === 3 || quarter === 4);
  return (isSpringOnly(first) && isFallOnly(second)) || (isFallOnly(first) && isSpringOnly(second));
}

/** This is an explicit student attestation, never the generic preference to
 * sort retakes first. Apply the same rule to add/replace/automatic placement
 * and to checking already restored schedules; restoration itself need not
 * discard the student's work.
 */
export function enrollmentEligibilityIssue(
  course: EligibilityCourse,
  fallCalculusRetakeConfirmed: boolean,
): string | null {
  return isFallCalculusRetakeCourse(course) && fallCalculusRetakeConfirmed !== true
    ? FALL_CALCULUS_RETAKE_MESSAGE
    : null;
}
