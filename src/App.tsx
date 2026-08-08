import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import courseDataJson from "./data/course-data.json";
import updateInfoJson from "./data/update-info.json";
import updateHistoryJson from "./data/update-history.json";

type Day = "月" | "火" | "水" | "木" | "金" | "土";
type Semester = "spring" | "fall";
type CapLimit = 20 | 22 | 24;
type ScheduleView = "quarter" | "annual" | "intensive";
type TextSize = "small" | "normal" | "large";
type ScheduleExportFormat = "xlsx" | "csv";
type BlockingError = { title: string; message: string; courseTitle: string };
type UpdateHistoryEntry = {
  updatedAt: string;
  message: string;
  source: "automatic" | "manual";
};
type SavedScheduleState = {
  department?: string;
  year?: number;
  semester?: Semester;
  quarter?: number;
  studentNumber?: string;
  toeicExempt?: boolean;
  retakePriority?: boolean;
  capLimits?: Partial<Record<Semester, CapLimit>>;
  scheduleView?: ScheduleView;
  textSize?: TextSize;
  selectedIds?: string[];
  selectionSources?: Record<string, "required" | "elective">;
  courseSemesterAssignments?: Record<string, Semester>;
};
type SavedScheduleFile = {
  schemaVersion: 1;
  academicYear: number;
  savedAt: string;
  note: string;
  state: SavedScheduleState;
  selectedCourseNames: string[];
};
type Slot = { day: Day; period: number; label: string };
type Course = {
  id: string;
  title: string;
  baseTitle: string;
  key: string;
  instructors: string;
  term: string;
  quarters: number[];
  year: number | null;
  category: string;
  campus: string;
  room: string;
  restriction: string;
  slots: Slot[];
  creditsByDepartment: Record<string, number>;
  defaultCredits: number | null;
  syllabusSearchUrl: string;
};
type RequiredCourse = {
  key: string;
  name: string;
  year: number;
  credits: number;
  sourcePages: number[];
};
type CourseData = {
  meta: {
    academicYear: number;
    sourceWorkbook: string;
    sourceGuide: string;
    coverage: Record<string, number>;
  };
  departments: Record<
    string,
    {
      name: string;
      required: RequiredCourse[];
      variantCount: number;
      sourcePagePairs: number[][];
    }
  >;
  courses: Course[];
};

const courseData = courseDataJson as CourseData;
const updateInfo = updateInfoJson as {
  appVersion: string;
  appUpdatedAt: string;
  timetableUpdatedAt: string;
  sourceWorkbook: string;
  sourcePageUrl: string;
  sourceSha256: string;
};
const buildUpdatedAt = import.meta.env.VITE_BUILD_TIME || updateInfo.appUpdatedAt;
const buildCommit = import.meta.env.VITE_BUILD_COMMIT || "local";
const timetableSourcePage = updateInfo.sourcePageUrl;
const updateHistory = updateHistoryJson as UpdateHistoryEntry[];
const firstYearGuidanceUrls: Record<string, string> = {
  機械: "https://sites.google.com/view/mimomi-guidance/home/mech_engr",
  電気: "https://sites.google.com/view/mimomi-guidance/home/elec_eng",
  土木: "https://sites.google.com/view/mimomi-guidance/home/civil_engr",
  建築: "https://sites.google.com/view/mimomi-guidance/home/arch_engr",
  応化: "https://sites.google.com/view/mimomi-guidance/home/amc",
  ＭＡ: "https://sites.google.com/view/mimomi-guidance/home/ma",
  数情: "https://sites.google.com/view/mimomi-guidance/home/math_engr",
  環境: "https://sites.google.com/view/mimomi-guidance/home/sust_engr",
  創生: "https://sites.google.com/view/mimomi-guidance/home/cd",
};
const days: Day[] = ["月", "火", "水", "木", "金", "土"];
const periods = [1, 2, 3, 4, 5];
const semesterDetails: Record<Semester, { label: string; quarters: number[] }> = {
  spring: { label: "前期", quarters: [1, 2] },
  fall: { label: "後期", quarters: [3, 4] },
};
const departmentKeys = Object.keys(courseData.departments);
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

const capExemptKeys = new Set(
  [
    "生産実習",
    "卒業研究1",
    "卒業研究2",
    "エンジニアリング・デザイン型卒業研究1",
    "エンジニアリング・デザイン型卒業研究2",
    "英語コミュニケーション基礎",
    "英語コミュニケーション応用I",
    "英語コミュニケーション応用II",
    "グローバル・ビジネスエンジニアリングI",
    "グローバル・ビジネスエンジニアリングII",
    "グローバル・ビジネスエンジニアリングIII",
    "技術と経営",
    "事業継承者・企業家の実務I",
    "事業継承者・企業家の実務II",
    "ロボットデザイン入門",
    "ロボットデザイン基礎I",
    "ロボットデザイン基礎II",
    "ロボットデザイン実践I",
    "ロボットデザイン実践II",
    "つくりかたマップ",
    "なんでも作るジム",
    "チャレンジ・ハッカソン",
    "物理学実験(コンピュータ活用を含む)",
    "化学実験(コンピュータ活用を含む)",
    "生物学実験(コンピュータ活用を含む)",
    "地学実験(コンピュータ活用を含む)",
    "情報と職業",
  ].map((value) => normalize(value)),
);

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

function formatUpdateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatHistoryEntry(entry: UpdateHistoryEntry) {
  const date = new Date(entry.updatedAt);
  if (Number.isNaN(date.getTime())) return entry.message;
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `[${value("year")}年${value("month")}月${value("day")}日 ${value("hour")}:${value("minute")}] ${entry.message}`;
}

function asCapLimit(value: unknown): CapLimit {
  return value === 22 || value === 24 ? value : 20;
}

function courseCredits(course: Course, department: string) {
  return course.creditsByDepartment[department] ?? course.defaultCredits;
}

function quartersOverlap(a: Course, b: Course) {
  return a.quarters.some((quarter) => b.quarters.includes(quarter));
}

function isPhysicalCampus(campus: string) {
  return campus === "実籾" || campus === "津田沼";
}

function isCapExempt(course: Course) {
  return course.term.includes("集中") || capExemptKeys.has(course.key);
}

function isAnnualCourse(course: Course) {
  return course.term.includes("通年");
}

function isIntensiveCourse(course: Course) {
  return course.term.includes("集中");
}

function isSpecialAvailableInSemester(course: Course, semester: Semester) {
  if (isAnnualCourse(course)) return true;
  if (!isIntensiveCourse(course)) return false;
  if (course.term.includes("前")) return semester === "spring";
  if (course.term.includes("後")) return semester === "fall";
  return true;
}

function intensiveTimingLabel(course: Course) {
  if (course.term.includes("前")) return "前期に登録";
  if (course.term.includes("後")) return "後期に登録";
  return "実施時期は要確認";
}

function isCompatible(course: Course, department: string) {
  if (course.category === department || course.category === "共通") return true;
  if (["ＢＥ", "教職"].includes(course.category)) return true;
  if (course.category !== "教養") return false;

  const context = normalize(`${course.title}${course.restriction}`);
  const mentionsAnotherDepartment = departmentKeys.some(
    (key) =>
      key !== department &&
      departmentTokens[key].some((token) => context.includes(normalize(token))),
  );
  if (mentionsAnotherDepartment) return false;

  const mentionsOwnDepartment = departmentTokens[department].some((token) =>
    context.includes(normalize(token)),
  );
  const mentionsAnyDepartment = departmentKeys.some((key) =>
    departmentTokens[key].some((token) => context.includes(normalize(token))),
  );
  return mentionsOwnDepartment || !mentionsAnyDepartment;
}

function conflictMessage(course: Course, selected: Course[]) {
  if (selected.some((item) => item.key === course.key)) {
    return "同じ科目がすでに選択されています。";
  }

  for (const existing of selected) {
    if (!quartersOverlap(course, existing)) continue;
    for (const slot of course.slots) {
      for (const existingSlot of existing.slots) {
        if (slot.day !== existingSlot.day) continue;
        if (slot.period === existingSlot.period) {
          return `${slot.label}は「${existing.title}」と重なっています。`;
        }
        if (
          Math.abs(slot.period - existingSlot.period) === 1 &&
          isPhysicalCampus(course.campus) &&
          isPhysicalCampus(existing.campus) &&
          course.campus !== existing.campus
        ) {
          const earlierPeriod = Math.min(slot.period, existingSlot.period);
          const laterPeriod = Math.max(slot.period, existingSlot.period);
          return `${slot.day}曜日${earlierPeriod}・${laterPeriod}限で、「${existing.title}」（${existing.campus}）と「${course.title}」（${course.campus}）のキャンパス間移動が生じます。`;
        }
      }
    }
  }
  return null;
}

function slotLabel(course: Course) {
  return course.slots.length
    ? course.slots.map((slot) => slot.label).join("・")
    : "時間外・集中";
}

