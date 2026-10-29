// 模擬試験の画面。学習の対象の全問から、settings.json の問題数だけを選んで出す。
import { el, clear, button, heading, banner, BACK_HOME } from '../ui.js?v=c7a45f5a91';
import { runQuestions } from './quizrun.js?v=c7a45f5a91';
import { resultView } from './review.js?v=c7a45f5a91';
import { pickFinalQuestions } from '../logic/picker.js?v=c7a45f5a91';
import { shuffled } from '../logic/shuffle.js?v=c7a45f5a91';
import { scoreAnswers, isPassed, passScoreFor } from '../logic/grade.js?v=c7a45f5a91';
import { recordTestAnswers, addRandomPass } from '../storage.js?v=c7a45f5a91';
import { MARK_ALL, cardsForAnswers } from '../logic/weakcards.js?v=c7a45f5a91';

// 「合格した回数 ◯回」（0回のときも出す。段階6-22g）
function passCountText(times) {
  return '合格した回数 ' + times + '回';
}

export function render(ctx, root) {
  const count = ctx.settings.final_test.question_count;
  const passScore = passScoreFor(count, ctx.settings.pass_rate);

  function frame() {
    const node = clear(root);
    node.appendChild(heading('模擬試験', BACK_HOME));
    const host = el('div', { class: 'host' });
    node.appendChild(host);
    return host;
  }

  function showStart() {
    ctx.setGuard(false);
    const host = frame();
    host.appendChild(el('section', { class: 'panel' }, [
      // 合格の決まりの文（段階6-22c。数は設定から計算する）
      el('p', { class: 'test-rule', text: count + '問が出題されます。' + passScore + '問以上の正解で合格です。' }),
      // 合格した回数だけを出す（目標の回数は付けない。段階6-22g）
      el('p', { class: 'note', text: passCountText(ctx.state.randomPassCount) }),
      el('div', { class: 'qactions' }, [button('はじめる（' + count + '問）', startQuiz, 'btn btn-main')]),
    ]));
  }

  function startQuiz() {
    ctx.setGuard(true);
    const ids = pickFinalQuestions(ctx.allQuestionIds, ctx.marks(), count);
    const questions = ids.map((id) => ctx.questionById.get(id)).filter(Boolean);
    const host = frame();
    runQuestions({
      root: host,
      ctx,
      questions,
      shuffleChoices: true,
      highlightMode: 'never',
      feedback: 'end',
      showCards: false,
      onFinish: showResult,
    });
  }

  function practiceWrong(answers) {
    const wrong = answers.filter((a) => !a.correct).map((a) => a.question);
    ctx.setGuard(true);
    const host = frame();
    // 練習の上の案内は出さない（段階6-22c）
    const inner = el('div', { class: 'host' });
    host.appendChild(inner);
    runQuestions({
      root: inner,
      ctx,
      questions: shuffled(wrong),
      shuffleChoices: true,
      highlightMode: 'after',
      feedback: 'each',
      showCards: true,
      markCards: MARK_ALL,
      // 間違えたら苦手な問題に入れ、正解では何も変えない（段階6-21 第5-4節）
      onAnswered: (answer) => ctx.recordRetry(answer.id, answer.correct),
      onFinish: () => showResult(answers, true),
    });
  }

  function showResult(answers, again) {
    if (!again) {
      recordTestAnswers(answers.map((a) => ({ id: a.id, correct: a.correct })));
      // 本番は1問ごとの正誤を出さないので、苦手なカードの印も最後にまとめて付ける
      ctx.markWeakCards(cardsForAnswers(answers, MARK_ALL));
    }
    ctx.setGuard(false);
    const score = scoreAnswers(answers);
    const passed = isPassed(score.correct, passScore);
    if (passed && !again) addRandomPass();
    const host = frame();
    const wrong = answers.filter((a) => !a.correct);
    // 結果（点数・合否・ボタン）を先に、その下に間違えた問題の一覧（段階6-21 第5-6節）。
    // 文言と並びは分野テストにそろえる（段階6-22e）：「59 / 65 問正解」、不合格なら「不合格（59問以上で合格）」の1行、
    // ボタンは「間違えた◯問を練習する」・「ホームへ」・「もう一度受ける（65問）」
    resultView(ctx, host, () => {
      const actions = [];
      if (wrong.length) {
        actions.push(button('間違えた' + wrong.length + '問を練習する', () => practiceWrong(answers), 'btn btn-main'));
      }
      actions.push(el('a', { class: 'btn btn-main', href: '#/' }, 'ホームへ'));
      actions.push(button('もう一度受ける（' + count + '問）', startQuiz, 'btn btn-quiet'));
      return [
        passed ? banner('合格！', 'pass') : null,
        el('section', { class: 'panel result' }, [
          el('p', { class: 'result-score', text: score.correct + ' / ' + score.total + ' 問正解' }),
          passed ? null : el('p', { class: 'judge judge-ng', text: '不合格（' + passScore + '問以上で合格）' }),
          el('p', { class: 'note', text: passCountText(ctx.state.randomPassCount) }),
          el('div', { class: 'qactions qactions-stack' }, actions),
        ]),
      ].filter(Boolean);
    }, wrong, { toResult: true });
  }

  showStart();
}
