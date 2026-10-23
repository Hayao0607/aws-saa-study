// 並び替え。画面から切り離した関数。
// rng は 0以上1未満の数を返す関数。渡さなければ Math.random を使う。

// 元の配列を変えずに、並びを入れ替えた新しい配列を返す（Fisher-Yates）。
export function shuffled(list, rng = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
