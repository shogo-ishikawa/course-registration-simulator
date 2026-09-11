// Confirmed correction supplied on 2026-09-11: all introductory foreign
// language offerings carry one credit, including newly added class sections.
export function isIntroductoryForeignLanguage(key) {
  const normalized = String(key ?? "").normalize("NFKC").replace(/\s+/gu, "");
  return /^初習外国語(?:\([^()]+\))?$/u.test(normalized);
}

export function applyCourseCreditOverrides(key, credit, departmentKeys) {
  if (!isIntroductoryForeignLanguage(key)) return credit;
  return {
    byDepartment: Object.fromEntries(departmentKeys.map((department) => [department, 1])),
    defaultCredits: 1,
  };
}
