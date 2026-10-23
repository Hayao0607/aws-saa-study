// 苦手な問題の画面。はじめの画面で解く数（5問・10問・15問・20問・30問・全部）を選び、ランダムに出す（段階6-22）。
// ④ 演習（ヒントなし）と同じ形で解く。
// 答えるたびに記録する（間違えたら苦手な問題のまま、正解したら外れる。段階6-21 第5-4節）。
// 終わりの画面は「残りの苦手な問題（◯問）を解く」。全問正解で苦手な問題が0問になったら「苦手な問題はなくなりました」。
// 「間違えた◯問をもう一度」は置かない。
import { el, clear, heading, banner, countChooser, BACK_HOME } from '../ui.js?v=d5cfdb6c3a';
import { runQuestions } from './quizrun.js?v=d5cfdb6c3a';
import { shuffled } from '../logic/shuffle.js?v=d5cfdb6c3a';
import { MARK_ALL } from '../logic/weakcards.js?v=d5cfdb6c3a';
import { weakRule } from '../logic/weak.js?v=d5cfdb6c3a';

export function render(ctx, root) {
  // title：見出し（はじめの画面だけ「苦手な問題　8問」。段階6-22f）
  function frame(title = '苦手な問題') {
    const node = clear(root);
    node.appendChild(heading(title, BACK_HOME));
    const host = el('div', { class: 'host' });
    node.appendChild(host);
    return host;
  }

  function showStart() {
    ctx.setGuard(false);
    const ids = ctx.weakIds();
    const host = frame(ids.length ? '苦手な問題　' + ids.length + '問' : '苦手な問題');
    if (!ids.length) {
      host.appendChild(el('section', { class: 'panel' }, [
        el('p', { class: 'note', text: '苦手な問題はありません。' }),
      ]));
      return;
    }
    host.appendChild(el('section', { class: 'panel' }, [
      // 数は見出しに出し、枠の中は「何をするか」の1文と数を選ぶボタン（段階6-22f）
      countChooser(ids.length, startQuiz, { label: '苦手な問題', lead: '練習する問題数を選んでください。' + removeText() + '、苦手から外れます。' }),
    ]));
  }

  // 「正解すると」（settings.json の weak_questions.correct_in_a_row_to_remove が1）／「2回続けて正解すると」（2以上）
  function removeText() {
    const n = weakRule(ctx.settings).correctInARowToRemove;
    return n > 1 ? n + '回続けて正解すると' : '正解すると';
  }

  // 選んだ数を、そのときの苦手な問題の中からランダムに出す。
  function startQuiz(count) {
    ctx.setGuard(true);
    const ids = shuffled(ctx.weakIds()).slice(0, count);
    const questions = ids.map((id) => ctx.questionById.get(id)).filter(Boolean);
    const host = frame();
    runQuestions({
      root: host,
      ctx,
      questions,
      shuffleChoices: true,
      highlightMode: 'after',
      feedback: 'each',
      showCards: true,
      markCards: MARK_ALL,
      lastLabel: '結果を見る',
      onAnswered: (answer) => ctx.recordWeakPractice(answer.id, answer.correct),
      onFinish: (answers) => showDone(answers),
    });
  }

  function showDone(answers) {
    ctx.setGuard(false);
    const correct = answers.filter((a) => a.correct).length;
    const left = ctx.weakIds();
    const host = frame();
    if (correct === answers.length && !left.length) {
      host.appendChild(banner('クリア！'));
      host.appendChild(el('section', { class: 'panel' }, [
        el('p', { class: 'result-score', text: correct + ' / ' + answers.length + ' 問正解' }),
        el('p', { class: 'note', text: '苦手な問題はなくなりました' }),
      ]));
      return;
    }
    host.appendChild(el('section', { class: 'panel' }, [
      el('p', { class: 'result-score', text: correct + ' / ' + answers.length + ' 問正解' }),
      left.length ? null : el('p', { class: 'note', text: '苦手な問題はなくなりました' }),
    ]));
    // 残りの苦手な問題があれば、数を選んで続ける
    if (left.length) {
      host.appendChild(el('section', { class: 'panel' }, [
        countChooser(left.length, startQuiz, { label: '苦手な問題', quiet: true }),
      ]));
    }
  }

  showStart();
}
