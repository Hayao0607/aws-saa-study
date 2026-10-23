// 学習の記録の保存と読み出し。保存に触るのは、このファイルだけ。
// 保存先を変えるときは、ここだけを直す。
// 1つのキーに JSON で入れる。形を変えたら js/logic/migrate.js の VERSION を上げる。
import { VERSION, blankState, migrateState, needsMigration } from './logic/migrate.js?v=d5cfdb6c3a';
import { pickKnown } from './logic/known.js?v=d5cfdb6c3a';
import { applyAnswer, applyRetryAnswer } from './logic/weak.js?v=d5cfdb6c3a';
import { markCards, applyPractice } from './logic/weakcards.js?v=d5cfdb6c3a';
import {
  reviewName, applyReviewAnswer, applyBlockTestAnswer,
} from './logic/plan.js?v=d5cfdb6c3a';

const KEY = 'aws-saa-study';

// ---------------------------------------------------------------- 保存先の有無

let available = null;

// 保存できる場所があるか（プライベートブラウズなどでは使えないことがある）。
export function isStorageAvailable() {
  if (available !== null) return available;
  try {
    const probe = KEY + '-probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    available = true;
  } catch (e) {
    available = false;
  }
  return available;
}

// ---------------------------------------------------------------- 読み出しと保存

let state = null;   // 保存されている中身（そのまま。書き込みはこちらに行う）
let view = null;    // いまのデータにあるIDだけに絞った見え方（画面が読むのはこちら）
let known = null;   // いまのデータにあるIDの集まり（js/logic/known.js の knownIds）
let migrated = false;
let migrateOpts = null; // 前の版の記録を移すときに使う（js/logic/migrate.js の migrateState の opts）

// 前の版の記録を移すために、章とレッスンの対応・最初の間隔の復習の名前・レッスンと章の問題・
// 移し替える日・スケジュールの決まりを教える（段階6-18・6-21。読み出す前に呼ぶ）。
// opts：{ blockUnits: { 章ID: [レッスンID, …] }, firstKey: 'd1',
//         unitQuestions: { レッスンID: [問題ID] }, blockQuestions: { 章ID: [問題ID] }, today: 日付, rule }
export function setMigrationContext(opts) {
  migrateOpts = opts || null;
}

// いまのデータにあるIDを教える。これを渡したあとは、データに無いIDの記録を無視して返す。
// 記録そのものは消さない（消えたレッスンや、学習の対象から外した問題の記録が
// 残っていても、壊れずに読めるようにするためだけに使う）。
export function setKnownIds(ids) {
  known = ids || null;
  view = null;
}

function readRaw() {
  try {
    const text = window.localStorage.getItem(KEY);
    return text ? JSON.parse(text) : null;
  } catch (e) {
    return null;
  }
}

// 保存されている中身（そのまま）。書き込みのときだけ使う。
function rawState() {
  if (state) return state;
  const raw = readRaw();
  migrated = needsMigration(raw);
  state = migrateState(raw, migrateOpts);
  if (migrated) persist(); // 新しい版で書き戻し、読み直せるようにする
  return state;
}

// 画面が読む中身。いまのデータに無いIDの記録は入っていない。
export function getState() {
  const s = rawState();
  if (!known) return s;
  if (!view) view = pickKnown(s, known);
  return view;
}

// 前の版から移し替えたかどうか（段階6-13から、画面には知らせない。移し替えは黙って行う）。
export function wasMigrated() {
  rawState();
  return migrated;
}

// 保存の形の版。
export function storageVersion() {
  return VERSION;
}

function persist() {
  view = null; // 次に読むときに作り直す
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    available = false;
  }
}

// ---------------------------------------------------------------- 書き込み

// レッスンの完了。date は完了した日。reviews を渡せば、その復習の予定日を残す
// （予定があるときだけ。前に完了していたレッスンは、完了した日も復習も変えない）。
// questionIds：そのレッスンの問題（復習の残りの問題にする。段階6-21）。
export function setUnitDone(unitId, date, reviews, questionIds) {
  const s = rawState();
  const first = s.units[unitId] !== true;
  s.units[unitId] = true;
  if (first && date) s.unitDoneAt[unitId] = date;
  if (first && reviews) {
    s.reviews[unitId] = { ...reviews };
    for (const slot of Object.keys(reviews)) {
      s.reviewLeft[reviewName('unit', unitId, slot)] = (questionIds || []).slice();
    }
  }
  markTodayDone((x) => x.type === 'unit' && x.id === unitId);
  persist();
}

