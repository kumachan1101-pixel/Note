/**
 * note.com 画像一括挿入スクリプト
 *
 * 使い方:
 *  1. note.com のエディタ画面を開く
 *  2. H2_INDICES に画像を挿入したい H2 の番号（0始まり）をセット
 *  3. ブラウザのコンソールに貼り付けて実行
 *     → 各 H2 の直後に空段落 + ファイル入力が現れる
 *  4. Claude の file_upload ツールで各 input[type=file] に画像を渡す
 */

const H2_INDICES = [0, 1, 2, 3, 4];
const WAIT_MS = 600;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function setCursorAtEndOfH2(h2) {
  const editor = document.querySelector('.ProseMirror');
  const walker = document.createTreeWalker(h2, NodeFilter.SHOW_TEXT);
  let lastText = null, node;
  while ((node = walker.nextNode())) { lastText = node; }
  if (!lastText) return false;
  const range = document.createRange();
  range.setStart(lastText, lastText.length);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  editor.focus();
  h2.scrollIntoView({ block: 'center' });
  return true;
}

function setCursorOnEmptyP(p) {
  const editor = document.querySelector('.ProseMirror');
  const range = document.createRange();
  range.setStart(p, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  editor.focus();
  p.scrollIntoView({ block: 'center' });
}

async function pressEnterAtEnd(h2) {
  setCursorAtEndOfH2(h2);
  await sleep(200);
  h2.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', code: 'End', keyCode: 35, bubbles: true, cancelable: true }));
  await sleep(100);
  document.querySelector('.ProseMirror').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  await sleep(300);
}

async function clickPlusButton(emptyP) {
  setCursorOnEmptyP(emptyP);
  await sleep(300);
  const plusBtn = document.querySelector('[data-testid="add-block-button"], .plus-button, button[aria-label*="追加"], button[aria-label*="add"]');
  if (plusBtn) { plusBtn.click(); await sleep(400); }
  else {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '+' || b.innerHTML.includes('plus'));
    if (btn) { btn.click(); await sleep(400); }
  }
}

async function clickImageMenuItem() {
  const items = [...document.querySelectorAll('[role="menuitem"], [role="option"], li, .menu-item')];
  const imgItem = items.find(el => el.textContent.trim() === '画像' || el.textContent.includes('画像'));
  if (imgItem) { imgItem.click(); await sleep(500); return true; }
  return false;
}

(async () => {
  const editor = document.querySelector('.ProseMirror');
  if (!editor) { console.error('ProseMirror エディタが見つかりません'); return; }
  const h2s = [...editor.querySelectorAll('h2')];
  console.log('H2 見出し:', h2s.map((h, i) => `[${i}] ${h.textContent.trim().slice(0,30)}`));
  const results = [];
  for (const idx of H2_INDICES) {
    const h2 = h2s[idx];
    if (!h2) { console.warn(`H2[${idx}] なし`); continue; }
    console.log(`▶ H2[${idx}] 処理中...`);
    await pressEnterAtEnd(h2);
    const emptyP = h2.nextElementSibling;
    if (!emptyP) continue;
    await clickPlusButton(emptyP);
    await clickImageMenuItem();
    await sleep(300);
    const count = document.querySelectorAll('input[type="file"]').length;
    console.log(`  → file input: ${count}個`);
    results.push({ h2Index: idx, fileInputCount: count });
    await sleep(WAIT_MS);
  }
  console.log('✅ 完了:', results);
  return results;
})();