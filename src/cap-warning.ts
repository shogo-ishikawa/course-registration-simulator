export type CapSnapshot = {
  context: string;
  semester: "spring" | "fall";
  credits: number;
  limit: number;
};

/** Warn on entering an over-limit plan or worsening it, while allowing the
 * student to remove courses without interrupting each step of the correction.
 */
export function shouldWarnCap(previous: CapSnapshot | null, next: CapSnapshot) {
  return next.credits > next.limit && (!previous ||
    previous.context !== next.context || previous.semester !== next.semester ||
    previous.credits <= previous.limit || next.credits > previous.credits ||
    next.limit < previous.limit);
}
