// 予定と「今日やること」の計算。画面から切り離した関数。
// 中で日時を取らない（呼ぶ側が now を渡す。試せるようにするため）。
// 日付は、朝の区切り（settings.json の plan.day_start_hour）で数えた日の 'YYYY-MM-DD'。
//
// 今日の一覧の1行（today.items の1つ）：
//   { type: 'reviews', id: 'reviews', questions, done }                 復習の山（予定日が来た復習の問題をまとめたもの。段階6-21）
//   { type: 'unit',   id: レッスンID, questions, done }                   レッスン
//   { type: 'block',  id: 章ID, questions, done }                        章末テスト（questions は1回分の問題数。段階6-22c）
//   { type: 'cat',    id: 分野名, questions, done }                       分野テスト（30問。段階6-22c）
//   { type: 'mock',   id: 'mock', questions, done }                       模擬試験
// questions は、その行でその日に解く延べの問題数（レッスンは ③・④ の2回ぶん）。
//
// 復習（段階6-21）：レッスンの復習（reviews[レッスンID][d1…] が予定日）と章の復習（blockReviews[章ID] が予定日）の
// それぞれが「残りの問題」（reviewLeft[復習の名前]）を持つ。復習の名前は 'U001:d1'・'chapter:B001'（reviewName）。
// 予定日が今日かそれより前の、終えていない復習の残りの問題を1つの山にまとめる（同じ問題は1回）。
// 山から1問答えたら、その問題を、山に入っているすべての復習の残りから外す。残りが0になった復習は済。
//
// 章末テスト（段階6-22c）：章に1つ。章の全問に1回ずつ正解したら合格。
// 「合格まで」の問題（testLeft['block:章ID']。始めていなければ章の全問を章の並びのまま）を持ち、
// 1回に「合格まで」の前から15問を出す（足りなければ、その章の苦手な問題 → その章のほかの問題で補う。js/logic/picker.js）。
// 正解した問題は「合格まで」から外し、間違えた問題は「合格まで」のいちばん後ろに移す（補った問題を間違えたら後ろに入れる）。
// 「合格まで」が0になったら合格（記録は消し、次に受けるときはまた全問から）。
// 分野テスト（段階6-22c）：分野ごとに1つ。1回に30問を選び（同じ日にその分野のテストで出た問題は除く）、
// pass_rate をかけて切り上げた数（27問）以上の正解で合格。合格した日の chapter_review_repeat_days 日後
// （学ぶ日でなければ次の学ぶ日）に、新しく30問でもう一度（catTestNext[分野名]。模擬試験の日以後と、予定が無いときは入れない）。
// 不合格のときは catTestFailed[分野名] に日付を残し、合格するまで次の学ぶ日以後の一覧に先に入れる。

// 章末テストの1回の問題数と、分野テストの問題数（段階6-22・6-22c）。
export const BLOCK_TEST_QUESTIONS = 15;
export const CATEGORY_TEST_QUESTIONS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SEARCH_DAYS = 400; // 次の学ぶ日を探す上限（学ぶ曜日が無いときに止まるように）

// ---------------------------------------------------------------- 設定

// settings.json の plan から、使う値を取り出す。
export function planRule(settings) {
  const p = (settings && settings.plan) || {};
  const hour = Number(p.day_start_hour);
  const mock = Number(p.mock_days_before_exam);
  const after = Array.isArray(p.review_after_days)
    ? p.review_after_days.map(Number).filter((n) => Number.isFinite(n) && n >= 1).map(Math.floor)
    : [];
  const count = Number(settings && settings.final_test && settings.final_test.question_count);
  const repeat = Number(p.chapter_review_repeat_days);
  return {
    dayStartHour: Number.isFinite(hour) && hour >= 0 && hour < 24 ? Math.floor(hour) : 4,
    mockDays: Number.isFinite(mock) && mock >= 0 ? Math.floor(mock) : 3,
    reviewAfterDays: after.length ? after : [1, 7],
    mockQuestions: Number.isFinite(count) && count > 0 ? Math.floor(count) : 65,
    chapterRepeatDays: Number.isFinite(repeat) && repeat >= 1 ? Math.floor(repeat) : 14,
  };
}

