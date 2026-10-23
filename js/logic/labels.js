// 選択肢の記号の読み替え。画面から切り離した関数。
// データの選択肢は元の並びの記号（label）を持つ。画面では、出している並びの順に
// A・B・C… と振り直すため、元の記号から画面の記号への読み替えが要る。

// 並びの何番目かを、画面の記号にする（0 → A、1 → B …）。
export function displayLabel(index) {
  return String.fromCharCode(65 + index);
}

// 画面に出している選択肢の並びから、{ 元の記号: 画面の記号 } の対応を作る。
export function labelMap(displayChoices) {
  const map = {};
  (displayChoices || []).forEach((choice, i) => {
    if (choice && typeof choice.label === 'string') map[choice.label] = displayLabel(i);
  });
  return map;
}

// 元の記号を、画面に出している並びの記号に読み替える。
// 並びの中に無ければ null を返す。
export function toDisplayLabel(displayChoices, originalLabel) {
  const i = (displayChoices || []).findIndex((c) => c && c.label === originalLabel);
  return i < 0 ? null : displayLabel(i);
}

// 元の記号の配列を、画面の記号の配列にして並べ替える（見つからないものは落とす）。
export function toDisplayLabels(displayChoices, originalLabels) {
  return (originalLabels || [])
    .map((label) => toDisplayLabel(displayChoices, label))
    .filter((x) => x !== null)
    .sort();
}
