// レッスンの画面。上に4つのタブ（① 覚える／② 確かめる／③ 演習（ヒントあり）／
// ④ 演習（ヒントなし））を置き、いつでも自由に移れる。
// ③・④ で1問以上答えたあとに別のタブへ移るときだけ、画面の中に重ねて確認を出す
// （移ると、その演習は最初からになる）。
import {
  el, clear, button, cardFaces, heading, banner, progress, prefersReducedMotion, showDialog,
  backToCategory, stickyBar,
} from '../ui.js?v=dc64bc235b';
import { runQuestions } from './quizrun.js?v=dc64bc235b';
import { prepareCheck, renderCheckCard, isMissed } from './checkcard.js?v=dc64bc235b';
import { MARK_ALL, cardsForCheckCard } from '../logic/weakcards.js?v=dc64bc235b';
import { shuffled } from '../logic/shuffle.js?v=dc64bc235b';
import { isBlockTestDue, isSeenBefore } from '../logic/progress.js?v=dc64bc235b';

// タブの字は、スマホの幅（1つ85px）に収めるため2行にし、かっこは半角にする。
const TABS = ['① 覚える', '② 確かめる', '③ 演習\n(ヒントあり)', '④ 演習\n(ヒントなし)'];
const LEAVE_TAB_MESSAGE = 'いまの演習は、最初からになります。移動しますか？';

// ② で間違えたカードを、何枚あとにもう一度出すか（settings.json の check.retry_after_cards）。
function retryAfterCards(settings) {
  const n = settings && settings.check ? Number(settings.check.retry_after_cards) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : 3;
}

// ③ で間違えた問題を、何問あとにもう一度出すか（settings.json の practice.retry_after_questions。段階6-22）。
function retryAfterQuestions(settings) {
  const n = settings && settings.practice ? Number(settings.practice.retry_after_questions) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : 3;
}

