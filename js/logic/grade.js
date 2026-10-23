// 正誤の判定と採点。画面から切り離した関数。

// 正解の選択肢のラベル（元データのラベル）を、元の並びで返す。
export function correctLabels(question) {
  return question.choices.filter((c) => c.correct).map((c) => c.label);
}

// 選んだラベルの集まりが正解かどうか。
// 選んだ数が select_count と一致し、選んだものがすべて正解の選択肢であるときだけ true。
export function isCorrect(question, selectedLabels) {
  const picked = new Set(selectedLabels);
  if (picked.size !== question.select_count) return false;
  const right = new Set(correctLabels(question));
  if (picked.size !== right.size) return false;
  for (const label of picked) {
    if (!right.has(label)) return false;
  }
  return true;
}

// 解答の記録から、点数と間違えた問題のIDを出す。
// answers: [{ id, correct }] の配列。
export function scoreAnswers(answers) {
  const wrongIds = answers.filter((a) => !a.correct).map((a) => a.id);
  return {
    total: answers.length,
    correct: answers.length - wrongIds.length,
    wrongIds,
  };
}

// 問題数と合格の割合から、合格ライン（切り上げ）を出す。
export function passScoreFor(questionCount, passRate) {
  return Math.ceil(questionCount * passRate);
}

// 合格かどうか。
export function isPassed(correctCount, passScore) {
  return correctCount >= passScore;
}
