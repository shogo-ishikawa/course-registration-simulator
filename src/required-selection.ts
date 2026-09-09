export type SelectionSemester = "spring" | "fall";

type RequiredDefinition = { key: string; year: number };
type SelectableCourse = { id: string; key: string; year: number | null; quarters: number[] };

export function belongsToSemester(
  course: Pick<SelectableCourse, "id" | "quarters">,
  semester: SelectionSemester,
  quarters: number[],
  assignments: Record<string, SelectionSemester>,
) {
  const assigned = assignments[course.id];
  return assigned ? assigned === semester : course.quarters.some((quarter) => quarters.includes(quarter));
}

export function quarterLabel(course: Pick<SelectableCourse, "quarters">) {
  const quarters = [...new Set(course.quarters)].sort((a, b) => a - b);
  return quarters.length ? quarters.map((quarter) => `${quarter}Q`).join("・") : "開講Q要確認";
}

export function semesterQuarterLabel(
  course: Pick<SelectableCourse, "quarters">,
  assignedSemester?: SelectionSemester,
) {
  const spring = course.quarters.some((quarter) => quarter === 1 || quarter === 2);
  const fall = course.quarters.some((quarter) => quarter === 3 || quarter === 4);
  const semester = assignedSemester
    ? assignedSemester === "spring" ? "前期" : "後期"
    : spring && fall ? "前期・後期" : spring ? "前期" : fall ? "後期" : "学期要確認";
  const assignedQuarters = assignedSemester
    ? course.quarters.filter((quarter) => assignedSemester === "spring" ? quarter <= 2 : quarter >= 3)
    : course.quarters;
  return `${semester}${quarterLabel({ quarters: assignedQuarters })}`;
}

/** Use one decision for the pending list and automatic placement. Match exact
 * course keys: A and B are different subjects, even within the same lab series.
 * Existing manual selections always take precedence over a later lookup.
 */
export function deriveRequiredSelection<R extends RequiredDefinition, C extends SelectableCourse>({
  requiredCourses, candidates, selectedCourses, semester, quarters, assignments, deferredMatches,
}: {
  requiredCourses: R[];
  candidates: C[];
  selectedCourses: C[];
  semester: SelectionSemester;
  quarters: number[];
  assignments: Record<string, SelectionSemester>;
  deferredMatches: { course: C; classLabel: string }[];
}) {
  return requiredCourses.map((required) => {
    const allCandidates = candidates.filter((course) => course.key === required.key && course.year === required.year);
    const currentCandidates = allCandidates.filter((course) => course.quarters.some((quarter) => quarters.includes(quarter)));
    const selected = selectedCourses.filter((course) => course.key === required.key);
    const selectedCurrent = selected.filter((course) => belongsToSemester(course, semester, quarters, assignments));
    const selectedElsewhere = selected.filter((course) => !belongsToSemester(course, semester, quarters, assignments));
    const deferred = deferredMatches.filter((match) => match.course.key === required.key);
    const isCurrent = selectedCurrent.length > 0 || (
      selectedElsewhere.length === 0 && deferred.length === 0 &&
      (allCandidates.length === 0 || currentCandidates.length > 0)
    );
    return {
      required,
      candidates: currentCandidates,
      selectedCurrent,
      selectedElsewhere,
      deferred,
      isCurrent,
      pending: isCurrent && selected.length === 0,
    };
  });
}