// ---------------------------------------------------------------- 日付

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function toUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

// 'YYYY-MM-DD' の形で、実在する日か。
export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return fromUtc(toUtc(value)) === value;
}

// その時刻が、朝の区切りで数えて何日か（端末の時計の日付）。3時59分までは前の日。
export function dayKey(now, rule) {
  const t = new Date(now.getTime() - rule.dayStartHour * HOUR_MS);
  return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
}

export function addDays(key, n) {
  return fromUtc(toUtc(key) + n * DAY_MS);
}

// 曜日（0＝日、1＝月 … 6＝土）。
export function weekdayOf(key) {
  return new Date(toUtc(key)).getUTCDay();
}

// ---------------------------------------------------------------- 学ぶ日

// その日が学ぶ日か（学ぶ曜日で、休みの日でない）。受験日かどうかは見ない。
export function isStudyDay(plan, key) {
  if (!plan) return false;
  return (plan.weekdays || []).includes(weekdayOf(key))
    && !(plan.days_off || []).includes(key);
}

// その日から数えて、最初の学ぶ日（その日が学ぶ日なら、その日）。
export function nextStudyDay(plan, key) {
  let d = key;
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    if (isStudyDay(plan, d)) return d;
    d = addDays(d, 1);
  }
  return key;
}

// from から受験日の前の日までの学ぶ日（並び順どおり）。
export function studyDaysUntilExam(plan, from) {
  const out = [];
  if (!plan || !isDateKey(plan.exam_date)) return out;
  for (let d = from; d < plan.exam_date; d = addDays(d, 1)) {
    if (isStudyDay(plan, d)) out.push(d);
  }
  return out;
}

// 予定の状態：'none'（予定なし）| 'expired'（受験日をすぎた）| 'active'。
export function planStatus(plan, date) {
  if (!plan || !isDateKey(plan.exam_date)) return 'none';
  return date > plan.exam_date ? 'expired' : 'active';
}

// 試験前の模擬試験の日のうち、最初の日（受験日の前の、模擬試験のための学ぶ日。plan.mock_days_before_exam）。
// 模擬試験の日が無い（0日）ときは受験日。
export function mockStartDay(plan, rule) {
  if (!plan || !isDateKey(plan.exam_date)) return null;
  if (rule.mockDays <= 0) return plan.exam_date;
  let d = addDays(plan.exam_date, -1);
  let found = 0;
  let last = plan.exam_date;
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    if (isStudyDay(plan, d)) {
      found += 1;
      last = d;
      if (found >= rule.mockDays) return d;
    }
    d = addDays(d, -1);
  }
  return last;
}

// 章の復習を終えた日から、次の章の復習の予定日（段階6-21）。
// 終えた日の chapter_review_repeat_days 日後（学ぶ日でなければ次の学ぶ日）。
// その日が模擬試験の日かそれより後なら入れない（null）。予定が無いときも null。
export function nextChapterReviewDate(plan, doneDate, rule) {
  if (planStatus(plan, doneDate) !== 'active') return null;
  const next = nextStudyDay(plan, addDays(doneDate, rule.chapterRepeatDays));
  const mock = mockStartDay(plan, rule);
  if (!isStudyDay(plan, next) || !mock || next >= mock) return null;
  return next;
}

// 章の復習を終えた日から、次の章の復習の予定日（段階6-22h）。
// スケジュールがあれば nextChapterReviewDate と同じ（模擬試験の日かそれより後なら null）。
// スケジュールが無い（予定なし・受験日をすぎた）ときは、終えた日の chapter_review_repeat_days 日後（暦の日数どおり。終わりは無い）。
// 分野テストのくり返しには使わない（スケジュールが無いときは入れないため、nextChapterReviewDate を使う）。
export function nextChapterRepeatDate(plan, doneDate, rule) {
  if (planStatus(plan, doneDate) === 'active') return nextChapterReviewDate(plan, doneDate, rule);
  return addDays(doneDate, rule.chapterRepeatDays);
}

