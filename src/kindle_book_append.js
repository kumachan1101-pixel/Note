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
 * この形式は、公開済み記事のエディタ DOM を inspect して発見した。
 * （参考記事: https://note.com/rosy_flax9582/n/na4ff430261c2）
 *
 * 【カスタマイズ】
 * KINDLE_BOOKS 配列の title / description / amazonUrl を変更して使う。
 * Amazon URL は https://www.amazon.co.jp/dp/[ASIN] 形式で指定。
 */

// ===== 書籍設定（ここを編集して使い回す） =====
const KINDLE_BOOKS = [
  {
    title: 'SOLID原則 実践ソフトウェア設計',
    description:
      'SOLID原則の「知っている」と「できる」の間にあるギャップを埋めるための実践的な設計ガイドです。' +
      'コード例はC#ですが、言語に依存しない「設計の考え方」に焦点を当てています。',
    amazonUrl: 'https://www.amazon.co.jp/dp/B0FR4FNM67',
  },
  {
    title: 'SOLID原則 C言語ソフトウェア設計',
    description:
      '制約の少ないC言語を題材に、ソフトウェア設計の本質（責任・契約・依存）を体系的に学べる一冊です。' +
      '関数ポインタや構造体などを活用し、オブジェクト指向的な設計を自ら構築しながらSOLID原則を理解できます。',
    amazonUrl: 'https://www.amazon.co.jp/dp/B0GSMK45YY',
  },
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
  const lastEl = editor.lastElementChild;
  const walker = document.createTreeWalker(lastEl, NodeFilter.SHOW_TEXT);
  let lastText = null, node;
  while ((node = walker.nextNode())) lastText = node;

  if (!lastText) {
    // テキストノードがない場合（空の段落）は直接末尾にセット
    const range = document.createRange();
    range.selectNodeContents(lastEl);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  } else {
    const range = document.createRange();
    range.setStart(lastText, lastText.length);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }

  editor.focus();
  lastEl.scrollIntoView({ block: 'center' });
  await sleep(300);

  // --- ヘルパー: ClipboardEvent でHTMLを貼り付ける ---
  const pasteHTML = async (html, waitMs = 600) => {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', '');
    editor.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    );
    await sleep(waitMs);
  };

  // --- 1. 前文 + H3「関連書籍」を追加 ---
  await pasteHTML(
    '<p>この記事が少しでも参考になった方へ<br>' +
    '関連書籍として以下もあわせて紹介します。<br>' +
    'Kindle Unlimitedの対象になっている場合は、追加費用なしでそのまま読むことができます。</p>' +
    '<h3>関連書籍</h3>',
    700
  );

  // --- 2. 各書籍の説明 + Amazonカード figure を追加 ---
  for (const book of KINDLE_BOOKS) {
    // 書籍説明
    await pasteHTML(
      `<p><strong>${book.title}</strong><br>${book.description}</p>`,
      500
    );

    // Amazonカード埋め込み（figure形式必須）
    await pasteHTML(
      `<figure data-src="${book.amazonUrl}" data-identifier="null"` +
      ` embedded-service="external-article" contenteditable="false" draggable="true"></figure>`,
      900
    );
  }

  console.log('✅ Kindle本紹介を末尾に追加しました');
  console.log('あとは「公開に進む」→「更新する」で保存してください');
})();
