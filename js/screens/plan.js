// スケジュールのページ。受験日・勉強する曜日・休む日を決め、1日に解く問題の目安を出す。
// 最初にスケジュールを立てるときも、立て直すときも、ここで行う。
// 保存したら、その場で目安を出し、今日の一覧も作り直す。
// スケジュールがあるときは、ページのいちばん下に控えめな「スケジュールを削除する」（段階6-22h）。
// 削除しても学習の記録と復習は消えない（今日の一覧と分野テストのくり返しの予定は消える）。
// 削除したあとも、受験日などを入れて保存すれば、また立てられる。
import { el, clear, button, heading, toast, fieldError, showDialog, BACK_HOME } from '../ui.js?v=c7a45f5a91';
import { setPlan } from '../storage.js?v=c7a45f5a91';
import { dailyTarget, isDateKey, planStatus } from '../logic/plan.js?v=c7a45f5a91';

const DELETE_MESSAGE = 'スケジュールを削除しますか？今日やることと分野テストのくり返しの予定がなくなります。'
  + '学習の記録と復習は消えません。';

// 月〜日の順に並べる（値は 0＝日 … 6＝土）。
const WEEKDAYS = [
  { value: 1, label: '月' }, { value: 2, label: '火' }, { value: 3, label: '水' },
  { value: 4, label: '木' }, { value: 5, label: '金' }, { value: 6, label: '土' },
  { value: 0, label: '日' },
];

// 「5月3日（土）」の形。
function dateLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const name = WEEKDAYS.find((x) => x.value === w).label;
  return m + '月' + d + '日（' + name + '）';
}

export function render(ctx, root) {
  const saved = ctx.state.plan;
  // 画面の上で編むスケジュール（保存するまで、保存の中身は変えない）
  const draft = {
    exam_date: saved ? saved.exam_date : '',
    weekdays: saved ? saved.weekdays.slice() : WEEKDAYS.map((x) => x.value),
    days_off: saved ? saved.days_off.slice() : [],
  };
  let errors = {};          // 欄ごとの入力の誤り { exam, weekdays, off }
  let offInput = '';        // 休む日を足す欄の値

  function draw() {
    const node = clear(root);
    const today = ctx.todayKey();
    node.appendChild(heading('スケジュール', BACK_HOME));

    // ---- 受験日
    const exam = el('input', {
      class: 'field' + (errors.exam ? ' is-error' : ''), type: 'date', id: 'plan-exam',
      value: draft.exam_date, min: today,
      'aria-describedby': errors.exam ? 'plan-exam-error' : null,
      'aria-invalid': errors.exam ? 'true' : null,
    });
    for (const type of ['input', 'change']) {
      exam.addEventListener(type, () => { draft.exam_date = exam.value; });
    }

    // ---- 勉強する曜日
    const days = el('div', { class: 'weekdays', role: 'group', 'aria-label': '勉強する曜日' },
      WEEKDAYS.map((w) => {
        const on = draft.weekdays.includes(w.value);
        return el('button', {
          class: 'weekday' + (on ? ' is-on' : ''),
          type: 'button',
          'aria-pressed': on ? 'true' : 'false',
          onClick: () => {
            draft.weekdays = on
              ? draft.weekdays.filter((d) => d !== w.value)
              : draft.weekdays.concat([w.value]);
            errors.weekdays = null;
            draw();
          },
        }, w.label);
      }));

    // ---- 休む日
    const offField = el('input', {
      class: 'field' + (errors.off ? ' is-error' : ''), type: 'date', id: 'plan-off',
      value: offInput, min: today,
      'aria-describedby': errors.off ? 'plan-off-error' : null,
      'aria-invalid': errors.off ? 'true' : null,
    });
    for (const type of ['input', 'change']) {
      offField.addEventListener(type, () => { offInput = offField.value; });
    }
    const offRows = draft.days_off.filter((d) => d >= today).map((d) => el('div', { class: 'dayoff' }, [
      el('span', { class: 'dayoff-name', text: dateLabel(d) }),
      button('消す', () => {
        draft.days_off = draft.days_off.filter((x) => x !== d);
        draw();
      }, 'btn btn-quiet btn-small'),
    ]));

    node.appendChild(el('section', { class: 'panel' }, [
      el('label', { class: 'field-label', for: 'plan-exam', text: '受験日' }),
      exam,
      fieldError(errors.exam, 'plan-exam-error'),
      el('p', { class: 'field-label', text: '勉強する曜日' }),
      days,
      fieldError(errors.weekdays, 'plan-days-error'),
      el('label', { class: 'field-label', for: 'plan-off', text: '休む日' }),
      el('div', { class: 'field-row' }, [
        offField,
        button('追加', () => {
          const v = offField.value;
          if (!isDateKey(v)) {
            errors.off = '休む日を入れてください。';
          } else if (v < today) {
            errors.off = '休む日は、今日以降の日を入れてください。';
          } else {
            if (!draft.days_off.includes(v)) draft.days_off = draft.days_off.concat([v]).sort();
            offInput = '';
            errors.off = null;
          }
          draw();
        }, 'btn btn-quiet btn-small'),
      ]),
      fieldError(errors.off, 'plan-off-error'),
      offRows.length ? el('div', { class: 'dayoffs' }, offRows) : null,
      el('div', { class: 'qactions' }, [button('保存する', save, 'btn btn-main')]),
    ]));

    // ---- 1日に解く問題の目安（保存したスケジュールの、開いたときの残りから）
    const plan = ctx.state.plan;
    if (plan && plan.exam_date >= today) {
      const t = dailyTarget(new Date(), ctx.state, ctx.curriculum, ctx.settings);
      const perDay = Math.ceil(t.target);
      node.appendChild(el('section', { class: 'panel' }, [
        el('p', { class: 'field-label', text: '1日に解く問題の目安' }),
        el('p', { class: 'plan-target', text: perDay + '問' }),
      ]));
    }

    // ---- スケジュールを削除する（スケジュールがあるときだけ。受験日をすぎたときは出さない）
    if (planStatus(plan, today) === 'active') {
      node.appendChild(el('div', { class: 'qactions' }, [
        button('スケジュールを削除する', askDelete, 'btn btn-quiet'),
      ]));
    }
  }

  // 画面の中に重ねて確かめる。「削除する」でスケジュールを削除し、ホームに戻る。
  function askDelete() {
    showDialog({
      message: DELETE_MESSAGE,
      yesLabel: '削除する',
      noLabel: '戻る',
      danger: true,
      onYes: () => {
        setPlan(null);
        window.location.hash = '#/';
        toast('スケジュールを削除しました。');
      },
    });
  }

  function save() {
    const today = ctx.todayKey();
    errors = {};
    if (!isDateKey(draft.exam_date)) {
      errors.exam = '受験日を入れてください。';
    } else if (draft.exam_date <= today) {
      errors.exam = '受験日は、明日以降の日を入れてください。';
    }
    if (!draft.weekdays.length) {
      errors.weekdays = '勉強する曜日を1つ以上選んでください。';
    }
    if (errors.exam || errors.weekdays) {
      draw();
      return;
    }
    setPlan({
      exam_date: draft.exam_date,
      weekdays: draft.weekdays.slice().sort((a, b) => a - b),
      days_off: draft.days_off.filter((d) => d >= today),
    });
    ctx.refreshToday(true);
    draw();
    toast('保存しました。');
  }

  draw();
}