// レッスンを完了した日から、復習の予定日を作る（{ d1: 日付, d7: 日付 }）。
// スケジュールがあれば、その日が学ぶ日でなければ次の学ぶ日にする。
// スケジュールが無い（予定なし・受験日をすぎた）ときは、完了した日の1日後・7日後（暦の日数どおり。段階6-22h）。
export function reviewDates(plan, doneDate, rule) {
  const active = planStatus(plan, doneDate) === 'active';
  const out = {};
  for (const n of rule.reviewAfterDays) {
    out['d' + n] = active ? nextStudyDay(plan, addDays(doneDate, n)) : addDays(doneDate, n);
  }
  return out;
}

// 復習の名前（'d1'・'d7' など。settings.json の plan.review_after_days の順）。
export function reviewKeys(rule) {
  return rule.reviewAfterDays.map((n) => 'd' + n);
}

// 章末テストに初めて合格したときの、復習のまとめ方（段階6-18）。
// まだ合格していない章のときだけ { drop, reviewDate } を返す（それ以外は null）。
//   drop：消す復習（[{ id: レッスンID, keys: [...] }]）。最初の間隔の復習は、予定日が合格した日より後なら残し、
//         合格した日かそれより前なら消す（章末テストで同じ問題を解いたため）。それより後の間隔の復習は、すべて消す
//   reviewDate：章の復習の予定日（合格した日の、最後の間隔の後。スケジュールがあれば、学ぶ日でなければ次の学ぶ日。
//               スケジュールが無いときは暦の日数どおり。段階6-22h）
export function chapterReviewOnPass(state, block, date, rule) {
  if (blockPassed(state, block.id)) return null; // 2回目以降の合格（受け直しを含め、すでに合格している章）
  const first = reviewKeys(rule)[0];
  const drop = [];
  for (const unit of block.units) {
    const r = (state.reviews && state.reviews[unit.id]) || {};
    const keys = Object.keys(r).filter((k) => isDateKey(r[k]) && (k !== first || r[k] <= date));
    if (keys.length) drop.push({ id: unit.id, keys });
  }
  const last = rule.reviewAfterDays[rule.reviewAfterDays.length - 1];
  const after = addDays(date, last);
  const active = planStatus(state.plan, date) === 'active';
  return { drop, reviewDate: active ? nextStudyDay(state.plan, after) : after };
}


// ---------------------------------------------------------------- 数え方

// レッスンの問題数（③・④ で解く問題の数）。
export function unitQuestionCount(unit) {
  return (unit.question_ids || []).length;
}

// 段階6-22の章末テストの回の分け方（版7の記録を移すときにだけ使う。段階6-22c）。
// 章の問題を、max 問以下の回に均等に分ける（並びのまま前から。多い回を前に。例：21問 → 11問・10問）。
export function splitRounds(ids, max = BLOCK_TEST_QUESTIONS) {
  const list = (ids || []).slice();
  if (!list.length) return [];
  const k = Math.ceil(list.length / max);
  const base = Math.floor(list.length / k);
  const extra = list.length % k;
  const out = [];
  let pos = 0;
  for (let i = 0; i < k; i += 1) {
    const n = base + (i < extra ? 1 : 0);
    out.push(list.slice(pos, pos + n));
    pos += n;
  }
  return out;
}

// 分野の問題（分野テストの元。curriculum の分野テストの回の問題を、並びのまま重ねずに合わせたもの）。
export function categoryQuestionIds(category) {
  const seen = new Set();
  for (const test of category.tests || []) for (const id of test.question_ids || []) seen.add(id);
  return [...seen];
}

// カリキュラムの順番どおりの、レッスン・章末テスト・分野テスト（段階6-22c で章末テストを章に1つにした）。
export function planSteps(curriculum) {
  const out = [];
  for (const category of curriculum) {
    for (const block of category.blocks) {
      for (const unit of block.units) out.push({ type: 'unit', unit, block, category });
      out.push({ type: 'block', block, category });
    }
    out.push({ type: 'cat', category });
  }
  return out;
}

