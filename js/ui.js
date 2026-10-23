// 画面を組み立てる小さな部品。見た目の決まりは css/style.css にある。
import { displayLabel } from './logic/labels.js?v=d5cfdb6c3a';

export { displayLabel };

// 要素を作る。props は属性、children は文字列・要素・配列。
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'onClick') node.addEventListener('click', value);
    else if (key === 'disabled') node.disabled = !!value;
    else node.setAttribute(key, value);
  }
  appendAll(node, children);
  return node;
}

export function appendAll(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// 端末が「動きを減らす」設定になっているか。
export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

// ------------------------------------------------------------ 線で描いた絵（絵文字は使わない）

const SVG_NS = 'http://www.w3.org/2000/svg';

// 線の絵の形（24×24 の中に描く）。
const ICON_PATHS = {
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  cross: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  circleCheck: ['circle', 'M8 12.5l2.8 2.8L16 10'],
  circleCross: ['circle', 'M9 9l6 6', 'M15 9l-6 6'],
  chevronRight: ['M9.5 6l6 6-6 6'],
  chevronDown: ['M6 9.5l6 6 6-6'],
  pencil: ['M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z', 'M13.5 6.5l4 4'],
  chevronLeft: ['M14.5 6l-6 6 6 6'],
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13', 'M15.5 15.5L20 20'],
};

// 線の絵。label を渡せば読み上げの名前を付け、無ければ飾りとして隠す。
export function icon(name, opts = {}) {
  const size = String(opts.size || 20);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(opts.stroke || 2.2));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'icon' + (opts.class ? ' ' + opts.class : ''));
  if (opts.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const d of ICON_PATHS[name] || []) {
    if (d === 'circle') {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', '12');
      c.setAttribute('cy', '12');
      c.setAttribute('r', '9');
      svg.appendChild(c);
    } else {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
  }
  return svg;
}

// 済み・完了の印：緑の塗りつぶしの丸と白いチェック。
export function doneMark(size = 24, label = '済み') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon mark-done');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', '12');
  c.setAttribute('cy', '12');
  c.setAttribute('r', '12');
  c.setAttribute('class', 'mark-done-bg');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M7 12.5l3.2 3.2L17 9');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', '#FFFFFF');
  p.setAttribute('stroke-width', '2.4');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(c);
  svg.appendChild(p);
  return svg;
}

// まだの印：白抜きの丸。
export function todoMark(size = 24, label = 'まだ') {
  return el('span', {
    class: 'mark-todo', role: 'img', 'aria-label': label,
    style: 'width: ' + size + 'px; height: ' + size + 'px;',
  });
}

// テストの行の印：線で描いた鉛筆。
export function testMark() {
  return icon('pencil', { size: 22, stroke: 1.8, class: 'mark-test' });
}

// 答えたあと、正誤の行（「○ 正解／✕ 不正解」）が上の帯のすぐ下に来るよう、画面を動かす。
export function scrollToJudge(node) {
  if (!node) return;
  const bar = document.querySelector('.appbar');
  const offset = bar ? bar.getBoundingClientRect().height : 0;
  const y = node.getBoundingClientRect().top + window.scrollY - offset - 8;
  window.scrollTo(0, Math.max(0, y));
}

// ------------------------------------------------------------ 文と色

// 色の位置（highlights）のところに色を付けた中身を作る。
// highlights を空にすれば、色なしになる。
export function highlightedText(text, highlights) {
  const frag = document.createDocumentFragment();
  const list = (highlights || []).slice().sort((a, b) => a.start - b.start);
  let pos = 0;
  for (const h of list) {
    const start = Math.max(pos, h.start);
    const end = Math.min(text.length, h.end);
    if (end <= start) continue;
    if (start > pos) frag.appendChild(document.createTextNode(text.slice(pos, start)));
    frag.appendChild(el('mark', { class: 'hl', text: text.slice(start, end) }));
    pos = end;
  }
  if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
  return frag;
}

