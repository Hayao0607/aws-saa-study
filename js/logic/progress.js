// 進み具合の判定。画面から切り離した関数。
// 引数の state は storage.js が持つ保存の形（素のオブジェクト）。
// categories は curriculum.json の categories（並び順どおりの配列）。

// ---------------------------------------------------------------- 1件ごとの判定

export function isUnitDone(state, unitId) {
  return state.units[unitId] === true;
}

// 章末テストの合格の通算回数。
export function blockTestPassCount(state, blockId) {
  return Number(state.blockTests[blockId]) || 0;
}

export function isBlockTestPassed(state, blockId) {
  return blockTestPassCount(state, blockId) > 0;
}

// 分野テストの合格の通算回数（段階6-22で、分野ごとに1つにした）。
export function categoryTestPassCount(state, categoryName) {
  return Number(state.categoryTests[categoryName]) || 0;
}

export function isCategoryTestPassed(state, categoryName) {
  return categoryTestPassCount(state, categoryName) > 0;
}

// テストでの記録。まだ出ていなければ null、前回正解なら 1、前回不正解なら 0。
export function questionMark(state, questionId) {
  const record = state.questions[questionId];
  if (!record) return null;
  return record.last;
}

// 模擬試験の問題の選び方に渡す印（{ 問題ID: 1 | 0 }）。
export function questionMarks(state) {
  const out = {};
  for (const [id, record] of Object.entries(state.questions || {})) {
    // テストに出ていない問題（復習・練習でだけ答えた問題。test: false）は、まだ出ていないとする
    if (record && record.test !== false && (record.last === 0 || record.last === 1)) out[id] = record.last;
  }
  return out;
}

// ---------------------------------------------------------------- まとめた数

// 並び順どおりの、すべてのレッスン（分野・章を添えて）。
export function unitSequence(categories) {
  const out = [];
  for (const category of categories) {
    for (const block of category.blocks) {
      for (const unit of block.units) {
        out.push({ category, block, unit });
      }
    }
  }
  return out;
}

export function countUnits(categories) {
  return unitSequence(categories).length;
}

export function countDoneUnits(categories, state) {
  return unitSequence(categories).filter((x) => isUnitDone(state, x.unit.id)).length;
}

export function blockStats(block, state) {
  const unitDone = block.units.filter((u) => isUnitDone(state, u.id)).length;
  return {
    unitTotal: block.units.length,
    unitDone,
    allUnitsDone: unitDone === block.units.length,
    testQuestionCount: block.test.question_ids.length,
    testPassed: isBlockTestPassed(state, block.id),
    testPassCount: blockTestPassCount(state, block.id),
  };
}

export function categoryStats(category, state) {
  let unitTotal = 0;
  let unitDone = 0;
  let blockTestPassed = 0;
  for (const block of category.blocks) {
    const s = blockStats(block, state);
    unitTotal += s.unitTotal;
    unitDone += s.unitDone;
    if (s.testPassed) blockTestPassed += 1;
  }
  const testPassed = isCategoryTestPassed(state, category.name) ? 1 : 0;
  return {
    unitTotal,
    unitDone,
    allUnitsDone: unitDone === unitTotal,
    blockTotal: category.blocks.length,
    blockTestPassed,
    testTotal: 1,
    testPassed,
  };
}

// ---------------------------------------------------------------- 案内の判定

// 章末テストを案内するか（章の全レッスンが完了で、まだ合格していない）。
export function isBlockTestDue(block, state) {
  const s = blockStats(block, state);
  return s.allUnitsDone && !s.testPassed;
}

// 分野テストを案内するか（分野の全レッスンが完了で、合格していない）。
export function isCategoryTestDue(category, state) {
  return categoryStats(category, state).allUnitsDone
    && !isCategoryTestPassed(state, category.name);
}

// 模擬試験を案内するか（全分野の分野テストに合格した）。
export function isRandomDue(categories, state) {
  return categories.every((category) => isCategoryTestPassed(state, category.name));
}

// 「次はこれ」。並び順に見て、最初にやるべきものを1つ返す。
// 分野 → 章 の順に見る。章は「未完了のレッスン」→「未合格の章末テスト」の順。
// 分野のすべての章を見終えたら、その分野の未合格の分野テストの回。
// すべて終わっていれば模擬試験。
export function nextAction(categories, state) {
  for (const category of categories) {
    for (const block of category.blocks) {
      const unit = block.units.find((u) => !isUnitDone(state, u.id));
      if (unit) return { type: 'unit', category, block, unit };
      if (!isBlockTestPassed(state, block.id)) {
        return { type: 'blockTest', category, block };
      }
    }
    if (!isCategoryTestPassed(state, category.name)) return { type: 'categoryTest', category };
  }
  return { type: 'random' };
}

// ---------------------------------------------------------------- 既出（段階6-22）

// カードが出ているレッスン（{ カードID: [レッスンID] }）。curriculum の各レッスンの cards から作る。
export function cardLessons(categories) {
  const out = {};
  for (const { unit } of unitSequence(categories)) {
    for (const x of unit.cards || []) {
      if (!out[x.id]) out[x.id] = [];
      if (!out[x.id].includes(unit.id)) out[x.id].push(unit.id);
    }
  }
  return out;
}

// 「既出」か：そのカードが、自分が完了したほかのレッスンに出ているか（いまのレッスンは数えない）。
export function isSeenBefore(state, lessonsOfCard, cardId, unitId) {
  return (lessonsOfCard[cardId] || []).some((id) => id !== unitId && isUnitDone(state, id));
}
