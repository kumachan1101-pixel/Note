/**
 * note.com 記事末尾 Kindle本紹介一括追加スクリプト
 * ファイル: src/kindle_book_append.js
 *
 * 【使い方】
 * 1. note.com のエディタ画面（下書き or 公開済み記事の編集）を開く
 * 2. ブラウザのコンソール（F12 → Console タブ）を開く
 * 3. このスクリプト全体を貼り付けて Enter
 * 4. 記事末尾に自動追加される
 * 5. 「公開に進む」→「更新する」で保存
 *
 * 【重要な知見】
 * note.com の ProseMirror エディタに Amazon カードを埋め込むには
 * ClipboardEvent で <figure> 形式のHTMLをペーストする必要がある。
 *
 * NG（カード変換されない）:
 *   dt.setData('text/plain', 'https://www.amazon.co.jp/dp/XXXXXXX')
 *   dt.setData('text/html', '<p>https://www.amazon.co.jp/dp/XXXXXXX</p>')
 *
 * OK（Amazonカードとして埋め込まれる）:
 *   dt.setData('text/html',
 *     '<figure data-src="https://www.amazon.co.jp/dp/XXXXXXX"' +
 *     ' data-identifier="null"' +
 *     ' embedded-service="external-article"' +
 *     ' contenteditable="false" draggable="true"></figure>'
 *   )
 *
 * 【カスタマイズ】
 * KINDLE_BOOKS 配列の amazonUrl を変更して使う。
 * Amazon URL は https://www.amazon.co.jp/dp/[ASIN] 形式で指定。
 */

// ===== 書籍設定（ここを編集して使い回す） =====
const KINDLE_BOOKS = [
  { amazonUrl: 'https://www.amazon.co.jp/dp/B0FR4FNM67' },
  { amazonUrl: 'https://www.amazon.co.jp/dp/B0GSMK45YY' },
];

// ===== メイン処理 =====
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const editor = document.querySelector('.ProseMirror');
  if (!editor) {
    console.error('❌ ProseMirror エディタが見つかりません。note.com のエディタ画面で実行してください。');
    return;
  }

  // --- カーソルを末尾に移動 ---
  editor.focus();
  const lastEl = editor.lastElementChild;
  lastEl.scrollIntoView({ block: 'center' });

  const range = document.createRange();
  range.selectNodeContents(lastEl);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  await sleep(300);

  // --- ヘルパー: ClipboardEvent でHTMLを貼り付ける ---
  const pasteHTML = async (html, waitMs = 500) => {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', '');
    editor.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    );
    await sleep(waitMs);
  };

  // --- 1. イントロ文を独立した2つのPとして追加 ---
  // ※ 1つのpasteHTMLにまとめると本文末尾Pに混入するため、必ず個別に送る
  await pasteHTML('<p>この記事が少しでも参考になった方へ</p>', 500);
  await pasteHTML(
    '<p>関連書籍として以下もあわせて紹介します。Kindle Unlimitedの対象になっている場合は、追加費用なしでそのまま読むことができます。</p>',
    500
  );

  // --- 2. 各書籍のAmazonカードを個別に追加（3秒待機でカード変換を待つ）---
  for (const book of KINDLE_BOOKS) {
    await pasteHTML(
      `<figure data-src="${book.amazonUrl}" data-identifier="null"` +
        ` embedded-service="external-article" contenteditable="false" draggable="true"></figure>`,
      3000
    );
  }

  console.log('✅ Kindle本紹介を末尾に追加しました');
  console.log('あとは「公開に進む」→「更新する」で保存してください');
})();
