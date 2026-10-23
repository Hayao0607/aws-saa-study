// 章末テストと分野テストの画面（段階6-21で作り直し、段階6-22c で章に1つ・30問中27問で合格に直した）。
// 章末テスト：章に1つ。1回に15問（「合格まで」の前から。足りなければその章の苦手な問題 → ほかの問題で補う）。
//   章の全問に1回ずつ正解したら合格。間違えた問題は「合格まで」のいちばん後ろに移り、次にまた出る。
// 分野テスト：分野ごとに1つ。1回に30問（同じ日にその分野で出た問題は除く）。27問以上の正解で合格。
// 解いている最中は1問ごとの正誤を出さず、問題文に色を付けない。数を選ぶ画面は出さない。
// 1問答えるごとに記録する（「合格まで」の出し入れ・苦手な問題の出入り）。
// 解き終えたら、正解の数と、間違えた問題の一覧（js/screens/review.js。最後の問題では「結果へ」）。
// 途中で離れるときの確認は出さない（答えた分は残るため。段階6-22）。
import { el, clear, button, heading, banner, backToCategory, progress } from '../ui.js?v=dc64bc235b';
import { runQuestions } from './quizrun.js?v=dc64bc235b';
import { resultView } from './review.js?v=dc64bc235b';
import { shuffled } from '../logic/shuffle.js?v=dc64bc235b';
import { blockTestPassCount, categoryTestPassCount } from '../logic/progress.js?v=dc64bc235b';
import { MARK_ALL } from '../logic/weakcards.js?v=dc64bc235b';

function questionsOf(ctx, ids) {
  return ids.map((id) => ctx.questionById.get(id)).filter(Boolean);
}

function passNote(n) {
  return n > 0 ? el('p', { class: 'note', text: '★ 合格' + n + '回' }) : null;
}

// 間違えた問題の練習（3つのテストで共通。段階6-22c で「間違えた◯問を練習する」にし、上の案内を消した）。
// 1問ごとに答え合わせをし、カードを出す。合格には数えない。間違えたら苦手な問題に入れ、正解では何も変えない。
export function practiceButton(wrongCount, onClick) {
  return button('間違えた' + wrongCount + '問を練習する', onClick, 'btn btn-main');
}

export function runPractice(ctx, host, answers, onFinish) {
  const wrong = answers.filter((a) => !a.correct).map((a) => a.question);
  runQuestions({
    root: host,
    ctx,
    questions: shuffled(wrong),
    shuffleChoices: true,
    highlightMode: 'after',
    feedback: 'each',
    showCards: true,
    markCards: MARK_ALL,
    onAnswered: (answer) => ctx.recordRetry(answer.id, answer.correct),
    onFinish,
  });
}

// 見つからないとき。
function notFound(root, text) {
  clear(root).appendChild(el('section', { class: 'panel' }, [el('p', { class: 'note', text })]));
}

// 画面の枠（見出し・戻るリンク・場所の名前）を描き、中身を入れる箱を返す。
function framer(root, title, where, back) {
  return () => {
    const node = clear(root);
    node.appendChild(heading(title, back));
    if (where) node.appendChild(el('p', { class: 'note', text: where }));
    const host = el('div', { class: 'host' });
    node.appendChild(host);
    return host;
  };
}

// ---------------------------------------------------------------- 章末テスト

export function renderBlockTest(ctx, root, params) {
  const found = ctx.blockById.get(params.blockId);
  if (!found) {
    notFound(root, 'その章は見つかりませんでした。');
    return;
  }
  const { block, category } = found;
  const frame = framer(root, '章末テスト', block.name, backToCategory(category));
  const total = ctx.blockQuestionCount(block.id);

  // 「正解した問題 28 / 32」の進捗の棒と「合格まであと4問」（始めていて、合格していないとき）。
  function progressNodes() {
    const left = ctx.blockTestLeft(block.id).length;
    return [
      el('p', { class: 'chooser-left', text: '正解した問題' }),
      progress(total - left, total, total - left),
      el('p', { class: 'result-line', text: '合格まであと' + left + '問' }),
    ];
  }

  // 合格の決まりの文（段階6-22e）。15問より多い章：「この章の37問から、15問ずつ出題されます。37問すべてに正解すると合格です。」
  // 15問以下の章：「この章の8問が出題されます。8問すべてに正解すると合格です。」
  function ruleText(size) {
    const head = total > size ? 'この章の' + total + '問から、' + size + '問ずつ出題されます。' : 'この章の' + total + '問が出題されます。';
    return head + total + '問すべてに正解すると合格です。';
  }

  // はじめの画面：合格の決まりの文と「はじめる（15問）」（始めていれば進捗と「続きを解く（15問）」）。
  function showStart() {
    ctx.setGuard(false);
    const started = ctx.blockTestStarted(block.id);
    const size = ctx.blockTestSize(block.id);
    const host = frame();
    host.appendChild(el('section', { class: 'panel' }, [
      passNote(blockTestPassCount(ctx.state, block.id)),
      size
        ? el('p', { class: 'test-rule', text: ruleText(size) })
        : el('p', { class: 'note', text: 'このテストの問題はありません。' }),
      ...(size && started ? progressNodes() : []),
      size ? el('div', { class: 'qactions' }, [
        button((started ? '続きを解く' : 'はじめる') + '（' + size + '問）', start, 'btn btn-main'),
      ]) : null,
    ]));
  }

  // 1回分（15問）を選び、並べ替えて通して解く。
  function start() {
    const pick = ctx.pickBlockTest(block.id);
    let passedNow = false;
    ctx.setGuard(false);
    runQuestions({
      root: frame(),
      ctx,
      questions: questionsOf(ctx, pick.ids),
      shuffleChoices: true,
      highlightMode: 'never',
      feedback: 'end',
      showCards: false,
      markCards: MARK_ALL, // 苦手なカードの印も、1問ごとに付ける
      onAnswered: (answer) => {
        // 同じ回の中で合格したあとの解答は、「合格まで」を変えない（苦手な問題の出入りは記録する）
        const result = ctx.answerBlockTest(block.id, answer.id, answer.correct, passedNow);
        if (result.passed) passedNow = true;
      },
      onFinish: (answers) => {
        ctx.finishBlockTestRound(block.id);
        showResult(answers, passedNow);
      },
    });
  }

  // 結果の画面：「8 / 15 問正解」、「間違えた7問を練習する」「ホームへ」（段階6-22e で「次へ」を消し、「ホームへ」を目立つボタンにした）。
  // 合格していなければ下の枠に、進捗の棒・「合格まであと◯問」・「続きを解く（15問）」。合格したら「合格！」。
  function showResult(answers, passedNow) {
    ctx.setGuard(false);
    const wrong = answers.filter((a) => !a.correct);
    const host = frame();
    resultView(ctx, host, () => {
      const actions = [];
      if (wrong.length) actions.push(practiceButton(wrong.length, () => practice(answers, passedNow)));
      actions.push(el('a', { class: 'btn btn-main', href: '#/' }, 'ホームへ'));
      const parts = [];
      if (passedNow) parts.push(banner('合格！', 'pass'));
      parts.push(el('section', { class: 'panel result' }, [
        el('p', { class: 'result-score', text: (answers.length - wrong.length) + ' / ' + answers.length + ' 問正解' }),
        passedNow ? passNote(blockTestPassCount(ctx.state, block.id)) : null,
        el('div', { class: 'qactions qactions-stack' }, actions),
      ]));
      if (!passedNow) {
        parts.push(el('section', { class: 'panel' }, [
          ...progressNodes(),
          el('div', { class: 'qactions' }, [
            button('続きを解く（' + ctx.blockTestSize(block.id) + '問）', start, 'btn btn-quiet'),
          ]),
        ]));
      }
      return parts;
    }, wrong, { toResult: true });
  }

  function practice(answers, passedNow) {
    ctx.setGuard(false);
    runPractice(ctx, frame(), answers, () => showResult(answers, passedNow));
  }

  showStart();
}