// テストの名前。章末テストは 'block:B001'（testLeft のキー。「合格まで」の問題）、分野テストは 'cat:ストレージ'（段階6-22c）。
export function testKey(type, id) {
  return type === 'block' ? 'block:' + id : 'cat:' + id;
}

// 復習の名前（reviewLeft・reviewDoneAt のキー）。レッスンの復習は 'U001:d1'、章の復習は 'chapter:B001'。
export function reviewName(kind, id, slot) {
  return kind === 'chapter' ? 'chapter:' + id : id + ':' + slot;
}

// カリキュラムから、復習とテストの問題を引く表（段階6-21・6-22）。
//   unitQuestions：{ レッスンID: [問題ID] }、blockQuestions：{ 章ID: [章末テストの問題ID] }、
//   blockOfUnit：{ レッスンID: 章ID }、catQuestions：{ 分野名: [分野の問題ID] }、
//   blockRounds：{ 章ID: [[1回目の問題ID], …] }（段階6-22の回。版7の記録を移すときにだけ使う）
export function reviewLookup(curriculum) {
  const look = { unitQuestions: {}, blockQuestions: {}, blockOfUnit: {}, blockRounds: {}, catQuestions: {} };
  for (const category of curriculum || []) {
    for (const block of category.blocks || []) {
      look.blockQuestions[block.id] = (block.test && block.test.question_ids || []).slice();
      look.blockRounds[block.id] = splitRounds(look.blockQuestions[block.id]);
      for (const unit of block.units || []) {
        look.unitQuestions[unit.id] = (unit.question_ids || []).slice();
        look.blockOfUnit[unit.id] = block.id;
      }
    }
    look.catQuestions[category.name] = categoryQuestionIds(category);
  }
  return look;
}


function unitDone(state, id) {
  return !!(state.units && state.units[id] === true);
}

function blockPassed(state, id) {
  return (Number(state.blockTests && state.blockTests[id]) || 0) > 0;
}

function catPassed(state, name) {
  return (Number(state.categoryTests && state.categoryTests[name]) || 0) > 0;
}

function stepPassed(state, step) {
  if (step.type === 'unit') return unitDone(state, step.unit.id);
  if (step.type === 'block') return blockPassed(state, step.block.id);
  return catPassed(state, step.category.name);
}

// 分野テストの次のくり返しの予定日（無ければ null。段階6-22）。
export function pendingCategoryTest(state, name) {
  const d = state.catTestNext && state.catTestNext[name];
  return isDateKey(d) ? d : null;
}

// 分野テストに不合格のまま（合格するまで、次の学ぶ日以後の一覧に先に入れる。段階6-22c）。
export function categoryTestFailed(state, name) {
  return isDateKey(state.catTestFailed && state.catTestFailed[name]) && !catPassed(state, name);
}

// 終えていない章の復習の予定日（無ければ null）。
export function pendingChapterReview(state, blockId) {
  const d = state.blockReviews && state.blockReviews[blockId];
  return isDateKey(d) ? d : null;
}

// ---------------------------------------------------------------- 復習の山（段階6-21）

// 復習の残りの問題（保存に無ければ、その復習の問題すべて）。
// いまのデータに無い問題（学習の対象から外した問題）は、残りに数えない。
function reviewLeftOf(state, look, kind, id) {
  const full = kind === 'chapter' ? (look.blockQuestions[id] || []) : (look.unitQuestions[id] || []);
  return (key) => {
    const v = state.reviewLeft && state.reviewLeft[key];
    return Array.isArray(v) ? v.filter((x) => full.includes(x)) : full.slice();
  };
}