// 章末テストの合格（「合格まで」が0になった。段階6-22c）。chapter は、初めて合格したときの復習のまとめ方
// （js/logic/plan.js の chapterReviewOnPass の結果。予定が無いとき・2回目以降は null）：
// 消す復習を終えたことにし、章の復習の予定日と残りの問題（blockQuestionIds）を残す（段階6-18・6-21）。
export function addBlockTestPass(blockId, chapter, blockQuestionIds) {
  const s = rawState();
  if (chapter) {
    for (const d of chapter.drop || []) {
      const r = s.reviews[d.id];
      if (r) {
        for (const k of d.keys) {
          r[k] = null;
          delete s.reviewLeft[reviewName('unit', d.id, k)];
        }
      }
    }
    s.blockReviews[blockId] = chapter.reviewDate;
    s.reviewLeft[reviewName('chapter', blockId)] = (blockQuestionIds || []).slice();
  }
  s.blockTests[blockId] = (s.blockTests[blockId] || 0) + 1;
  markTodayDone((x) => x.type === 'block' && x.id === blockId);
  persist();
}

// 章末テストで1問答えた（段階6-22c）。正解した問題は「合格まで」から外し、間違えた問題は「合格まで」の
// いちばん後ろに移す（補った問題は、間違えたときだけ後ろに入れる）。locked：同じ回の中で合格したあとの解答。
// 苦手な問題の記録も付ける（補った問題も同じ。間違えたら入れ、正解したら外す）。
// 返す値：{ left: 「合格まで」の数, passed: 0になったか }（合格の記録は呼ぶ側で addBlockTestPass を呼ぶ）
export function answerBlockTestQuestion(blockId, questionId, correct, look, locked) {
  const s = rawState();
  const result = applyBlockTestAnswer(s, blockId, questionId, !!correct, look, !!locked);
  s.questions[questionId] = applyAnswer(s.questions[questionId], !!correct, true);
  persist();
  return result;
}

// 章末テストの1回分（15問）を解き終えた（段階6-22c）。今日やることの行を済にする（合格していなければ、次の学ぶ日にまた出る）。
export function finishBlockTestRound(blockId) {
  if (markTodayDone((x) => x.type === 'block' && x.id === blockId)) persist();
}

// 分野テストを始める（段階6-22c）：出した問題を、その日の日付と一緒に残す（同じ日の分野テストには出さない）。
export function startCategoryTest(categoryName, questionIds, date) {
  const s = rawState();
  const t = s.catTestToday[categoryName];
  const before = t && t.date === date ? t.ids : [];
  s.catTestToday[categoryName] = { date, ids: [...new Set([...before, ...(questionIds || [])])] };
  persist();
}

// 分野テストで1問答えた（段階6-22c）。苦手な問題の記録（間違えたら入れ、正解したら外す）と、分野テストに出た問題の記録。
export function answerCategoryTestQuestion(questionId, correct) {
  const s = rawState();
  s.questions[questionId] = applyAnswer(s.questions[questionId], !!correct, true);
  s.catTestSeen[questionId] = 1; // 分野テストに出た問題（30問の選び方に使う）
  persist();
}

// 分野テストを1回受け終えた（段階6-22c）。合格なら合格の回数を1つ増やし、くり返しの予定日（next。無ければ null）を残す。
// 不合格なら合格の回数は変えず、不合格のままの印（その日の日付）を残す。どちらも今日やることの行を済にする。
export function finishCategoryTest(categoryName, passed, next, date) {
  const s = rawState();
  if (passed) {
    s.categoryTests[categoryName] = (s.categoryTests[categoryName] || 0) + 1;
    s.catTestNext[categoryName] = next || null;
    delete s.catTestFailed[categoryName];
  } else {
    s.catTestFailed[categoryName] = date;
  }
  markTodayDone((x) => x.type === 'cat' && x.id === categoryName);
  persist();
}

export function addRandomPass() {
  const s = rawState();
  s.randomPassCount += 1;
  markTodayDone((x) => x.type === 'mock');
  persist();
}

// ---------------------------------------------------------------- 予定と今日の一覧

// 今日の一覧の行のうち、合うものを「済」にする（保存は呼ぶ側で行う）。
function markTodayDone(match) {
  const today = rawState().today;
  if (!today || !Array.isArray(today.items)) return false;
  let hit = false;
  for (const item of today.items) {
    if (!item.done && match(item)) {
      item.done = true;
      hit = true;
    }
  }
  return hit;
}

