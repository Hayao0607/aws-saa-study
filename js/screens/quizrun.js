// 一組の問題を順に出す仕組み。レッスンの③④、テスト、復習の山、苦手な問題で共通に使う。
// 問題の上に進捗の棒（解いた分を青く伸ばす。段階6-21）。
// 答えたあとの画面（選択肢の色分け・この問題を解くカード・理由・用語のリンク）は js/ui.js（段階6-22）。
import {
  el, clear, button, textBlock, cardsBox, progress, displayLabel, prefersReducedMotion,
  stickyBar, scrollToJudge, answeredChoices, questionTerms,
} from '../ui.js?v=d5cfdb6c3a';
import { shuffled } from '../logic/shuffle.js?v=d5cfdb6c3a';
import { isCorrect } from '../logic/grade.js?v=d5cfdb6c3a';
import { cardsForAnswer } from '../logic/weakcards.js?v=d5cfdb6c3a';

// opts
//   root            描く先の要素
//   ctx             main.js の ctx
//   questions       問題の配列（出す順。並べ替えは呼ぶ側で決める）
//   shuffleChoices  選択肢の並びを入れ替えるか（retryAfter でもう一度出すときも、出すたびに入れ替え直す）
//   highlightMode   'always'（いつも色を付ける）| 'after'（答えたあとだけ）| 'never'
//   feedback        'each'（1問ごとに正誤を出す）| 'end'（出さずに最後まで進む）
//   showCards       答えたあとに「この問題を解くカード」を見せるか（見せるときは、用語をリンクにする。段階6-22）
//   retryAfter      間違えた問題を、何問あとにもう一度出すか（③ 演習（ヒントあり）。段階6-22）。
//                   残りがその数より少なければ最後。正解するまでくり返す。進捗の棒は、正解して終えた問題の数で数える
//   lastLabel       最後の問題で答えたあとのボタンの字（既定は「終わる」）
//   lastActions     (answers) => [{ label, onClick, quiet }]  最後の問題で正解を見せたあとに、
//                   下に固定するボタンを呼ぶ側で決める（あれば lastLabel と onFinish の代わりに使う）
//   markCards       間違えたときに、苦手なカードの印を付けるか（js/logic/weakcards.js）
//                   'all'（答えるたび）| 無し（付けない）
//   onAnswered      (answer) => void  1問答えるたびに呼ぶ（呼ぶ側が答えた数を知り、1問ごとに記録するため）
//                   answer: { id, question, labels, choices, correct }
//   onFinish        (answers) => void
//                   answers: [{ id, question, labels, choices, correct }]
export function runQuestions(opts) {
  let items = opts.questions.map((q) => ({
    q,
    choices: opts.shuffleChoices ? shuffled(q.choices) : q.choices.slice(),
  }));
  const total = items.length;
  const retryAfter = Number.isInteger(opts.retryAfter) && opts.retryAfter >= 1 ? opts.retryAfter : 0;
  const answers = [];
  let index = 0;
  let cleared = 0;        // 正解して終えた問題の数（retryAfter のとき）
  let selected = [];
  let revealed = false;   // 答えたあと（正解を見せる）
  let shake = false;
  let justAnswered = false; // 答えた直後（正誤の行が上の帯のすぐ下に来るよう、画面を動かす）

  // もう一度出す問題の選択肢。shuffleChoices のときは並びを入れ替え直す（段階6-22g）。
  // 前と同じ並びになったら、1つずらして必ず前と違う並びにする（入れ替え直しをくり返さない）
  function retryChoices(before) {
    if (!opts.shuffleChoices || before.length < 2) return before.slice();
    const next = shuffled(before);
    const same = next.every((c, i) => c.label === before[i].label);
    return same ? next.slice(1).concat(next.slice(0, 1)) : next;
  }

  function pick(label) {
    const q = items[index].q;
    if (q.select_count === 1) {
      selected = [label];
    } else if (selected.includes(label)) {
      selected = selected.filter((x) => x !== label);
    } else if (selected.length < q.select_count) {
      selected = selected.concat([label]);
    }
    render();
  }

  function answer() {
    const item = items[index];
    const q = item.q;
    const ok = isCorrect(q, selected);
    answers.push({
      id: q.id, question: q, labels: selected.slice(), choices: item.choices.slice(), correct: ok,
    });
    if (opts.markCards) opts.ctx.markWeakCards(cardsForAnswer(answers, answers.length - 1, opts.markCards));
    if (opts.onAnswered) opts.onAnswered(answers[answers.length - 1]);
    justAnswered = true;
    if (retryAfter) {
      if (ok) {
        cleared += 1;
      } else {
        // 間違えた問題は、retryAfter 問あとにもう一度（残りが少なければ最後）
        const rest = items.slice(index + 1);
        const at = Math.min(retryAfter, rest.length);
        items = items.slice(0, index + 1).concat(rest.slice(0, at), [{ q, choices: retryChoices(item.choices) }], rest.slice(at));
      }
    }
    if (opts.feedback === 'each') {
      revealed = true;
      if (!ok) shake = !prefersReducedMotion();
      render();
      return;
    }
    advance();
  }

  function advance() {
    index += 1;
    selected = [];
    revealed = false;
    shake = false;
    if (index >= items.length) {
      opts.onFinish(answers);
      window.scrollTo(0, 0);
      return;
    }
    render();
    // 次の問題に移ったら、画面を一番上に戻す
    window.scrollTo(0, 0);
  }

  // 答える前の選択肢（押せる形）。
  function choiceButton(choice, i) {
    const isPicked = selected.includes(choice.label);
    return el('button', {
      class: 'choice' + (isPicked ? ' is-picked' : ''),
      type: 'button',
      'aria-pressed': isPicked ? 'true' : 'false',
      onClick: () => pick(choice.label),
    }, [
      el('span', { class: 'choice-label', text: displayLabel(i) }),
      el('span', { class: 'choice-text', text: choice.text }),
    ]);
  }

  function render() {
    const { q, choices } = items[index];
    const node = clear(opts.root);
    // 棒の伸び方は「終えた数 ÷ 全体」（答えて正解を見せたら、その問題も終えた数に入れる）。
    // retryAfter のときは、正解して終えた問題の数で数える
    if (retryAfter) {
      const justCleared = revealed && answers[answers.length - 1].correct;
      node.appendChild(progress(cleared, total, Math.min(justCleared ? cleared : cleared + 1, total)));
    } else {
      node.appendChild(progress(index + (revealed ? 1 : 0), total, index + 1));
    }

    // 用語のリンクは、答えたあとの解説の画面だけ（段階6-22）
    const gl = revealed && opts.showCards ? opts.ctx.glossary : null;
    const body = el('div', { class: 'quiz' + (shake ? ' shake' : '') });
    const textPanel = el('section', { class: 'panel panel-q' }); // 問題の面（選択肢の白と見分ける地）
    if (q.select_count > 1) {
      textPanel.appendChild(el('p', { class: 'qmeta', text: q.select_count + 'つ選択' }));
    }
    const colored = opts.highlightMode === 'always' || (opts.highlightMode === 'after' && revealed);
    textPanel.appendChild(textBlock(q.text, colored ? q.highlights : [], 'qtext', gl, questionTerms(gl, q.id).text));
    body.appendChild(textPanel);

    // 正誤は、選択肢の上に1回だけ出す。
    let judgeNode = null;
    if (revealed) {
      const ok = answers[answers.length - 1].correct;
      judgeNode = el('p', {
        class: 'judge ' + (ok ? 'judge-ok' : 'judge-ng'),
        text: ok ? '○ 正解' : '✕ 不正解',
      });
      body.appendChild(judgeNode);
      body.appendChild(answeredChoices(q, choices, selected, gl));
    } else {
      body.appendChild(el('div', { class: 'choices' }, choices.map((choice, i) => choiceButton(choice, i))));
    }

    if (revealed) {
      if (opts.showCards) body.appendChild(cardsBox(opts.ctx, q, choices, { links: true, picked: selected }));
      const last = index + 1 >= items.length;
      if (last && opts.lastActions) {
        body.appendChild(stickyBar(opts.lastActions(answers).map((a) => button(
          a.label, a.onClick, 'btn btn-wide ' + (a.quiet ? 'btn-quiet' : 'btn-main'),
        ))));
      } else {
        const label = last ? (opts.lastLabel || '終わる') : (retryAfter ? '次へ' : '次の問題へ');
        body.appendChild(stickyBar([button(label, advance, 'btn btn-main btn-wide')]));
      }
    } else {
      // 「答える」も下に固定する。決めた数を選ぶまでは押せない薄い形で「◯つ選んでください」
      const ready = selected.length === q.select_count;
      body.appendChild(stickyBar([
        el('button', {
          class: 'btn btn-main btn-wide',
          type: 'button',
          disabled: !ready,
          onClick: answer,
        }, ready ? '答える' : (q.select_count + 'つ選んでください')),
      ]));
    }
    node.appendChild(body);
    if (justAnswered) {
      justAnswered = false;
      scrollToJudge(judgeNode);
    }

    if (shake) {
      shake = false;
      body.addEventListener('animationend', () => body.classList.remove('shake'), { once: true });
    }
  }

  render();
}
