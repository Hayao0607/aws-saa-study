// カード1枚を選択式で確かめる画面の部品。② 確かめる（js/screens/unit.js）と
// 苦手なカードの練習（js/screens/weakcards.js）が共通に使う。
// 表を見せ、check_choices と正しい答え（back）を並べ替えて出す。答えたら、正解でも間違いでも
// 選択肢の上に「○ 正解／✕ 不正解」、正しい答えに ✓・選んだ間違いに ✕、選択肢の下にカード
// （問い・答え・補足）を出して止まり、下に固定した「次へ」で進む。
// 選択肢の無いカード（check_choices が空）だけ、めくる形（押すと答え。「覚えた／まだ」）で出す。
// 問いの面は①のカードの「問い」と同じ地、選択肢は白（段階6-17）。間違えたら、③・④と同じく揺らす
// （「動きを減らす」設定のときは揺らさない）。
import {
  el, button, cardFaces, textBlock, backNote, icon, stickyBar, scrollToJudge,
} from '../ui.js?v=10294e4f56';
import { shuffled } from '../logic/shuffle.js?v=10294e4f56';

const FLIP_MS = 320;

// 1枚ぶんの状態を用意する。
export function prepareCheck(card) {
  const wrong = card.check_choices || [];
  return {
    flip: wrong.length === 0,
    options: shuffled([{ text: card.back, correct: true }]
      .concat(wrong.map((text) => ({ text, correct: false })))),
    picked: null,       // 選んだ選択肢の番号（めくる形で「まだ」を押したら -1）
    flipped: false,
    showButtons: false,
  };
}

// 答えが間違い（めくる形では「まだ」）だったか。
export function isMissed(st) {
  return st.flip ? st.picked === -1 : !st.options[st.picked].correct;
}

// 1枚を描く。
// item: { card, seenBefore }
// h: {
//   reduced      「動きを減らす」設定か
//   gl           ctx.glossary（答えたあとのカードの用語をリンクにする。段階6-22）
//   scrollJudge  答えた直後か（正誤の行が上の帯のすぐ下に来るよう、画面を動かす）
//   onAnswer()   選択肢を選んだ（st.picked は入れてある。呼ぶ側で描き直す）
//   onNext()     「次へ」（めくる形では「覚えた」「まだ」。st.picked は入れてある）
//   onRedraw()   描き直す（めくったあと）
//   setTimer(fn, ms)  めくる動きを待つ時計（画面を移ったら呼ぶ側で止める）
// }
export function renderCheckCard(at, item, st, h) {
  if (st.flip) {
    renderFlip(at, item, st, h);
    return;
  }
  const answered = st.picked !== null;
  const ok = answered && st.options[st.picked].correct;
  // 間違えた直後だけ揺らす（③・④と同じ揺れ。「次へ」までの描き直しでは揺らさない）
  const shake = answered && !ok && h.scrollJudge && !h.reduced;
  const body = el('div', { class: 'check-body' + (shake ? ' shake' : '') });
  at.appendChild(body);
  if (shake) body.addEventListener('animationend', () => body.classList.remove('shake'), { once: true });

  body.appendChild(el('section', { class: 'panel panel-q check-q' }, [
    el('div', { class: 'card-head' }, [
      el('span', { class: 'card-label', text: '問い' }),
      item.seenBefore ? el('span', { class: 'badge-seen', text: '既出' }) : null,
    ]),
    textBlock(item.card.front, [], 'card-front'), // カードの問いには色を付けない（段階6-22）
  ]));

  // 正誤の行（答えたあと）。選択肢の上に出し、上の帯のすぐ下に来るよう画面を動かす。
  let judgeNode = null;
  if (answered) {
    judgeNode = el('p', {
      class: 'judge ' + (ok ? 'judge-ok' : 'judge-ng'),
      text: ok ? '○ 正解' : '✕ 不正解',
    });
    body.appendChild(judgeNode);
  }

  body.appendChild(el('div', { class: 'choices check-choices' }, st.options.map((opt, i) => {
    const classes = ['choice', 'check-choice'];
    let mark = null;
    if (answered) {
      if (opt.correct) {
        // 正しい答えに ✓（正解でも間違いでも）
        classes.push('is-correct');
        if (ok && !h.reduced) classes.push('is-pop');
        mark = icon('check', { size: 20, label: '正しい答え', class: 'choice-mark' });
      } else if (i === st.picked) {
        classes.push('is-wrong');
        mark = icon('cross', { size: 20, label: '選んだ間違いの答え', class: 'choice-mark' });
      }
    }
    return el('button', {
      class: classes.join(' '),
      type: 'button',
      disabled: answered,
      onClick: () => {
        if (st.picked !== null) return;
        st.picked = i;
        h.onAnswer();
      },
    }, [
      el('span', { class: 'choice-text', text: opt.text }),
      mark,
    ]);
  })));

  if (answered) {
    // 答えたら、正解でも間違いでも、カード（問い・答え・補足）を ① と同じ形で出して止まる
    body.appendChild(el('section', { class: 'panel check-card' }, [
      cardFaces(item.card, { seenBefore: item.seenBefore, note: true, gl: h.gl || null }),
    ]));
    body.appendChild(stickyBar([button('次へ', h.onNext, 'btn btn-main btn-wide')]));
    if (h.scrollJudge) scrollToJudge(judgeNode);
  }
}

// 選択肢が無いカードだけ、めくる形（表を見せ、押すと答え。自分で「覚えた／まだ」を押す）。
function renderFlip(at, item, st, h) {
  const flipped = st.flipped;
  const front = el('div', { class: 'flip-face flip-front' + (flipped ? ' is-away' : '') }, [
    el('div', { class: 'card-head' }, [
      el('span', { class: 'card-label', text: '問い' }),
      item.seenBefore ? el('span', { class: 'badge-seen', text: '既出' }) : null,
    ]),
    textBlock(item.card.front, [], 'card-front'),
    el('p', { class: 'flip-hint', text: 'タップして答えを見る' }),
  ]);
  const back = el('div', { class: 'flip-face flip-back' + (flipped ? '' : ' is-away') }, [
    el('div', { class: 'card-head' }, [el('span', { class: 'card-label', text: '答え' })]),
    el('div', { class: 'card-back', text: item.card.back }),
    backNote(item.card),
  ]);
  const flip = el('div', {
    class: 'flip' + (flipped ? ' is-back' : '') + (h.reduced ? ' no-motion' : ''),
  }, [el('div', { class: 'flip-inner' }, [front, back])]);

  const tap = el('button', { class: 'cardtap', type: 'button' }, [flip]);
  tap.addEventListener('click', () => {
    if (st.flipped) return;
    st.flipped = true;
    flip.classList.add('is-back');
    if (h.reduced) {
      st.showButtons = true;
      h.onRedraw();
    } else {
      h.setTimer(() => {
        st.showButtons = true;
        h.onRedraw();
      }, FLIP_MS);
    }
  });

  const panel = el('section', { class: 'panel' }, [tap]);
  if (st.showButtons) {
    panel.appendChild(el('div', { class: 'qactions qactions-row' }, [
      button('まだ', () => { st.picked = -1; h.onNext(); }, 'btn btn-quiet'),
      button('覚えた', () => { h.onNext(); }, 'btn btn-main'),
    ]));
  }
  at.appendChild(panel);
}