// 終えていない復習（予定日があるもの）すべて。
// 返す値：[{ key, kind: 'unit'|'chapter', id, slot, due, left }]
export function pendingReviews(state, look) {
  const out = [];
  for (const [unitId, r] of Object.entries(state.reviews || {})) {
    if (!unitDone(state, unitId) || !r) continue;
    const leftOf = reviewLeftOf(state, look, 'unit', unitId);
    for (const [slot, due] of Object.entries(r)) {
      if (!isDateKey(due)) continue;
      const key = reviewName('unit', unitId, slot);
      out.push({ key, kind: 'unit', id: unitId, slot, due, left: leftOf(key) });
    }
  }
  for (const [blockId, due] of Object.entries(state.blockReviews || {})) {
    if (!isDateKey(due)) continue;
    const key = reviewName('chapter', blockId);
    out.push({ key, kind: 'chapter', id: blockId, slot: null, due, left: reviewLeftOf(state, look, 'chapter', blockId)(key) });
  }
  return out;
}

// 予定日が date かそれより前の、終えていない復習（山に入る復習）。
export function dueReviews(state, date, look) {
  return pendingReviews(state, look).filter((x) => x.due <= date);
}

// 復習の並びの、残りの問題をまとめたもの（同じ問題は1回だけ。最初に出た順）。
export function poolOf(reviews) {
  const seen = new Set();
  for (const r of reviews) for (const id of r.left) seen.add(id);
  return [...seen];
}

// 今日の山（予定日が来た、終えていない復習の残りの問題。同じ問題は1回だけ）。
export function reviewPool(state, date, look) {
  return poolOf(dueReviews(state, date, look));
}

// 山から1問答えた（段階6-21）。state を書き換える（呼ぶ側が保存する）。
// その問題を、山に入っているすべての復習の残りから外す。残りが0になった復習は済にし、終えた日を記録する。
// 章の復習を終えたら、終えた日から chapter_review_repeat_days 日後に次の章の復習を入れる
// （スケジュールがあれば、模擬試験の日かそれより後になるときは入れない。スケジュールが無ければ暦の日数どおり。nextChapterRepeatDate）。
// 返す値：{ finished: [復習の名前], pool: 答えたあとの山の問題数 }
export function applyReviewAnswer(state, questionId, date, rule, look) {
  if (!state.reviewLeft) state.reviewLeft = {};
  if (!state.reviewDoneAt) state.reviewDoneAt = {};
  const finished = [];
  for (const r of dueReviews(state, date, look)) {
    if (r.left.length && !r.left.includes(questionId)) continue; // 残りが0の復習（データから外れた問題だけだったもの）も済にする
    const left = r.left.filter((id) => id !== questionId);
    if (left.length) {
      state.reviewLeft[r.key] = left;
      continue;
    }
    finished.push(r.key);
    state.reviewDoneAt[r.key] = date;
    delete state.reviewLeft[r.key];
    if (r.kind === 'unit') {
      state.reviews[r.id][r.slot] = null;
    } else {
      const next = nextChapterRepeatDate(state.plan, date, rule);
      state.blockReviews[r.id] = next;
      if (next) state.reviewLeft[r.key] = (look.blockQuestions[r.id] || []).slice();
    }
  }
  return { finished, pool: reviewPool(state, date, look).length };
}

// その日に終えた復習があるか（山が0問でも、今日やることの行を済として出すため）。
export function reviewFinishedOn(state, date) {
  return Object.values(state.reviewDoneAt || {}).some((d) => d === date);
}

// ---------------------------------------------------------------- 章末テストの「合格まで」・分野テスト（段階6-22c）

// 章末テストの「合格まで」の問題。始めていなければ章の全問（章の並び）。いまのデータに無い問題は数えない。
export function blockTestLeft(state, blockId, look) {
  const full = look.blockQuestions[blockId] || [];
  const v = state.testLeft && state.testLeft[testKey('block', blockId)];
  if (Array.isArray(v)) return v.filter((x) => full.includes(x));
  return full.slice();
}

// 章末テストを始めているか（「合格まで」の記録を持っているか）。
export function blockTestStarted(state, blockId) {
  return Array.isArray(state.testLeft && state.testLeft[testKey('block', blockId)]);
}

// 章末テストの1回の問題数（15問。章の問題が少なければその数）。
export function blockTestSize(look, blockId) {
  return Math.min(BLOCK_TEST_QUESTIONS, (look.blockQuestions[blockId] || []).length);
}

