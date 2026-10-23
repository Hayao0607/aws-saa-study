// 保存した進み具合のうち、いまのデータに無いIDの記録を無視する。画面から切り離した関数。
// レッスンを消したとき（段階6-9の U098）や、学習の対象から問題を外したとき
// （aws1-q584・aws2-q325）に、古い記録が残っていても壊れずに読めるようにする。
// 記録そのものは消さない（保存の中身はそのまま残し、読み出した見え方だけを絞る）。

// いまのデータにあるIDの集まりを、curriculum と questions と cards から作る。
export function knownIds(categories, questions, cards) {
  const units = new Set();
  const blocks = new Set();
  const categories2 = new Set(); // 分野名
  for (const category of categories || []) {
    categories2.add(category.name);
    for (const block of category.blocks || []) {
      blocks.add(block.id);
      for (const unit of block.units || []) units.add(unit.id);
    }
  }
  return {
    units,
    blocks,
    categories: categories2,
    questions: new Set((questions || []).map((q) => q.id)),
    cards: new Set((cards || []).map((c) => c.id)),
  };
}

// 保存の中身から、いまのデータにあるIDの記録だけを残した新しい中身を作る。
// known を渡さなければ、そのまま返す。
export function pickKnown(state, known) {
  if (!state || !known) return state;
  const out = {
    version: state.version,
    units: {},
    blockTests: {},
    categoryTests: {},
    catTestNext: {},
    catTestSeen: {},
    catTestToday: {},
    catTestFailed: {},
    randomPassCount: state.randomPassCount,
    questions: {},
    // 予定と今日の一覧はそのまま渡す（今日の一覧の行は、データに無ければ画面で飛ばす）
    plan: state.plan || null,
    today: state.today || null,
    unitDoneAt: {},
    reviews: {},
    cards: {},
    blockReviews: {},
    reviewLeft: {},
    reviewDoneAt: { ...(state.reviewDoneAt || {}) },
    testLeft: {},
  };
  // 復習の残り・章末テストの「合格まで」：データにあるレッスン・章の分だけ、データにある問題だけを残す
  const knownReview = (key) => (key.startsWith('chapter:')
    ? known.blocks.has(key.slice(8))
    : known.units.has(key.split(':')[0]));
  const knownTest = (key) => key.startsWith('block:') && known.blocks.has(key.slice(6));
  for (const [field, ok] of [['reviewLeft', knownReview], ['testLeft', knownTest]]) {
    for (const [key, ids] of Object.entries(state[field] || {})) {
      if (!ok(key) || !Array.isArray(ids)) continue;
      out[field][key] = ids.filter((id) => known.questions.has(id));
    }
  }
  for (const [id, v] of Object.entries(state.unitDoneAt || {})) {
    if (known.units.has(id)) out.unitDoneAt[id] = v;
  }
  for (const [id, v] of Object.entries(state.reviews || {})) {
    if (known.units.has(id)) out.reviews[id] = v;
  }
  for (const [id, v] of Object.entries(state.units || {})) {
    if (known.units.has(id)) out.units[id] = v;
  }
  for (const [id, v] of Object.entries(state.blockTests || {})) {
    if (known.blocks.has(id)) out.blockTests[id] = v;
  }
  for (const [name, v] of Object.entries(state.categoryTests || {})) {
    if (known.categories.has(name)) out.categoryTests[name] = v;
  }
  for (const [name, v] of Object.entries(state.catTestNext || {})) {
    if (known.categories.has(name)) out.catTestNext[name] = v;
  }
  for (const [id, v] of Object.entries(state.catTestSeen || {})) {
    if (known.questions.has(id)) out.catTestSeen[id] = v;
  }
  for (const [name, v] of Object.entries(state.catTestToday || {})) {
    if (known.categories.has(name) && v) out.catTestToday[name] = { date: v.date, ids: (v.ids || []).filter((id) => known.questions.has(id)) };
  }
  for (const [name, v] of Object.entries(state.catTestFailed || {})) {
    if (known.categories.has(name)) out.catTestFailed[name] = v;
  }
  for (const [id, v] of Object.entries(state.questions || {})) {
    if (known.questions.has(id)) out.questions[id] = v;
  }
  for (const [id, v] of Object.entries(state.blockReviews || {})) {
    if (known.blocks.has(id)) out.blockReviews[id] = v;
  }
  for (const [id, v] of Object.entries(state.cards || {})) {
    if (known.cards.has(id)) out.cards[id] = v;
  }
  return out;
}
