// 使い方の画面。レッスンの4つのタブとテスト、スケジュールを1行ずつ説明する。
// 各画面には説明の文を出さない（説明はここにだけ置く）。
import { el, clear, heading, BACK_HOME } from '../ui.js?v=c7a45f5a91';
import { weakRule } from '../logic/weak.js?v=c7a45f5a91';
import { weakCardRule } from '../logic/weakcards.js?v=c7a45f5a91';
import { planRule, BLOCK_TEST_QUESTIONS, CATEGORY_TEST_QUESTIONS } from '../logic/plan.js?v=c7a45f5a91';
import { passScoreFor } from '../logic/grade.js?v=c7a45f5a91';

// 復習の日の言い方（1 → 翌日、7 → 1週間後、それ以外 → n日後）。
function afterDays(n) {
  if (n === 1) return '翌日';
  if (n === 7) return '1週間後';
  return n + '日後';
}

export function render(ctx, root) {
  const rule = weakRule(ctx.settings);
  const cardRule = weakCardRule(ctx.settings);
  const plan = planRule(ctx.settings);
  const reviewWhen = plan.reviewAfterDays.map(afterDays).join('と');
  const mockCount = ctx.settings.final_test.question_count;
  const retryAfter = ctx.settings.check && ctx.settings.check.retry_after_cards
    ? ctx.settings.check.retry_after_cards : 3;
  const retryQuestions = ctx.settings.practice && ctx.settings.practice.retry_after_questions
    ? ctx.settings.practice.retry_after_questions : 3;
  const catPass = passScoreFor(CATEGORY_TEST_QUESTIONS, ctx.settings.pass_rate);

  const lines = [
    ['① 覚える', 'カードの問いと答えを見て覚えます。答えの下の小さな文は補足です。'],
    ['② 確かめる', '問いを見て、正しい答えを選びます。'],
    ['② で答えたあと', 'カードの問い・答え・補足が出ます。読んだら「次へ」を押します。'],
    ['② で間違えたとき', 'そのカードは、' + retryAfter + '枚あとにもう一度出ます。全部正解すると「クリア！」です。'],
    ['② の既出のカード', '完了したほかのレッスンに出たカード（既出）を間違えると、苦手なカードに入ります。'],
    ['② のめくるカード', '選択肢の無いカードは、押して答えを見て「覚えた」か「まだ」を選びます。'],
    ['③ 演習（ヒントあり）', '問題文のキーワードに色が付きます。答えたら、正解とカードが出ます。'],
    ['③ で間違えたとき', 'その問題は、' + retryQuestions + '問あとにもう一度出ます。全問正解すると ④ へ進めます。'],
    ['④ 演習（ヒントなし）', '色なしで、問題と選択肢を並べ替えて解きます。答えたあとは問題文に色が付きます。'],
    ['④ の結果', '全問正解でレッスンが完了します。間違えた問題は、もう一度解けます。'],
    ['選んで答える', '選び終えたら、下の「答える」を押します。'],
    ['タブの移動', '③・④ の途中で移ると、その演習は最初からになります。'],
    ['答えたあと', '下に「この問題を解くカード」と、正解の理由・ほかの選択肢が違う理由が出ます。'],
    ['用語', '答えたあと、点線の付いた言葉を押すと、その用語の説明が出ます。'],
    ['章末テスト', '1回' + BLOCK_TEST_QUESTIONS + '問です。章の全問に1回ずつ正解すると合格です。'],
    ['章末テストの続き', '間違えた問題は、次にまた出ます。まだ正解していない問題が先に出ます。'],
    ['分野テスト', 'その分野から' + CATEGORY_TEST_QUESTIONS + '問です。' + catPass + '問以上の正解で合格です。'],
    ['分野テストの問題', '苦手な問題・前に間違えた問題・まだ出ていない問題の順に選びます。'],
    ['分野テストの受け直し', 'その日に出た問題は、同じ日の分野テストにはもう出ません。'],
    ['分野テストのくり返し', '合格すると、' + plan.chapterRepeatDays + '日後に新しい' + CATEGORY_TEST_QUESTIONS + '問でもう一度受けます。'],
    ['テストの記録', '答えた分は、途中でやめても残ります。'],
    ['模擬試験', '本番と同じ ' + mockCount + '問です。9割以上の正解で合格です。合格した回数が出ます。'],
    ['苦手な問題', rule.wrongTimesToAdd + '回間違えると入り、テスト・復習・練習で '
      + rule.correctInARowToRemove + '回' + (rule.correctInARowToRemove > 1 ? '続けて' : '') + '正解すると外れます。'],
    ['苦手なカード', '④・テスト・復習で間違えた問題のカードが、' + cardRule.wrongTimesToAdd
      + '回で入ります。練習で ' + cardRule.correctInARowToRemove + '回続けて正解すると外れます。'],
    // スケジュールが無ければ、ホームに次にやること（レッスン・章末テスト・分野テスト・模擬試験）が出る（段階6-22k）
    ['スケジュール', '受験日と勉強する曜日を決めると、ホームに今日やることが出ます。無ければ、次にやることが出ます。'],
    ['休む日', 'スケジュールのページで追加できます。量は次の日から自動で変わります。'],
    // スケジュールが無ければ、ホームの「復習　残り◯問」にまとまる（段階6-22h）
    ['復習', '学んだ' + reviewWhen + 'の問題が、今日やること（スケジュールが無ければホーム）の「復習　残り◯問」にまとまります。'],
    ['数を選ぶ', '復習・苦手な問題・苦手なカードは、5〜30問・全部から選んで、ランダムに解きます。'],
    ['復習の残り', '答えた分から残りが減ります。'],
    ['章の復習', '章末テストに合格すると、その章の' + afterDays(plan.reviewAfterDays[plan.reviewAfterDays.length - 1]) + 'の復習は「章の復習」にまとまります。'],
    ['章の復習のくり返し', '章の復習を終えると、' + plan.chapterRepeatDays + '日ごとにくり返します。スケジュールが無いときも、'
      + plan.chapterRepeatDays + '日ごとに続きます。'],
    ['用語集', 'メニューの「用語集」で、分野ごとに用語を引けます。検索もできます。'],
    ['1日の区切り', '朝' + plan.dayStartHour + '時です。それより前は、前の日です。'],
  ];

  const node = clear(root);
  node.appendChild(heading('使い方', BACK_HOME));
  node.appendChild(el('section', { class: 'panel' }, [
    el('dl', { class: 'helplist' }, lines.flatMap(([term, body]) => [
      el('dt', { class: 'help-term', text: term }),
      el('dd', { class: 'help-body', text: body }),
    ])),
  ]));
  node.appendChild(el('section', { class: 'panel' }, [
    el('p', { class: 'note', text: '完了したレッスンには ✓、合格したテストには ★ と合格の回数が付きます。' }),
    el('p', { class: 'note', text: '途中でやめると、そのレッスン・その演習は最初からになります。復習とテストは、答えた分が残ります。' }),
    el('p', { class: 'note', text: '学習の記録は、このブラウザに残ります。メニューの「学習の記録を消す」で消せます。'
      + '別の端末へは、メニューの「記録を移す」で移せます。' }),
  ]));
}
