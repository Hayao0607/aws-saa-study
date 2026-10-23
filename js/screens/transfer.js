// 記録を移すページ（段階6-22j）。サーバーは使わず、この端末の学習の記録を JSON ファイルに書き出し、
// 別の端末でそのファイルを読み込む（読み込みは置き換えだけ。足し合わせはしない）。
// ファイルの形：{ app: 'aws-saa-study', kind: 'study-record', exported_at: '2026-10-23T17:14:00+09:00',
//                 version: 8, state: 保存している記録そのまま }
import { el, clear, button, heading, toast, showDialog, BACK_HOME } from '../ui.js?v=dc64bc235b';
import { exportState, replaceState } from '../storage.js?v=dc64bc235b';
import { VERSION } from '../logic/migrate.js?v=dc64bc235b';

const APP_NAME = 'aws-saa-study';
const KIND = 'study-record';
const BAD_FILE = 'このファイルは読み込めません。このアプリで書き出したファイルを選んでください。';
const NEWER_FILE = 'このファイルは、新しい版のアプリで書き出されています。アプリを開き直してから、もう一度読み込んでください。';

const pad = (n) => String(n).padStart(2, '0');

// 端末の時刻で「2026-10-23T17:14:00+09:00」の形（時差つき）。
function isoLocal(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    + sign + pad(Math.floor(a / 60)) + ':' + pad(a % 60);
}

// ファイル名：aws-saa-study-記録-YYYYMMDD-HHMM.json（書き出した日時。端末の時刻）
function fileName(d) {
  return APP_NAME + '-記録-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
    + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
}

const isPlainObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isVersion = (v) => Number.isInteger(v) && v >= 1;

// 読み込んだ文字を確かめる。返す値：{ ok: true, doc } か { ok: false, message }。
// 版は、ファイルの version と state の中の version の両方を見る（どちらかが今の版より大きければ「新しい版」）。
function checkFile(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: BAD_FILE };
  }
  if (!isPlainObject(doc) || doc.app !== APP_NAME || doc.kind !== KIND || !isPlainObject(doc.state)) {
    return { ok: false, message: BAD_FILE };
  }
  if ((isVersion(doc.version) && doc.version > VERSION) || (isVersion(doc.state.version) && doc.state.version > VERSION)) {
    return { ok: false, message: NEWER_FILE };
  }
  // 版の分からない記録は、移し替えで初めの状態になってしまうため読み込まない
  if (!isVersion(doc.version) || !isVersion(doc.state.version)) return { ok: false, message: BAD_FILE };
  return { ok: true, doc };
}

// 確認の文の「10月23日 17:14」（exported_at から。この端末の時刻で出す）。読めなければ null。
function exportedLabel(value) {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function render(ctx, root) {
  const node = clear(root);
  node.appendChild(heading('記録を移す', BACK_HOME));

  const intro = el('p', { class: 'transfer-lead', text: '別の端末で続きをするときは、この端末で記録を書き出し、そのファイルを別の端末で読み込みます。' });
  const steps = el('ol', { class: 'steps' }, [
    el('li', { text: 'この端末で「記録を書き出す」を押す（ファイルが保存されます）' }),
    el('li', { text: 'そのファイルを、メールや LINE などで別の端末に送り、保存する' }),
    el('li', { text: '別の端末のこのページで「記録を読み込む」を押し、そのファイルを選ぶ' }),
  ]);

  if (!ctx.storageAvailable) {
    node.appendChild(el('section', { class: 'panel' }, [
      intro, steps,
      el('p', { class: 'notice notice-warn', text: 'このブラウザでは記録を保存できないため、記録を移せません。' }),
    ]));
    return;
  }

  // 見えないファイルの入力（「記録を読み込む」のボタンから開く）
  const input = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      input.value = ''; // 同じファイルをもう一度選んでも読み込めるように
      readFile(String(reader.result || ''));
    };
    reader.onerror = () => {
      input.value = '';
      showDialog({ message: BAD_FILE, yesLabel: '閉じる', single: true });
    };
    reader.readAsText(file, 'utf-8');
  });

  node.appendChild(el('section', { class: 'panel' }, [
    intro,
    steps,
    el('div', { class: 'qactions' }, [
      button('記録を書き出す', exportRecord, 'btn btn-main'),
      button('記録を読み込む', () => { input.value = ''; input.click(); }, 'btn btn-quiet'),
    ]),
    input,
    el('p', { class: 'note transfer-note', text: '読み込むと、その端末の記録は、読み込んだ記録に置き換わります。' }),
  ]));

  // 書き出す：Blob と a[download] でファイルを保存させる（記録は変えない）
  function exportRecord() {
    const now = new Date();
    const doc = {
      app: APP_NAME,
      kind: KIND,
      exported_at: isoLocal(now),
      version: VERSION,
      state: exportState(),
    };
    const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: fileName(now), class: 'visually-hidden' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('記録を書き出しました。');
  }

  // 読み込む：確かめて、確認のあと置き換える
  function readFile(text) {
    const r = checkFile(text);
    if (!r.ok) {
      showDialog({ message: r.message, yesLabel: '閉じる', single: true });
      return;
    }
    const when = exportedLabel(r.doc.exported_at);
    showDialog({
      message: when
        ? 'この端末の記録を、' + when + ' に書き出した記録に置き換えます。よろしいですか？'
        : '書き出した記録に置き換えます。よろしいですか？',
      yesLabel: '置き換える',
      noLabel: '戻る',
      onYes: () => {
        replaceState(r.doc.state);
        ctx.refreshToday(true);
        window.location.hash = '#/';
        toast('記録を読み込みました。');
      },
    });
  }
}
