type RequiredDefinition = { key: string; year: number };
type AutoCourse = { id: string; key: string; year: number | null; quarters: number[] };
type ClassLookup<C> = {
  status: string;
  matches: { course: C }[];
  deferredMatches: { course: C }[];
  blockedKeys: string[];
};

/** Explicitly reapply verified required classes after a profile correction.
 * The required definitions are the only authority for enrolling subjects;
 * the class table may contain electives and never makes them required.
 * Existing class replacements are validated together, so swaps do not clash
 * with classes that are about to be removed. A failed replacement preserves
 * the whole original plan. Independent additions may still be skipped.
 */
export function planRequiredAutoPlacement<R extends RequiredDefinition, C extends AutoCourse>({
  requiredCourses, candidates, selectedCourses, quarters, lookup,
  coveredCourseKeys = [], isAutoEligible = () => true, conflictMessage,
}: {
  requiredCourses: R[];
  candidates: C[];
  selectedCourses: C[];
  quarters: number[];
  lookup: ClassLookup<C>;
  coveredCourseKeys?: readonly string[];
  isAutoEligible?: (course: C) => boolean;
  conflictMessage: (course: C, selected: C[]) => string | null;
}) {
  const replacements: { required: R; previous: C[]; course: C }[] = [];
  const additions: { required: R; course: C; mapped: boolean }[] = [];
  const skipped: { required: R; reason: string }[] = [];
  const conflicts: { course: C; message: string }[] = [];
  const covered = new Set(coveredCourseKeys);
  const blocked = new Set(lookup.blockedKeys);
  const canMap = lookup.status === "matched" || lookup.status === "needs-review";
  const definitions = requiredCourses.filter((required, index) => requiredCourses.findIndex((other) =>
    other.key === required.key && other.year === required.year) === index);

  for (const required of definitions) {
    const existing = selectedCourses.filter((course) => course.key === required.key);
    const currentYearExisting = existing.filter((course) => course.year === required.year);
    // A past-year or otherwise nonmatching selection must never be reclassified
    // using the current cohort's table.
    if (existing.length !== currentYearExisting.length) continue;
    if (existing.some((course) => !isAutoEligible(course))) continue;
    const allCandidates = candidates.filter((course) => course.key === required.key && course.year === required.year);
    const matches = canMap ? [...lookup.matches, ...lookup.deferredMatches]
      .filter((match) => match.course.key === required.key && match.course.year === required.year) : [];
    const uniqueMatches = [...new Map(matches.map((match) => [match.course.id, match.course])).values()];
    const mapped = !blocked.has(required.key) && uniqueMatches.length === 1
      ? allCandidates.find((course) => course.id === uniqueMatches[0].id) : undefined;

    if (mapped) {
      if (!isAutoEligible(mapped)) {
        skipped.push({ required, reason: "履修条件を確認して手動で選択してください" });
        continue;
      }
      if (existing.length) {
        if (existing.length !== 1 || existing[0].id !== mapped.id) {
          replacements.push({ required, previous: existing, course: mapped });
        }
      } else if (mapped.quarters.some((quarter) => quarters.includes(quarter))) {
        additions.push({ required, course: mapped, mapped: true });
      }
      continue;
    }

    const currentCandidates = allCandidates.filter((course) => course.quarters.some((quarter) => quarters.includes(quarter)));
    if (existing.length || currentCandidates.length) {
      if (blocked.has(required.key) || covered.has(required.key) || uniqueMatches.length > 0) {
        skipped.push({ required, reason: "学籍番号による指定クラスを確定できません" });
        continue;
      }
    }
    if (existing.length) continue;
    if (!currentCandidates.length) continue;
    const eligible = currentCandidates.filter(isAutoEligible);
    if (eligible.length !== 1) {
      skipped.push({ required, reason: eligible.length ? "クラスを手動で選択してください" : "履修条件を確認して手動で選択してください" });
      continue;
    }
    additions.push({ required, course: eligible[0], mapped: false });
  }

  const removedIds = new Set(replacements.flatMap((replacement) => replacement.previous.map((course) => course.id)));
  const preserved = selectedCourses.filter((course) => !removedIds.has(course.id));
  const replacementCourses = replacements.map((replacement) => replacement.course);
  for (const [index, course] of replacementCourses.entries()) {
    const message = conflictMessage(course, [...preserved, ...replacementCourses.filter((_, otherIndex) => index !== otherIndex)]);
    if (message) conflicts.push({ course, message });
  }
  if (conflicts.length) {
    return { selectedCourses: [...selectedCourses], added: [] as C[], replacements: [] as typeof replacements,
      skipped, conflicts, changed: false, classCount: 0 };
  }

  // Keep existing course order, replacing a class at its former position.
  const replacementByOldId = new Map(replacements.flatMap((replacement) =>
    replacement.previous.map((course) => [course.id, replacement.course] as const)));
  const next = [...new Map(selectedCourses.map((course) => {
    const replacement = replacementByOldId.get(course.id) ?? course;
    return [replacement.id, replacement] as const;
  })).values()];
  const added: C[] = [];
  let classCount = replacements.length;
  for (const addition of additions) {
    const message = conflictMessage(addition.course, next);
    if (message) {
      skipped.push({ required: addition.required, reason: message });
      continue;
    }
    added.push(addition.course);
    next.push(addition.course);
    if (addition.mapped) classCount++;
  }
  return { selectedCourses: next, added, replacements, skipped, conflicts,
    changed: added.length > 0 || replacements.length > 0, classCount };
}
