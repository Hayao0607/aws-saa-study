// テストの結果の画面と、間違えた問題の見直し（段階6-21 第5-6節）。
// まず結果（呼ぶ側が作る正解の数・ボタンなど）と、間違えた問題の一覧を出す。
// 一覧の各行は、番号・問題文の頭（40字）・「選んだ答え D ／ 正解 A」（記号は画面に出した並びの記号。段階6-22）。
// 行を押すと、その問題の見直し（1問ずつの画面）を開く。見直しの画面では「一覧」「前へ」「次へ」を下の帯に固定し、
// 「前へ」「次へ」を押したら、その問題の頭（上の帯のすぐ下）から出す。結果のボタンは一覧の画面にだけ出す。
// opts.toResult（章末テスト・分野テスト・模擬試験。段階6-22c・6-22e）：帯の「一覧」を「結果へ」にし、最後の問題では
// 「前へ」「結果へ」の2つにする。「結果へ」を押すと結果の画面のいちばん上（ボタンのある所）に戻る。
import {
  el, clear, button, textBlock, cardsBox, scrollToJudge, answeredChoices, questionTerms,
} from '../ui.js?v=d5cfdb6c3a';
import { toDisplayLabels } from '../logic/labels.js?v=d5cfdb6c3a';

const HEAD_LENGTH = 40;

function head(text) {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > HEAD_LENGTH ? line.slice(0, HEAD_LENGTH) + '…' : line;
}

// 「選んだ答え D ／ 正解 A」（画面に出した並びの記号）。
function answerLine(a) {
  const picked = toDisplayLabels(a.choices, a.labels).join('・') || '－';
  const right = toDisplayLabels(a.choices, a.choices.filter((c) => c.correct).map((c) => c.label)).join('・');
  return '選んだ答え ' + picked + ' ／ 正解 ' + right;
}

// host：描く先。summary()：一覧の画面の上に出す結果（要素の配列）。
// wrongAnswers：[{ id, question, labels, choices, correct }]（間違えたものだけ）
export function resultView(ctx, host, summary, wrongAnswers, opts = {}) {
  let mode = 'list';
  let at = 0;

  function listNodes() {
    const nodes = [...summary()];
    if (!wrongAnswers.length) return nodes;
    nodes.push(el('p', { class: 'cardpart-title', text: '間違えた問題' }));
    nodes.push(el('section', { class: 'panel review' }, [
      el('div', { class: 'rows' }, wrongAnswers.map((a, i) => el('button', {
        class: 'row review-row', type: 'button',
        onClick: () => { at = i; mode = 'page'; draw(true); },
      }, [
        el('span', { class: 'row-name', text: (i + 1) + '. ' + head(a.question.text) }),
        el('span', { class: 'review-answer', text: answerLine(a) }),
      ]))),
    ]));
    return nodes;
  }

  function pageNode() {
    const a = wrongAnswers[at];
    const q = a.question;
    const gl = ctx.glossary; // 見直しは答えたあとの解説の画面なので、用語をリンクにする（段階6-22）
    return el('section', { class: 'panel review review-page' }, [
      el('p', { class: 'review-pos', text: (at + 1) + ' / ' + wrongAnswers.length }),
      // 問題の面（選択肢と見分ける地）
      el('div', { class: 'qface' }, [textBlock(q.text, q.highlights, 'qtext', gl, questionTerms(gl, q.id).text)]),
      el('p', { class: 'judge judge-ng', text: '✕ 不正解' }),
      answeredChoices(q, a.choices, a.labels, gl),
      cardsBox(ctx, q, a.choices, { links: true, picked: a.labels }),
    ]);
  }

  // 下に固定する帯（段階6-22e）。opts.toResult（3つのテスト）のとき：
  //   最後以外の問題：「結果へ」（控えめ）・「前へ」・「次へ」。最後の問題：「前へ」・「結果へ」（目立つボタン）
  //   「結果へ」は押すと結果の画面のいちばん上に戻る。最初の問題では「前へ」を押せない
  // それ以外のとき：「一覧」「前へ」「次へ」（最後の問題では「次へ」を押せない）
  function pageBar() {
    const last = at + 1 >= wrongAnswers.length;
    const toList = () => { mode = 'list'; draw(false); };
    const prev = el('button', {
      class: 'btn btn-quiet', type: 'button', disabled: at === 0,
      onClick: () => { at -= 1; draw(true); },
    }, '前へ');
    const next = el('button', {
      class: 'btn btn-main', type: 'button', disabled: last,
      onClick: () => { at += 1; draw(true); },
    }, '次へ');
    let buttons;
    if (opts.toResult) {
      buttons = last
        ? [prev, button('結果へ', toList, 'btn btn-main')]
        : [button('結果へ', toList, 'btn btn-quiet'), prev, next];
    } else {
      buttons = [button('一覧', toList, 'btn btn-quiet'), prev, next];
    }
    return el('div', { class: 'sticky-bar' }, [el('div', { class: 'sticky-inner sticky-row' }, buttons)]);
  }

  function draw(toPageTop) {
    const node = clear(host);
    if (mode === 'page' && wrongAnswers[at]) {
      const page = pageNode();
      node.appendChild(page);
      node.appendChild(pageBar());
      // 問題の頭（上の帯のすぐ下）から出す
      if (toPageTop) scrollToJudge(page);
      return;
    }
    for (const part of listNodes()) node.appendChild(part);
    window.scrollTo(0, 0);
  }

  draw(false);
}
