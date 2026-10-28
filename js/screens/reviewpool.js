// 復習の画面（段階6-21）。予定日が来たレッスンの復習・章の復習の問題を1つの山にまとめ、
// 解く数（5問・10問・15問・20問・30問・全部）を選んで、山の中からランダムに出す。今日やることの行からだけ開く。
// 途中で離れるときの確認は出さない（答えた分は残るため。段階6-22）。
// 解き方は ④ 演習（ヒントなし）と同じ（1問ごとに正誤とカード、選択肢の並べ替え。答えたあとは問題文に色）。
// 1問答えるごとに、その問題を山（それを含むすべての復習の残り）から外して保存する（途中でやめても、答えた分は減っている）。
// 間違えた問題はすぐ苦手な問題に入れ、正解した問題は苦手な問題から外す。苦手なカードの印は答えるたびに付ける。
import { el, clear, button, heading, countChooser, BACK_HOME } from '../ui.js?v=10294e4f56';
import { runQuestions } from './quizrun.js?v=10294e4f56';
import { shuffled } from '../logic/shuffle.js?v=10294e4f56';
import { MARK_ALL } from '../logic/weakcards.js?v=10294e4f56';

export function render(ctx, root) {
  // title：見出し（はじめの画面だけ「復習　残り20問」。段階6-22f）
  function frame(title = '復習') {
    const node = clear(root);
    node.appendChild(heading(title, BACK_HOME));
    const host = el('div', { class: 'host' });
    node.appendChild(host);
    return host;
  }

  function questionsOf(ids) {
    return ids.map((id) => ctx.questionById.get(id)).filter(Boolean);
  }

  // はじめの画面：見出しに「残り ◯問」、枠の中に「何をするか」の1文と、解く数のボタン（段階6-22f）。
  function showStart() {
    ctx.setGuard(false);
    const left = ctx.reviewPoolIds();
    const host = frame(left.length ? '復習　残り' + left.length + '問' : '復習');
    if (!left.length) {
      host.appendChild(el('section', { class: 'panel' }, [
        el('p', { class: 'note', text: '今日の復習はありません。' }),
        el('div', { class: 'qactions' }, [el('a', { class: 'btn btn-main', href: '#/' }, 'ホームへ')]),
      ]));
      return;
    }
    host.appendChild(el('section', { class: 'panel' }, [
      countChooser(left.length, start, { lead: '前に学んだ問題を解き直します。解く問題数を選んでください。' }),
    ]));
  }

  // 選んだ数を、山の中からランダムに出す。
  function start(count) {
    const picked = shuffled(ctx.reviewPoolIds()).slice(0, count);
    run(questionsOf(picked), (answer) => ctx.answerReview(answer.id, answer.correct), showEnd);
  }

  // ④ と同じ形で解く。最後の問題のボタンは「結果を見る」。
  function run(list, onAnswered, onDone) {
    ctx.setGuard(false);
    runQuestions({
      root: frame(),
      ctx,
      questions: shuffled(list),
      shuffleChoices: true,
      highlightMode: 'after', // 答えたあとに、問題文に色を付ける（段階6-21）
      feedback: 'each',
      showCards: true,
      markCards: MARK_ALL,
      lastLabel: '結果を見る',
      onAnswered,
      onFinish: onDone,
    });
  }

  // 終わりの画面：正解の数、「間違えた◯問をもう一度」、「ホームへ」（段階6-22e で「次へ」を消し、目立つボタンにした）、
  // 山に残りがあれば「残り ◯問」と続けて解くボタン。
  function showEnd(answers) {
    ctx.setGuard(false);
    const wrong = answers.filter((a) => !a.correct).map((a) => a.question);
    const host = frame();
    const actions = [];
    if (wrong.length) {
      // 間違えた問題だけを並べ替えて解き直す（間違えたら苦手な問題に入れ、正解では何も変えない）
      actions.push(button('間違えた' + wrong.length + '問をもう一度', () => run(
        wrong, (answer) => ctx.recordRetry(answer.id, answer.correct), showEnd,
      ), 'btn btn-main'));
    }
    actions.push(el('a', { class: 'btn btn-main', href: '#/' }, 'ホームへ'));
    host.appendChild(el('section', { class: 'panel result' }, [
      el('p', { class: 'result-score', text: (answers.length - wrong.length) + ' / ' + answers.length + ' 問正解' }),
      el('div', { class: 'qactions qactions-stack' }, actions),
    ]));
    const left = ctx.reviewPoolIds().length;
    if (left) host.appendChild(el('section', { class: 'panel' }, [countChooser(left, start, { quiet: true })]));
    window.scrollTo(0, 0);
  }

  showStart();
}