// 改行をそのまま出す文の箱。gl と terms を渡せば、用語をリンクにする（答えたあとの解説の画面だけ。段階6-22）。
export function textBlock(text, highlights, className = 'qtext', gl = null, terms = null) {
  const node = el('div', { class: className });
  node.appendChild(richText(text, highlights, gl, terms));
  return node;
}

// ------------------------------------------------------------ 用語のリンク（段階6-22）

// 用語の当たり（glossary.json の question_terms・card_terms の1つの文の分）から、リンクにするものを選ぶ。
// 同じ用語は、1つの文につき最初の1か所だけ。重なる当たりは、前のものを残す。
export function firstTerms(terms) {
  const out = [];
  const used = new Set();
  let end = 0;
  for (const t of (terms || []).slice().sort((a, b) => a.start - b.start)) {
    if (used.has(t.term_id) || t.start < end) continue;
    used.add(t.term_id);
    out.push(t);
    end = t.end;
  }
  return out;
}

// 色（highlights）と用語のリンク（terms）を付けた中身。gl（ctx.glossary）が無ければ、リンクは付けない。
// 色とリンクは重なってよい（リンクの中に色を付ける）。
export function richText(text, highlights, gl = null, terms = null) {
  const list = gl ? firstTerms(terms).filter((t) => gl.termById.has(t.term_id)) : [];
  if (!list.length) return highlightedText(text, highlights);
  const frag = document.createDocumentFragment();
  const part = (start, end) => highlightedText(text.slice(start, end), (highlights || [])
    .map((h) => ({ start: h.start - start, end: h.end - start })));
  let pos = 0;
  for (const t of list) {
    if (t.start > pos) frag.appendChild(part(pos, t.start));
    const link = el('span', {
      class: 'term', role: 'button', tabindex: '0', 'data-term': t.term_id,
      'aria-label': text.slice(t.start, t.end) + '（用語の説明）',
    }, [part(t.start, t.end)]);
    const open = (e) => { e.preventDefault(); e.stopPropagation(); showTermSheet(gl, t.term_id); };
    link.addEventListener('click', open);
    link.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
    frag.appendChild(link);
    pos = t.end;
  }
  if (pos < text.length) frag.appendChild(part(pos, text.length));
  return frag;
}

// 画面の下から出す用語の説明（見出し・説明・関係する用語）。外を押すか「閉じる」で消える。
// 関係する用語を押すと、その用語の説明に変わる。
let sheetKey = null;
export function showTermSheet(gl, termId) {
  const term = gl && gl.termById.get(termId);
  if (!term) return;
  let node = document.getElementById('sheet');
  if (!node) {
    node = el('div', { id: 'sheet', class: 'sheet-layer' });
    document.body.appendChild(node);
  }
  const first = node.hidden !== false || !node.firstChild;
  const related = (term.related || []).map((id) => gl.termById.get(id)).filter(Boolean);
  const box = el('div', {
    class: 'sheet' + (first && !prefersReducedMotion() ? ' is-motion' : ''),
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title',
  }, [
    el('div', { class: 'sheet-head' }, [
      el('h3', { class: 'sheet-title', id: 'sheet-title', text: term.headword }),
      button('閉じる', hideTermSheet, 'btn btn-quiet sheet-close'),
    ]),
    term.aliases && term.aliases.length
      ? el('p', { class: 'term-aliases', text: term.aliases.join('・') }) : null,
    el('p', { class: 'term-desc', text: term.description }),
    related.length ? el('div', { class: 'term-related' }, [
      el('p', { class: 'term-related-title', text: '関係する用語' }),
      el('div', { class: 'term-chips' }, related.map((r) => button(r.headword,
        () => showTermSheet(gl, r.term_id), 'term-chip'))),
    ]) : null,
  ]);
  const backdrop = el('div', { class: 'sheet-backdrop', onClick: hideTermSheet });
  clear(node).appendChild(backdrop);
  node.appendChild(box);
  node.hidden = false;
  if (!sheetKey) {
    sheetKey = (e) => { if (e.key === 'Escape') hideTermSheet(); };
    document.addEventListener('keydown', sheetKey);
  }
  const close = box.querySelector('.sheet-close');
  if (close) close.focus();
}