export default function Home() {
  const [department, setDepartment] = useState("機械");
  const [year, setYear] = useState(1);
  const [semester, setSemester] = useState<Semester>("spring");
  const [quarter, setQuarter] = useState(1);
  const [scheduleView, setScheduleView] = useState<ScheduleView>("quarter");
  const [textSize, setTextSize] = useState<TextSize>("normal");
  const [studentNumber, setStudentNumber] = useState("");
  const [toeicExempt, setToeicExempt] = useState(false);
  const [retakePriority, setRetakePriority] = useState(false);
  const [capLimits, setCapLimits] = useState<Record<Semester, CapLimit>>({
    spring: 20,
    fall: 20,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionSources, setSelectionSources] = useState<Record<string, "required" | "elective">>({});
  const [courseSemesterAssignments, setCourseSemesterAssignments] = useState<Record<string, Semester>>({});
  const [requiredEditMode, setRequiredEditMode] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ day: Day; period: number } | null>(null);
  const [detailCourse, setDetailCourse] = useState<Course | null>(null);
  const [syllabusCopyResult, setSyllabusCopyResult] = useState<{
    courseId: string;
    status: "copied" | "failed";
  } | null>(null);
  const [requiredOpenKey, setRequiredOpenKey] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [specialSearch, setSpecialSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [blockingError, setBlockingError] = useState<BlockingError | null>(null);
  const [lastBlockedIssue, setLastBlockedIssue] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [updateHistoryOpen, setUpdateHistoryOpen] = useState(false);
  const [scheduleExportFormat, setScheduleExportFormat] = useState<ScheduleExportFormat>("xlsx");
  const [scheduleExporting, setScheduleExporting] = useState(false);
  const [printSemester, setPrintSemester] = useState<Semester>("spring");

  const courseById = useMemo(
    () => new Map(courseData.courses.map((course) => [course.id, course])),
    [],
  );

  const selectedCourses = useMemo(
    () => selectedIds.map((id) => courseById.get(id)).filter((course): course is Course => Boolean(course)),
    [courseById, selectedIds],
  );

  const semesterQuarters = semesterDetails[semester].quarters;
  const semesterLabel = semesterDetails[semester].label;

  function courseBelongsToActiveSemester(course: Course) {
    const assignedSemester = courseSemesterAssignments[course.id];
    return assignedSemester
      ? assignedSemester === semester
      : course.quarters.some((item) => semesterQuarters.includes(item));
  }

  const requiredForProfile = useMemo(() => {
    const required = courseData.departments[department].required.filter((course) => course.year === year);
    if (!toeicExempt) return required;
    return required.filter((course) => !["英語I", "英語II"].includes(course.key));
  }, [department, toeicExempt, year]);

  const compatibleCourses = useMemo(
    () =>
      courseData.courses.filter(
        (course) =>
          isCompatible(course, department) &&
          course.year !== null &&
          course.year <= year,
      ),
    [department, year],
  );

  const requiredForSemester = useMemo(
    () =>
      requiredForProfile.filter((required) => {
        const candidates = compatibleCourses.filter(
          (course) => course.key === required.key && course.year === year,
        );
        return (
          candidates.length === 0 ||
          candidates.some((course) =>
            course.quarters.some((item) => semesterQuarters.includes(item)),
          )
        );
      }),
    [compatibleCourses, requiredForProfile, semesterQuarters, year],
  );

  function showBlockingIssue(course: Course, message: string) {
    const title = message.includes("キャンパス間移動")
      ? "キャンパス間移動が生じています"
      : message.includes("重なっています")
        ? "同じ曜日・時限に科目があります"
        : "この科目は追加できません";
    setNotice(null);
    setLastBlockedIssue(`「${course.title}」：${message}`);
    setBlockingError({ title, message, courseTitle: course.title });
  }

  async function copySyllabusCourseTitle(course: Course) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(course.title);
      setSyllabusCopyResult({ courseId: course.id, status: "copied" });
    } catch {
      setSyllabusCopyResult({ courseId: course.id, status: "failed" });
    }
  }

  function addCourse(
    course: Course,
    source: "required" | "elective",
    assignedSemester?: Semester,
  ) {
    const conflict = conflictMessage(course, selectedCourses);
    if (conflict) {
      showBlockingIssue(course, conflict);
      return false;
    }
    const effectiveSource = requiredForSemester.some((required) => required.key === course.key)
      ? "required"
      : source;
    setSelectedIds((current) => [...current, course.id]);
    setSelectionSources((current) => ({ ...current, [course.id]: effectiveSource }));
    if (assignedSemester) {
      setCourseSemesterAssignments((current) => ({
        ...current,
        [course.id]: assignedSemester,
      }));
    }
    setNotice(
      course.slots.length > 1
        ? `「${course.title}」を${slotLabel(course)}のセットで追加しました。`
        : `「${course.title}」を追加しました。`,
    );
    return true;
  }

  function removeCourse(course: Course) {
    setSelectedIds((current) => current.filter((id) => id !== course.id));
    setSelectionSources((current) => {
      const next = { ...current };
      delete next[course.id];
      return next;
    });
    setCourseSemesterAssignments((current) => {
      const next = { ...current };
      delete next[course.id];
      return next;
    });
    setNotice(`「${course.title}」を時間割から外しました。`);
  }

  function replaceRequiredCourse(currentCourse: Course, nextCourse: Course) {
    if (currentCourse.id === nextCourse.id) return false;
    const otherCourses = selectedCourses.filter((course) => course.id !== currentCourse.id);
    const conflict = conflictMessage(nextCourse, otherCourses);
    if (conflict) {
      showBlockingIssue(nextCourse, conflict);
      return false;
    }
    setSelectedIds((current) =>
      current.map((id) => (id === currentCourse.id ? nextCourse.id : id)),
    );
    setSelectionSources((current) => {
      const next = { ...current };
      delete next[currentCourse.id];
      next[nextCourse.id] = "required";
      return next;
    });
    setCourseSemesterAssignments((current) => {
      if (!current[currentCourse.id]) return current;
      const next = { ...current, [nextCourse.id]: current[currentCourse.id] };
      delete next[currentCourse.id];
      return next;
    });
    setNotice(
      `「${currentCourse.title}」を${slotLabel(nextCourse)}のクラスへ変更しました。`,
    );
    return true;
  }

  function autoPlaceRequired() {
    const automaticallyPlaced: Course[] = [];
    const preservedCourses = selectedCourses.filter(
      (course) => !courseBelongsToActiveSemester(course),
    );
    const nextSources: Record<string, "required" | "elective"> = Object.fromEntries(
      preservedCourses.map((course) => [course.id, selectionSources[course.id] ?? "elective"]),
    );

    for (const required of requiredForSemester) {
      const candidates = compatibleCourses.filter(
        (course) =>
          course.key === required.key &&
          course.year === year &&
          course.quarters.some((item) => semesterQuarters.includes(item)),
      );
      if (candidates.length !== 1) continue;
      const course = candidates[0];
      if (!conflictMessage(course, [...preservedCourses, ...automaticallyPlaced])) {
        automaticallyPlaced.push(course);
        nextSources[course.id] = "required";
      }
    }

    setSelectedIds([
      ...preservedCourses.map((course) => course.id),
      ...automaticallyPlaced.map((course) => course.id),
    ]);
    setSelectionSources(nextSources);
    setCourseSemesterAssignments(
      Object.fromEntries(
        preservedCourses
          .filter((course) => courseSemesterAssignments[course.id])
          .map((course) => [course.id, courseSemesterAssignments[course.id]]),
      ),
    );
    setNotice(
      `${semesterLabel}の共通必修${automaticallyPlaced.length}科目を配置しました。クラス分けがある必修は右側の候補から選んでください。`,
    );
  }

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("cit-course-simulator-2026");
        if (saved) {
          const state = JSON.parse(saved) as {
          department?: string;
          year?: number;
          semester?: Semester;
          quarter?: number;
          studentNumber?: string;
          toeicExempt?: boolean;
          retakePriority?: boolean;
          capLimits?: Partial<Record<Semester, CapLimit>>;
          scheduleView?: ScheduleView;
          textSize?: TextSize;
          selectedIds?: string[];
          selectionSources?: Record<string, "required" | "elective">;
          courseSemesterAssignments?: Record<string, Semester>;
          };
          if (state.department && courseData.departments[state.department]) setDepartment(state.department);
          if (state.year && state.year >= 1 && state.year <= 4) setYear(state.year);
          const savedQuarter = state.quarter && state.quarter >= 1 && state.quarter <= 4
            ? state.quarter
            : 1;
          const savedSemester = state.semester === "spring" || state.semester === "fall"
            ? state.semester
            : savedQuarter >= 3 ? "fall" : "spring";
          setSemester(savedSemester);
          if (["quarter", "annual", "intensive"].includes(state.scheduleView ?? "")) {
            setScheduleView(state.scheduleView ?? "quarter");
          }
          if (["small", "normal", "large"].includes(state.textSize ?? "")) {
            setTextSize(state.textSize ?? "normal");
          }
          setQuarter(
            semesterDetails[savedSemester].quarters.includes(savedQuarter)
              ? savedQuarter
              : semesterDetails[savedSemester].quarters[0],
          );
          setStudentNumber(state.studentNumber ?? "");
          setToeicExempt(Boolean(state.toeicExempt));
          setRetakePriority(Boolean(state.retakePriority));
          setCapLimits({
            spring: asCapLimit(state.capLimits?.spring),
            fall: asCapLimit(state.capLimits?.fall),
          });
          const validIds = (state.selectedIds ?? []).filter((id) => courseById.has(id));
          setSelectedIds(validIds);
          setSelectionSources(state.selectionSources ?? {});
          setCourseSemesterAssignments(
            Object.fromEntries(
              Object.entries(state.courseSemesterAssignments ?? {}).filter(
                ([id, value]) => courseById.has(id) && (value === "spring" || value === "fall"),
              ),
            ),
          );
        }
      } catch {
        window.localStorage.removeItem("cit-course-simulator-2026");
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [courseById]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      "cit-course-simulator-2026",
      JSON.stringify({
        department,
        year,
        semester,
        quarter,
        studentNumber,
        toeicExempt,
        retakePriority,
        capLimits,
        scheduleView,
        textSize,
        selectedIds,
        selectionSources,
        courseSemesterAssignments,
      }),
    );
  }, [
    capLimits,
    courseSemesterAssignments,
    department,
    hydrated,
    quarter,
    retakePriority,
    scheduleView,
    semester,
    selectedIds,
    selectionSources,
    studentNumber,
    textSize,
    toeicExempt,
    year,
  ]);

  const pendingRequired = useMemo(
    () =>
      requiredForSemester.filter(
        (required) =>
          !selectedCourses.some(
            (course) =>
              course.key === required.key &&
              course.quarters.some((item) => semesterQuarters.includes(item)),
          ),
      ),
    [requiredForSemester, selectedCourses, semesterQuarters],
  );

  const selectedRequiredChoices = useMemo(
    () =>
      requiredForSemester.flatMap((required) => {
        const candidates = compatibleCourses.filter(
          (course) =>
            course.key === required.key &&
            course.year === year &&
            course.quarters.some((item) => semesterQuarters.includes(item)),
        );
        if (candidates.length <= 1) return [];
        const selected = selectedCourses.find(
          (course) =>
            course.key === required.key &&
            course.quarters.some((item) => semesterQuarters.includes(item)),
        );
        return selected ? [{ required, course: selected, candidates }] : [];
      }),
    [compatibleCourses, requiredForSemester, selectedCourses, semesterQuarters, year],
  );

  const halfCourses = selectedCourses.filter((course) =>
    courseBelongsToActiveSemester(course),
  );
  const unknownCreditCourses = halfCourses.filter((course) => courseCredits(course, department) === null);
  const totalCredits = halfCourses.reduce(
    (sum, course) => sum + (courseCredits(course, department) ?? 0),
    0,
  );
  const capCredits = halfCourses.reduce(
    (sum, course) =>
      sum + (isCapExempt(course) ? 0 : (courseCredits(course, department) ?? 0)),
    0,
  );
  const capRelaxationEligible = year >= 2 || semester === "fall";
  const capLimit = capRelaxationEligible ? capLimits[semester] : 20;
  const capExceeded = capCredits > capLimit;

  const detectedScheduleIssues = (() => {
    const issues: string[] = [];
    for (let index = 0; index < halfCourses.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < halfCourses.length; nextIndex += 1) {
        const first = halfCourses[index];
        const second = halfCourses[nextIndex];
        if (!quartersOverlap(first, second)) continue;
        if (first.key === second.key) {
          issues.push(`「${first.title}」が重複して登録されています。`);
          continue;
        }
        for (const firstSlot of first.slots) {
          for (const secondSlot of second.slots) {
            if (firstSlot.day !== secondSlot.day) continue;
            if (firstSlot.period === secondSlot.period) {
              issues.push(`${firstSlot.label}で「${first.title}」と「${second.title}」が重複しています。`);
            } else if (
              Math.abs(firstSlot.period - secondSlot.period) === 1 &&
              isPhysicalCampus(first.campus) &&
              isPhysicalCampus(second.campus) &&
              first.campus !== second.campus
            ) {
              issues.push(
                `${firstSlot.day}曜日${Math.min(firstSlot.period, secondSlot.period)}・${Math.max(firstSlot.period, secondSlot.period)}限で、「${first.title}」（${first.campus}）と「${second.title}」（${second.campus}）のキャンパス間移動が生じています。`,
              );
            }
          }
        }
      }
    }
    return [...new Set(issues)];
  })();

  const automaticErrorCount =
    (capExceeded ? 1 : 0) + detectedScheduleIssues.length + (lastBlockedIssue ? 1 : 0);
  const automaticWarningCount = unknownCreditCourses.length;

  const slotCandidates = useMemo(() => {
    if (!activeSlot) return [];
    const query = normalize(courseSearch);
    return compatibleCourses
      .filter(
        (course) =>
          course.quarters.includes(quarter) &&
          course.slots.some(
            (slot) => slot.day === activeSlot.day && slot.period === activeSlot.period,
          ) &&
          !selectedIds.includes(course.id) &&
          (!query ||
            normalize(`${course.title}${course.instructors}${course.restriction}`).includes(query)),
      )
      .sort((a, b) => {
        const aYearRank = retakePriority ? (a.year ?? 99) : a.year === year ? 0 : 1;
        const bYearRank = retakePriority ? (b.year ?? 99) : b.year === year ? 0 : 1;
        const aRetake = /再履修|再$/.test(`${a.title}${a.restriction}`) ? 0 : 1;
        const bRetake = /再履修|再$/.test(`${b.title}${b.restriction}`) ? 0 : 1;
        return (
          aYearRank - bYearRank ||
          (retakePriority ? aRetake - bRetake : 0) ||
          a.title.localeCompare(b.title, "ja")
        );
      });
  }, [activeSlot, compatibleCourses, courseSearch, quarter, retakePriority, selectedIds, year]);

  const specialCourseCandidates = useMemo(() => {
    if (scheduleView === "quarter") return [];
    const query = normalize(specialSearch);
    return compatibleCourses
      .filter((course) => {
        const matchesType = scheduleView === "annual"
          ? isAnnualCourse(course)
          : isIntensiveCourse(course) && isSpecialAvailableInSemester(course, semester);
        return (
          matchesType &&
          (!query || normalize(`${course.title}${course.instructors}${course.restriction}`).includes(query))
        );
      })
      .sort((a, b) => {
        const aYearRank = a.year === year ? 0 : 1;
        const bYearRank = b.year === year ? 0 : 1;
        return aYearRank - bYearRank || (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title, "ja");
      });
  }, [compatibleCourses, scheduleView, semester, specialSearch, year]);

  const outOfGridCourses = selectedCourses.filter(
    (course) =>
      course.quarters.includes(quarter) &&
      (!course.slots.length || course.slots.some((slot) => slot.period > 5)),
  );

  function requiredCandidates(required: RequiredCourse) {
    return compatibleCourses
      .filter(
        (course) =>
          course.key === required.key &&
          course.year === year &&
          course.quarters.some((item) => semesterQuarters.includes(item)),
      )
      .sort((a, b) => slotLabel(a).localeCompare(slotLabel(b), "ja"));
  }

  function resetSchedule() {
    const preservedCourses = selectedCourses.filter(
      (course) => !courseBelongsToActiveSemester(course),
    );
    setSelectedIds(preservedCourses.map((course) => course.id));
    setSelectionSources(
      Object.fromEntries(
        preservedCourses.map((course) => [course.id, selectionSources[course.id] ?? "elective"]),
      ),
    );
    setCourseSemesterAssignments(
      Object.fromEntries(
        preservedCourses
          .filter((course) => courseSemesterAssignments[course.id])
          .map((course) => [course.id, courseSemesterAssignments[course.id]]),
      ),
    );
    setNotice(`${semesterLabel}の時間割を空にしました。もう一方の学期とプロフィール設定は残しています。`);
  }

  function downloadSchedule() {
    const payload: SavedScheduleFile = {
      schemaVersion: 1,
      academicYear: courseData.meta.academicYear,
      savedAt: new Date().toISOString(),
      note: "学籍番号はプライバシー保護のため保存していません。",
      state: {
        department,
        year,
        semester,
        quarter,
        toeicExempt,
        retakePriority,
        capLimits,
        scheduleView,
        textSize,
        selectedIds,
        selectionSources,
        courseSemesterAssignments,
      },
      selectedCourseNames: selectedCourses.map((course) => course.title),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeDepartment = courseData.departments[department].name.replace(/[^\p{L}\p{N}-]+/gu, "-");
    link.href = downloadUrl;
    link.download = `履修計画-${courseData.meta.academicYear}-${safeDepartment}-${year}年.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    setNotice("履修計画を端末へ保存しました。学籍番号は保存ファイルに含めていません。");
  }

  function exportSemesterLabel(course: Course) {
    const assigned = courseSemesterAssignments[course.id];
    if (assigned) return semesterDetails[assigned].label;
    const inSpring = course.quarters.some((item) => semesterDetails.spring.quarters.includes(item));
    const inFall = course.quarters.some((item) => semesterDetails.fall.quarters.includes(item));
    if (inSpring && inFall) return "通年";
    if (inSpring) return "前期";
    if (inFall) return "後期";
    return course.term || "要確認";
  }

  function scheduleExportRows() {
    return selectedCourses
      .map((course) => ({
        学期: exportSemesterLabel(course),
        開講期間: course.term,
        講義コード: course.id,
        科目名: course.title,
        曜日時限: slotLabel(course),
        担当教員: course.instructors,
        キャンパス: course.campus,
        教室: course.room,
        単位数: courseCredits(course, department) ?? "要確認",
        区分: selectionSources[course.id] === "required" ? "必修" : "選択",
      }))
      .sort((a, b) =>
        a.学期.localeCompare(b.学期, "ja") ||
        a.曜日時限.localeCompare(b.曜日時限, "ja") ||
        a.科目名.localeCompare(b.科目名, "ja"),
      );
  }

  function downloadBlob(blob: Blob, filename: string) {
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  }

  async function exportSchedule() {
    const rows = scheduleExportRows();
    if (!rows.length) {
      setNotice("出力する科目がありません。時間割に科目を追加してください。");
      return;
    }

    const safeDepartment = courseData.departments[department].name.replace(/[^\p{L}\p{N}-]+/gu, "-");
    const basename = `時間割-${courseData.meta.academicYear}-${safeDepartment}-${year}年`;
    setScheduleExporting(true);
    try {
      if (scheduleExportFormat === "csv") {
        const headers = Object.keys(rows[0]) as (keyof (typeof rows)[number])[];
        const csvCell = (rawValue: string | number) => {
          let value = String(rawValue);
          if (/^[=+\-@]/.test(value)) value = `'${value}`;
          return `"${value.replaceAll('"', '""')}"`;
        };
        const csv = [
          headers.map(csvCell).join(","),
          ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
        ].join("\r\n");
        downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `${basename}.csv`);
      } else {
        const { default: ExcelJS } = await import("exceljs");
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "日本大学生産工学部 履修登録シミュレータ";
        workbook.created = new Date();
        const worksheet = workbook.addWorksheet("時間割");
        worksheet.addRow([`${courseData.meta.academicYear}年度 ${courseData.departments[department].name} ${year}年 時間割`]);
        worksheet.mergeCells(1, 1, 1, 10);
        worksheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
        worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C2340" } };
        worksheet.getCell("A1").alignment = { vertical: "middle" };
        worksheet.getRow(1).height = 28;
        worksheet.addRow([]);
        worksheet.columns = [
          { key: "学期", width: 10 }, { key: "開講期間", width: 14 }, { key: "講義コード", width: 15 },
          { key: "科目名", width: 34 }, { key: "曜日時限", width: 18 }, { key: "担当教員", width: 24 },
          { key: "キャンパス", width: 14 }, { key: "教室", width: 18 }, { key: "単位数", width: 10 }, { key: "区分", width: 10 },
        ];
        const headerRow = worksheet.addRow(Object.keys(rows[0]));
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2457D6" } };
        rows.forEach((row) => worksheet.addRow(Object.values(row)));
        worksheet.views = [{ state: "frozen", ySplit: 3 }];
        worksheet.autoFilter = { from: "A3", to: "J3" };
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber >= 3) {
            row.alignment = { vertical: "middle", wrapText: true };
            row.eachCell((cell) => {
              cell.border = { bottom: { style: "thin", color: { argb: "FFDCE3ED" } } };
            });
          }
        });
        const buffer = await workbook.xlsx.writeBuffer();
        downloadBlob(
          new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          `${basename}.xlsx`,
        );
      }
      setNotice(`${scheduleExportFormat === "xlsx" ? "Excel" : "CSV"}形式で時間割を出力しました。`);
    } catch {
      setNotice("時間割を出力できませんでした。もう一度お試しください。");
    } finally {
      setScheduleExporting(false);
    }
  }

  function courseInExportSemester(course: Course, targetSemester: Semester) {
    const assigned = courseSemesterAssignments[course.id];
    return assigned
      ? assigned === targetSemester
      : course.quarters.some((item) => semesterDetails[targetSemester].quarters.includes(item));
  }

  function coursesAtExportSlot(targetSemester: Semester, day: Day, period: number) {
    return selectedCourses.filter(
      (course) =>
        courseInExportSemester(course, targetSemester) &&
        course.slots.some((slot) => slot.day === day && slot.period === period),
    );
  }

  function coursesAtQuarterSlot(targetQuarter: number, day: Day, period: number) {
    return selectedCourses.filter(
      (course) =>
        course.quarters.includes(targetQuarter) &&
        course.slots.some((slot) => slot.day === day && slot.period === period),
    );
  }

  function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
    const lines: string[] = [];
    let line = "";
    for (const character of text) {
      const next = `${line}${character}`;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  async function createScheduleImage() {
    const canvas = document.createElement("canvas");
    const width = 1600;
    const margin = 56;
    const labelWidth = 86;
    const columnWidth = (width - margin * 2 - labelWidth) / days.length;
    const rowHeight = 128;
    const tableHeight = 58 + periods.length * rowHeight;
    canvas.width = width;
    canvas.height = 150 + tableHeight * 2 + 90;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.fillStyle = "#f3f6fa";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#0c2340";
    context.font = "bold 36px sans-serif";
    context.fillText(`${courseData.meta.academicYear}年度 ${courseData.departments[department].name} ${year}年 時間割`, margin, 58);
    context.font = "20px sans-serif";
    context.fillStyle = "#5f6b80";
    context.fillText("日本大学生産工学部 履修登録シミュレータ", margin, 94);

    (["spring", "fall"] as Semester[]).forEach((targetSemester, semesterIndex) => {
      const top = 126 + semesterIndex * tableHeight;
      context.fillStyle = "#0c2340";
      context.font = "bold 26px sans-serif";
      context.fillText(semesterDetails[targetSemester].label, margin, top + 36);
      days.forEach((day, dayIndex) => {
        const x = margin + labelWidth + dayIndex * columnWidth;
        context.fillStyle = "#2457d6";
        context.fillRect(x, top + 50, columnWidth, 46);
        context.fillStyle = "white";
        context.font = "bold 21px sans-serif";
        context.textAlign = "center";
        context.fillText(`${day}曜日`, x + columnWidth / 2, top + 80);
      });
      periods.forEach((period, periodIndex) => {
        const y = top + 96 + periodIndex * rowHeight;
        context.fillStyle = "#e4eaf3";
        context.fillRect(margin, y, labelWidth, rowHeight);
        context.fillStyle = "#14213d";
        context.font = "bold 21px sans-serif";
        context.textAlign = "center";
        context.fillText(`${period}限`, margin + labelWidth / 2, y + rowHeight / 2 + 8);
        days.forEach((day, dayIndex) => {
          const x = margin + labelWidth + dayIndex * columnWidth;
          context.fillStyle = "white";
          context.fillRect(x, y, columnWidth, rowHeight);
          context.strokeStyle = "#b8c3d2";
          context.strokeRect(x, y, columnWidth, rowHeight);
          const courses = coursesAtExportSlot(targetSemester, day, period);
          const courseText = courses.map((course) => `${course.title}\n${course.term}・${course.campus}`).join("\n");
          context.fillStyle = "#14213d";
          context.font = "bold 17px sans-serif";
          context.textAlign = "left";
          const lines = courseText.split("\n").flatMap((line) => wrapCanvasText(context, line, columnWidth - 18));
          lines.slice(0, 5).forEach((line, lineIndex) => context.fillText(line, x + 9, y + 25 + lineIndex * 21));
        });
      });
    });
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image creation failed")), "image/png"),
    );
  }

  async function shareSchedule() {
    if (!selectedCourses.length) {
      setNotice("共有する科目がありません。時間割に科目を追加してください。");
      return;
    }
    try {
      const image = await createScheduleImage();
      const filename = `時間割-${courseData.meta.academicYear}-${courseData.departments[department].name}-${year}年.png`;
      const file = new File([image], filename, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `${courseData.meta.academicYear}年度の時間割`, files: [file] });
        setNotice("曜日・時限表の画像をスマートフォンの共有メニューへ送りました。");
      } else {
        downloadBlob(image, filename);
        setNotice("共有用の曜日・時限表を画像で保存しました。スマートフォンへ送信してお使いください。");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("共有用の時間割画像を作成できませんでした。もう一度お試しください。");
    }
  }

  function emailSchedule() {
    if (!selectedCourses.length) {
      setNotice("メールで送る科目がありません。時間割に科目を追加してください。");
      return;
    }
    const lines = (["spring", "fall"] as Semester[]).flatMap((targetSemester) => [
      `【${semesterDetails[targetSemester].label}】`,
      ...periods.map((period) =>
        `${period}限｜${days.map((day) => {
          const titles = coursesAtExportSlot(targetSemester, day, period).map((course) => course.title);
          return `${day}:${titles.join("・") || "―"}`;
        }).join("｜")}`,
      ),
      "",
    ]);
    const subject = `${courseData.meta.academicYear}年度 ${courseData.departments[department].name} ${year}年 時間割`;
    const body = [subject, "", ...lines, "日本大学生産工学部 履修登録シミュレータで作成"].join("\n");
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function printSchedule() {
    if (!selectedCourses.length) {
      setNotice("印刷する科目がありません。時間割に科目を追加してください。");
      return;
    }
    window.print();
  }

  async function importScheduleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error("ファイルが大きすぎます");
      const parsed = JSON.parse(await file.text()) as SavedScheduleFile | SavedScheduleState;
      const state = "state" in parsed ? parsed.state : parsed;
      const nextDepartment = state.department && courseData.departments[state.department]
        ? state.department
        : department;
      const nextYear = state.year && state.year >= 1 && state.year <= 4 ? state.year : year;
      const nextSemester = state.semester === "spring" || state.semester === "fall"
        ? state.semester
        : semester;
      const requestedQuarter = state.quarter && state.quarter >= 1 && state.quarter <= 4
        ? state.quarter
        : semesterDetails[nextSemester].quarters[0];
      const nextQuarter = semesterDetails[nextSemester].quarters.includes(requestedQuarter)
        ? requestedQuarter
        : semesterDetails[nextSemester].quarters[0];
      const validIds = [...new Set((state.selectedIds ?? []).filter((id) => courseById.has(id)))];
      const validIdSet = new Set(validIds);

      setDepartment(nextDepartment);
      setYear(nextYear);
      setSemester(nextSemester);
      setQuarter(nextQuarter);
      setToeicExempt(Boolean(state.toeicExempt));
      setRetakePriority(Boolean(state.retakePriority));
      setCapLimits({
        spring: asCapLimit(state.capLimits?.spring),
        fall: asCapLimit(state.capLimits?.fall),
      });
      if (["quarter", "annual", "intensive"].includes(state.scheduleView ?? "")) {
        setScheduleView(state.scheduleView ?? "quarter");
      } else {
        setScheduleView("quarter");
      }
      if (["small", "normal", "large"].includes(state.textSize ?? "")) {
        setTextSize(state.textSize ?? "normal");
      }
      setSelectedIds(validIds);
      setSelectionSources(
        Object.fromEntries(
          Object.entries(state.selectionSources ?? {}).filter(
            ([id, source]) => validIdSet.has(id) && (source === "required" || source === "elective"),
          ),
        ),
      );
      setCourseSemesterAssignments(
        Object.fromEntries(
          Object.entries(state.courseSemesterAssignments ?? {}).filter(
            ([id, value]) => validIdSet.has(id) && (value === "spring" || value === "fall"),
          ),
        ),
      );
      setStudentNumber("");
      setActiveSlot(null);
      setDetailCourse(null);
      setNotice(
        validIds.length === (state.selectedIds ?? []).length
          ? "端末の保存ファイルから履修計画を読み込みました。"
          : "履修計画を読み込みました。現在の時間割データにない科目は除外されています。",
      );
    } catch {
      setNotice("保存ファイルを読み込めませんでした。このシミュレータから保存したJSONファイルを選んでください。");
    }
  }

  return (
    <main className={`app-shell text-size-${textSize}`}>
      <header className="site-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">N</span>
          <div>
            <p className="eyebrow">NIHON UNIVERSITY · CIT</p>
            <p className="brand-title">履修登録シミュレータ</p>
          </div>
        </div>
        <div className="header-badges">
          <span className="data-badge">{courseData.meta.academicYear}年度データ</span>
          <button
            type="button"
            className="history-button"
            onClick={() => setUpdateHistoryOpen(true)}
          >
            更新履歴
          </button>
          <div className="text-size-control" role="group" aria-label="文字サイズ">
            <span>文字</span>
            {(["small", "normal", "large"] as TextSize[]).map((size, index) => (
              <button
                key={size}
                type="button"
                className={textSize === size ? "active" : ""}
                onClick={() => setTextSize(size)}
                aria-label={size === "small" ? "文字を小さく" : size === "large" ? "文字を大きく" : "標準の文字サイズ"}
              >
                {index === 0 ? "A−" : index === 1 ? "A" : "A＋"}
              </button>
            ))}
          </div>
          <a href="https://portal.cit.nihon-u.ac.jp/" target="_blank" rel="noreferrer">
            ポータルへ
          </a>
        </div>
      </header>

      {updateHistoryOpen && (
        <div
          className="modal-layer modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setUpdateHistoryOpen(false);
          }}
        >
          <section
            className="detail-modal update-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-history-title"
          >
            <button
              type="button"
              className="modal-close"
              aria-label="更新履歴を閉じる"
              onClick={() => setUpdateHistoryOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">UPDATE HISTORY</p>
            <h2 id="update-history-title">更新履歴</h2>
            <p className="update-history-description">
              時間割データとアプリに反映された主な更新を表示しています。
            </p>
            <ol className="update-history-list">
              {updateHistory.map((entry, index) => (
                <li key={`${entry.updatedAt}-${index}`}>
                  <span className={`history-source ${entry.source}`}>
                    {entry.source === "automatic" ? "自動" : "手動"}
                  </span>
                  <strong>{formatHistoryEntry(entry)}</strong>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <section className="official-registration-notice" role="alert">
        <span className="notice-icon" aria-hidden="true">!</span>
        <div>
          <div className="official-warning-heading">
            <span>必ず確認</span>
            <strong>履修登録はこのシミュレータでは完了しません</strong>
          </div>
          <p>
            このシミュレータは履修計画を立てるためのものであり、実際の履修登録には反映されません。
            時間割を確認した後に、必ずポータルシステムから正式な履修登録を行なってください。
          </p>
        </div>
        <a href="https://portal.cit.nihon-u.ac.jp/" target="_blank" rel="noreferrer">
          正式な履修登録はこちら
        </a>
      </section>

      <section className="update-status-strip" aria-label="アプリと時間割データの更新情報">
        <div>
          <span>アプリ</span>
          <strong>v{updateInfo.appVersion}</strong>
          <small>更新 {formatUpdateTime(buildUpdatedAt)}（{buildCommit}）</small>
        </div>
        <div>
          <span>時間割データ</span>
          <strong>{courseData.meta.academicYear}年度</strong>
          <small>最終取込 {formatUpdateTime(updateInfo.timetableUpdatedAt)}</small>
        </div>
        <a href={timetableSourcePage} target="_blank" rel="noreferrer">
          配布元の時間割表を確認
        </a>
      </section>

      <section className="intro-panel">
        <div className="intro-copy">
          <p className="eyebrow light">BUILD YOUR SCHEDULE</p>
          <h1>迷わず組める、<br />あなたの時間割。</h1>
          <p className="intro-description">
            前期・後期を分けて、学科と学年から共通必修を配置できます。
            クラス分け科目、CAP上限、キャンパス間移動も学期ごとに確認します。
          </p>
          <aside className="intro-update-history" aria-labelledby="intro-update-history-title">
            <div className="intro-update-history-heading">
              <div>
                <span>WHAT'S NEW</span>
                <h2 id="intro-update-history-title">最近の更新</h2>
              </div>
              <button type="button" onClick={() => setUpdateHistoryOpen(true)}>
                すべて見る
              </button>
            </div>
            <ol>
              {updateHistory.slice(0, 3).map((entry, index) => (
                <li key={`${entry.updatedAt}-summary-${index}`}>
                  <i aria-hidden="true" />
                  <span>{formatHistoryEntry(entry)}</span>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        <div className="profile-card">
          <div className="profile-row semester-picker">
            <span className="field-label">履修登録する学期</span>
            <div className="semester-switch" role="tablist" aria-label="履修登録する学期">
              {(["spring", "fall"] as Semester[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={semester === item}
                  className={semester === item ? "active" : ""}
                  onClick={() => {
                    setSemester(item);
                    setQuarter(semesterDetails[item].quarters[0]);
                    setScheduleView("quarter");
                    setActiveSlot(null);
                    setDetailCourse(null);
                    setRequiredOpenKey(null);
                  }}
                >
                  <strong>{semesterDetails[item].label}</strong>
                  <small>{semesterDetails[item].quarters.map((value) => `${value}Q`).join("・")}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="profile-row two-columns">
            <label>
              <span>所属学科</span>
              <select
                value={department}
                onChange={(event) => {
                  setDepartment(event.target.value);
                  setSelectedIds([]);
                  setSelectionSources({});
                  setCourseSemesterAssignments({});
                }}
              >
                {departmentKeys.map((key) => (
                  <option key={key} value={key}>{courseData.departments[key].name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>学籍番号（任意）</span>
              <input
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value.slice(0, 12))}
                placeholder="例：26B12345"
              />
            </label>
          </div>
          <a
            className="department-guidance-link"
            href={firstYearGuidanceUrls[department]}
            target="_blank"
            rel="noreferrer"
            aria-label={`${courseData.departments[department].name}を選択中。1年生向け時間割作成用資料掲載サイトを開く`}
          >
            <span>1年生向け時間割作成用資料</span>
            <strong>{courseData.departments[department].name}の資料を確認</strong>
            <small>資料掲載サイトを開く ↗</small>
          </a>

          <div className="profile-row">
            <span className="field-label">学年</span>
            <div className="segmented" role="group" aria-label="学年">
              {[1, 2, 3, 4].map((item) => (
                <button
                  key={item}
                  className={year === item ? "active" : ""}
                  onClick={() => {
                    setYear(item);
                    setSelectedIds([]);
                    setSelectionSources({});
                    setCourseSemesterAssignments({});
                    setCapLimits({ spring: 20, fall: 20 });
                  }}
                >
                  {item}年
                </button>
              ))}
            </div>
          </div>

          <div className="profile-row option-grid">
            <label className="check-option">
              <input type="checkbox" checked={toeicExempt} onChange={(e) => setToeicExempt(e.target.checked)} />
              <span><strong>英語Ⅰ・Ⅱを免除済み</strong><small>TOEIC等による認定</small></span>
            </label>
            <label className="check-option">
              <input type="checkbox" checked={retakePriority} onChange={(e) => setRetakePriority(e.target.checked)} />
              <span><strong>下級年次・再履修を優先表示</strong><small>上級生には下級年次科目を常時表示</small></span>
            </label>
          </div>

          <div className="profile-footer">
            <fieldset className="cap-limit-fieldset">
              <legend>この学期のCAP上限</legend>
              <div className="cap-radio-group">
                {([20, 22, 24] as CapLimit[]).map((limit) => {
                  const disabled = !capRelaxationEligible && limit > 20;
                  return (
                    <label
                      key={limit}
                      className={`${capLimit === limit ? "selected" : ""}${disabled ? " disabled" : ""}`}
                    >
                      <input
                        type="radio"
                        name="cap-limit"
                        value={limit}
                        checked={capLimit === limit}
                        disabled={disabled}
                        onChange={() =>
                          setCapLimits((current) => ({ ...current, [semester]: limit }))
                        }
                      />
                      <span><strong>{limit}単位</strong><small>{limit === 20 ? "緩和なし" : "上限緩和"}</small></span>
                    </label>
                  );
                })}
              </div>
              <p className="cap-choice-note">
                {capRelaxationEligible
                  ? `${semesterLabel}の上限を選択してください。前期・後期で設定は別々に保存されます。`
                  : "1年生前期は上限緩和の対象外です。後期から選択できます。"}
              </p>
            </fieldset>
            <button className="primary-button" onClick={autoPlaceRequired}>共通必修を自動配置</button>
          </div>
        </div>
      </section>

      <section className="summary-strip" aria-label="履修状況">
        <article className={`summary-card ${capExceeded ? "danger" : ""}`}>
          <div>
            <span className="summary-label">{semesterLabel}の登録単位</span>
            <strong>{totalCredits}<small>単位</small></strong>
          </div>
          <div className="summary-meta">
            <span>キャップ算入 {capCredits} / {capLimit}</span>
            <div className="progress-track"><i style={{ width: `${Math.min(100, (capCredits / capLimit) * 100)}%` }} /></div>
          </div>
        </article>
        <article className="summary-card">
          <span className="summary-label">{semesterLabel}の選択済み</span>
          <strong>{halfCourses.length}<small>科目</small></strong>
          <span className="summary-note">2コマセットは1科目で集計</span>
        </article>
        <article className="summary-card">
          <span className="summary-label">{semesterLabel}の未配置必修</span>
          <strong>{pendingRequired.length}<small>科目</small></strong>
          <span className="summary-note">クラス候補から手動で選択</span>
        </article>
        <article className={`summary-card status-card ${automaticErrorCount ? "error" : automaticWarningCount ? "warning" : "ok"}`}>
          <span className="summary-label">自動チェック</span>
          <strong>{automaticErrorCount ? "要修正" : automaticWarningCount ? "要確認" : "問題なし"}</strong>
          <span className="summary-note">
            {automaticErrorCount
              ? `エラー${automaticErrorCount}件・下に理由を表示`
              : automaticWarningCount
                ? `確認事項${automaticWarningCount}件・下に詳細を表示`
                : "現在の選択ではエラーなし"}
          </span>
        </article>
      </section>

      {notice && (
        <div className="alert-banner" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="お知らせを閉じる">×</button>
        </div>
      )}

      <section className={`auto-check-details ${automaticErrorCount ? "has-error" : ""}`} aria-labelledby="auto-check-heading">
        <div className="auto-check-heading">
          <div>
            <p className="eyebrow">AUTOMATIC CHECK</p>
            <h2 id="auto-check-heading">自動チェック結果</h2>
          </div>
          <span className={automaticErrorCount ? "error-count" : "clear-count"}>
            {automaticErrorCount ? `エラー ${automaticErrorCount}件` : automaticWarningCount ? `確認 ${automaticWarningCount}件` : "エラーなし"}
          </span>
        </div>
        <div className="auto-check-list">
          {capExceeded && (
            <article className="check-result error">
              <span>CAP</span>
              <div><strong>{semesterLabel}のCAP上限を超えています</strong><p>算入対象{capCredits}単位に対し、設定上限は{capLimit}単位です。{capCredits - capLimit}単位減らしてください。</p></div>
            </article>
          )}
          {detectedScheduleIssues.map((issue) => (
            <article className="check-result error" key={issue}>
              <span>時間割</span><div><strong>登録済み科目に組み合わせエラーがあります</strong><p>{issue}</p></div>
            </article>
          ))}
          {lastBlockedIssue && (
            <article className="check-result error recent-error">
              <span>直近</span><div><strong>追加できなかった科目があります</strong><p>{lastBlockedIssue}</p></div>
              <button onClick={() => setLastBlockedIssue(null)}>確認済みにする</button>
            </article>
          )}
          {unknownCreditCourses.length > 0 && (
            <article className="check-result warning">
              <span>単位</span>
              <div><strong>単位数を確認できない科目があります</strong><p>{unknownCreditCourses.slice(0, 4).map((course) => course.title).join("、")}{unknownCreditCourses.length > 4 ? ` ほか${unknownCreditCourses.length - 4}科目` : ""}</p></div>
            </article>
          )}
          {!automaticErrorCount && !automaticWarningCount && (
            <article className="check-result clear"><span>✓</span><div><strong>{semesterLabel}の時間割に自動検出エラーはありません</strong><p>履修済み科目や個別の履修条件は、下の注意事項とポータルで別途確認してください。</p></div></article>
          )}
        </div>
      </section>

      <aside className="manual-history-warning" role="note">
        <span aria-hidden="true">履修歴</span>
        <div>
          <strong>過去に履修して単位を取得している同名科目は、原則として履修できません</strong>
          <p>このシミュレータには過去の履修・単位取得履歴がないため、自動では判定できません。必ずポータルの成績情報と照合してください。</p>
        </div>
      </aside>

      <section className="workspace">
        <div className="schedule-panel">
          <div className="section-toolbar">
            <div>
              <p className="eyebrow">TIMETABLE</p>
              <h2>{courseData.departments[department].name}・{year}年・{semesterLabel}</h2>
            </div>
            <div className="toolbar-actions">
              <div className="schedule-export-control">
                <label>
                  <span>出力形式</span>
                  <select
                    value={scheduleExportFormat}
                    onChange={(event) => setScheduleExportFormat(event.target.value as ScheduleExportFormat)}
                    aria-label="時間割の出力形式"
                  >
                    <option value="xlsx">Excel</option>
                    <option value="csv">CSV</option>
                  </select>
                </label>
                <button className="primary-button" onClick={exportSchedule} disabled={scheduleExporting}>
                  {scheduleExporting ? "出力中…" : "時間割を出力"}
                </button>
              </div>
              <button className="soft-button share-schedule-button" onClick={shareSchedule}>
                スマホへ共有
              </button>
              <button className="soft-button email-schedule-button" onClick={emailSchedule}>メールで送信</button>
              <div className="print-schedule-control">
                <select
                  value={printSemester}
                  onChange={(event) => setPrintSemester(event.target.value as Semester)}
                  aria-label="印刷する学期"
                >
                  <option value="spring">前期（1Q・2Q）</option>
                  <option value="fall">後期（3Q・4Q）</option>
                </select>
                <button className="soft-button print-schedule-button" onClick={printSchedule}>印刷</button>
              </div>
              <button className="soft-button save-button" onClick={downloadSchedule}>
                端末に保存
              </button>
              <label className="soft-button file-button">
                保存データを読み込む
                <input type="file" accept="application/json,.json" onChange={importScheduleFile} />
              </label>
              <button
                className={requiredEditMode ? "soft-button active" : "soft-button"}
                onClick={() => setRequiredEditMode((current) => !current)}
              >
                必修科目を手動編集
              </button>
              <button className="text-button" onClick={resetSchedule}>{semesterLabel}をリセット</button>
            </div>
          </div>

          <p className="local-save-note">
            変更内容はこのブラウザにも自動保存されます。「端末に保存」で別の端末へ移せるJSONファイルを作成できます（学籍番号は含みません）。
          </p>

          <div className="quarter-tabs" role="tablist" aria-label="開講期間">
            {semesterQuarters.map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={scheduleView === "quarter" && quarter === item}
                className={scheduleView === "quarter" && quarter === item ? "active" : ""}
                onClick={() => {
                  setQuarter(item);
                  setScheduleView("quarter");
                }}
              >
                {item}Q
                <small>{semesterLabel}</small>
              </button>
            ))}
            <button
              role="tab"
              aria-selected={scheduleView === "annual"}
              className={scheduleView === "annual" ? "active special" : "special"}
              onClick={() => setScheduleView("annual")}
            >
              通年
              <small>年間開講</small>
            </button>
            <button
              role="tab"
              aria-selected={scheduleView === "intensive"}
              className={scheduleView === "intensive" ? "active special" : "special"}
              onClick={() => setScheduleView("intensive")}
            >
              集中
              <small>{semesterLabel}対象</small>
            </button>
          </div>

          <div className="campus-legend" aria-label="キャンパス色分け">
            <span><i className="dot mimomi" />実籾</span>
            <span><i className="dot tsudanuma" />津田沼</span>
            <span><i className="dot online" />オンデマンド</span>
          </div>

          {scheduleView === "quarter" ? (
            <>
              <div className="timetable-scroll">
                <div className="timetable-grid">
                  <div className="grid-corner">時限</div>
                  {days.map((day) => <div className="day-header" key={day}>{day}曜日</div>)}
                  {periods.map((period) => (
                    <div className="grid-row" key={period}>
                      <div className="period-label"><strong>{period}</strong><span>限</span></div>
                      {days.map((day) => {
                        const course = selectedCourses.find(
                          (item) =>
                            item.quarters.includes(quarter) &&
                            item.slots.some((slot) => slot.day === day && slot.period === period),
                        );
                        if (!course) {
                          return (
                            <button
                              className="empty-slot"
                              key={`${day}-${period}`}
                              onClick={() => {
                                setCourseSearch("");
                                setActiveSlot({ day, period });
                              }}
                              aria-label={`${day}曜日${period}限に科目を追加`}
                            >
                              <span>＋</span><small>科目を追加</small>
                            </button>
                          );
                        }
                        const source = selectionSources[course.id];
                        const removable = source !== "required" || requiredEditMode;
                        return (
                          <article
                            key={`${day}-${period}`}
                            className={`course-card campus-${course.campus}`}
                            onClick={() => setDetailCourse(course)}
                          >
                            <div className="course-card-top">
                              <span className={source === "required" ? "type-badge required" : "type-badge"}>
                                {source === "required" ? "必修" : "選択"}
                              </span>
                              {course.slots.length > 1 && <span className="set-badge">SET</span>}
                            </div>
                            <h3>{course.title}</h3>
                            <p>{course.instructors || "担当教員未記載"}</p>
                            <div className="course-card-bottom">
                              <span>{course.campus}</span>
                              <span>{courseCredits(course, department) ?? "?"}単位</span>
                            </div>
                            {removable && (
                              <button
                                className="remove-course"
                                aria-label={`${course.title}を削除`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeCourse(course);
                                }}
                              >×</button>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {outOfGridCourses.length > 0 && (
                <div className="outside-courses">
                  <h3>時間外・6限以降の選択済み科目</h3>
                  <div>
                    {outOfGridCourses.map((course) => (
                      <button key={course.id} onClick={() => setDetailCourse(course)}>
                        <strong>{course.title}</strong><span>{slotLabel(course)} · {courseCredits(course, department) ?? "?"}単位</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <section className="special-course-browser">
              <div className="special-browser-heading">
                <div>
                  <h3>{scheduleView === "annual" ? "通年科目" : `${semesterLabel}に登録する集中講義`}</h3>
                  <p>{scheduleView === "annual" ? "1Qから4Qまで開講される科目です。" : "前学期集中・前集中は前期、後学期集中は後期に分類しています。時期不明の集中講義は両方に表示します。"}</p>
                </div>
                <label className="special-search"><span>科目名・教員名で絞り込み</span><input value={specialSearch} onChange={(event) => setSpecialSearch(event.target.value)} placeholder="検索" /></label>
              </div>
              <p className="lower-year-note">{year}年生には、同学科の1年次から{year}年次までの開講科目を表示しています。</p>
              <div className="special-course-list">
                {specialCourseCandidates.map((course) => {
                  const selected = selectedIds.includes(course.id);
                  const assignedElsewhere = selected && courseSemesterAssignments[course.id] && courseSemesterAssignments[course.id] !== semester;
                  return (
                    <article className={`special-course-card campus-${course.campus}`} key={course.id}>
                      <div className="special-course-main">
                        <div className="special-course-badges"><span>{course.year ?? "?"}年次</span><span>{course.campus}</span><span>{course.term}</span></div>
                        <h4>{course.title}</h4>
                        <p>{course.instructors || "担当教員未記載"}</p>
                        <small>{courseCredits(course, department) ?? "要確認"}単位{isIntensiveCourse(course) ? ` · ${intensiveTimingLabel(course)}` : ""}</small>
                        {course.restriction && <em>{course.restriction}</em>}
                      </div>
                      <div className="special-course-actions">
                        <button className="soft-button" onClick={() => setDetailCourse(course)}>詳細</button>
                        {selected ? (
                          <button className={assignedElsewhere ? "soft-button" : "delete-special-button"} disabled={Boolean(assignedElsewhere)} onClick={() => removeCourse(course)}>{assignedElsewhere ? "他学期で選択済み" : "削除"}</button>
                        ) : (
                          <button className="primary-button" onClick={() => addCourse(course, "elective", semester)}>追加</button>
                        )}
                      </div>
                    </article>
                  );
                })}
                {specialCourseCandidates.length === 0 && <div className="empty-results"><strong>該当する科目がありません</strong><p>検索条件、所属学科、学年を確認してください。</p></div>}
              </div>
            </section>
          )}
        </div>

        <aside className="required-panel">
          <div className="required-panel-header">
            <div>
              <p className="eyebrow">REQUIRED OPTIONS</p>
              <h2>クラス選択が必要な必修</h2>
            </div>
            <span>{pendingRequired.length}</span>
          </div>
          <p className="panel-description">
            学籍番号、英語免除、再履修などで時間が分かれる科目です。履修案内と候補の制限欄を確認して選んでください。
          </p>

          {selectedRequiredChoices.length > 0 && (
            <div className="selected-required-section">
              <div className="selected-required-label">
                <span>選択済みクラス</span>
                <b>{selectedRequiredChoices.length}</b>
              </div>
              {selectedRequiredChoices.map(({ required, course, candidates }) => {
                const open = requiredOpenKey === required.key;
                return (
                  <article className="selected-required-card" key={required.key}>
                    <div className="selected-required-summary">
                      <div>
                        <strong>{required.name}</strong>
                        <span>{slotLabel(course)} · {course.campus}</span>
                        <small>{course.instructors || "担当教員未記載"}</small>
                      </div>
                      <span className="selected-badge">選択済み</span>
                    </div>
                    <div className="selected-required-actions">
                      <button
                        className="change-class-button"
                        onClick={() => setRequiredOpenKey(open ? null : required.key)}
                      >
                        {open ? "候補を閉じる" : "クラスを変更"}
                      </button>
                      <button
                        className="delete-class-button"
                        onClick={() => {
                          removeCourse(course);
                          setRequiredOpenKey(null);
                        }}
                      >
                        削除
                      </button>
                    </div>
                    {open && (
                      <div className="required-candidates change-candidates">
                        {candidates.map((candidate) => {
                          const isCurrent = candidate.id === course.id;
                          return (
                            <button
                              key={candidate.id}
                              disabled={isCurrent}
                              onClick={() =>
                                replaceRequiredCourse(course, candidate) && setRequiredOpenKey(null)
                              }
                            >
                              <strong>{slotLabel(candidate)}{isCurrent ? "（現在のクラス）" : ""}</strong>
                              <span>{candidate.instructors || "担当教員未記載"}</span>
                              <small>{candidate.campus}{candidate.restriction ? ` · ${candidate.restriction}` : ""}</small>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className="required-list">
            {pendingRequired.length === 0 ? (
              <div className="complete-state"><span>✓</span><strong>共通必修は配置済みです</strong><p>クラス分け科目は上の「選択済みクラス」から変更・削除できます。</p></div>
            ) : (
              pendingRequired.map((required) => {
                const candidates = requiredCandidates(required);
                const open = requiredOpenKey === required.key;
                return (
                  <article className="required-group" key={required.key}>
                    <button className="required-group-trigger" onClick={() => setRequiredOpenKey(open ? null : required.key)}>
                      <div><strong>{required.name}</strong><span>{required.credits}単位 · {candidates.length}候補</span></div>
                      <b>{open ? "−" : "＋"}</b>
                    </button>
                    {open && (
                      <div className="required-candidates">
                        {candidates.length ? candidates.map((course) => (
                          <button
                            key={course.id}
                            onClick={() => addCourse(course, "required") && setRequiredOpenKey(null)}
                          >
                            <strong>{slotLabel(course)}</strong>
                            <span>{course.instructors || "担当教員未記載"}</span>
                            <small>{course.campus}{course.restriction ? ` · ${course.restriction}` : ""}</small>
                          </button>
                        )) : (
                          <p className="no-candidate">2026年度時間割で一致する開講候補を確認できませんでした。教務案内をご確認ください。</p>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>

          <div className="help-card">
            <strong>候補が多いときは</strong>
            <p>科目の「履修制限」と学籍番号別のクラス表を照合してください。このシミュレータは確定登録の代わりにはなりません。</p>
          </div>
        </aside>
      </section>

      <section className="printable-schedule" aria-hidden="true">
        <header>
          <div>
            <p>NIHON UNIVERSITY · COLLEGE OF INDUSTRIAL TECHNOLOGY</p>
            <h1>{courseData.meta.academicYear}年度 {semesterDetails[printSemester].label}時間割表</h1>
          </div>
          <dl>
            <div><dt>所属</dt><dd>{courseData.departments[department].name}</dd></div>
            <div><dt>学年</dt><dd>{year}年</dd></div>
          </dl>
        </header>
        {semesterDetails[printSemester].quarters.map((targetQuarter) => (
          <section className="print-semester" key={targetQuarter}>
            <h2>{targetQuarter}Q</h2>
            <table>
              <thead><tr><th>時限</th>{days.map((day) => <th key={day}>{day}曜日</th>)}</tr></thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period}>
                    <th>{period}限</th>
                    {days.map((day) => (
                      <td key={day}>
                        {coursesAtQuarterSlot(targetQuarter, day, period).map((course) => (
                          <div className="print-course" key={course.id}>
                            <strong>{course.title}</strong>
                            <small>{course.term}・{course.campus}{course.room ? `・${course.room}` : ""}</small>
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <footer>出力日時：{formatUpdateTime(new Date().toISOString())}　※正式な履修登録内容はポータルで確認してください。</footer>
      </section>

      <section className="rules-section">
        <div>
          <p className="eyebrow">AUTOMATIC CHECKS</p>
          <h2>このシミュレータが確認すること</h2>
        </div>
        <div className="rules-grid">
          <article><span>01</span><h3>セット科目</h3><p>火2・金3など、同じ講義コードの複数コマを一括で登録します。</p></article>
          <article><span>02</span><h3>学期別の履修上限</h3><p>前期・後期ごとにCAP上限を20・22・24単位から設定します。1年生前期は20単位固定です。</p></article>
          <article><span>03</span><h3>キャンパス移動</h3><p>連続するコマが実籾と津田沼に分かれる組み合わせを登録前に警告します。</p></article>
          <article><span>04</span><h3>時間割重複</h3><p>同じ曜日・時限に複数の科目を置こうとした場合は追加を止めます。</p></article>
        </div>
      </section>

      <footer className="site-footer">
        <div>
          <strong>2026年度 履修登録シミュレータ</strong>
          <p>時間割表とキャンパスガイドをもとにした学修計画支援ツールです。</p>
        </div>
        <div className="footer-links">
          <a href="https://portal.cit.nihon-u.ac.jp/Campusweb/slbssrch.do" target="_blank" rel="noreferrer">シラバス検索</a>
          <a href="https://portal.cit.nihon-u.ac.jp/" target="_blank" rel="noreferrer">履修登録ポータル</a>
        </div>
        <p className="disclaimer">
          本ツールの結果は参考情報です。履修資格、クラス指定、TOEIC認定、再履修、集中科目、最新の変更は必ずポータル・教務課・クラス担任の案内で確認してください。
        </p>
      </footer>

      {activeSlot && (
        <div className="drawer-backdrop" onMouseDown={() => setActiveSlot(null)}>
          <aside className="course-drawer" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog">
            <div className="drawer-header">
              <div><p className="eyebrow">CHOOSE A COURSE</p><h2>{activeSlot.day}曜日 {activeSlot.period}限</h2></div>
              <button onClick={() => setActiveSlot(null)} aria-label="閉じる">×</button>
            </div>
            <label className="search-box">
              <span>講義名・教員名で絞り込み</span>
              <input value={courseSearch} onChange={(e) => setCourseSearch(e.target.value)} placeholder="検索" autoFocus />
            </label>
            <div className="candidate-count">履修可能な候補 {slotCandidates.length}件（下級年次科目を含む）</div>
            <div className="drawer-list">
              {slotCandidates.map((course) => (
                <article key={course.id} className={`drawer-course campus-${course.campus}`}>
                  <div className="drawer-course-main">
                    <div className="drawer-course-heading">
                      <span>{course.category}</span>
                      <span>{course.year ?? "?"}年次</span>
                      {course.slots.length > 1 && <b>2コマセット</b>}
                    </div>
                    <h3>{course.title}</h3>
                    <p>{course.instructors || "担当教員未記載"}</p>
                    <dl>
                      <div><dt>開講</dt><dd>{slotLabel(course)}</dd></div>
                      <div><dt>場所</dt><dd>{course.campus}</dd></div>
                      <div><dt>単位</dt><dd>{courseCredits(course, department) ?? "要確認"}</dd></div>
                    </dl>
                    {course.restriction && <small className="restriction">履修制限：{course.restriction}</small>}
                  </div>
                  <div className="drawer-course-actions">
                    <button className="soft-button" onClick={() => setDetailCourse(course)}>詳細</button>
                    <button className="primary-button" onClick={() => addCourse(course, "elective") && setActiveSlot(null)}>追加</button>
                  </div>
                </article>
              ))}
              {!slotCandidates.length && <div className="empty-results"><strong>候補が見つかりません</strong><p>学科・開講期間・履修制限または検索条件を確認してください。</p></div>}
            </div>
          </aside>
        </div>
      )}

      {blockingError && (
        <div className="blocking-error-backdrop">
          <section className="blocking-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="blocking-error-title">
            <span className="blocking-error-icon" aria-hidden="true">!</span>
            <p className="eyebrow">REGISTRATION ERROR</p>
            <h2 id="blocking-error-title">{blockingError.title}</h2>
            <p className="blocked-course-name">追加しようとした科目：{blockingError.courseTitle}</p>
            <div className="blocking-error-message">{blockingError.message}</div>
            <p className="blocking-error-help">この科目は時間割に追加されていません。表示された曜日・時限とキャンパスを確認し、別の科目またはクラスを選んでください。</p>
            <button className="primary-button" autoFocus onClick={() => setBlockingError(null)}>内容を確認しました</button>
          </section>
        </div>
      )}

      {detailCourse && (
        <div className="modal-backdrop" onMouseDown={() => setDetailCourse(null)}>
          <section className="detail-modal" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog">
            <button className="modal-close" onClick={() => setDetailCourse(null)} aria-label="閉じる">×</button>
            <div className={`detail-campus campus-${detailCourse.campus}`}>
              <span>{detailCourse.campus}</span><strong>{detailCourse.term}</strong>
            </div>
            <p className="eyebrow">COURSE DETAILS</p>
            <h2>{detailCourse.title}</h2>
            <p className="detail-instructor">{detailCourse.instructors || "担当教員未記載"}</p>
            <div className="detail-grid">
              <div><span>曜日・時限</span><strong>{slotLabel(detailCourse)}</strong></div>
              <div><span>取得単位</span><strong>{courseCredits(detailCourse, department) ?? "要確認"}単位</strong></div>
              <div><span>キャンパス</span><strong>{detailCourse.campus}</strong></div>
              <div><span>開講学年・教室</span><strong>{detailCourse.year ?? "?"}年次 · {detailCourse.room || "未記載"}</strong></div>
            </div>
            {detailCourse.slots.length > 1 && <div className="set-callout"><strong>セット開講科目</strong><p>{slotLabel(detailCourse)}をまとめて登録します。</p></div>}
            {detailCourse.restriction && <div className="restriction-block"><strong>履修制限・対象</strong><p>{detailCourse.restriction}</p></div>}
            <div className="syllabus-search-note">
              <span>シラバスで検索する講義名</span>
              <strong>{detailCourse.title}</strong>
              <p>科目名をコピーし、公式検索画面の「講義名」欄へ貼り付けてください。</p>
              {syllabusCopyResult?.courseId === detailCourse.id && syllabusCopyResult.status === "failed" && (
                <small>自動コピーできませんでした。上の科目名を選択してコピーしてください。</small>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className={`soft-button syllabus-copy-button ${syllabusCopyResult?.courseId === detailCourse.id && syllabusCopyResult.status === "copied" ? "copied" : ""}`}
                onClick={() => copySyllabusCourseTitle(detailCourse)}
              >
                {syllabusCopyResult?.courseId === detailCourse.id && syllabusCopyResult.status === "copied" ? "✓ 科目名をコピーしました" : "科目名をコピー"}
              </button>
              <a href={detailCourse.syllabusSearchUrl} target="_blank" rel="noreferrer" className="soft-button">シラバス検索画面を開く</a>
              {!selectedIds.includes(detailCourse.id) && (
                <button className="primary-button" onClick={() => addCourse(detailCourse, "elective", scheduleView !== "quarter" ? semester : undefined) && setDetailCourse(null)}>履修案に追加</button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
