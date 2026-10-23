// 起動、版の番号の確かめ、データの読み込み、画面の切り替え、上のメニュー、途中で離れるときの確認。
import { el, clear, button, icon, showDialog, hideDialog, hideTermSheet } from './ui.js?v=d5cfdb6c3a';
import {
  getState, isStorageAvailable, setKnownIds, clearAll,
  setUnitDone, saveToday,
  markWeakCards, recordWeakCardPractice,
  setMigrationContext, addBlockTestPass, startCategoryTest, finishCategoryTest,
  answerBlockTestQuestion, finishBlockTestRound, answerCategoryTestQuestion,
  answerReviewQuestion, recordWeakPractice, recordRetryAnswer,
} from './storage.js?v=d5cfdb6c3a';
import { unitSequence, questionMarks, cardLessons } from './logic/progress.js?v=d5cfdb6c3a';
import { knownIds } from './logic/known.js?v=d5cfdb6c3a';
import { weakQuestionIds } from './logic/weak.js?v=d5cfdb6c3a';
import { pickCategoryTest, pickBlockTest } from './logic/picker.js?v=d5cfdb6c3a';
import { passScoreFor } from './logic/grade.js?v=d5cfdb6c3a';
import { weakCardIds, weakCardRule } from './logic/weakcards.js?v=d5cfdb6c3a';
import {
  planRule, dayKey, planStatus, reviewDates, computeToday, needsRecompute,
  reviewKeys, chapterReviewOnPass, reviewLookup, reviewPool,
  nextChapterReviewDate, categoryTestCount, categoryTestToday,
  blockTestLeft, blockTestStarted, blockTestSize,
} from './logic/plan.js?v=d5cfdb6c3a';
import * as home from './screens/home.js?v=d5cfdb6c3a';
import * as helpScreen from './screens/help.js?v=d5cfdb6c3a';
import * as categoryScreen from './screens/category.js?v=d5cfdb6c3a';
import * as unitScreen from './screens/unit.js?v=d5cfdb6c3a';
import * as testScreen from './screens/test.js?v=d5cfdb6c3a';
import * as mockScreen from './screens/mock.js?v=d5cfdb6c3a';
import * as weakScreen from './screens/weak.js?v=d5cfdb6c3a';
import * as weakCardsScreen from './screens/weakcards.js?v=d5cfdb6c3a';
import * as reviewPoolScreen from './screens/reviewpool.js?v=d5cfdb6c3a';
import * as planScreen from './screens/plan.js?v=d5cfdb6c3a';
import * as glossaryScreen from './screens/glossary.js?v=d5cfdb6c3a';

const root = document.getElementById('app');
const menuNode = document.getElementById('menu');
const menuBtn = document.getElementById('menu-btn');

// 版の番号（tools/stamp_version.py が書き換える。手で直さない。段階6-22b）
const APP_VERSION = 'd5cfdb6c3a';

const LEAVE_MESSAGE = 'いま解いている問題は、最初からになります。移動しますか？';
const CLEAR_MESSAGE = '学習の記録をすべて消して、最初の状態に戻します。消しますか？';

// ---------------------------------------------------------------- データの読み込み

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(path + ' を読めませんでした（' + res.status + '）');
  return res.json();
}

// 開いたページが古いままでないかを確かめる（段階6-22b）。
// version.json の番号が APP_VERSION と違い、いまの行き先の ?v= もその番号でなければ、?v=番号 を付けて
// 読み直す（ページの呼び名が変わるので、ブラウザは index.html を新しく読む）。読み直すときは true を返す。
// version.json が読めない・番号が同じ・すでに ?v= がその番号なら、何もしない（同じことを繰り返さない）。
// 学習の記録には一切さわらない。行き先（#/...）は読み直しのあとも同じ。
async function reloadIfOld() {
  let latest;
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return false;
    latest = (await res.json()).version;
  } catch (e) {
    return false;
  }
  if (typeof latest !== 'string' || !latest || latest === APP_VERSION) return false;
  if (new URLSearchParams(location.search).get('v') === latest) return false;
  location.replace(location.pathname + '?v=' + encodeURIComponent(latest) + location.hash);
  return true;
}