// ---------------------------------------------------------------- 分野テスト

export function renderCategoryTest(ctx, root, params) {
  const category = ctx.categoryByName.get(params.categoryName);
  if (!category) {
    notFound(root, 'その分野テストは見つかりませんでした。');
    return;
  }
  const name = category.name;
  const frame = framer(root, '分野テスト', name, backToCategory(category));

  // はじめの画面：合格の決まりの文と「はじめる（30問）」。
  function showStart() {
    ctx.setGuard(false);
    const count = ctx.categoryTestCount(name);
    const host = frame();
    host.appendChild(el('section', { class: 'panel' }, [
      passNote(categoryTestPassCount(ctx.state, name)),
      count
        ? el('p', { class: 'test-rule', text: 'この分野から' + count + '問が出題されます。' + ctx.categoryPassScore(name) + '問以上の正解で合格です。' })
        : el('p', { class: 'note', text: 'このテストの問題はありません。' }),
      count ? el('div', { class: 'qactions' }, [button('はじめる（' + count + '問）', start, 'btn btn-main')]) : null,
    ]));
  }

  // 30問を選び（同じ日にこの分野で出た問題は除く）、並べ替えて通して解く。
  function start() {
    const ids = ctx.startCategoryTest(name);
    ctx.setGuard(false);
    runQuestions({
      root: frame(),
      ctx,
      questions: shuffled(questionsOf(ctx, ids)),
      shuffleChoices: true,
      highlightMode: 'never',
      feedback: 'end',
      showCards: false,
      markCards: MARK_ALL,
      onAnswered: (answer) => ctx.answerCategoryTest(answer.id, answer.correct),
      onFinish: (answers) => {
        const correct = answers.filter((a) => a.correct).length;
        showResult(answers, ctx.finishCategoryTest(name, correct));
      },
    });
  }

  // 結果の画面：「28 / 30 問正解」、合格なら「合格！」、不合格なら「不合格（27問以上で合格）」。
  // 「間違えた◯問を練習する」「ホームへ」。不合格のときだけ控えめな「もう一度受ける（30問）」（段階6-22e で「次へ」を消した）。
  function showResult(answers, outcome) {
    ctx.setGuard(false);
    const wrong = answers.filter((a) => !a.correct);
    const host = frame();
    resultView(ctx, host, () => {
      const actions = [];
      if (wrong.length) actions.push(practiceButton(wrong.length, () => practice(answers, outcome)));
      actions.push(el('a', { class: 'btn btn-main', href: '#/' }, 'ホームへ'));
      if (!outcome.passed) {
        actions.push(button('もう一度受ける（' + ctx.categoryTestCount(name) + '問）', start, 'btn btn-quiet'));
      }
      return [
        outcome.passed ? banner('合格！', 'pass') : null,
        el('section', { class: 'panel result' }, [
          el('p', { class: 'result-score', text: (answers.length - wrong.length) + ' / ' + answers.length + ' 問正解' }),
          outcome.passed
            ? passNote(categoryTestPassCount(ctx.state, name))
            : el('p', { class: 'judge judge-ng', text: '不合格（' + outcome.passScore + '問以上で合格）' }),
          el('div', { class: 'qactions qactions-stack' }, actions),
        ]),
      ].filter(Boolean);
    }, wrong, { toResult: true });
  }

  function practice(answers, outcome) {
    ctx.setGuard(false);
    runPractice(ctx, frame(), answers, () => showResult(answers, outcome));
  }

  showStart();
}