// 章末テストで1問答えた。state を書き換える（呼ぶ側が保存する）。
// 正解：「合格まで」から外す（補った問題なら何もしない）。間違い：「合格まで」のいちばん後ろに移す（補った問題は後ろに入れる）。
// 「合格まで」が0になったら合格（passed: true。記録は消し、次に受けるときは全問から）。
// locked：同じ回の中で合格したあとの解答（「合格まで」を変えない）。
export function applyBlockTestAnswer(state, blockId, questionId, correct, look, locked = false) {
  if (!state.testLeft) state.testLeft = {};
  if (locked) return { left: blockTestLeft(state, blockId, look).length, passed: false };
  let left = blockTestLeft(state, blockId, look).filter((id) => id !== questionId);
  if (!correct) left.push(questionId);
  if (!left.length) {
    delete state.testLeft[testKey('block', blockId)];
    return { left: 0, passed: true };
  }
  state.testLeft[testKey('block', blockId)] = left;
  return { left: left.length, passed: false };
}

// 分野テストの1回の問題数（30問。分野の問題が少なければその数）。
export function categoryTestCount(look, name) {
  return Math.min(CATEGORY_TEST_QUESTIONS, (look.catQuestions[name] || []).length);
}

// その日にその分野の分野テストで出した問題（同じ日の分野テストには出さない。日が変われば使わない）。
export function categoryTestToday(state, name, date) {
  const t = state.catTestToday && state.catTestToday[name];
  return t && t.date === date && Array.isArray(t.ids) ? t.ids.slice() : [];
}

// ---------------------------------------------------------------- 残りの延べ問題数

// 合格した章の章の復習・分野テストの、次の予定日より後のくり返しの回数（模擬試験の日より前に入る分）。
function repeatsAfter(plan, due, rule) {
  const mock = mockStartDay(plan, rule);
  if (!mock) return 0;
  let n = 0;
  let d = due;
  for (let i = 0; i < 200; i += 1) {
    const next = nextStudyDay(plan, addDays(d, rule.chapterRepeatDays));
    if (!isStudyDay(plan, next) || next >= mock) break;
    n += 1;
    d = next;
  }
  return n;
}

// 残りの延べ問題数（模擬試験を除く）。これから実際に出る予定の問題を数える（段階6-18・6-21）。
//   完了していないレッスン：問題数 × 3（③・④・最初の間隔の復習）
//   今日の山に残っている問題：その数（同じ問題は1回だけ）
//   予定日がまだ来ていない復習：その復習の残りの問題の数
//   合格していない章末テスト：「合格まで」の数（始めていなければ章の問題数。段階6-22c）
//   合格していない章：章の復習の分（その章の問題数）
//   合格した章の章の復習のくり返し：次の予定日から chapter_review_repeat_days 日ごとに、
//     模擬試験の日より前に入る回数 × その章の問題数（次の予定日の分は、上の復習に入っている）
//   分野テスト（段階6-22・6-22c）：合格していないとき・くり返しの予定があるときは1回分（30問）、
//     くり返しの予定があれば、その後に模擬試験の日より前に入る回数 × 30問（補う問題・不合格での受け直しは前もって数えない）
export function remainingQuestions(state, curriculum, rule, date) {
  const look = reviewLookup(curriculum);
  let sum = 0;
  for (const step of planSteps(curriculum)) {
    if (step.type === 'unit') {
      if (!unitDone(state, step.unit.id)) sum += unitQuestionCount(step.unit) * 3;
    } else if (step.type === 'block') {
      const n = step.block.test.question_ids.length;
      if (!blockPassed(state, step.block.id)) {
        sum += blockTestLeft(state, step.block.id, look).length;
        sum += n;
      } else {
        const due = pendingChapterReview(state, step.block.id);
        if (due && state.plan) sum += n * repeatsAfter(state.plan, due, rule);
      }
    } else {
      const name = step.category.name;
      const next = pendingCategoryTest(state, name);
      if (!catPassed(state, name) || next) sum += categoryTestCount(look, name);
      if (next && state.plan) sum += categoryTestCount(look, name) * repeatsAfter(state.plan, next, rule);
    }
  }
  const pending = pendingReviews(state, look);
  const today = date || '9999-12-31';
  sum += poolOf(pending.filter((r) => r.due <= today)).length;
  for (const r of pending) if (r.due > today) sum += r.left.length;
  return sum;
}