async function boot() {
  if (await reloadIfOld()) return;
  let settings;
  let questionsDoc;
  let cardsDoc;
  let curriculumDoc;
  let glossaryDoc;
  try {
    [settings, questionsDoc, cardsDoc, curriculumDoc, glossaryDoc] = await Promise.all([
      loadJson('settings.json'),
      loadJson('data/questions.json'),
      loadJson('data/cards.json'),
      loadJson('data/curriculum.json'),
      loadJson('data/glossary.json'),
    ]);
  } catch (e) {
    clear(root).appendChild(el('section', { class: 'panel' }, [
      el('p', { class: 'notice notice-warn', text: 'データを読み込めませんでした。' }),
      el('p', { class: 'note', text: String(e.message || e) }),
      el('p', { class: 'note', text: 'app/ でサーバーを動かしてから開いてください（README.md を見てください）。' }),
    ]));
    return;
  }

  const questions = questionsDoc.questions;
  const cards = cardsDoc.cards;
  const curriculum = curriculumDoc.categories;

  // 保存した学習の記録のうち、いまのデータに無いIDの記録を無視する
  // （消したレッスンや、学習の対象から外した問題の記録が残っていても壊れない）。
  // 版4までの記録を章の復習の形に移すため、章とレッスンの対応を先に教える（段階6-18。読み出す前に）
  // 版5までの記録を復習の山・テストの残りの形に移すため、レッスン・章の問題と、移し替える日も教える（段階6-21）
  const look = reviewLookup(curriculum);
  const rule = planRule(settings);
  setMigrationContext({
    blockUnits: Object.fromEntries(curriculum.flatMap((c) => c.blocks.map((b) => [b.id, b.units.map((u) => u.id)]))),
    firstKey: reviewKeys(rule)[0],
    unitQuestions: look.unitQuestions,
    blockQuestions: look.blockQuestions,
    // 版7までの記録を、章に1つの章末テストの形に移すため（段階6-22の回の分け方。段階6-22・6-22c）
    blockRounds: look.blockRounds,
    catRounds: Object.fromEntries(curriculum.map((c) => [c.name, c.tests.map((t) => t.round)])),
    today: dayKey(new Date(), rule),
    rule,
  });
  setKnownIds(knownIds(curriculum, questions, cards));

  const ctx = {
    settings,
    questions,
    cards,
    curriculum,
    allQuestionIds: questions.map((q) => q.id),
    questionById: new Map(questions.map((q) => [q.id, q])),
    cardById: new Map(cards.map((c) => [c.id, c])),
    categoryByName: new Map(curriculum.map((c) => [c.name, c])),
    unitById: new Map(),
    blockById: new Map(),
    unitSequence: unitSequence(curriculum),
    // カードが出ているレッスン（「既出」の決め方に使う。段階6-22）
    cardLessons: cardLessons(curriculum),
    // 用語集（段階6-22）。termById：{ 用語ID → 用語 }、questionTerms・cardTerms：当たりの位置
    glossary: {
      terms: glossaryDoc.terms,
      termById: new Map(glossaryDoc.terms.map((t) => [t.term_id, t])),
      questionTerms: glossaryDoc.question_terms || {},
      cardTerms: glossaryDoc.card_terms || {},
    },
    // 学習の記録は storage.js が持つものを、そのつど読む
    // （記録を消したときに、画面が古い中身を見ないようにする）
    // 保存の形の移し替えは、storage.js が黙って行う（画面には知らせない）。
    get state() { return getState(); },
    storageAvailable: isStorageAvailable(),
    marks: () => questionMarks(getState()),
    weakIds: () => weakQuestionIds(getState(), questions.map((q) => q.id), settings),
    // ---- 苦手なカード（判定は js/logic/weakcards.js）
    weakCardIds: () => weakCardIds(getState(), cards.map((c) => c.id), settings),
    markWeakCards: (cardIds) => markWeakCards(cardIds),
    recordWeakCardPractice: (cardId, correct) => recordWeakCardPractice(
      cardId, correct, weakCardRule(settings),
    ),
    setGuard: (on) => { guard = !!on; },
    reload: () => route(),
    // ---- スケジュールと今日の一覧（計算は js/logic/plan.js。日時はここで取って渡す）
    todayKey: () => dayKey(new Date(), planRule(settings)),
    // 今日の一覧を作り直す。force が無ければ、日が変わったときだけ
    // （ホームを表示するたびと、スケジュールのページで保存したときに呼ぶ）。
    refreshToday: (force) => {
      const now = new Date();
      const state = getState();
      if (!force && !needsRecompute(state, now, settings)) return;
      saveToday(computeToday({ now, state, curriculum, settings }));
    },
    // レッスンの完了。スケジュールがあれば、復習の予定日と残りの問題も残す。
    completeUnit: (unitId) => {
      const date = dayKey(new Date(), rule);
      const plan = getState().plan;
      const reviews = planStatus(plan, date) === 'active' ? reviewDates(plan, date, rule) : null;
      setUnitDone(unitId, date, reviews, look.unitQuestions[unitId]);
    },
    // 章末テストの合格（「合格まで」が0になった）。初めての合格で予定があれば、その章の復習をまとめる（段階6-18）。
    passBlockTest: (blockId) => {
      const found = ctx.blockById.get(blockId);
      const date = dayKey(new Date(), rule);
      const chapter = found ? chapterReviewOnPass(getState(), found.block, date, rule) : null;
      addBlockTestPass(blockId, chapter, look.blockQuestions[blockId]);
    },
    // ---- 復習の山（段階6-21）
    reviewPoolIds: () => reviewPool(getState(), dayKey(new Date(), rule), look),
    // 山から1問答えた（その問題を含む復習の残りから外す。苦手な問題の出入りも記録する）。答えたあとの山の数を返す
    answerReview: (questionId, correct) => answerReviewQuestion(
      questionId, correct, dayKey(new Date(), rule), rule, look,
    ),
    // ---- 章末テスト（段階6-22c）：章に1つ。「合格まで」の問題・1回の問題数
    blockTestLeft: (blockId) => blockTestLeft(getState(), blockId, look),
    blockTestStarted: (blockId) => blockTestStarted(getState(), blockId),
    blockTestSize: (blockId) => blockTestSize(look, blockId),
    blockQuestionCount: (blockId) => (look.blockQuestions[blockId] || []).length,
    // 1回分の問題を選ぶ：「合格まで」の前から15問、足りなければその章の苦手な問題 → ほかの問題で補う。
    // 返す値：{ ids: 出す順の問題ID, extra: 補った問題の集まり }
    pickBlockTest: (blockId) => pickBlockTest(
      look.blockQuestions[blockId] || [], blockTestLeft(getState(), blockId, look), new Set(ctx.weakIds()),
      blockTestSize(look, blockId),
    ),
    // 章末テストで1問答えた。「合格まで」が0になったら合格を記録する（locked：同じ回の中で合格したあと）。
    answerBlockTest: (blockId, questionId, correct, locked) => {
      const result = answerBlockTestQuestion(blockId, questionId, correct, look, locked);
      if (result.passed) ctx.passBlockTest(blockId);
      return result;
    },
    // 1回分を解き終えた（今日やることの行を済にする）
    finishBlockTestRound: (blockId) => finishBlockTestRound(blockId),
    // ---- 分野テスト（段階6-22c）：30問。pass_rate をかけて切り上げた数（27問）以上の正解で合格
    categoryTestCount: (name) => categoryTestCount(look, name),
    categoryPassScore: (name) => passScoreFor(categoryTestCount(look, name), settings.pass_rate),
    // 分野テストを始める：その日にその分野で出した問題を除いて30問を選び、その日の記録に足して、そのIDを返す
    startCategoryTest: (name) => {
      const state = getState();
      const date = dayKey(new Date(), rule);
      const ids = pickCategoryTest(
        look.catQuestions[name] || [], new Set(ctx.weakIds()), state.questions, state.catTestSeen,
        categoryTestCount(look, name), Math.random, categoryTestToday(state, name, date),
      );
      startCategoryTest(name, ids, date);
      return ids;
    },
    answerCategoryTest: (questionId, correct) => answerCategoryTestQuestion(questionId, correct),
    // 1回受け終えた：合否を決めて記録する。合格なら、合格の日の chapter_review_repeat_days 日後にくり返しを入れる
    // （予定が無ければ入れない）。返す値：{ passed, passScore }
    finishCategoryTest: (name, correctCount) => {
      const passScore = ctx.categoryPassScore(name);
      const passed = correctCount >= passScore;
      const date = dayKey(new Date(), rule);
      finishCategoryTest(name, passed, passed ? nextChapterReviewDate(getState().plan, date, rule) : null, date);
      return { passed, passScore };
    },
    // ---- 苦手な問題の出入り（段階6-21 第5-4節）
    recordWeakPractice: (questionId, correct) => recordWeakPractice(questionId, correct),
    recordRetry: (questionId, correct) => recordRetryAnswer(questionId, correct),
  };
  for (const category of curriculum) {
    for (const block of category.blocks) {
      ctx.blockById.set(block.id, { block, category });
      for (const unit of block.units) {
        ctx.unitById.set(unit.id, { unit, block, category });
      }
    }
  }

  // ---------------------------------------------------------------- メニュー

  clear(menuBtn).appendChild(icon('menu', { size: 20, stroke: 2 }));

  function closeMenu() {
    menuNode.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'メニューを開く');
  }

  function openMenu() {
    drawMenu();
    menuNode.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'メニューを閉じる');
  }

  function drawMenu() {
    const node = clear(menuNode);
    const weakCount = ctx.weakIds().length;
    const weakCardCount = ctx.weakCardIds().length;
    const links = [
      { label: 'ホーム', href: '#/' },
      ...curriculum.map((c) => ({
        label: c.name, href: '#/category/' + encodeURIComponent(c.name), sub: true,
      })),
      { label: '模擬試験', href: '#/mock' },
      { label: '苦手な問題（' + weakCount + '問）', href: '#/weak' },
      { label: '苦手なカード（' + weakCardCount + '枚）', href: '#/weak-cards' },
      { label: '用語集', href: '#/glossary' },
      { label: 'スケジュール', href: '#/plan' },
      { label: '使い方', href: '#/help' },
    ];
    const items = links.map((item) => el('li', {}, [
      el('a', {
        class: 'menu-item' + (item.sub ? ' menu-item-sub' : ''),
        href: item.href,
        onClick: () => { closeMenu(); },
      }, item.label),
    ]));
    items.push(el('li', {}, [el('hr', { class: 'menu-sep' })]));
    items.push(el('li', {}, [
      button('学習の記録を消す', () => {
        closeMenu();
        showDialog({
          message: CLEAR_MESSAGE,
          yesLabel: '消す',
          noLabel: 'やめる',
          danger: true,
          onYes: () => { clearAll(); route(); },
        });
      }, 'menu-item menu-item-danger'),
    ]));
    node.appendChild(el('ul', { class: 'menu-list' }, items));
  }

  menuBtn.addEventListener('click', () => {
    if (menuNode.hidden) openMenu();
    else closeMenu();
  });

  // ---------------------------------------------------------------- 画面の切り替え

  function parseRoute() {
    const raw = window.location.hash.replace(/^#/, '');
    const parts = raw.split('/').filter((s) => s.length > 0).map(decodeURIComponent);
    if (!parts.length) return { name: 'home' };
    if (parts[0] === 'help') return { name: 'help' };
    if (parts[0] === 'category') return { name: 'category', categoryName: parts[1] };
    if (parts[0] === 'unit') return { name: 'unit', unitId: parts[1], tab: parts[2] || '1' };
    if (parts[0] === 'block-test') return { name: 'blockTest', blockId: parts[1] };
    if (parts[0] === 'review') return { name: 'review' };
    if (parts[0] === 'category-test') return { name: 'categoryTest', categoryName: parts[1] };
    if (parts[0] === 'glossary') return { name: 'glossary' };
    if (parts[0] === 'mock') return { name: 'mock' };
    if (parts[0] === 'weak') return { name: 'weak' };
    if (parts[0] === 'weak-cards') return { name: 'weakCards' };
    if (parts[0] === 'plan') return { name: 'plan' };
    return { name: 'home' };
  }

  function route() {
    guard = false;
    hideTermSheet();
    const r = parseRoute();
    clear(root);
    if (r.name === 'help') helpScreen.render(ctx, root);
    else if (r.name === 'category') categoryScreen.render(ctx, root, r);
    else if (r.name === 'unit') unitScreen.render(ctx, root, r);
    else if (r.name === 'blockTest') testScreen.renderBlockTest(ctx, root, r);
    else if (r.name === 'review') reviewPoolScreen.render(ctx, root);
    else if (r.name === 'categoryTest') testScreen.renderCategoryTest(ctx, root, r);
    else if (r.name === 'mock') mockScreen.render(ctx, root);
    else if (r.name === 'weak') weakScreen.render(ctx, root);
    else if (r.name === 'weakCards') weakCardsScreen.render(ctx, root);
    else if (r.name === 'plan') planScreen.render(ctx, root);
    else if (r.name === 'glossary') glossaryScreen.render(ctx, root);
    else home.render(ctx, root);
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- 途中で離れるときの確認

  // 確認は、画面の中に重ねて出すウィンドウ（js/ui.js の showDialog。アプリ全体でこの形にそろえる）。
  let guard = false;
  let here = window.location.hash || '#/';
  let goingBack = false;
  let pending = null;

  function showLeave() {
    closeMenu();
    showDialog({
      message: LEAVE_MESSAGE,
      yesLabel: '移動する',
      noLabel: '続ける',
      onYes: () => {
        const to = pending;
        pending = null;
        guard = false;
        if (to && to !== (window.location.hash || '#/')) window.location.hash = to;
        else route();
      },
      onNo: () => { pending = null; },
    });
  }

  window.addEventListener('hashchange', () => {
    const now = window.location.hash || '#/';
    if (goingBack) {
      goingBack = false;
      here = now;
      return;
    }
    if (guard && now !== here) {
      pending = now;
      goingBack = true;
      window.location.hash = here; // いまの画面に戻してから、画面の中で確かめる
      showLeave();
      return;
    }
    here = now;
    hideDialog();
    route();
  });

  route();
}

boot();
