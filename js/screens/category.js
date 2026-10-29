// 分野の画面。章はたたんだ形で並べ、押すと開いてレッスンと章末テストの1行が出る（段階6-22c で回の行をなくした）。
// 下に分野テストの1行（★ と合格した回数。段階6-22）。
import { el, clear, heading, icon, doneMark, todoMark, testMark, BACK_HOME } from '../ui.js?v=c7a45f5a91';
import {
  blockStats, isUnitDone, categoryTestPassCount, blockTestPassCount,
} from '../logic/progress.js?v=c7a45f5a91';

// テストの行（オレンジの地と文字、線で描いた鉛筆の絵、★ と合格の通算回数）。
// left を渡すと、合格していないときに ★ の代わりに「あと◯問」を出す（章末テスト。段階6-22c）。
function testRow(href, name, passCount, left = null) {
  let meta = passCount > 0 ? '★' + passCount : '';
  if (passCount <= 0 && left !== null) meta = 'あと' + left + '問';
  return el('a', { class: 'lrow lrow-test', href }, [
    testMark(),
    el('span', { class: 'lrow-name', text: name }),
    el('span', { class: 'lrow-pass', text: meta }),
  ]);
}

export function render(ctx, root, params) {
  const category = ctx.categoryByName.get(params.categoryName);
  if (!category) {
    clear(root).appendChild(el('section', { class: 'panel' }, [
      el('p', { class: 'note', text: 'その分野は見つかりませんでした。' }),
    ]));
    return;
  }

  const open = new Set(); // 開いている章

  function draw() {
    const node = clear(root);
    const state = ctx.state;
    node.appendChild(heading(category.name, BACK_HOME));

    const blocks = category.blocks.map((block) => {
      const bs = blockStats(block, state);
      const isOpen = open.has(block.id);
      const head = el('button', {
        class: 'lrow block-head', type: 'button', 'aria-expanded': isOpen ? 'true' : 'false',
        onClick: () => {
          if (isOpen) open.delete(block.id);
          else open.add(block.id);
          draw();
        },
      }, [
        icon(isOpen ? 'chevronDown' : 'chevronRight', { size: 18, class: 'block-arrow' }),
        el('span', { class: 'lrow-name', text: block.name }),
        // 章の全レッスンが完了したら、数を緑の文字にする
        el('span', {
          class: 'lrow-meta' + (bs.unitTotal > 0 && bs.unitDone === bs.unitTotal ? ' is-done' : ''),
          text: bs.unitDone + ' / ' + bs.unitTotal,
        }),
      ]);
      if (!isOpen) return el('section', { class: 'panel block' }, [head]);

      // レッスンの行の左に丸（まだ＝白抜き、完了＝緑の塗りつぶしの丸と白いチェック）
      const unitRows = block.units.map((unit) => el('a', {
        class: 'lrow lrow-unit', href: '#/unit/' + unit.id,
      }, [
        isUnitDone(state, unit.id) ? doneMark(26, '完了') : todoMark(26, 'まだ'),
        el('span', { class: 'lrow-name', text: unit.name }),
      ]));
      // 章末テストは1行（合格していなければ「あと◯問」、合格していれば合格の回数。段階6-22c）
      const testRows = [testRow('#/block-test/' + block.id, '章末テスト',
        blockTestPassCount(state, block.id), ctx.blockTestLeft(block.id).length)];
      return el('section', { class: 'panel block is-open' }, [
        head,
        el('div', { class: 'block-body' }, [...unitRows, ...testRows]),
      ]);
    });
    node.appendChild(el('div', { class: 'blocks' }, blocks));

    node.appendChild(el('section', { class: 'panel list' }, [testRow(
      '#/category-test/' + encodeURIComponent(category.name),
      '分野テスト',
      categoryTestPassCount(state, category.name),
    )]));
  }

  draw();
}