// 今日の目標。残りの延べ問題数 ÷ 残りの学ぶ日
// （受験日の前の、模擬試験のための学ぶ日を除く。1より小さければ1）。
export function dailyTarget(now, state, curriculum, settings) {
  const rule = planRule(settings);
  const date = dayKey(now, rule);
  const plan = state.plan;
  const remaining = remainingQuestions(state, curriculum, rule, date);
  const studyDays = studyDaysUntilExam(plan, date).length;
  const days = Math.max(1, studyDays - rule.mockDays);
  const lessonsLeft = planSteps(curriculum)
    .filter((s) => s.type === 'unit' && !unitDone(state, s.unit.id)).length;
  return { date, remaining, studyDays, days, target: remaining / days, lessonsLeft };
}

// ---------------------------------------------------------------- 今日の一覧

function sameItem(a, b) {
  return a.type === b.type && a.id === b.id;
}

// 行の問題数（毎日の目安に足す数）：章末テストは1回分（15問。章が小さければその数）、分野テストは30問（段階6-22c）。
function stepItem(state, step, look) {
  if (step.type === 'unit') {
    return { type: 'unit', id: step.unit.id, questions: unitQuestionCount(step.unit) * 2, done: false };
  }
  if (step.type === 'block') {
    return { type: 'block', id: step.block.id, questions: blockTestSize(look, step.block.id), done: false };
  }
  return { type: 'cat', id: step.category.name, questions: categoryTestCount(look, step.category.name), done: false };
}

// 前の日までにレッスンを完了しているか（完了した日が分からないものは、前の日までとする）。
function doneBefore(state, unitId, date) {
  if (!unitDone(state, unitId)) return false;
  const at = state.unitDoneAt && state.unitDoneAt[unitId];
  return !isDateKey(at) || at < date;
}

