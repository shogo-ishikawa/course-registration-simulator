import { areCalculusRetakePair } from "./enrollment-eligibility.ts";

type ConflictSlot = { day: string; period: number; label: string };
export type ScheduleConflictCourse = {
  key: string;
  title: string;
  campus: string;
  quarters: readonly number[];
  slots: readonly ConflictSlot[];
};

function quartersOverlap(first: ScheduleConflictCourse, second: ScheduleConflictCourse) {
  return first.quarters.some((quarter) => second.quarters.includes(quarter));
}

function isPhysicalCampus(campus: string) {
  return campus === "実籾" || campus === "津田沼";
}

function needsCampusTransfer(first: ScheduleConflictCourse, second: ScheduleConflictCourse) {
  return isPhysicalCampus(first.campus) && isPhysicalCampus(second.campus) &&
    first.campus !== second.campus;
}

/** Check all overlapping slots before considering any campus transfer.
 * A selected course or slot encountered first must not hide an overlap
 * elsewhere in the proposed class's complete schedule.
 */
export function conflictMessage(
  course: ScheduleConflictCourse,
  selected: readonly ScheduleConflictCourse[],
  calculusRetakeConfirmed = false,
): string | null {
  if (selected.some((item) => item.key === course.key &&
    !(calculusRetakeConfirmed && areCalculusRetakePair(course, item)))) {
    return "同じ科目がすでに選択されています。";
  }

  const concurrentCourses = selected.filter((existing) => quartersOverlap(course, existing));
  for (const existing of concurrentCourses) {
    for (const slot of course.slots) {
      for (const existingSlot of existing.slots) {
        if (slot.day === existingSlot.day && slot.period === existingSlot.period) {
          return `${slot.label}は「${existing.title}」と重なっています。`;
        }
      }
    }
  }

  for (const existing of concurrentCourses) {
    if (!needsCampusTransfer(course, existing)) continue;
    for (const slot of course.slots) {
      for (const existingSlot of existing.slots) {
        if (slot.day === existingSlot.day && Math.abs(slot.period - existingSlot.period) === 1) {
          const earlierPeriod = Math.min(slot.period, existingSlot.period);
          const laterPeriod = Math.max(slot.period, existingSlot.period);
          return `${slot.day}曜日${earlierPeriod}・${laterPeriod}限で、「${existing.title}」（${existing.campus}）と「${course.title}」（${course.campus}）のキャンパス間移動が生じます。`;
        }
      }
    }
  }
  return null;
}

/** Report duplicate subjects and overlapping slots before transfer issues.
 * If a pair already overlaps, its adjacent slots are not also diagnosed as
 * travel: that combination must first be resolved as an overlap.
 */
export function detectedScheduleIssues(selected: readonly ScheduleConflictCourse[]): string[] {
  const overlaps: string[] = [];
  const transfers: string[] = [];
  for (let index = 0; index < selected.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < selected.length; nextIndex += 1) {
      const first = selected[index];
      const second = selected[nextIndex];
      if (!quartersOverlap(first, second)) continue;
      if (first.key === second.key) {
        overlaps.push(`「${first.title}」が重複して登録されています。`);
        continue;
      }

      const pairOverlaps: string[] = [];
      for (const firstSlot of first.slots) {
        for (const secondSlot of second.slots) {
          if (firstSlot.day === secondSlot.day && firstSlot.period === secondSlot.period) {
            pairOverlaps.push(`${firstSlot.label}で「${first.title}」と「${second.title}」が重複しています。`);
          }
        }
      }
      if (pairOverlaps.length > 0) {
        overlaps.push(...pairOverlaps);
        continue;
      }
      if (!needsCampusTransfer(first, second)) continue;
      for (const firstSlot of first.slots) {
        for (const secondSlot of second.slots) {
          if (firstSlot.day === secondSlot.day && Math.abs(firstSlot.period - secondSlot.period) === 1) {
            transfers.push(
              `${firstSlot.day}曜日${Math.min(firstSlot.period, secondSlot.period)}・${Math.max(firstSlot.period, secondSlot.period)}限で、「${first.title}」（${first.campus}）と「${second.title}」（${second.campus}）のキャンパス間移動が生じています。`,
            );
          }
        }
      }
    }
  }
  return [...new Set([...overlaps, ...transfers])];
}