export function render(ctx, root, params) {
  const found = ctx.unitById.get(params.unitId);
  if (!found) {
    clear(root).appendChild(el('section', { class: 'panel' }, [
      el('p', { class: 'note', text: 'そのレッスンは見つかりませんでした。' }),
    ]));
    return;
  }
  const { unit, block, category } = found;
  const categoryHref = '#/category/' + encodeURIComponent(category.name);
  const questions = unit.question_ids.map((id) => ctx.questionById.get(id)).filter(Boolean);
  // 「既出」：そのカードが、自分が完了したほかのレッスンに出ているか（段階6-22。データの seen_before は使わない）
  const cards = (unit.cards || []).map((x) => ({
    card: ctx.cardById.get(x.id),
    seenBefore: isSeenBefore(ctx.state, ctx.cardLessons, x.id, unit.id),
  })).filter((x) => x.card);
  const reduced = prefersReducedMotion();
  const retryAfter = retryAfterCards(ctx.settings);
  const seq = ctx.unitSequence;
  const place = seq.findIndex((x) => x.unit.id === unit.id);
  const nextUnit = place >= 0 && place + 1 < seq.length ? seq[place + 1].unit : null;

  let tab = 1;                // いまのタブ（1〜4）
  let answeredInRun = 0;      // ③・④ でいま答えた数
  let timer = null;           // めくる形の時計（タブを移ったら止める）

  // ---------------------------------------------------------------- 枠

  // タブと見出しを描き、中身を入れる場所（host）を返す。
  let host = null;

  function frame() {
    stopTimer();
    const node = clear(root);
    node.appendChild(heading(unit.name, backToCategory(category)));
    node.appendChild(el('div', { class: 'tabs', role: 'tablist' }, TABS.map((label, i) => el('button', {
      class: 'tab' + (i + 1 === tab ? ' is-now' : ''),
      type: 'button',
      role: 'tab',
      'aria-selected': i + 1 === tab ? 'true' : 'false',
      onClick: () => askTab(i + 1),
    }, label))));
    host = el('div', { class: 'host' });
    node.appendChild(host);
    return host;
  }

  function stopTimer() {
    if (timer) window.clearTimeout(timer);
    timer = null;
  }

  // タブを押したとき。③・④ で1問以上答えていれば、画面の中に重ねて確かめる。
  function askTab(next) {
    // いまのタブを押したときは何もしない。① だけは、見ているカードから1枚目に戻る（段階6-22i）
    if (next === tab && next !== 1) return;
    if ((tab === 3 || tab === 4) && answeredInRun > 0) {
      showDialog({
        message: LEAVE_TAB_MESSAGE,
        yesLabel: '移動する',
        noLabel: '続ける',
        onYes: () => goTab(next),
      });
      return;
    }
    goTab(next);
  }

  function goTab(next) {
    tab = next;
    answeredInRun = 0;
    if (tab === 1) {
      cardIndex = 0; // ① のタブを押したら、いつも1枚目から（段階6-22i）
      showMemorize();
    } else if (tab === 2) startCheck();
    else if (tab === 3) startPractice();
    else startFinish();
    window.scrollTo(0, 0);
  }

  // 次のレッスンへ（次が無ければ分野へ戻る）のボタン。
  function nextLessonLink(className) {
    return nextUnit
      ? el('a', { class: className, href: '#/unit/' + nextUnit.id }, '次のレッスンへ')
      : el('a', { class: className, href: categoryHref }, category.name + 'へ戻る');
  }

  // ---------------------------------------------------------------- ① 覚える

  let cardIndex = 0;

  function showMemorize() {
    ctx.setGuard(false);
    const at = frame();
    const item = cards[cardIndex];
    if (!item) {
      at.appendChild(el('section', { class: 'panel' }, [
        el('p', { class: 'note', text: 'このレッスンのカードはありません。' }),
        el('div', { class: 'qactions' }, [
          button('③ 演習（ヒントあり）へ', () => goTab(3), 'btn btn-main'),
        ]),
      ]));
      return;
    }
    // 進捗の棒は、いま見ているカードまでを埋める（最後のカードでいっぱい。段階6-22g）
    at.appendChild(progress(cardIndex + 1, cards.length, cardIndex + 1));
    at.appendChild(el('section', { class: 'panel' }, [
      cardFaces(item.card, { seenBefore: item.seenBefore, note: true }),
    ]));
    // 「前へ」「次へ」（最後のカードは「前へ」「② 確かめるへ」）は、③ ④ と同じ下に固定した帯に入れる（段階6-22i）。
    // 1枚目に戻るときは、上のタブの「① 覚える」を押す（「もう一度見る」は置かない）。
    // 「前へ」「次へ」で移ったら、画面のいちばん上から出す（③ ④ と同じ。段階6-22j）
    const last = cardIndex + 1 >= cards.length;
    const prev = el('button', {
      class: 'btn btn-quiet', type: 'button', disabled: cardIndex === 0,
      onClick: () => { cardIndex -= 1; showMemorize(); window.scrollTo(0, 0); },
    }, '前へ');
    const bar = stickyBar([
      prev,
      last
        ? button('② 確かめるへ', () => goTab(2), 'btn btn-main')
        : button('次へ', () => { cardIndex += 1; showMemorize(); window.scrollTo(0, 0); }, 'btn btn-main'),
    ]);
    bar.firstChild.classList.add('sticky-row');
    at.appendChild(bar);
    // カードが短くても帯が画面の下に来るよう、中身の場所を画面の下まで伸ばす（帯は中身の最後に置くので、
    // カードが長いときは、スクロールすればカードの最後まで読め、帯に隠れたままにならない）。
    // ページの下の余白（.main の padding-bottom。帯の下の負の余白で打ち消している分）を引き、短いカードではスクロールしないようにする
    at.classList.add('memo-host');
    const main = at.closest('.main');
    const padBottom = main ? parseFloat(window.getComputedStyle(main).paddingBottom) || 0 : 0;
    const top = at.getBoundingClientRect().top + window.scrollY;
    at.style.minHeight = 'calc(100dvh - ' + Math.round(top + padBottom) + 'px)';
  }

  // ---------------------------------------------------------------- ② 確かめる

  let queue = [];        // これから出すカード（先頭がいまのカード）
  let cleared = 0;       // 正解して終えたカードの数
  let finishedCheck = false;
  let checkState = null; // いまのカードの状態 { flip, options, picked, flipped, showButtons }

  function startCheck() {
    queue = shuffled(cards);
    cleared = 0;
    finishedCheck = false;
    prepareCard();
    showCheck();
  }

  // いまのカードの選択肢を用意する。選択肢が無いカードは、めくる形で出す。
  function prepareCard() {
    const item = queue[0];
    checkState = item ? prepareCheck(item.card) : null;
  }

  function showCheck(scrollJudge) {
    ctx.setGuard(false);
    const at = frame();
    const item = queue[0];

    // 全部正解したら、大きく「クリア！」。
    if (finishedCheck || !item) {
      at.appendChild(banner('クリア！'));
      at.appendChild(el('div', { class: 'qactions' }, [
        button('③ 演習（ヒントあり）へ', () => goTab(3), 'btn btn-ok'),
        button('もう一度確かめる', startCheck, 'btn btn-quiet'),
      ]));
      return;
    }

    // 進捗の棒（終えた数は、正解して終えたカードの数。段階6-21）
    at.appendChild(progress(cleared, cards.length, Math.min(cleared + 1, cards.length)));
    // カード1枚の画面は js/screens/checkcard.js（苦手なカードの練習と共通）
    renderCheckCard(at, item, checkState, {
      reduced,
      gl: ctx.glossary, // 答えたあとのカードの用語をリンクにする（段階6-22）
      scrollJudge,
      onAnswer: () => {
        // 既出のカード（前のレッスンで出たカード）を間違えたら、苦手なカードの印を付ける（段階6-21）
        ctx.markWeakCards(cardsForCheckCard(item.card.id, item.seenBefore, isMissed(checkState)));
        showCheck(true);
      },
      onNext: nextCheckCard,
      onRedraw: () => showCheck(),
      setTimer: (fn, ms) => {
        timer = window.setTimeout(() => { timer = null; fn(); }, ms);
      },
    });
  }

  // 次のカードへ。間違えた（めくる形では「まだ」の）カードは、何枚かあとにもう一度出す
  // （残りがその数より少なければ、最後に出す）。全部正解するまで続ける。
  function nextCheckCard() {
    stopTimer();
    const item = queue[0];
    const missedNow = isMissed(checkState);
    // めくる形で「まだ」を押した既出のカードにも、苦手なカードの印を付ける（選択式は答えたときに付けた）
    if (checkState.flip) ctx.markWeakCards(cardsForCheckCard(item.card.id, item.seenBefore, missedNow));
    queue = queue.slice(1);
    if (missedNow) {
      const at = Math.min(retryAfter, queue.length);
      queue = queue.slice(0, at).concat([item], queue.slice(at));
    } else {
      cleared += 1;
    }
    if (!queue.length) finishedCheck = true;
    prepareCard();
    showCheck();
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- ③ 演習（ヒントあり）
  // ② と同じ動き（段階6-22）：間違えたら揺らし、答えたあとの画面（正誤・選択肢の色分け・カード・理由）を出して
  // 「次へ」で進む。間違えた問題は settings.json の practice.retry_after_questions 問あとにもう一度出し、
  // 正解するまでくり返す。苦手なカードの印は付けない（苦手な問題も数えない）。

  function startPractice() {
    ctx.setGuard(true);
    const at = frame();
    if (!questions.length) {
      at.appendChild(el('section', { class: 'panel' }, [
        el('p', { class: 'note', text: 'このレッスンの問題はありません。' }),
      ]));
      return;
    }
    runQuestions({
      root: at,
      ctx,
      questions,
      shuffleChoices: true,      // 選択肢の並びは ④ と同じく入れ替える（問題の順番はそのまま。段階6-22g）
      highlightMode: 'always',   // 問題文に、いつも色を付ける
      feedback: 'each',
      showCards: true,
      retryAfter: retryAfterQuestions(ctx.settings),
      onAnswered: () => { answeredInRun += 1; },
      // 最後の問題に正解したら、下に固定したボタンを「④ 演習（ヒントなし）へ」にし、
      // その下に控えめな「もう一度解く」（③を最初から）
      lastActions: () => [
        { label: '④ 演習（ヒントなし）へ', onClick: () => goTab(4) },
        { label: 'もう一度解く', onClick: () => goTab(3), quiet: true },
      ],
      onFinish: () => goTab(4),
    });
  }

  // ---------------------------------------------------------------- ④ 演習（ヒントなし）

  function startFinish() {
    ctx.setGuard(true);
    const at = frame();
    if (!questions.length) {
      at.appendChild(el('section', { class: 'panel' }, [
        el('p', { class: 'note', text: 'このレッスンの問題はありません。' }),
      ]));
      return;
    }
    runFinish(at, questions, null, showFinishResult);
  }

  // ④ の問題を並べ替えて解く。最後の問題のボタンは「結果を見る」。
  // onAnswered：1問ごとの記録（1回目は無し。「間違えた◯問をもう一度」では苦手な問題の出入りを記録する）
  function runFinish(at, list, onAnswered, onDone) {
    runQuestions({
      root: at,
      ctx,
      questions: shuffled(list),
      shuffleChoices: true,
      highlightMode: 'after',    // 答える前は色なし、答えたあとに問題文に色を付ける（段階6-21）
      feedback: 'each',
      showCards: true,
      markCards: MARK_ALL,
      lastLabel: '結果を見る',
      onAnswered: (answer) => {
        answeredInRun += 1;
        if (onAnswered) onAnswered(answer);
      },
      onFinish: onDone,
    });
  }

  // ④ の結果。全問正解なら「クリア！」（レッスンの完了）。
  // 間違いがあれば、正解の数と大きい「間違えた◯問をもう一度」、控えめに「次のレッスンへ」
  // （このレッスンは完了にならない。次のレッスンが無ければ「（分野）へ戻る」）。
  function showFinishResult(answers) {
    const wrong = answers.filter((a) => !a.correct).map((a) => a.question);
    if (!wrong.length) {
      finish();
      return;
    }
    ctx.setGuard(false);
    answeredInRun = 0;
    const at = frame();
    at.appendChild(el('section', { class: 'panel result' }, [
      el('p', {
        class: 'result-score',
        text: (answers.length - wrong.length) + ' / ' + answers.length + ' 問正解',
      }),
      el('div', { class: 'qactions qactions-stack' }, [
        button('間違えた' + wrong.length + '問をもう一度', () => startRetry(wrong), 'btn btn-main'),
        nextLessonLink('btn btn-quiet'),
      ]),
    ]));
  }

  // 間違えた問題だけを、並びを入れ替えて解き直す（間違えたら苦手な問題に入れ、正解では何も変えない）。
  function startRetry(wrongQuestions) {
    ctx.setGuard(true);
    const at = frame();
    runFinish(at, wrongQuestions, (answer) => ctx.recordRetry(answer.id, answer.correct), showFinishResult);
  }

  // ---------------------------------------------------------------- 完了

  function finish() {
    ctx.completeUnit(unit.id);
    ctx.setGuard(false);
    answeredInRun = 0;
    const at = frame();
    at.appendChild(banner('クリア！'));
    const items = [];
    if (isBlockTestDue(block, ctx.state)) {
      items.push(el('a', {
        class: 'btn btn-main', href: '#/block-test/' + block.id,
      }, '章末テストを受ける'));
    }
    if (nextUnit) {
      items.push(el('a', { class: 'btn btn-main', href: '#/unit/' + nextUnit.id }, '次のレッスンへ'));
    }
    items.push(el('a', { class: 'btn btn-quiet', href: categoryHref }, category.name + 'へ戻る'));
    // ④ を最初から（レッスンは完了のまま）
    items.push(button('もう一度解く', () => goTab(4), 'btn btn-quiet'));
    at.appendChild(el('div', { class: 'qactions qactions-stack' }, items));
  }

  // ---------------------------------------------------------------- 入口

  const start = Number(params.tab);
  goTab(start >= 1 && start <= 4 ? start : 1);
}