export function hideTermSheet() {
  const node = document.getElementById('sheet');
  if (node) {
    node.hidden = true;
    clear(node);
  }
  if (sheetKey) {
    document.removeEventListener('keydown', sheetKey);
    sheetKey = null;
  }
}

// 問題文・選択肢の用語の当たり（glossary.json の question_terms）。
export function questionTerms(gl, questionId) {
  return (gl && gl.questionTerms[questionId]) || { text: [], choices: {} };
}

export function button(label, onClick, className = 'btn') {
  return el('button', { class: className, type: 'button', onClick }, label);
}

// ページの名前。back（{ label, href }）を渡せば、名前の上に戻るリンク（「‹ ホーム」など。段階6-22）。
// 見出し（段階6-22f：はじめの画面では「苦手なカード　27枚」のように、全角の空白で区切って数を付ける。呼ぶ側で文字を作る）。
export function heading(text, back) {
  const title = el('h2', { class: 'head-title', text });
  if (!back) return title;
  const frag = document.createDocumentFragment();
  frag.appendChild(el('a', { class: 'backlink', href: back.href }, [
    icon('chevronLeft', { size: 16, stroke: 2.2 }), back.label,
  ]));
  frag.appendChild(title);
  return frag;
}

// 戻るリンクの行き先（段階6-22）。
export const BACK_HOME = { label: 'ホーム', href: '#/' };
export function backToCategory(category) {
  return { label: category.name, href: '#/category/' + encodeURIComponent(category.name) };
}

// 「クリア！」「合格！」を大きく出す。軽く弾む動きを付ける
// （「動きを減らす」設定のときは動かさない）。
export function banner(word, kind = 'clear') {
  const classes = ['banner-word'];
  if (kind === 'pass') classes.push('is-test');
  if (!prefersReducedMotion()) classes.push('is-motion');
  return el('div', { class: 'banner' }, [
    el('span', { class: classes.join(' '), text: word }),
  ]);
}

// 問題・カードの上の進捗の棒（段階6-21）。細い棒（解いた分を青く伸ばす）と、右端に小さく「1 / 15」。
// done：終えた数、total：全体、now：数字に出す番号（いまの「1 / 15」と同じ）。
export function progress(done, total, now) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return el('div', { class: 'qprogress' }, [
    el('div', {
      class: 'qbar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total),
      'aria-valuenow': String(done),
    }, [el('div', { class: 'qbar-fill', style: 'width: ' + pct + '%' })]),
    el('span', { class: 'qprogress-num', text: now + ' / ' + total }),
  ]);
}

// 解く数のボタン（段階6-21・6-22。復習・苦手な問題・苦手なカード）。
// 「残り ◯問」（unit で「枚」）と「5問」「10問」「15問」「20問」「30問」「全部」（2段×3つ）。
// opts.lead を渡すと、「残り ◯問」の行の代わりに、その文（何をするか）をボタンの上に出す（はじめの画面。段階6-22f）。
// 残りの数以上のボタンは出さない（「全部」はいつも出す）。onPick(数)。全部なら残りの数を渡す。
export const COUNT_CHOICES = [5, 10, 15, 20, 30];
export function countChooser(left, onPick, opts = {}) {
  const unit = opts.unit || '問';
  const buttons = COUNT_CHOICES.filter((n) => n < left)
    .map((n) => button(n + unit, () => onPick(n), 'btn ' + (opts.quiet ? 'btn-quiet' : 'btn-main')));
  buttons.push(button('全部', () => onPick(left), 'btn ' + (opts.quiet ? 'btn-quiet' : 'btn-main')));
  return el('div', { class: 'chooser' }, [
    opts.lead
      ? el('p', { class: 'chooser-lead', text: opts.lead })
      : el('p', { class: 'chooser-left', text: (opts.label || '残り') + ' ' + left + unit }),
    el('div', { class: 'chooser-buttons' }, buttons),
  ]);
}

