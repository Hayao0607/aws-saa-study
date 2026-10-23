// 今日やることの行の中身（ホームの一覧が使う。段階6-21。終わりの画面の「次へ」は段階6-22e で消した）。
// 行ごとに、行の頭の小さな言葉・名前・残りの問題数・行き先・済かどうかを返す。データに無いものは出さない。
import { isUnitDone } from '../logic/progress.js?v=d5cfdb6c3a';
import { testKey } from '../logic/plan.js?v=d5cfdb6c3a';

// 1行の中身：{ key, kind, name, left, leftText, href, done, test }
// 章末テストは「章末テスト　（章名）　あと◯問」（「合格まで」の数。はじめて受ける前は章の問題数）、
// 分野テストは「分野テスト　（分野名）」（段階6-22c）
//   left：数（復習の山の残り・章末テストの「合格まで」。済の行・ほかの行は null）、leftText：その数の出し方
function entry(ctx, item) {
  const state = ctx.state;
  if (item.type === 'reviews') {
    const left = ctx.reviewPoolIds().length;
    const done = item.done || left === 0;
    return {
      key: 'reviews', kind: '復習', name: '', left: done ? null : left, leftText: '残り' + left + '問', href: '#/review', done, test: false,
    };
  }
  if (item.type === 'unit') {
    const found = ctx.unitById.get(item.id);
    if (!found) return null;
    const done = item.done || isUnitDone(state, item.id);
    return { key: 'unit:' + item.id, kind: 'レッスン', name: found.unit.name, left: null, href: '#/unit/' + item.id, done, test: false };
  }
  if (item.type === 'block') {
    // 1回分（15問）を解き終えたら済（合格していなければ、次の学ぶ日にまた出る。段階6-22c）
    const found = ctx.blockById.get(item.id);
    if (!found) return null;
    const done = !!item.done;
    const left = ctx.blockTestLeft(item.id).length;
    return {
      key: testKey('block', item.id), kind: '章末テスト', name: found.block.name,
      left: done ? null : left, leftText: 'あと' + left + '問',
      href: '#/block-test/' + item.id, done, test: true,
    };
  }
  if (item.type === 'cat') {
    const category = ctx.categoryByName.get(item.id);
    if (!category) return null;
    const done = !!item.done;
    // 1回受け終えたら済（合格でも不合格でも。段階6-22c）
    return {
      key: testKey('cat', item.id), kind: '分野テスト', name: category.name, left: null,
      href: '#/category-test/' + encodeURIComponent(item.id), done, test: true,
    };
  }
  return { key: 'mock', kind: '模擬試験', name: '', left: null, href: '#/mock', done: !!item.done, test: true };
}

// 今日やることの行（一覧の順）。予定が無い・休みの日などは空。
export function todayEntries(ctx) {
  const today = ctx.state.today;
  if (!ctx.state.plan || !today || today.status !== 'active' || !Array.isArray(today.items)) return [];
  return today.items.map((item) => entry(ctx, item)).filter(Boolean);
}
