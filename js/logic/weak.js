// 苦手な問題の判定。画面から切り離した関数。
// 記録（record）は storage.js が持つ1問ぶんの形：
//   { last: 1|0, wrong: 通算の間違い回数, streak: 続けて正解した回数, test?: false }
//   test: false は、テスト（章末テスト・分野テスト・模擬試験）に出ていない問題（模擬試験の選び方で「まだ出ていない」とする）
//
// 数える場面（段階6-21 第5-4節）：
//   ③・④（1回目）                                   数えない
//   「間違えた問題をもう一度」（どの場面でも）         間違えたら入れる（applyRetryAnswer）。正解では何も変えない
//   テストの本番・復習・苦手な問題の練習              間違えたら入れ、正解したら外す（applyAnswer）
// 入れる・外す回数は settings.json の weak_questions（いまは1回・1回）。

// settings.json の weak_questions から、使う2つの値を取り出す。
export function weakRule(settings) {
  const w = (settings && settings.weak_questions) || {};
  const add = Number(w.wrong_times_to_add);
  const remove = Number(w.correct_in_a_row_to_remove);
  return {
    wrongTimesToAdd: Number.isFinite(add) && add >= 1 ? Math.floor(add) : 1,
    correctInARowToRemove: Number.isFinite(remove) && remove >= 1 ? Math.floor(remove) : 1,
  };
}

// 1問ぶんの記録が、苦手な問題の条件に当てはまるか。
// 通算の間違い回数が wrongTimesToAdd 以上で、かつ
// 続けて正解した回数が correctInARowToRemove 未満のとき。
export function isWeakRecord(record, rule) {
  if (!record) return false;
  const wrong = Number(record.wrong) || 0;
  const streak = Number(record.streak) || 0;
  return wrong >= rule.wrongTimesToAdd && streak < rule.correctInARowToRemove;
}

// 苦手な問題のIDを、渡した並び順のまま返す。
export function weakQuestionIds(state, questionIds, settings) {
  const rule = weakRule(settings);
  const records = (state && state.questions) || {};
  return (questionIds || []).filter((id) => isWeakRecord(records[id], rule));
}

// 解答1件を、記録に反映した新しい記録を返す（元の記録は変えない）。
// テストの本番・復習・苦手な問題の練習で使う。
// 間違えたら、通算の間違い回数を1増やし、続けて正解した回数を0に戻す（苦手な問題に入る）。
// 正解したら、続けて正解した回数を1増やす（苦手な問題に入っていれば外れる）。
// fromTest：テストの本番での解答か（false なら、テストに出ていない印 test: false を残す）。
export function applyAnswer(record, correct, fromTest = true) {
  const base = record || { last: null, wrong: 0, streak: 0 };
  const wrong = Number(base.wrong) || 0;
  const streak = Number(base.streak) || 0;
  const out = correct
    ? { last: 1, wrong, streak: streak + 1 }
    : { last: 0, wrong: wrong + 1, streak: 0 };
  const tested = fromTest || (record ? record.test !== false : false);
  if (!tested) out.test = false;
  return out;
}

// 「間違えた問題をもう一度」での解答1件。間違えたら苦手な問題に入れ、正解では何も変えない。
export function applyRetryAnswer(record, correct) {
  if (correct) return record || null;
  return applyAnswer(record, false, false);
}
