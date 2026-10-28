// 苦手なカードの判定。画面から切り離した関数。
// 演習やテストで問題を間違えたとき、その問題のカードに印を付ける。
// 印が付いたカードは苦手なカードに入り、苦手なカードの練習で続けて正解すると外れる。
// 記録（records）は storage.js が持つ { カードID: { wrong, streak } } の形：
//   wrong  外れてから付いた印の数（外れたら記録ごと消す）
//   streak 苦手なカードの練習で、続けて正解した回数
import { isCorrect } from './grade.js?v=10294e4f56';

// 印を付けるかの決め方（runQuestions の markCards に渡す）。
//   'all'   答えるたびに数える（④・テスト・復習・苦手な問題・間違えた問題をもう一度）
//   それ以外は数えない（③ 演習（ヒントあり）は数えない。段階6-22。
//   ② 確かめるは、既出のカードだけ cardsForCheckCard で数える。段階6-21）
export const MARK_ALL = 'all';

// settings.json の weak_cards から、使う2つの値を取り出す。
export function weakCardRule(settings) {
  const w = (settings && settings.weak_cards) || {};
  const add = Number(w.wrong_times_to_add);
  const remove = Number(w.correct_in_a_row_to_remove);
  return {
    wrongTimesToAdd: Number.isFinite(add) && add >= 1 ? Math.floor(add) : 1,
    correctInARowToRemove: Number.isFinite(remove) && remove >= 1 ? Math.floor(remove) : 2,
  };
}

// 問題を間違えたときに印を付けるカードのID（組の順）。
// - role が correct のカードと、role が無いカード（補うカード）はすべて
// - role が eliminate のカードは、選んだ間違いの選択肢と結ばれているものだけ
// labels は選んだ選択肢の元の記号。正解なら空を返す。
export function cardsToMark(question, labels) {
  if (isCorrect(question, labels || [])) return [];
  const correct = new Set((question.choices || []).filter((c) => c.correct).map((c) => c.label));
  const pickedWrong = new Set((labels || []).filter((x) => !correct.has(x)));
  const out = [];
  for (const link of question.links || []) {
    if (link.role === 'eliminate') {
      if (pickedWrong.has(link.choice_label)) out.push(link.card_id);
    } else {
      out.push(link.card_id);
    }
  }
  return [...new Set(out)];
}

// 答えの並び（runQuestions の answers。{ id, question, labels, correct }）の i 番目の答えで、
// 印を付けるカードのID。正解・数えない決め方なら空。
export function cardsForAnswer(answers, i, mode) {
  const a = answers[i];
  if (!a || a.correct) return [];
  if (mode !== MARK_ALL) return [];
  return cardsToMark(a.question, a.labels);
}

// 答えの並びすべてで、印を付けるカードのID（重ねない）。
export function cardsForAnswers(answers, mode) {
  const out = [];
  for (let i = 0; i < answers.length; i += 1) out.push(...cardsForAnswer(answers, i, mode));
  return [...new Set(out)];
}

// ② 確かめるで1枚答えたときに、印を付けるカードのID（段階6-21）。
// そのレッスンで「既出」の印が付くカード（自分が完了したほかのレッスンに出ているカード。段階6-22。
// js/logic/progress.js の isSeenBefore）を間違えた（めくる形では「まだ」）ときだけ。
// そのレッスンで初めて出るカードの間違いは数えない。
export function cardsForCheckCard(cardId, seenBefore, missed) {
  return seenBefore && missed ? [cardId] : [];
}

// 1枚の記録が、苦手なカードに入っているか。
export function isWeakCardRecord(record, rule) {
  return !!record && (Number(record.wrong) || 0) >= rule.wrongTimesToAdd;
}

// 印を付けた新しい記録を返す（元の記録は変えない）。
// 印の数を1増やし、続けて正解した回数を0に戻す（すでに入っているカードも同じ）。
export function markCards(records, cardIds) {
  const out = { ...(records || {}) };
  for (const id of new Set(cardIds || [])) {
    const base = out[id] || { wrong: 0, streak: 0 };
    out[id] = { wrong: (Number(base.wrong) || 0) + 1, streak: 0 };
  }
  return out;
}

// 苦手なカードの練習で1枚答えた新しい記録を返す（元の記録は変えない）。
// 正解なら続けて正解した回数を1増やし、決めた回数に届いたら外す（記録ごと消す）。
// 間違いなら続けて正解した回数を0に戻す。苦手なカードでなければ、何も変えない。
export function applyPractice(records, cardId, correct, rule) {
  const out = { ...(records || {}) };
  const base = out[cardId];
  if (!isWeakCardRecord(base, rule)) return out;
  if (!correct) {
    out[cardId] = { wrong: Number(base.wrong) || 0, streak: 0 };
    return out;
  }
  const streak = (Number(base.streak) || 0) + 1;
  if (streak >= rule.correctInARowToRemove) delete out[cardId];
  else out[cardId] = { wrong: Number(base.wrong) || 0, streak };
  return out;
}

// 苦手なカードのIDを、渡した並び順のまま返す。
export function weakCardIds(state, cardIds, settings) {
  const rule = weakCardRule(settings);
  const records = (state && state.cards) || {};
  return (cardIds || []).filter((id) => isWeakCardRecord(records[id], rule));
}
