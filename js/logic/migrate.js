// 保存の形の移し替えと、読み出した中身の整え。画面から切り離した関数。
// storage.js だけが呼ぶ。版が上がったときに、前の版の保存を新しい形へ移す。
import { isDateKey, nextChapterReviewDate, reviewName } from './plan.js?v=d5cfdb6c3a';

export const VERSION = 8;

// 何も無いときの形。
export function blankState() {
  return {
    version: VERSION,
    units: {},          // { レッスンID: true }                完了したか
    blockTests: {},     // { 章ID: 回数 }                      章末テストの合格の通算回数（章の全問に1回ずつ正解した回数）
    categoryTests: {},  // { 分野名: 回数 }                    分野テストの合格の通算回数（段階6-22で、回ごとから分野ごとにした）
    catTestNext: {},    // { 分野名: 日付|null }               分野テストのくり返しの予定日（段階6-22）
    catTestSeen: {},    // { 問題ID: 1 }                       分野テストに出た問題（段階6-22。30問の選び方に使う）
    catTestToday: {},   // { 分野名: { date, ids: [問題ID] } } その日に分野テストで出した問題（段階6-22c。同じ日には出さない）
    catTestFailed: {},  // { 分野名: 日付 }                    分野テストに不合格のまま（段階6-22c。合格したら消す）
    randomPassCount: 0, // 数                                  模擬試験の合格の通算回数
    questions: {},      // { 問題ID: { last, wrong, streak, test? } } 答えた問題の記録（test: false はテストに出ていない）
    plan: null,         // { exam_date, weekdays: [0〜6], days_off: [日付] } 予定（無ければ null）
    today: null,        // { date, status, items: [...] }      今日の一覧（js/logic/plan.js）
    unitDoneAt: {},     // { レッスンID: 日付 }                レッスンを完了した日
    reviews: {},        // { レッスンID: { d1: 日付|null, d7: 日付|null } } 復習の予定日（null は終えた）
    cards: {},          // { カードID: { wrong, streak } }  苦手なカードの記録（js/logic/weakcards.js）
    blockReviews: {},   // { 章ID: 日付|null } 章の復習の予定日（null は終えた。段階6-18）
    reviewLeft: {},     // { 復習の名前: [問題ID] } 終えていない復習の残りの問題（段階6-21。名前は 'U001:d1'・'chapter:B001'）
    reviewDoneAt: {},   // { 復習の名前: 日付 } 復習を終えた日（段階6-21）
    testLeft: {},       // { 'block:章ID': [問題ID] } 章末テストの「合格まで」の問題（段階6-22c。並びが出す順）
  };
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

// 1問ぶんの記録を整える。
function normalizeRecord(value) {
  if (value === 0 || value === 1) {
    // 版1の形（1=前回正解・0=前回不正解）。回数の記録は無いので0から始める。
    return { last: value, wrong: 0, streak: 0 };
  }
  if (!isPlainObject(value)) return null;
  const last = value.last === 0 || value.last === 1 ? value.last : null;
  if (last === null) return null;
  const out = { last, wrong: toCount(value.wrong), streak: toCount(value.streak) };
  if (value.test === false) out.test = false;
  return out;
}

// 苦手なカード1枚ぶんの記録を整える。印が1つも無ければ null（記録しない）。
function normalizeCardRecord(value) {
  if (!isPlainObject(value)) return null;
  const wrong = toCount(value.wrong);
  if (wrong < 1) return null;
  return { wrong, streak: toCount(value.streak) };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value) {
  return typeof value === 'string' && DATE_RE.test(value);
}

// 予定を整える。形が違えば null（予定なし）。
function normalizePlan(value) {
  if (!isPlainObject(value) || !isDate(value.exam_date)) return null;
  const weekdays = Array.isArray(value.weekdays)
    ? [...new Set(value.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
    : [];
  const daysOff = Array.isArray(value.days_off)
    ? [...new Set(value.days_off.filter(isDate))].sort()
    : [];
  return { exam_date: value.exam_date, weekdays, days_off: daysOff };
}

// 今日の一覧を整える。形が違えば null（次にホームを開いたときに作り直す）。
function normalizeToday(value) {
  if (!isPlainObject(value) || !isDate(value.date) || !Array.isArray(value.items)) return null;
  const types = ['reviews', 'unit', 'block', 'cat', 'mock'];
  const items = value.items
    .filter((x) => isPlainObject(x) && types.includes(x.type) && typeof x.id === 'string')
    .map((x) => {
      return { type: x.type, id: x.id, questions: toCount(x.questions), done: x.done === true };
    });
  const status = typeof value.status === 'string' ? value.status : 'active';
  return { date: value.date, status, items };
}

// 版4までの記録を、章の復習の形にする（段階6-18 第1-5節）。予定がある人だけ。
// すでに章末テストに合格している章で、そのレッスンにまだ終えていない、最初の間隔より後の復習
// （1週間後の復習）があれば、それらを消し（null）、その中でいちばん遅い予定日に章の復習を入れる。
// 最初の間隔の復習（1日後の復習）は、そのまま残す。
// opts.blockUnits：{ 章ID: [レッスンID, …] }、opts.firstKey：最初の間隔の復習の名前（'d1'）
function mergeChapterReviews(state, opts) {
  if (!state.plan || !opts || !opts.blockUnits) return;
  const first = opts.firstKey || 'd1';
  for (const [blockId, unitIds] of Object.entries(opts.blockUnits)) {
    if (!(state.blockTests[blockId] > 0)) continue;
    let latest = null;
    for (const unitId of unitIds) {
      const r = state.reviews[unitId];
      if (!r) continue;
      for (const [k, v] of Object.entries(r)) {
        if (k === first || !isDate(v)) continue;
        if (!latest || v > latest) latest = v;
        r[k] = null;
      }
    }
    if (latest) state.blockReviews[blockId] = latest;
  }
}

function idList(value) {
  return Array.isArray(value) ? [...new Set(value.filter((x) => typeof x === 'string'))] : null;
}

// 版5までの記録を、復習の山・テストの残りの形にする（段階6-21 第6節）。
// - 終えていないレッスンの復習・章の復習：残りの問題を、そのレッスン・章の問題すべてにする
// - 終えた章の復習で、次のくり返しがまだ入っていない章（予定があり、章末テストに合格した章）：
//   終えた日は記録に無いので、移し替えた日（opts.today）を終えた日として、第2節の決まりで次の章の復習を入れる
// - 苦手な問題：通算の間違いが1回以上で、最後の答えが間違いの問題を苦手な問題とする
//   （続けて正解した回数を、最後の答えが間違いなら0、正解なら1以上にする）
// - 不合格の記録（testFailed）は使わない。今日の一覧は作り直す
// 予定が無い人の記録は、苦手な問題の読み直しのほかは変えない。
// opts：{ unitQuestions, blockQuestions, today, rule }
function toV6(state, opts) {
  for (const record of Object.values(state.questions)) {
    if (record.last === 0) record.streak = 0;
    else if (record.last === 1) record.streak = Math.max(1, record.streak);
  }
  state.today = null;
  if (!state.plan || !opts) return;
  const unitQ = opts.unitQuestions || {};
  const blockQ = opts.blockQuestions || {};
  for (const [unitId, r] of Object.entries(state.reviews)) {
    for (const [slot, due] of Object.entries(r)) {
      if (isDateKey(due) && unitQ[unitId]) state.reviewLeft[reviewName('unit', unitId, slot)] = unitQ[unitId].slice();
    }
  }
  for (const [blockId, due] of Object.entries(state.blockReviews)) {
    const key = reviewName('chapter', blockId);
    if (isDateKey(due)) {
      if (blockQ[blockId]) state.reviewLeft[key] = blockQ[blockId].slice();
      continue;
    }
    if (due !== null || !(state.blockTests[blockId] > 0) || !opts.today || !opts.rule) continue;
    const next = nextChapterReviewDate(state.plan, opts.today, opts.rule);
    state.blockReviews[blockId] = next;
    state.reviewDoneAt[key] = opts.today;
    if (next && blockQ[blockId]) state.reviewLeft[key] = blockQ[blockId].slice();
  }
}

// 版6までの記録を、章末テストの回・分野ごとの分野テストの形にする（段階6-22 第6節）。
// - 章末テスト：合格していた章は、すべての回を合格にする（回ごとの合格の回数 = 章の合格の回数）。
//   始めていた残り（'block:章ID'）は回に分け直す。回の問題が残りに1つも無い回は合格、全部ある回は始めていない回、
//   一部ある回はその分を残りにする
// - 分野テスト：第1〜すべての回に合格していた分野は、1回合格したことにする（合格した日は移し替えた日。
//   予定があれば、そこから第2節の決まりでくり返しを入れる）。それ以外は合格していない。回の残りは捨てる
// opts：{ blockRounds: { 章ID: [[問題ID]] }, catRounds: { 分野名: [回] }, today, rule }
// oldCats：版6までの { 分野名: { 回: 回数 } }、oldTestLeft：版6までの testLeft
function toV7(state, opts, oldCats, oldTestLeft) {
  state.today = null;
  if (!state.blockRounds) state.blockRounds = {};
  if (!opts) return;
  const rounds = opts.blockRounds || {};
  for (const [blockId, list] of Object.entries(rounds)) {
    const passes = state.blockTests[blockId] || 0;
    if (passes > 0) {
      state.blockRounds[blockId] = {};
      list.forEach((_, i) => { state.blockRounds[blockId][String(i + 1)] = passes; });
      continue;
    }
    const left = idList(oldTestLeft && oldTestLeft['block:' + blockId]);
    if (!left || !left.length) continue;
    list.forEach((ids, i) => {
      const r = String(i + 1);
      const rest = ids.filter((id) => left.includes(id));
      if (!rest.length) {
        if (!state.blockRounds[blockId]) state.blockRounds[blockId] = {};
        state.blockRounds[blockId][r] = 1;
      } else if (rest.length < ids.length) {
        state.testLeft['block:' + blockId + ':' + r] = rest;
      }
    });
  }
  for (const [name, roundList] of Object.entries(opts.catRounds || {})) {
    const got = (oldCats && oldCats[name]) || {};
    if (!roundList.length || !roundList.every((r) => (got[String(r)] || 0) > 0)) continue;
    state.categoryTests[name] = 1;
    const next = state.plan && opts.today && opts.rule ? nextChapterReviewDate(state.plan, opts.today, opts.rule) : null;
    state.catTestNext[name] = next;
  }
}

// 版7までの記録を、章に1つの章末テスト・30問中27問で合格の分野テストの形にする（段階6-22c 第7節）。
// - 章末テスト：合格していた章（blockTests が1以上）はそのまま。合格していない章は、段階6-22の回の記録から
//   「合格まで」を作る（並びは章の並び）。合格していた回の問題は入れない、始めていた回（'block:章ID:回'）は
//   その回の残りの問題を入れる、始めていない回は全問を入れる。どの回も始めても合格してもいない章は記録を作らない
// - 回の合格の記録（blockRounds）は捨てる。分野テストの残り（'cat:分野名'）も捨てる
// - 分野テストの合格の回数・くり返しの予定日・出た問題はそのまま。今日の一覧は作り直す
// opts.blockRounds：{ 章ID: [[1回目の問題ID], …] }（段階6-22の回の分け方）
function toV8(state, opts) {
  const rounds = (opts && opts.blockRounds) || {};
  const passedRounds = state.blockRounds || {};
  const oldLeft = state.testLeft || {};
  state.testLeft = {};
  for (const [blockId, list] of Object.entries(rounds)) {
    if (state.blockTests[blockId] > 0) continue;
    const passed = passedRounds[blockId] || {};
    let started = false;
    const keep = new Set();
    list.forEach((ids, i) => {
      const r = String(i + 1);
      if ((passed[r] || 0) > 0) { started = true; return; }
      const v = oldLeft['block:' + blockId + ':' + r];
      if (Array.isArray(v)) {
        started = true;
        for (const id of v) keep.add(id);
      } else {
        for (const id of ids) keep.add(id);
      }
    });
    if (!started) continue;
    const left = list.flat().filter((id) => keep.has(id));
    if (left.length) state.testLeft['block:' + blockId] = left;
  }
  delete state.blockRounds;
  state.today = null;
}

// 読み出した中身を、いまの版の形にする。
// opts は前の版の記録を移すときに使う（mergeChapterReviews・toV6・toV7・toV8）。
// - 版8：そのまま整える
// - 版7まで：章に1つの章末テスト（「合格まで」）の形にする（段階6-22c 第7節）
// - 版6まで：章末テストの回・分野ごとの分野テストの形にする（段階6-22 第6節）
// - 版5：復習の山・テストの残りの形にする（段階6-21 第6節）
// - 版4：章の復習の形にする（第1-5節）
// - 版3：苦手なカードは0枚（段階6-16で足した記録）。章の復習の形にする（第1-5節）
// - 版2：予定は「なし」。完了していたレッスンは完了した日が分からないので、復習は予定しない
//         （終えたことにする）
// - 版1：合格したかどうか（true）→ 合格回数1。記録のない値は0
// - それ以外・形の違うもの：捨てて初めの状態にする
export function migrateState(raw, opts) {
  const state = blankState();
  if (!isPlainObject(raw)) return state;
  const version = raw.version;
  if (![1, 2, 3, 4, 5, 6, 7, VERSION].includes(version)) return state;
  if (version < VERSION) state.blockRounds = {}; // 段階6-22の回の合格（toV8 で「合格まで」に移して捨てる）
  const old = version === 1;

  if (isPlainObject(raw.units)) {
    for (const [id, v] of Object.entries(raw.units)) {
      if (v === true) state.units[id] = true;
    }
  }

  if (isPlainObject(raw.blockTests)) {
    for (const [id, v] of Object.entries(raw.blockTests)) {
      const n = old ? (v === true ? 1 : 0) : toCount(v);
      if (n > 0) state.blockTests[id] = n;
    }
  }

  const oldCats = {}; // 版6までの分野テストの回ごとの合格（toV7 で分野ごとにする）
  if (isPlainObject(raw.categoryTests)) {
    for (const [name, rounds] of Object.entries(raw.categoryTests)) {
      if (version >= 7) {
        const n = toCount(rounds);
        if (n > 0) state.categoryTests[name] = n;
        continue;
      }
      if (!isPlainObject(rounds)) continue;
      for (const [round, v] of Object.entries(rounds)) {
        const n = old ? (v === true ? 1 : 0) : toCount(v);
        if (n <= 0) continue;
        if (!oldCats[name]) oldCats[name] = {};
        oldCats[name][round] = n;
      }
    }
  }

  state.randomPassCount = toCount(raw.randomPassCount);

  if (isPlainObject(raw.questions)) {
    for (const [id, v] of Object.entries(raw.questions)) {
      const record = normalizeRecord(v);
      if (record) state.questions[id] = record;
    }
  }

  if (version < 3) { // 版1・版2には、予定と復習の記録が無い
    toV6(state, opts);
    toV7(state, opts, oldCats, null);
    toV8(state, opts);
    return state;
  }

  state.plan = normalizePlan(raw.plan);
  state.today = state.plan ? normalizeToday(raw.today) : null;
  if (isPlainObject(raw.unitDoneAt)) {
    for (const [id, v] of Object.entries(raw.unitDoneAt)) {
      if (isDate(v) && state.units[id]) state.unitDoneAt[id] = v;
    }
  }
  if (isPlainObject(raw.reviews)) {
    for (const [id, r] of Object.entries(raw.reviews)) {
      if (!isPlainObject(r) || !state.units[id]) continue;
      const out = {};
      for (const [k, v] of Object.entries(r)) out[k] = isDate(v) ? v : null;
      state.reviews[id] = out;
    }
  }
  if (version >= 4 && isPlainObject(raw.cards)) { // 版3には、苦手なカードの記録が無い
    for (const [id, v] of Object.entries(raw.cards)) {
      const record = normalizeCardRecord(v);
      if (record) state.cards[id] = record;
    }
  }

  if (version < 5) mergeChapterReviews(state, opts); // 版4・版3：章の復習の形にする

  if (version >= 5 && isPlainObject(raw.blockReviews)) {
    for (const [id, v] of Object.entries(raw.blockReviews)) {
      if (isDate(v)) state.blockReviews[id] = v;
      else if (v === null) state.blockReviews[id] = null;
    }
  }

  if (version < 6) { // 版5まで：復習の山・テストの残りの形にする
    toV6(state, opts);
    toV7(state, opts, oldCats, null);
    toV8(state, opts);
    return state;
  }

  const fields = version >= 7 ? ['reviewLeft', 'testLeft'] : ['reviewLeft'];
  for (const field of fields) {
    if (!isPlainObject(raw[field])) continue;
    for (const [k, v] of Object.entries(raw[field])) {
      const list = idList(v);
      if (list && list.length) state[field][k] = list;
    }
  }
  if (isPlainObject(raw.reviewDoneAt)) {
    for (const [k, v] of Object.entries(raw.reviewDoneAt)) if (isDate(v)) state.reviewDoneAt[k] = v;
  }

  if (version === 6) { // 版6：章末テストの回・分野ごとの分野テストの形にしてから、版8の形にする
    toV7(state, opts, oldCats, isPlainObject(raw.testLeft) ? raw.testLeft : null);
    toV8(state, opts);
    return state;
  }

  if (version === 7 && isPlainObject(raw.blockRounds)) {
    for (const [id, rounds] of Object.entries(raw.blockRounds)) {
      if (!isPlainObject(rounds)) continue;
      for (const [r, v] of Object.entries(rounds)) {
        const n = toCount(v);
        if (n <= 0) continue;
        if (!state.blockRounds[id]) state.blockRounds[id] = {};
        state.blockRounds[id][r] = n;
      }
    }
  }
  if (isPlainObject(raw.catTestNext)) {
    for (const [name, v] of Object.entries(raw.catTestNext)) {
      if (isDate(v)) state.catTestNext[name] = v;
      else if (v === null) state.catTestNext[name] = null;
    }
  }
  if (isPlainObject(raw.catTestSeen)) {
    for (const [id, v] of Object.entries(raw.catTestSeen)) if (v) state.catTestSeen[id] = 1;
  }
  if (version === 7) { // 版7：章に1つの章末テストの形にする（段階6-22c）
    toV8(state, opts);
    return state;
  }
  // 版8：章末テストの「合格まで」は 'block:章ID' だけ。分野テストのその日の問題・不合格のまま
  for (const k of Object.keys(state.testLeft)) if (!/^block:[^:]+$/.test(k)) delete state.testLeft[k];
  if (isPlainObject(raw.catTestToday)) {
    for (const [name, v] of Object.entries(raw.catTestToday)) {
      if (!isPlainObject(v) || !isDate(v.date)) continue;
      const ids = idList(v.ids);
      if (ids) state.catTestToday[name] = { date: v.date, ids };
    }
  }
  if (isPlainObject(raw.catTestFailed)) {
    for (const [name, v] of Object.entries(raw.catTestFailed)) if (isDate(v)) state.catTestFailed[name] = v;
  }
  return state;
}

// 移し替えが要るかどうか（画面に知らせるために使う）。
export function needsMigration(raw) {
  return isPlainObject(raw) && [1, 2, 3, 4, 5, 6, 7].includes(raw.version);
}
