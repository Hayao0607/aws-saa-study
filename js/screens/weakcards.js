// 苦手なカードの画面。はじめの画面で数（5枚・10枚・15枚・20枚・30枚・全部）を選び（段階6-22）、
// 苦手なカードの中からランダムに、分野をまぜて、1枚ずつ ② 確かめると同じ
// 選択式で出す（カード1枚の画面は js/screens/checkcard.js）。
// 1回の練習では、各カードを1回ずつ出す（間違えたカードを同じ練習の中でもう一度は出さない）。
// 答えるたびに記録する（途中でやめても、答えたカードの分は残る）。
// 続けて正解した回数が settings.json の weak_cards.correct_in_a_row_to_remove に届くと外れる。
import {
  el, clear, heading, banner, progress, prefersReducedMotion, countChooser, BACK_HOME,
} from '../ui.js?v=dc64bc235b';
import { prepareCheck, renderCheckCard, isMissed } from './checkcard.js?v=dc64bc235b';
import { shuffled } from '../logic/shuffle.js?v=dc64bc235b';
import { weakCardRule } from '../logic/weakcards.js?v=dc64bc235b';

export function render(ctx, root) {
  const reduced = prefersReducedMotion();
  let timer = null;     // めくる形の時計（描き直すときに止める）
  let list = [];        // この練習で出すカード（並べ替えたもの）
  let index = 0;
  let correctCount = 0;
  let st = null;        // いまのカードの状態（js/screens/checkcard.js の prepareCheck）
  let recorded = false; // いまのカードの答えを記録したか

  function stopTimer() {
    if (timer) window.clearTimeout(timer);
    timer = null;
  }

  // title：見出し（はじめの画面だけ「苦手なカード　27枚」。段階6-22f）
  function frame(title = '苦手なカード') {
    stopTimer();
    const node = clear(root);
    node.appendChild(heading(title, BACK_HOME));
    const host = el('div', { class: 'host' });
    node.appendChild(host);
    return host;
  }

  function currentCards() {
    return ctx.weakCardIds().map((id) => ctx.cardById.get(id)).filter(Boolean);
  }

  function showStart() {
    ctx.setGuard(false);
    const found = currentCards();
    const host = frame(found.length ? '苦手なカード　' + found.length + '枚' : '苦手なカード');
    if (!found.length) {
      host.appendChild(el('section', { class: 'panel' }, [
        el('p', { class: 'note', text: '苦手なカードはありません。' }),
      ]));
      return;
    }
    host.appendChild(el('section', { class: 'panel' }, [
      // 数は見出しに出し、枠の中は「何をするか」の1文と数を選ぶボタン（段階6-22f）
      countChooser(found.length, start, { label: '苦手なカード', unit: '枚', lead: '練習する枚数を選んでください。' + removeText() + '、苦手から外れます。' }),
    ]));
  }

  // 「2回続けて正解すると」（settings.json の weak_cards.correct_in_a_row_to_remove）。1なら「正解すると」
  function removeText() {
    const n = weakCardRule(ctx.settings).correctInARowToRemove;
    return n > 1 ? n + '回続けて正解すると' : '正解すると';
  }

  // そのときの苦手なカードから、選んだ数をランダムに。
  function start(count) {
    const found = currentCards();
    if (!found.length) {
      showStart();
      return;
    }
    list = shuffled(found).slice(0, count).map((card) => ({ card, seenBefore: false }));
    index = 0;
    correctCount = 0;
    prepare();
    show();
    window.scrollTo(0, 0);
  }

  function prepare() {
    st = prepareCheck(list[index].card);
    recorded = false;
  }

  // 答えを1回だけ記録する（選択式は選んだとき、めくる形は「覚えた／まだ」を押したとき）。
  function record() {
    if (recorded) return;
    recorded = true;
    const ok = !isMissed(st);
    if (ok) correctCount += 1;
    ctx.recordWeakCardPractice(list[index].card.id, ok);
  }

  function show(scrollJudge) {
    const host = frame();
    host.appendChild(progress(index + (recorded ? 1 : 0), list.length, index + 1)); // 進捗の棒（段階6-21）
    renderCheckCard(host, list[index], st, {
      reduced,
      gl: ctx.glossary, // 答えたあとのカードの用語をリンクにする（段階6-22）
      scrollJudge,
      onAnswer: () => { record(); show(true); },
      onNext: next,
      onRedraw: () => show(),
      setTimer: (fn, ms) => {
        timer = window.setTimeout(() => { timer = null; fn(); }, ms);
      },
    });
  }

  function next() {
    record();
    index += 1;
    if (index >= list.length) {
      showDone();
    } else {
      prepare();
      show();
    }
    window.scrollTo(0, 0);
  }

  // 最後に「◯ / ◯ 枚正解」と、数を選んでもう一度。全部正解なら「クリア！」。
  function showDone() {
    const host = frame();
    if (correctCount === list.length) host.appendChild(banner('クリア！'));
    const left = currentCards().length;
    host.appendChild(el('section', { class: 'panel' }, [
      el('p', { class: 'result-score', text: correctCount + ' / ' + list.length + ' 枚正解' }),
      left ? null : el('p', { class: 'note', text: '苦手なカードはなくなりました' }),
    ]));
    if (left) {
      host.appendChild(el('section', { class: 'panel' }, [
        countChooser(left, start, { label: '苦手なカード', unit: '枚', quiet: true }),
      ]));
    }
  }

  showStart();
}
