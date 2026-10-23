// ホームの画面。一番上に「今日やること」（スケジュールが無ければ「次のレッスン」と
// 「スケジュールを立てる」。予定日が来た復習があれば、その上に「復習　残り◯問」。段階6-22h）、
// その下に分野の一覧と、模擬試験・苦手な問題・苦手なカードの入口を置く。
// 「学習の記録を消す」は上のメニューにある（段階6-9）。
import { el, clear, doneMark, todoMark } from '../ui.js?v=dc64bc235b';
import { categoryStats, categoryTestPassCount, isUnitDone } from '../logic/progress.js?v=dc64bc235b';
import { todayEntries } from './todaylist.js?v=dc64bc235b';

// 次のレッスン（並び順で最初の、完了していないレッスン）の1行。
function nextLessonRow(ctx, label) {
  const next = ctx.unitSequence.find((x) => !isUnitDone(ctx.state, x.unit.id));
  if (!next) return null;
  return el('a', { class: 'trow', href: '#/unit/' + next.unit.id }, [
    todoMark(24, 'まだ'),
    el('span', { class: 'trow-name' }, [
      el('span', { class: 'trow-kind', text: label }),
      next.unit.name,
    ]),
  ]);
}

// 今日の一覧の1行（中身は js/screens/todaylist.js。データに無いもの（消したレッスンなど）は出さない）。
// 行の頭に小さく「復習」「レッスン」「章末テスト」「分野テスト」「模擬試験」。
// 復習の山は「復習　残り◯問」、章末テストは名前のあとに「あと◯問」（段階6-21・6-22c）。
// まだの行は白抜きの丸、終えた行は緑の塗りつぶしの丸と白いチェック・取り消し線・薄い色。
function todayRow(entry) {
  return {
    done: entry.done,
    node: el('a', { class: 'trow' + (entry.done ? ' is-done' : ''), href: entry.href }, [
      entry.done ? doneMark(24, '済み') : todoMark(24, 'まだ'),
      el('span', { class: 'trow-name' }, [
        el('span', { class: 'trow-kind' + (entry.test ? ' is-test' : ''), text: entry.kind }),
        entry.name,
        entry.left !== null ? el('span', { class: 'trow-left', text: entry.leftText }) : null,
      ]),
    ]),
  };
}

// スケジュールが無いとき（予定なし・受験日をすぎた）の復習の行（段階6-22h）。今日やることの復習の行と同じ見た目。
// 今日までに予定日が来た復習が無ければ出さない。
function reviewRow(ctx) {
  const left = ctx.reviewPoolIds().length;
  if (!left) return null;
  return todayRow({
    kind: '復習', name: '', left, leftText: '残り' + left + '問', href: '#/review', done: false, test: false,
  }).node;
}

// 進みの帯（今日やることのうち、済んだ割合）。
function progressBar(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return el('div', {
    class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total),
    'aria-valuenow': String(done), 'aria-label': '今日やること',
  }, [el('div', { class: 'bar-fill', style: 'width: ' + pct + '%' })]);
}

// 一番上の「今日やること」の箱。
function todayBox(ctx) {
  const state = ctx.state;
  const plan = state.plan;
  if (!plan) {
    return el('section', { class: 'panel today' }, [
      el('div', { class: 'trows' }, [reviewRow(ctx), nextLessonRow(ctx, '次のレッスン')]),
      el('div', { class: 'qactions' }, [
        el('a', { class: 'btn btn-quiet', href: '#/plan' }, 'スケジュールを立てる'),
      ]),
    ]);
  }
  const today = state.today || { status: 'active', items: [] };
  if (today.status === 'expired') {
    return el('section', { class: 'panel today' }, [
      el('p', { class: 'today-msg', text: '受験日をすぎました' }),
      el('div', { class: 'trows' }, [reviewRow(ctx), nextLessonRow(ctx, '次のレッスン')]),
      el('div', { class: 'qactions' }, [
        el('a', { class: 'btn btn-quiet', href: '#/plan' }, 'スケジュールを立て直す'),
      ]),
    ]);
  }
  if (today.status === 'off') {
    return el('section', { class: 'panel today' }, [
      el('p', { class: 'today-msg', text: '今日は休み' }),
    ]);
  }
  const rows = todayEntries(ctx).map(todayRow);
  // まだの行を上、終えた行を下に並べる（それぞれの中は、いまの順のまま）
  const todo = rows.filter((r) => !r.done);
  const done = rows.filter((r) => r.done);
  const doneCount = done.length;
  const parts = [
    el('div', { class: 'today-head' }, [
      el('h2', { class: 'today-title', text: '今日やること' }),
      el('span', { class: 'today-count', text: doneCount + ' / ' + rows.length }),
    ]),
    progressBar(doneCount, rows.length),
    el('div', { class: 'trows' }, [
      ...todo.map((r) => r.node),
      todo.length && done.length ? el('div', { class: 'trows-sep', role: 'separator' }) : null,
      ...done.map((r) => r.node),
    ]),
  ];
  if (doneCount === rows.length) {
    parts.push(el('p', { class: 'today-clear', text: '今日の分は完了！' }));
    const next = nextLessonRow(ctx, '次のレッスンへ');
    if (next) parts.push(el('div', { class: 'trows' }, [next]));
  }
  return el('section', { class: 'panel today' }, parts);
}

export function render(ctx, root) {
  // ホームを表示するたびに、日が変わっていれば今日の一覧を作り直す
  ctx.refreshToday(false);
  const node = clear(root);
  const state = ctx.state;

  if (!ctx.storageAvailable) {
    node.appendChild(el('p', {
      class: 'notice notice-warn', text: 'このブラウザでは、学習の記録を保存できません。',
    }));
  }

  node.appendChild(todayBox(ctx));

  // 分野は1行ずつ：名前・完了したレッスンの数／レッスンの数・★ と合格の通算回数
  const rows = ctx.curriculum.map((category) => {
    const s = categoryStats(category, state);
    const passTimes = categoryTestPassCount(state, category.name);
    return el('a', {
      class: 'lrow', href: '#/category/' + encodeURIComponent(category.name),
    }, [
      el('span', { class: 'lrow-name', text: category.name }),
      el('span', { class: 'lrow-meta', text: s.unitDone + ' / ' + s.unitTotal }),
      el('span', { class: 'lrow-pass', text: passTimes > 0 ? '★' + passTimes : '' }),
    ]);
  });
  node.appendChild(el('section', { class: 'panel list' }, rows));

  const weakCount = ctx.weakIds().length;
  const weakCardCount = ctx.weakCardIds().length;
  // 上の段に苦手な問題・苦手なカード、下の段に模擬試験を横いっぱい（テストと同じ薄いオレンジの地とオレンジの文字。段階6-22）
  node.appendChild(el('div', { class: 'tiles' }, [
    el('a', { class: 'tile', href: '#/weak' }, [
      '苦手な問題',
      el('span', { class: 'tile-count', text: String(weakCount) }),
    ]),
    el('a', { class: 'tile', href: '#/weak-cards' }, [
      '苦手なカード',
      el('span', { class: 'tile-count', text: String(weakCardCount) }),
    ]),
    el('a', { class: 'tile tile-wide tile-test', href: '#/mock' }, [
      '模擬試験',
      ctx.state.randomPassCount > 0
        ? el('span', { class: 'tile-pass', text: '★' + ctx.state.randomPassCount })
        : null,
    ]),
  ]));
}
