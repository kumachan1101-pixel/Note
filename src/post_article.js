/**
 * post_article.js - note.com 記事投稿支援スクリプト（統合版）
 * ファイル: src/post_article.js
 *
 * 【使い方】
 * 1. note.com のエディタ画面を開く
 * 2. ブラウザのコンソール（F12 → Console）を開く
 * 3. このスクリプト全体を貼り付けて Enter
 * 4. 以下の関数を順番に実行する
 *
 * 【関数一覧】
 *   await window.prepareCoverImage()   // カバー画像のfile input準備
 *   await window.prepareBodyImage()    // 本文画像のfile input準備
 *   await window.appendKindleBooks()   // Kindle末尾追加（完全自動）
 *   window.validateArticle()           // 投稿後チェック
 *
 * 【重要】
 * prepareCoverImage / prepareBodyImage は file inputをキャプチャして止まる。
 * その後、Claude の file_upload ツールで画像をセットすること。
 * ブラウザのJSはセキュリティ制限上、ローカルファイルを直接セットできない。
 */

// ===== 設定（記事ごとに変更する） =====
const CONFIG = {
  // Kindle本のAmazon URL
  KINDLE_BOOKS: [
    { amazonUrl: 'https://www.amazon.co.jp/dp/B0FR4FNM67' },
    { amazonUrl: 'https://www.amazon.co.jp/dp/B0GSMK45YY' },
  ],
  // 本文画像を挿入する段落のテキスト（この段落の直後に画像を挿入）
  BODY_IMAGE_AFTER_TEXT: 'AIへの依頼でも同じだと考えています。',
};

// ===== ユーティリティ =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const setupFileInterceptor = () => {
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') {
      window._capturedInput = this;
      console.log('📎 file input キャプチャ完了 → Claude file_upload でセットしてください');
      return;
    }
    return orig.call(this);
  };
};

// ===== 1. カバー画像のfile inputをキャプチャ =====
window.prepareCoverImage = async () => {
  setupFileInterceptor();
  window._capturedInput = null;

  // カバー画像ボタンを探す（aria-label または テキストで）
  const btn = [...document.querySelectorAll('button')].find(
    (b) =>
      (b.getAttribute('aria-label') || '').includes('カバー') ||
      (b.textContent || '').trim().includes('カバー画像') ||
      (b.getAttribute('aria-label') || '').includes('画像の配置')
  );

  if (!btn) {
    console.error('❌ カバー画像ボタンが見つかりません');
    return false;
  }

  btn.click();
  await sleep(500);

  if (window._capturedInput) {
    console.log('✅ カバー画像 file input 準備完了');
    return true;
  }
  console.error('❌ file input がキャプチャされませんでした（インターセプター設定後にボタンをクリックし直してください）');
  return false;
};

// ===== 2. 本文内指定位置に画像のfile inputをキャプチャ =====
window.prepareBodyImage = async (afterText) => {
  setupFileInterceptor();
  window._capturedInput = null;

  const targetText = afterText || CONFIG.BODY_IMAGE_AFTER_TEXT;
  const editor = document.querySelector('.ProseMirror');
  if (!editor) {
    console.error('❌ ProseMirror エディタが見つかりません');
    return false;
  }

  // 対象段落を探す
  const targetP = [...editor.childNodes].find(
    (n) => n.textContent?.trim() === targetText
  );
  if (!targetP) {
    console.error('❌ 対象段落が見つかりません:', targetText);
    console.log('ヒント: CONFIG.BODY_IMAGE_AFTER_TEXT を確認してください');
    return false;
  }

  // カーソルを末尾に設定
  const range = document.createRange();
  range.selectNodeContents(targetP);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  editor.focus();
  targetP.scrollIntoView({ block: 'center' });
  await sleep(300);

  // 「画像」ボタンを探す（+メニューが開いている場合）
  let imgBtn = [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === '画像' && b.offsetParent !== null
  );

  // 見つからない場合は「+」ボタンをクリックしてメニューを開く
  if (!imgBtn) {
    // aria-label="コンテンツを追加" などの追加ボタンを探す
    const plusBtns = [...document.querySelectorAll('button')].filter(
      (b) => b.offsetParent !== null && (b.textContent.trim() === '+' || (b.getAttribute('aria-label') || '').includes('追加'))
    );
    if (plusBtns.length > 0) {
      plusBtns[0].click();
      await sleep(400);
      imgBtn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === '画像' && b.offsetParent !== null
      );
    }
  }

  if (!imgBtn) {
    console.error('❌ 「画像」ボタンが見つかりません。手動で + → 画像 をクリックしてください');
    return false;
  }

  imgBtn.click();
  await sleep(500);

  if (window._capturedInput) {
    console.log('✅ 本文画像 file input 準備完了（対象段落の直後）');
    return true;
  }
  console.error('❌ file input がキャプチャされませんでした');
  return false;
};

