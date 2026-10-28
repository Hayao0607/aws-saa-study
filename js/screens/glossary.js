// 用語集の画面（段階6-22）。分野ごとの一覧（分野の並びはホームと同じ）と、上に検索の欄。
// 検索は、見出し・別の呼び方に、入れた文字を含むもの（英字の大文字・小文字は区別しない）。
// 1項目：見出し、別の呼び方（小さく）、説明、関係する用語（押すとその項目へ）。
import { el, clear, heading, icon, BACK_HOME } from '../ui.js?v=10294e4f56';

function norm(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, '');
}

export function render(ctx, root) {
  const gl = ctx.glossary;
  // 分野の並び：ホームと同じ（curriculum の順）。データの分野がそれ以外なら、後ろに
  const order = ctx.curriculum.map((c) => c.name);
  for (const t of gl.terms) if (!order.includes(t.category)) order.push(t.category);
  let query = '';

  const node = clear(root);
  node.appendChild(heading('用語集', BACK_HOME));
  const input = el('input', {
    class: 'field glossary-search', type: 'search', id: 'glossary-q',
    placeholder: '用語をさがす', 'aria-label': '用語をさがす', autocomplete: 'off',
  });
  node.appendChild(el('div', { class: 'glossary-searchbox' }, [
    icon('search', { size: 18, class: 'glossary-search-icon' }), input,
  ]));
  const list = el('div', { class: 'glossary' });
  node.appendChild(list);

  function matches(t) {
    if (!query) return true;
    return [t.headword, ...(t.aliases || [])].some((x) => norm(x).includes(query));
  }

  // 関係する用語へ：絞り込みで隠れていれば検索を空にしてから、その項目まで動かす。
  function goTerm(id) {
    const term = gl.termById.get(id);
    if (!term) return;
    if (!matches(term)) {
      input.value = '';
      query = '';
      draw();
    }
    const target = document.getElementById('term-' + id);
    if (!target) return;
    const bar = document.querySelector('.appbar');
    const offset = bar ? bar.getBoundingClientRect().height : 0;
    window.scrollTo(0, Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset - 8));
    target.classList.remove('is-flash');
    void target.offsetWidth; // 印を付け直す
    target.classList.add('is-flash');
    target.focus({ preventScroll: true });
  }

  function item(t) {
    const related = (t.related || []).map((id) => gl.termById.get(id)).filter(Boolean);
    return el('article', { class: 'gterm', id: 'term-' + t.term_id, tabindex: '-1' }, [
      el('h3', { class: 'gterm-head', text: t.headword }),
      t.aliases && t.aliases.length ? el('p', { class: 'term-aliases', text: t.aliases.join('・') }) : null,
      el('p', { class: 'term-desc', text: t.description }),
      related.length ? el('div', { class: 'term-related' }, [
        el('p', { class: 'term-related-title', text: '関係する用語' }),
        el('div', { class: 'term-chips' }, related.map((r) => el('button', {
          class: 'term-chip', type: 'button', onClick: () => goTerm(r.term_id),
        }, r.headword))),
      ]) : null,
    ]);
  }

  function draw() {
    clear(list);
    let shown = 0;
    for (const name of order) {
      const terms = gl.terms.filter((t) => t.category === name && matches(t))
        .sort((a, b) => a.headword.localeCompare(b.headword, 'ja'));
      if (!terms.length) continue;
      shown += terms.length;
      list.appendChild(el('section', { class: 'panel gcat' }, [
        el('h2', { class: 'gcat-title' }, [name, el('span', { class: 'gcat-count', text: String(terms.length) })]),
        ...terms.map(item),
      ]));
    }
    if (!shown) list.appendChild(el('p', { class: 'note', text: '見つかりませんでした。' }));
  }

  input.addEventListener('input', () => {
    query = norm(input.value);
    draw();
  });
  draw();
}