// 今日の一覧を作る。
// args: { now, state, curriculum, settings }
//   state.today が同じ日のものなら、そこで終えた行（done）を先に残す
//   （予定を変えて同じ日に作り直したとき、その日に終えた分を消さないため）。
// 返す値：{ date, status, items, target, remaining, days, skippedReviews }
//   status：'none' | 'expired' | 'off'（今日は休み）| 'active'
//   skippedReviews：章末テストと同じ日のため省いたレッスンの復習（[{ id, keys }]。終えたことにする）
export function computeToday(args) {
  const { now, state, curriculum, settings } = args;
  const rule = planRule(settings);
  const date = dayKey(now, rule);
  const plan = state.plan;
  const base = { date, items: [], target: 0, remaining: 0, days: 0, skippedReviews: [] };

  const status = planStatus(plan, date);
  if (status !== 'active') return { ...base, status };
  // 1. 学ぶ日でなければ（休みの曜日・休みの日・受験日）、一覧は作らない
  if (!isStudyDay(plan, date) || date === plan.exam_date) return { ...base, status: 'off' };

  const look = reviewLookup(curriculum);
  const t = dailyTarget(now, state, curriculum, settings);
  const target = t.target;
  const steps = planSteps(curriculum);

  const items = [];
  let other = 0; // 復習の山を除いた、その日の延べ問題数
  let newCount = 0;

  const prev = state.today;
  if (prev && prev.date === date && Array.isArray(prev.items)) {
    for (const item of prev.items) {
      if (!item || !item.done || item.type === 'reviews') continue;
      if (!['unit', 'block', 'cat', 'mock'].includes(item.type)) continue;
      items.push({ ...item });
      if (item.type !== 'mock') other += Number(item.questions) || 0;
      if (item.type === 'unit' || item.type === 'block' || item.type === 'cat') newCount += 1;
    }
  }
  const has = (item) => items.some((x) => sameItem(x, item));

  // 2. 復習の山：今日までに予定日が来ている、終えていない復習
  let due = dueReviews(state, date, look);
  const skipped = new Map(); // レッスンID → [復習の名前（d1 など）]

  // 5. 章末テストを入れたら、その章のレッスンの、その日の（まだ終えていない）復習を省く
  function withoutBlock(list, blockId) {
    return list.filter((r) => r.kind !== 'unit' || look.blockOfUnit[r.id] !== blockId);
  }
  function dropBlockReviews(blockId) {
    for (const r of due) {
      if (r.kind !== 'unit' || look.blockOfUnit[r.id] !== blockId) continue;
      if (!skipped.has(r.id)) skipped.set(r.id, []);
      skipped.get(r.id).push(r.slot);
    }
    due = withoutBlock(due, blockId);
  }
  const sum = () => other + poolOf(due).length;

  // 3. 始めたまま合格していない章末テスト（「合格まで」を持ったもの）、不合格のままの分野テスト
  //    （合格するまで、次の日以降にも残る）と、予定日が来た分野テストのくり返し（段階6-22・6-22c）
  for (const s of steps) {
    if (s.type === 'unit') continue;
    const repeatDue = s.type === 'cat' && pendingCategoryTest(state, s.category.name) !== null
      && pendingCategoryTest(state, s.category.name) <= date;
    if (s.type === 'block' && (stepPassed(state, s) || !blockTestStarted(state, s.block.id))) continue;
    if (s.type === 'cat' && !categoryTestFailed(state, s.category.name) && !repeatDue) continue;
    const item = stepItem(state, s, look);
    if (has(item)) continue;
    items.push(item);
    other += item.questions;
    if (s.type === 'block') dropBlockReviews(s.block.id);
  }

  // 4. 残りの枠に、カリキュラムの順番どおりに1つずつ
  for (const s of steps) {
    if (stepPassed(state, s)) continue;
    const item = stepItem(state, s, look);
    if (has(item)) continue;
    if (s.type === 'block' && !s.block.units.every((u) => doneBefore(state, u.id, date))) continue;
    if (s.type === 'cat' && !s.category.blocks
      .every((b) => b.units.every((u) => doneBefore(state, u.id, date)))) continue;
    const pool = s.type === 'block' ? poolOf(withoutBlock(due, s.block.id)).length : poolOf(due).length;
    const next = other + item.questions + pool;
    // 入れたほうが目標に近い・同じなら入れる。遠くなるなら止める（新しいものは最低1つ）
    if (newCount > 0 && Math.abs(next - target) > Math.abs(sum() - target)) break;
    items.push(item);
    other += item.questions;
    if (s.type === 'block') dropBlockReviews(s.block.id);
    newCount += 1;
  }

  // 復習の山の1行（いちばん上）。山が0問でも、今日に終えた復習があれば済の行として出す
  const poolCount = poolOf(due).length;
  if (poolCount > 0) items.unshift({ type: 'reviews', id: 'reviews', questions: poolCount, done: false });
  else if (reviewFinishedOn(state, date)) items.unshift({ type: 'reviews', id: 'reviews', questions: 0, done: true });

  // 6. 全レッスンを終えていれば、模擬試験を1回
  const allDone = steps.every((s) => s.type !== 'unit' || unitDone(state, s.unit.id));
  const mock = { type: 'mock', id: 'mock', questions: rule.mockQuestions, done: false };
  if (allDone && !has(mock)) items.push(mock);

  const skippedReviews = [...skipped].map(([id, keys]) => ({ id, keys }));
  return {
    ...base, status: 'active', items, target, remaining: t.remaining, days: t.days, skippedReviews,
  };
}

// 保存してある今日の一覧を、作り直す必要があるか（日が変わったか）。
export function needsRecompute(state, now, settings) {
  const today = state && state.today;
  return !today || today.date !== dayKey(now, planRule(settings));
}
