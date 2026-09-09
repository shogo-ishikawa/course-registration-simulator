type DepartmentCourse = { category: string; title: string; restriction: string };

const departmentTokens: Record<string, string[]> = {
  機械: ["機械工学科", "機械"],
  電気: ["電気電子工学科", "電気"],
  土木: ["土木工学科", "土木"],
  建築: ["建築工学科", "建築"],
  応化: ["応用分子化学科", "応化"],
  ＭＡ: ["マネジメント工学科", "MA", "ＭＡ"],
  数情: ["数理情報工学科", "数情"],
  環境: ["環境安全工学科", "環境"],
  創生: ["創生デザイン学科", "創生"],
};

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

export function isCourseCompatible(course: DepartmentCourse, department: string) {
  if (course.category === department || course.category === "共通") return true;
  if (["ＢＥ", "教職"].includes(course.category)) return true;
  if (course.category !== "教養") return false;

  const context = normalize(`${course.title}${course.restriction}`);
  // A joint class explicitly lists every eligible department. Mentioning a
  // second department must not exclude the first department named on the class.
  const mentionsOwnDepartment = (departmentTokens[department] ?? []).some((token) =>
    context.includes(normalize(token)),
  );
  if (mentionsOwnDepartment) return true;
  const mentionsAnyDepartment = Object.values(departmentTokens).some((tokens) =>
    tokens.some((token) => context.includes(normalize(token))),
  );
  return !mentionsAnyDepartment;
}