// 復習の山から1問答えた（段階6-21）。その問題を、山に入っているすべての復習の残りから外し、
// 残りが0になった復習を済にする（章の復習は、次のくり返しを入れる）。山が0問になったら、今日の一覧の行を済にする。
// 苦手な問題の記録も付ける（間違えたら入れ、正解したら外す）。返す値：答えたあとの山の問題数
export function answerReviewQuestion(questionId, correct, date, rule, look) {
  const s = rawState();
  const result = applyReviewAnswer(s, questionId, date, rule, look);
  s.questions[questionId] = applyAnswer(s.questions[questionId], !!correct, false);
  if (result.pool === 0) markTodayDone((x) => x.type === 'reviews');
  persist();
  return result.pool;
}

// 予定を保存する（null で予定をやめる。やめたときは、今日の一覧と復習の予定も消す）。
export function setPlan(plan) {
  const s = rawState();
  s.plan = plan ? {
    exam_date: plan.exam_date,
    weekdays: plan.weekdays.slice(),
    days_off: plan.days_off.slice(),
  } : null;
  if (!plan) {
    s.today = null;
    s.reviews = {};
    s.blockReviews = {};
    s.reviewLeft = {};
    s.reviewDoneAt = {};
    s.catTestNext = {};
  }
  persist();
}

// 計算した今日の一覧を保存する（js/logic/plan.js の computeToday の結果）。
// 章末テストと同じ日のため省いた復習は、終えたことにする。
export function saveToday(result) {
  const s = rawState();
  for (const skip of result.skippedReviews || []) {
    const r = s.reviews[skip.id];
    if (r) {
      for (const k of skip.keys) {
        r[k] = null;
        delete s.reviewLeft[reviewName('unit', skip.id, k)];
      }
    }
  }
  s.today = {
    date: result.date,
    status: result.status,
    items: result.items.map((x) => ({ ...x })),
  };
  persist();
}

// 模擬試験の解答をまとめて記録する（出たかどうか・前回の正誤・通算の間違い回数・続けて正解した回数）。
// 間違えた問題は苦手な問題に入り、正解した問題は外れる。answers: [{ id, correct }] の配列。
// （章末テスト・分野テストは answerTestQuestion で1問ごとに記録する。段階6-21）
export function recordTestAnswers(answers) {
  const s = rawState();
  for (const a of answers) {
    s.questions[a.id] = applyAnswer(s.questions[a.id], !!a.correct, true);
  }
  persist();
}

// 苦手な問題の練習での解答1件（間違えたら入れ、正解したら外す。段階6-21）。
export function recordWeakPractice(questionId, correct) {
  const s = rawState();
  s.questions[questionId] = applyAnswer(s.questions[questionId], !!correct, false);
  persist();
}

// 「間違えた問題をもう一度」での解答1件（④・復習・章末テスト・分野テスト・模擬試験のどれも同じ。段階6-21）。
// 間違えたら苦手な問題に入れ、正解では何も変えない。
export function recordRetryAnswer(questionId, correct) {
  const s = rawState();
  const next = applyRetryAnswer(s.questions[questionId], !!correct);
  if (!next) return;
  s.questions[questionId] = next;
  persist();
}

// ---------------------------------------------------------------- 苦手なカード

// 問題を間違えたときに、そのカードに印を付ける（js/logic/weakcards.js の cardsToMark で選んだID）。
// 演習・テスト・復習・苦手な問題から呼ぶ。② 確かめるからは、既出のカードを間違えたときだけ呼ぶ（段階6-21）。
export function markWeakCards(cardIds) {
  if (!cardIds || !cardIds.length) return;
  const s = rawState();
  s.cards = markCards(s.cards, cardIds);
  persist();
}

// 苦手なカードの練習で1枚答えた（2回続けて正解すると外れる。回数は settings.json の weak_cards）。
export function recordWeakCardPractice(cardId, correct, rule) {
  const s = rawState();
  s.cards = applyPractice(s.cards, cardId, !!correct, rule);
  persist();
}

// 学習の記録をすべて消す（苦手なカードの記録も消える）。
export function clearAll() {
  state = blankState();
  view = null;
  migrated = false;
  try {
    window.localStorage.removeItem(KEY);
  } catch (e) {
    // 消せなくても、画面の上では初めの状態に戻す。
  }
}