// 画面の下に固定して出すボタンの帯（スクロールしても押せる）。
export function stickyBar(children) {
  return el('div', { class: 'sticky-bar' }, [el('div', { class: 'sticky-inner' }, children)]);
}

// ------------------------------------------------------------ 確認のウィンドウと、済んだ知らせ

// 確認は、画面の中に重ねて出すウィンドウ（alert・confirm は使わない）。
// アプリ全体の確認は、すべてこの形で出す。
// opts: message, yesLabel, onYes, noLabel, onNo, danger（はいのボタンを赤くするか）
export function showDialog(opts) {
  const node = document.getElementById('dialog');
  if (!node) return;
  const close = () => {
    node.hidden = true;
    clear(node);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); if (opts.onNo) opts.onNo(); }
  };
  const yes = button(opts.yesLabel, () => { close(); opts.onYes(); },
    'btn ' + (opts.danger ? 'btn-danger' : 'btn-main'));
  const no = button(opts.noLabel || 'やめる', () => { close(); if (opts.onNo) opts.onNo(); }, 'btn btn-quiet');
  clear(node).appendChild(el('div', {
    class: 'dialog-box', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-msg',
  }, [
    el('p', { class: 'dialog-msg', id: 'dialog-msg', text: opts.message }),
    el('div', { class: 'dialog-btns' }, [no, yes]),
  ]));
  node.hidden = false;
  document.addEventListener('keydown', onKey);
  yes.focus();
}

// 出している確認のウィンドウを閉じる（押さずに画面が変わったとき）。
export function hideDialog() {
  const node = document.getElementById('dialog');
  if (!node) return;
  node.hidden = true;
  clear(node);
}

let toastTimer = null;

// 済んだ知らせ（「保存しました。」など）。画面の下に小さく出し、数秒で消す。
export function toast(message) {
  let node = document.getElementById('toast');
  if (!node) {
    node = el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add('is-on');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { node.classList.remove('is-on'); }, 2600);
}

// 入力の誤りは、直す欄のすぐ下に赤い文字で出す（枠なし）。
export function fieldError(text, id) {
  return text ? el('p', { class: 'field-error', id, text }) : null;
}

// ------------------------------------------------------------ カード

// 補足（back_note）。答えの下に小さく薄く出す。無ければ出さない。
export function backNote(card) {
  return card && card.back_note ? el('p', { class: 'card-note', text: card.back_note }) : null;
}

// カード1枚（上「問い」・下「答え」）。問いには色を付けない（どの画面でも。段階6-22）。
// opts.seenBefore で「既出」の印。opts.note が true なら、答えの下に補足を出す。
// opts.gl（ctx.glossary）を渡せば、問い・答えの用語をリンクにする（答えたあとの解説の画面だけ）。
export function cardFaces(card, opts = {}) {
  const terms = (opts.gl && opts.gl.cardTerms[card.id]) || { front: [], back: [] };
  return el('div', { class: 'card' }, [
    el('div', { class: 'card-side card-q' }, [
      el('div', { class: 'card-head' }, [
        el('span', { class: 'card-label', text: '問い' }),
        opts.seenBefore ? el('span', { class: 'badge-seen', text: '既出' }) : null,
      ]),
      textBlock(card.front, [], 'card-front', opts.gl, terms.front),
    ]),
    el('div', { class: 'card-side card-a' }, [
      el('div', { class: 'card-head' }, [el('span', { class: 'card-label', text: '答え' })]),
      textBlock(card.back, [], 'card-back', opts.gl, terms.back),
      opts.note ? backNote(card) : null,
    ]),
  ]);
}

