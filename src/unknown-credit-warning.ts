export type UnknownCreditSnapshot = {
  context: string;
  semester: "spring" | "fall";
  courseIds: string[];
};

/** Warn for newly selected courses with unknown credits, including restored
 * plans and plans viewed after switching the semester or student profile.
 */
export function newlyUnknownCreditIds(
  previous: UnknownCreditSnapshot | null,
  next: UnknownCreditSnapshot,
): string[] {
  const previousIds = new Set(previous &&
    previous.context === next.context && previous.semester === next.semester
    ? previous.courseIds : []);
  return [...new Set(next.courseIds)].filter(id => !previousIds.has(id));
}