// ===== 3. Kindle末尾追加（完全自動） =====
window.appendKindleBooks = async () => {
  const editor = document.querySelector('.ProseMirror');
  if (!editor) {
    console.error('❌ ProseMirror エディタが見つかりません');
    return false;
  }

  // カーソルを末尾に移動
  editor.focus();
  const lastEl = editor.lastElementChild;
  lastEl.scrollIntoView({ block: 'center' });
  const range = document.createRange();
  range.selectNodeContents(lastEl);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  await sleep(300);

  const pasteHTML = async (html, waitMs = 500) => {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', '');
    editor.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    );
    await sleep(waitMs);
  };

  // イントロ文（2段落に分けて貼り付け）
  await pasteHTML('<p>この記事が少しでも参考になった方へ</p>', 500);
  await pasteHTML(
    '<p>関連書籍として以下もあわせて紹介します。Kindle Unlimitedの対象になっている場合は、追加費用なしでそのまま読むことができます。</p>',
    500
  );

  // 各書籍のAmazonカードを個別追加（3秒待機でカード変換を待つ）
  for (const book of CONFIG.KINDLE_BOOKS) {
    await pasteHTML(
      `<figure data-src="${book.amazonUrl}" data-identifier="null"` +
        ` embedded-service="external-article" contenteditable="false" draggable="true"></figure>`,
      3000
    );
  }

  console.log('✅ Kindle本紹介を末尾に追加しました');
  console.log('あとは「公開に進む」→「更新する」で保存してください');
  return true;
};

// ===== 4. 投稿後バリデーション =====
window.validateArticle = () => {
  const editor = document.querySelector('.ProseMirror');
  if (!editor) {
    console.error('❌ エディタが見つかりません（公開後は記事ページで確認してください）');
    return null;
  }

  const nodes = [...editor.childNodes];
  const hasCover = !!document.querySelector('[class*="eyecatch"] img, [class*="cover"] img');
  const hasBodyImage = nodes.some(
    (n) => n.tagName === 'FIGURE' && n.querySelector?.('img') && !n.getAttribute('embedded-service')
  );
  const kindleCards = nodes.filter(
    (n) => n.getAttribute?.('embedded-service') === 'external-article'
  ).length;

  console.log('=== 投稿後チェック ===');
  console.log('表紙画像  :', hasCover ? '✅ 設定済み' : '❌ 未設定');
  console.log('本文画像  :', hasBodyImage ? '✅ 挿入済み' : '❌ 未挿入');
  console.log('Kindle紹介:', kindleCards > 0 ? `✅ ${kindleCards}冊` : '❌ 未設定');

  const allOk = hasCover && hasBodyImage && kindleCards >= CONFIG.KINDLE_BOOKS.length;
  console.log('総合     :', allOk ? '✅ 問題なし' : '⚠️ 要確認');

  return { hasCover, hasBodyImage, kindleCards, allOk };
};

// ===== 読み込み完了メッセージ =====
console.log(`
✅ post_article.js 読み込み完了

【実行順序】
  1. await window.prepareCoverImage()   → file input準備 → Claudeがカバー画像をセット
  2. await window.prepareBodyImage()    → file input準備 → Claudeが本文画像をセット
  3. await window.appendKindleBooks()   → Kindle末尾追加（自動）
  4. window.validateArticle()           → チェック（問題なければ「公開に進む」→「更新する」）

【設定変更】
  CONFIG.KINDLE_BOOKS         : Kindle本のAmazon URL
  CONFIG.BODY_IMAGE_AFTER_TEXT: 本文画像を挿入する段落のテキスト
`);