// ------------------------------------------------------------ 答えたあとの選択肢（段階6-22）

// 正解の選択肢の中の、決め手の語句（links で role が correct の choice_phrase）の位置。
function choicePhraseMarks(question, label, text) {
  const out = [];
  for (const link of question.links || []) {
    if (link.role !== 'correct' || link.choice_label !== label || !link.choice_phrase) continue;
    const at = text.indexOf(link.choice_phrase);
    if (at >= 0) out.push({ start: at, end: at + link.choice_phrase.length });
  }
  return out;
}

// 答えたあとの選択肢の並び（押せない形）。
//   選んで当たった正解：緑の地・緑の線・✓　　選ばなかった正解：白・緑の線・✓
//   選んだ間違い：赤の地・赤の線・✕　　　　　選ばなかった間違い：白・印なし
// 正解の選択肢の決め手の語句に、問題文と同じ黄色を付ける。gl を渡せば、用語をリンクにする。
export function answeredChoices(question, choices, pickedLabels, gl = null) {
  const picked = new Set(pickedLabels || []);
  const terms = questionTerms(gl, question.id).choices || {};
  return el('div', { class: 'choices' }, choices.map((choice, i) => {
    const classes = ['choice', 'is-static'];
    let mark = null;
    if (choice.correct) {
      classes.push(picked.has(choice.label) ? 'is-correct' : 'is-correct-miss');
      mark = icon('check', {
        size: 20, label: picked.has(choice.label) ? '選んだ正解' : '正解の選択肢', class: 'choice-mark',
      });
    } else if (picked.has(choice.label)) {
      classes.push('is-wrong');
      mark = icon('cross', { size: 20, label: '選んだ間違いの選択肢', class: 'choice-mark' });
    }
    const marks = choice.correct ? choicePhraseMarks(question, choice.label, choice.text) : [];
    const body = el('span', { class: 'choice-text' });
    body.appendChild(richText(choice.text, marks, gl, terms[choice.label]));
    return el('div', { class: classes.join(' ') }, [
      el('span', { class: 'choice-label', text: displayLabel(i) }), body, mark,
    ]);
  }));
}

// ------------------------------------------------------------ この問題を解くカード

// 「問題文｜カード」の2列の表。rows は組（question_phrase・card_phrase）の配列。
function phraseTable(rows, questionHead) {
  return el('table', { class: 'pairs' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', { scope: 'col', text: questionHead }),
      el('th', { scope: 'col', text: 'カード' }),
    ])]),
    el('tbody', {}, rows.map((pair) => el('tr', {}, [
      el('td', { text: pair.question_phrase.text }),
      el('td', { text: pair.card_phrase.text }),
    ]))),
  ]);
}

// 「該当箇所」：組（問題文の語句 ⇔ カードの言葉）を1行ずつ、2列の表で出す。組が無ければ出さない。
function pairsTable(link) {
  const pairs = link.pairs || [];
  if (!pairs.length) return null;
  return el('div', { class: 'cardpart' }, [
    el('p', { class: 'cardpart-title', text: '該当箇所' }),
    phraseTable(pairs, '問題文'),
  ]);
}

// ほかの選択肢が違う理由のカードの、問題文とカードの違う点（contrast_pairs）の表。
// 無いときは出さない。
function contrastTable(link) {
  const pairs = link.contrast_pairs || [];
  if (!pairs.length) return null;
  return el('div', { class: 'cardpart' }, [phraseTable(pairs, '問題文（違う点）')]);
}

// 「カード」：問い → 答え → 補足（小さく薄く）。
function cardPart(card, gl) {
  return el('div', { class: 'cardpart' }, [
    el('p', { class: 'cardpart-title', text: 'カード' }),
    cardFaces(card, { note: true, gl }),
  ]);
}

