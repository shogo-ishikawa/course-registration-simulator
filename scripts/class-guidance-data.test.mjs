import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lookupClasses } from '../src/class-guidance.ts';

const guidance = JSON.parse(readFileSync(new URL('../src/data/department-guidance.json', import.meta.url)));
const courses = JSON.parse(readFileSync(new URL('../src/data/course-data.json', import.meta.url))).courses;
const labKeys = ['工学基盤実験A', '工学基盤実験B', '科学基礎実験A', '科学基礎実験B'].sort();
const isLab = ({ course }) => labKeys.includes(course.key);
const lookup = (department, studentNumber, quarters = [1, 2, 3, 4], candidates = courses) =>
  lookupClasses(guidance, { department, studentNumber, quarters, year: 1, academicYear: 2026 }, candidates);

// Independent expected values transcribed from each supplied PDF's final
// laboratory table, not generated from department-guidance.json. Each row is
// [last student suffix in the group, course IDs in 1Q, 2Q, 3Q, 4Q order].
const laboratoryTables = {
  '機械': { prefix: '26B11', rows: [
    [50, ['1106005', '1106014', '1106003', '1106012']],
    [100, ['1106013', '1106006', '1106011', '1106004']],
    [149, ['1106001', '1106010', '1106007', '1106016']],
    [198, ['1106009', '1106002', '1106015', '1106008']],
  ] },
  '電気': { prefix: '26B21', rows: [
    [45, ['1106021', '1106030', '1106019', '1106028']],
    [88, ['1106029', '1106022', '1106027', '1106020']],
    [130, ['1106017', '1106026', '1106023', '1106032']],
    [176, ['1106025', '1106018', '1106031', '1106024']],
  ] },
  '土木': { prefix: '26B31', rows: [
    [56, ['1106037', '1106046', '1106035', '1106044']],
    [110, ['1106045', '1106038', '1106043', '1106036']],
    [164, ['1106033', '1106042', '1106039', '1106048']],
    [217, ['1106041', '1106034', '1106047', '1106040']],
  ] },
  '建築': { prefix: '26B41', rows: [
    [50, ['1106053', '1106062', '1106051', '1106060']],
    [99, ['1106061', '1106054', '1106059', '1106052']],
    [149, ['1106049', '1106058', '1106055', '1106064']],
    [198, ['1106057', '1106050', '1106063', '1106056']],
  ] },
  '応化': { prefix: '26B51', rows: [
    [47, ['1106069', '1106078', '1106067', '1106076']],
    [92, ['1106077', '1106070', '1106075', '1106068']],
    [138, ['1106065', '1106074', '1106071', '1106080']],
    [182, ['1106073', '1106066', '1106079', '1106072']],
  ] },
  'ＭＡ': { prefix: '26B61', rows: [
    [45, ['1106085', '1106094', '1106083', '1106092']],
    [88, ['1106093', '1106086', '1106091', '1106084']],
    [131, ['1106081', '1106090', '1106087', '1106096']],
    [176, ['1106089', '1106082', '1106095', '1106088']],
  ] },
  '数情': { prefix: '26B71', rows: [
    [40, ['1106101', '1106110', '1106099', '1106108']],
    [76, ['1106109', '1106102', '1106107', '1106100']],
    [119, ['1106097', '1106106', '1106103', '1106112']],
    [154, ['1106105', '1106098', '1106111', '1106104']],
  ] },
  '環境': { prefix: '26B81', rows: [
    [34, ['1106117', '1106126', '1106115', '1106124']],
    [67, ['1106125', '1106118', '1106123', '1106116']],
    [100, ['1106113', '1106122', '1106119', '1106128']],
    [132, ['1106121', '1106114', '1106127', '1106120']],
  ] },
  '創生': { prefix: '26B91', rows: [
    [36, ['1106133', '1106142', '1106131', '1106140']],
    [69, ['1106141', '1106134', '1106139', '1106132']],
    [101, ['1106129', '1106138', '1106135', '1106144']],
    [132, ['1106137', '1106130', '1106143', '1106136']],
  ] },
};

function labsByQuarter(result) {
  return result.matches.filter(isLab).sort((a, b) => a.course.quarters[0] - b.course.quarters[0]);
}

test('electrical laboratory group boundaries use the PDF quarter and defer the other semester', () => {
  // 02電気 PDF p13: inclusive endpoints; all four experiments meet 水1/水2.
  for (const suffix of [1, 45, 46, 88, 89, 130, 131, 176]) {
    const id = `26B21${String(suffix).padStart(3, '0')}`;
    const expected = laboratoryTables.電気.rows.find(([end]) => suffix <= end)[1];
    for (let q = 1; q <= 4; q++) {
      const result = lookup('電気', id, [q]);
      assert.deepEqual(result.matches.filter(isLab).map(({ course }) => course.id), [expected[q - 1]], `${id} ${q}Q`);
      const deferred = result.deferredMatches.filter(isLab);
      assert.equal(deferred.length, 3, `${id} ${q}Q deferred`);
      assert.deepEqual(deferred.map(({ course }) => course.id).sort(), expected.filter((_, i) => i !== q - 1).sort());
      assert.deepEqual(result.matches.find(isLab).course.slots.map(({ label }) => label), ['水1', '水2']);
    }
    for (const qs of [[1, 2], [3, 4]]) {
      const result = lookup('電気', id, qs);
      assert.deepEqual(labsByQuarter(result).map(({ course }) => course.id), qs.map(q => expected[q - 1]));
      assert.equal(result.deferredMatches.filter(isLab).length, 2);
    }
  }
});

