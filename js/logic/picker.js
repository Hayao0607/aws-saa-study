// 模擬試験と分野テストの問題の選び方。画面から切り離した関数。
import { shuffled } from './shuffle.js?v=c7a45f5a91';

// テストでの各問題の記録（marks）から、優先の順に3つの組に分ける。
// marks: { 問題ID: 1（前回正解） | 0（前回不正解） }。入っていなければ、まだ出ていない。
// 返す形: { wrong, unseen, rest }
export function groupByPriority(questionIds, marks) {
  const wrong = [];
  const unseen = [];
  const rest = [];
  for (const id of questionIds) {
    if (!Object.prototype.hasOwnProperty.call(marks, id)) {
      unseen.push(id);
    } else if (marks[id] === 0) {
      wrong.push(id);
    } else {
      rest.push(id);
    }
  }
  return { wrong, unseen, rest };
}

// 優先の順（前回間違えた → まだ出ていない → 残り）に、同じ優先の中はランダムに選ぶ。
// 選んだあとの出す順も入れ替えて返す。
export function pickFinalQuestions(questionIds, marks, count, rng = Math.random) {
  const picked = pickInPriorityOrder(questionIds, marks, count, rng);
  return shuffled(picked, rng);
}

// 優先の順を保ったまま選ぶ（確かめ用に、並びを入れ替えないものも出しておく）。
export function pickInPriorityOrder(questionIds, marks, count, rng = Math.random) {
  const groups = groupByPriority(questionIds, marks);
  const ordered = [
    ...shuffled(groups.wrong, rng),
    ...shuffled(groups.unseen, rng),
    ...shuffled(groups.rest, rng),
  ];
  return ordered.slice(0, count);
}

// 分野テストの問題の選び方（段階6-22・6-22c）。上から順に、count 問になるまで選ぶ（同じ組の中はランダム）：
//   1. その分野の苦手な問題（weak：問題ID の集まり）
//   2. 前に答えたとき（復習・テスト）に間違えたことがある問題（records[id].wrong が1以上）
//   3. まだ分野テストに出ていない問題（seen：{ 問題ID: 1 } に無いもの）
//   4. 残りの問題
// exclude：その日にその分野のテストで出した問題（段階6-22c）。まず exclude に無い問題から上の順で選び、
// それで count 問に足りなければ、exclude の問題からも同じ順で選ぶ。
// questionIds：その分野の問題。返す値は優先の順（出す順は呼ぶ側で入れ替える）。
export function pickCategoryTest(questionIds, weak, records, seen, count, rng = Math.random, exclude = null) {
  const ordered = (ids) => {
    const groups = [[], [], [], []];
    for (const id of ids) {
      const r = records && records[id];
      if (weak && weak.has(id)) groups[0].push(id);
      else if (r && (Number(r.wrong) || 0) > 0) groups[1].push(id);
      else if (!(seen && seen[id])) groups[2].push(id);
      else groups[3].push(id);
    }
    return groups.flatMap((g) => shuffled(g, rng));
  };
  const out = new Set(exclude || []);
  const fresh = ordered(questionIds.filter((id) => !out.has(id)));
  const again = fresh.length < count ? ordered(questionIds.filter((id) => out.has(id))) : [];
  return [...fresh, ...again].slice(0, count);
}

// 章末テストの1回の問題の選び方（段階6-22c）。
//   1. 「合格まで」の問題（left。並びのまま）を前から count 問まで
//   2. 足りなければ、その章の問題（chapterIds）の中だけから補う：
//      その章の苦手な問題（weak。「合格まで」に無いもの。同じ組の中はランダム）→ その章のほかの問題（ランダム）
//   章の問題が count 問に満たなければ、その数。返す値：{ ids: 出す順に並べ替えた問題, extra: 補った問題の集まり }
export function pickBlockTest(chapterIds, left, weak, count, rng = Math.random) {
  const main = left.slice(0, count);
  const inLeft = new Set(left);
  const pool = chapterIds.filter((id) => !inLeft.has(id));
  const fill = [
    ...shuffled(pool.filter((id) => weak && weak.has(id)), rng),
    ...shuffled(pool.filter((id) => !(weak && weak.has(id))), rng),
  ].slice(0, Math.max(0, count - main.length));
  return { ids: shuffled([...main, ...fill], rng), extra: new Set(fill) };
}