// 「✓ C を選べる」「✕ A は不正解」の行と、その下に理由（解説の reason）。理由が空なら行だけ。
function verdictLine(ok, shown, reason) {
  return el('div', { class: 'verdict ' + (ok ? 'is-ok' : 'is-ng') }, [
    el('p', { class: 'verdict-label' }, [
      icon(ok ? 'check' : 'cross', { size: 18, stroke: 2.6 }),
      ok ? shown + ' を選べる' : shown + ' は不正解',
    ]),
    reason && reason.trim() ? el('p', { class: 'verdict-reason', text: reason }) : null,
  ]);
}

// 「この問題を解くカード」の箱（答えたあとの画面。段階6-22）。記号は画面に出している並びの記号。
// - 小見出し「C が正解の理由」（2つ以上選ぶ問題は「B・D が正解の理由」）
// - 正解を選ぶカード（role が correct）と補うカード（role が無い）を、1枚ずつ白い枠で囲む
//   （枠の中は、カード → 該当箇所の表）。枠のあとに、正解ごとに「✓ C を選べる」と正解の理由
// - 小見出し「ほかの選択肢が違う理由」の下に、間違いの選択肢すべて。並びは、選んだ間違いの選択肢（画面の並びの順）を先に、
//   そのほかの間違いの選択肢（画面の並びの順）をあとに（段階6-22f。opts.picked：選んだ選択肢の元の記号）。
//   落とすカード（role が eliminate）がある選択肢は、白い枠の中にカード → 違う点の表 → 「✕ A は不正解」と違う理由。
//   落とすカードが無い選択肢は、枠なしで「✕ A は不正解」と違う理由だけ
// opts.links が true なら、カードの用語をリンクにする。
export function cardsBox(ctx, question, displayChoices, opts = {}) {
  const gl = opts.links ? ctx.glossary : null;
  const linkByCard = new Map((question.links || []).map((x) => [x.card_id, x]));
  const items = (question.card_ids || [])
    .map((id) => ({ card: ctx.cardById.get(id), link: linkByCard.get(id) }))
    .filter((x) => x.card && x.link);
  const solve = items.filter((x) => x.link.role !== 'eliminate');
  const ex = question.explanation || { correct: [], wrong: [] };
  const reasonOf = new Map([...(ex.correct || []), ...(ex.wrong || [])].map((x) => [x.label, x.reason]));
  const shown = displayChoices.map((c, i) => ({ choice: c, shown: displayLabel(i) }));
  const rights = shown.filter((x) => x.choice.correct);
  const picked = new Set(opts.picked || []);
  const wrongs = [
    ...shown.filter((x) => !x.choice.correct && picked.has(x.choice.label)),
    ...shown.filter((x) => !x.choice.correct && !picked.has(x.choice.label)),
  ];

  const others = wrongs.map((w) => {
    const cards = items.filter((x) => x.link.role === 'eliminate' && x.link.choice_label === w.choice.label);
    const line = verdictLine(false, w.shown, reasonOf.get(w.choice.label));
    if (!cards.length) return el('div', { class: 'verdict-only' }, [line]);
    return el('div', { class: 'cardgroup' }, [
      ...cards.flatMap((x) => [cardPart(x.card, gl), contrastTable(x.link)]),
      line,
    ]);
  });

  return el('section', { class: 'cardsbox' }, [
    el('h3', { class: 'cardsbox-title', text: 'この問題を解くカード' }),
    el('h4', { class: 'cardsbox-subtitle', text: rights.map((x) => x.shown).join('・') + ' が正解の理由' }),
    ...solve.map((x) => el('div', { class: 'cardgroup' }, [cardPart(x.card, gl), pairsTable(x.link)])),
    ...rights.map((x) => verdictLine(true, x.shown, reasonOf.get(x.choice.label))),
    wrongs.length ? el('div', { class: 'cardsbox-others' }, [
      el('h4', { class: 'cardsbox-subtitle', text: 'ほかの選択肢が違う理由' }),
      ...others,
    ]) : null,
  ]);
}