test('every student in all nine source laboratory tables gets four distinct experiments in their stated quarters', () => {
  assert.deepEqual(Object.keys(laboratoryTables).sort(), Object.keys(guidance.departments).sort());
  for (const [department, { prefix, rows }] of Object.entries(laboratoryTables)) {
    assert.equal(guidance.departments[department].rules.filter(rule => labKeys.includes(rule.courseKey)).length, 16, department);
    const last = rows.at(-1)[0];
    for (let suffix = 1; suffix <= last; suffix++) {
      const id = `${prefix}${String(suffix).padStart(3, '0')}`;
      const expected = rows.find(([end]) => suffix <= end)[1];
      const labs = labsByQuarter(lookup(department, id));
      assert.deepEqual(labs.map(({ course }) => course.id), expected, id);
      assert.deepEqual(labs.map(({ course }) => course.key).sort(), labKeys, `${id} A and B are distinct requirements`);
      assert.deepEqual(labs.map(({ course }) => course.quarters), [[1], [2], [3], [4]], id);
    }
    for (const id of [`${prefix}000`, `${prefix}${last + 1}`, prefix.replace('26B', '25B') + '001']) {
      const result = lookup(department, id);
      assert.equal(result.matches.filter(isLab).length, 0, `${id} must not extend the source range`);
      assert.equal(result.deferredMatches.filter(isLab).length, 0);
    }
  }
});

test('mechanical information-literacy gap and explicit sports roster omissions are not filled', () => {
  // 01機械 p12 explicitly has 001–058, 060–114, 115–198; p1 sports
  // class 1 explicitly omits 009. Adjacent numbers prove the gap is specific.
  const courseFor = (id, key) => lookup('機械', id).matches.find(({ course }) => course.key === key)?.course.id;
  assert.equal(courseFor('26B11058', '情報リテラシー'), '1108003');
  assert.equal(courseFor('26B11060', '情報リテラシー'), '1108002');
  const missing = lookup('機械', '26B11059', [1, 2]);
  assert.equal(missing.matches.some(({ course }) => course.key === '情報リテラシー'), false);
  assert.ok(missing.blockedKeys.includes('情報リテラシー'));
  assert.equal(courseFor('26B11008', '体育'), '1101001');
  assert.equal(courseFor('26B11010', '体育'), '1101001');
  assert.equal(courseFor('26B11009', '体育'), undefined);
});

test('source admission-year errors and instructor conflicts remain blocked instead of guessed', () => {
  const cases = [
    ['機械', '26B11133', '線形代数学', [3, 4]], // p7 prints 25B11133–25B11198.
    ['機械', '26B11198', '線形代数学', [3, 4]],
    ['ＭＡ', '26B61118', '線形代数学', [3, 4]], // p7 ends at 25B61176.
    ['ＭＡ', '26B61176', '線形代数学', [3, 4]],
    ['電気', '26B21001', '微分積分学I', [1, 2]], // p5 PDF 佐藤友彦 vs workbook 古津博俊.
  ];
  for (const [department, id, key, qs] of cases) {
    const result = lookup(department, id, qs);
    assert.equal(result.matches.some(({ course }) => course.key === key), false, `${department} ${id}`);
    assert.equal(result.deferredMatches.some(({ course }) => course.key === key), false);
    assert.ok(result.blockedKeys.includes(key), `${department} ${id} remains in manual review`);
  }
  assert.equal(guidance.departments.電気.rules.some(rule => rule.courseId === '1103012'), false);
  for (const info of Object.values(guidance.departments)) {
    for (const rule of info.rules) {
      for (const range of rule.studentRanges) {
        assert.match(range.from, /^26B\d{5}$/);
        assert.equal(range.from.slice(0, 5), range.to.slice(0, 5));
        assert.ok(range.from <= range.to);
      }
    }
  }
});

test('track-conditioned subjects block even a single remaining candidate for the fallback caller', () => {
  // Those PDF rows require a course-track choice absent from the profile.
  // lookupClasses.blockedKeys is the planner's guard before its single-option
  // fallback. Restrict candidates to one to reproduce that dangerous case.
  for (const [department, id, keys] of [
    ['応化', '26B51001', ['物理学I', '物理学II', '化学', '応用化学', '情報リテラシー']],
    ['数情', '26B71001', ['物理学I', '情報リテラシー']],
  ]) {
    for (const key of keys) {
      assert.ok(guidance.departments[department].coveredCourseKeys.includes(key));
      assert.equal(guidance.departments[department].rules.some(rule => rule.courseKey === key), false);
      const candidates = courses.filter(course => course.key === key && course.year === 1).slice(0, 1);
      assert.equal(candidates.length, 1, key);
      const result = lookup(department, id, [1, 2, 3, 4], candidates);
      assert.equal(result.matches.length, 0);
      assert.equal(result.deferredMatches.length, 0);
      assert.ok(result.blockedKeys.includes(key), `${department} ${key}`);
    }
  }
});
