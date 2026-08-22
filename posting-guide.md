# note.com è¨äºæç¨¿æé ï¼ç¢ºå®çï¼

æçµæ´æ°: 2026-07-25

## æ¦è¦

Claude in Chromeï¼ãã©ã¦ã¶ç´æ¥æä½ï¼ã§ note.com ã«è¨äºãæç¨¿ãããPythonã¹ã¯ãªããã»ã»ãã·ã§ã³Cookieåå¾ã¯ä¸è¦ã

---

## æç¨¿ãã­ã¼

### 1. æ°è¦ãã¼ãä½æ

`https://note.com/notes/new` ã« navigate â URLã `note.com/login` ã«ãªã£ãå ´åã¯ã­ã°ã¤ã³åãã®ããã¦ã¼ã¶ã¼ã«å ±åãã¦åæ­¢ã

### 2. ã¿ã¤ãã«è¨­å®ï¼javascript_toolï¼

```javascript
const titleEl = document.querySelector('textarea[placeholder="è¨äºã¿ã¤ãã«"]');
const titleSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
titleSetter.call(titleEl, 'ã¿ã¤ãã«æå­å');
titleEl.dispatchEvent(new Event('input', { bubbles: true }));
```

### 3. æ¬æãã¼ã¹ãï¼javascript_tool 1åï¼

```javascript
const BODY_HTML = `<h2>è¦åºã</h2><p>æ¬æ</p>`;

const editor = document.querySelector('.ProseMirror');
editor.focus();
document.execCommand('selectAll');
const dt = new DataTransfer();
dt.setData('text/html', BODY_HTML);
dt.setData('text/plain', editor.textContent);
editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
await new Promise(r => setTimeout(r, 1000));
```

**HTMLå¤æã«ã¼ã«ï¼**
- `##` â `<h2>`
- ã³ã¼ããã­ãã¯ â `<pre><code class="language-X">`
- `<table>` ã¿ã°ä½¿ç¨ç¦æ­¢ï¼ProseMirrorã§å±éãããªãï¼ãè¡¨ã¯ `<p><strong>ã©ãã«</strong> â å¤</p>` å½¢å¼ã§æ¸ã

**ç¢ºèªï¼** `document.querySelector('.ProseMirror').textContent.length` ã§æå­æ°ãä¸è´ããã°OKãã¹ã¯ãªã¼ã³ã·ã§ããã§ã®ç®è¦ç¢ºèªã¯ä¸è¦ã

### 4. ã«ãã¼ç»åã¢ããã­ã¼ã

#### ã¹ããã1ï¼file input ãåºç¾ããã

```javascript
// ãç»åãè¿½å ããã¿ã³ãã¯ãªãã¯ãã¦ã¡ãã¥ã¼ãåºã
document.querySelector('button[aria-label="ç»åãè¿½å "]').click();
```

â ãç»åãã¢ããã­ã¼ãããã¯ãªãã¯ï¼computer ãã¼ã«ã§ã¡ãã¥ã¼é ç®ãã¯ãªãã¯ï¼

#### ã¹ããã2ï¼file input ãæ¢ã

`read_page(filter:'all', depth:1)` ã§ `button [refN] type="file"` ãæ¢ã

#### ã¹ããã3ï¼ç»åãã¢ããã­ã¼ã

```
file_upload(ref: refN, paths: ["/path/to/image.png"])
```

#### ã¹ããã4ï¼ãä¿å­ããã¿ã³ãã¯ãªãã¯ï¼æ¹åçï¼

2ç§å¾ã£ã¦ããä»¥ä¸ã®JSã§åº§æ¨ãåå¾ãã¦ã¯ãªãã¯ï¼

```javascript
// ä¿å­ãã¿ã³ãç»é¢ä¸­å¤®ã«ã¹ã¯ã­ã¼ã«ãã¦ããåº§æ¨åå¾ï¼ãã¥ã¼ãã¼ãç«¯ã§ã®åº§æ¨ãºã¬é²æ­¢ï¼
const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'ä¿å­');
btn.scrollIntoView({ block: 'center', inline: 'center' });
await new Promise(r => setTimeout(r, 300));
const rect = btn.getBoundingClientRect();
return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 };
```

â è¿ã£ã¦ãã cx, cy ã«ã¹ã±ã¼ã«ä¿æ°ï¼screenshotå¹ / viewportå¹ â 0.817ï¼ãæããåº§æ¨ã§ `computer left_click` ã2åå®è¡ã

**æåç¢ºèªï¼**
```javascript
const imgs = document.querySelectorAll('img');
// URLã« "assets.st-note.com" ãå«ã¾ãã img ãããã°OK
```

### 5. å¬éè¨­å®ç»é¢ã¸ç§»å

ãå¬éã«é²ãããã¿ã³ãã¯ãªãã¯ï¼

```javascript
// ãã¼ã¹ãå¾1ç§ä»¥ä¸å¾ã£ã¦ããã¯ãªãã¯ï¼Reactç¶æåæå¾ã¡ï¼
const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'å¬éã«é²ã');
btn.click();
```

â URLã `/publish/` ã«å¤ããã°OKããã¿ã¤ãã«ãæ¬æãå¥åãã¦ãã ããããã¼ã¹ããåºãå ´åã¯éãã¦åã¯ãªãã¯ã

### 6. ã¿ã°è¨­å®ï¼javascript_toolï¼

```javascript
const TAGS_ARRAY = ['ã½ããã¦ã§ã¢è¨­è¨', 'ã¿ã°2', 'ã¿ã°3', 'ã¿ã°4', 'ã¿ã°5'];
const tagEl = document.querySelector('input[placeholder="ããã·ã¥ã¿ã°ãè¿½å ãã"]');
const tagSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

for (const tag of TAGS_ARRAY) {
  tagSetter.call(tagEl, tag);
  tagEl.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  tagEl.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
  }));
  await new Promise(r => setTimeout(r, 400));
}
```

**ã¿ã°ã®ã«ã¼ã«ï¼** `#ã½ããã¦ã§ã¢è¨­è¨` ã¯å¿ãå«ããè¨äºåå®¹ã«å¿ãã¦åè¨5åè¨­å®ã

### 7. æç¨¿ï¼javascript_toolï¼

```javascript
// fireFullClickï¼åç´ãª .click() ã¯å¹ããªããããå®å¨ãªPointerEvent/MouseEventã·ã¼ã±ã³ã¹ãä½¿ã
function fireFullClick(el) {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
}

const publishBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'æç¨¿ãã');
fireFullClick(publishBtn);
```

â æ°ç§å¾ã« `location.href` ããã§ãã¯ãURL ã `/publish/` ããå¤ãã£ã¦ããã°å¬éå®äºããè¨äºãå¬éããã¾ããããããã¢ãããåºããã¨ãããã

---

## ã¹ã¯ãªã¼ã³ã·ã§ããæ¹é

| ã¿ã¤ãã³ã° | è¦å¦ |
|---|---|
| ã¿ã¤ãã«ã»æ¬æãã¼ã¹ãå¾ | â ä¸è¦ï¼JSæ»ãå¤ã§ç¢ºèªï¼ |
| ã«ãã¼ç»åããªãã³ã°ãã¤ã¢ã­ã°ç¢ºèª | â 1æï¼ãã¤ã¢ã­ã°ãè¦ãããç¢ºèªï¼ |
| å¬éå®äºç¢ºèª | â 1æï¼ä»»æï¼ |

**ç®å®ï¼20ã25ã¿ã¼ã³ã§å®äº**

---

## ããããã¨ã©ã¼ã¨å¯¾å¦

| ã¨ã©ã¼ | å¯¾å¦ |
|---|---|
| `note.com/login` ã«ãªãã¤ã¬ã¯ã | ã­ã°ã¤ã³åããã¦ã¼ã¶ã¼ã«åã­ã°ã¤ã³ãä¾é ¼ |
| ãã¿ã¤ãã«ã»æ¬æãå¥åãã¦ãã ããããã¼ã¹ã | Reactåæå¾ã¡ä¸è¶³ã1ã2ç§å¾ã£ã¦åã¯ãªãã¯ |
| ãä¿å­ããã¿ã³ã¯ãªãã¯å¾ãã¤ã¢ã­ã°ãéããªã | åº§æ¨ãºã¬ã®å¯è½æ§ã`scrollIntoView`å¾ã«åº§æ¨ãååå¾ãã¦åã¯ãªãã¯ |
| `æç¨¿ãã` ãã¿ã³ãåå¿ããªã | `fireFullClick` ãä½¿ã£ã¦ãããç¢ºèªãåç´ `.click()` ã¯ä¸å¯ |

---

## æç¨¿æ¸ã¿è¨äºï¼ã½ããã¦ã§ã¢è¨­è¨ã·ãªã¼ãºï¼

| ã¿ã¤ãã« | URL |
|---|---|
| ã¾ãåãã | https://note.com/rosy_flax9582/n/n68088c41faf0 |
| éåæå¦çã»è²¬ä»»åé¢ | https://note.com/rosy_flax9582/n/n9edfbfc70ea3 |
| ã¤ã³ã¿ã¼ãã§ã¼ã¹ã®ç²åº¦ | https://note.com/rosy_flax9582/n/ne2a9b0b0b465 |
| ãã§ãã¯ãªã¹ãã¯å§ããåã«è¦ã | https://note.com/rosy_flax9582/n/n0d32a852dc99 |
| å·ä½ã«å¥ãè¾¼ãã ã¨ãæ½è±¡ã«æ»ã | https://note.com/rosy_flax9582/n/n931c64d23d41 |
| AIã¨ã®æ©æ¸¡ãã®è¨­è¨ | https://note.com/rosy_flax9582/n/n97dd8cf6f836 |
| è¦ãã¦ããªãé¨åã¾ã§è¨ç»ã«å¥ãã | https://note.com/rosy_flax9582/n/n8f970d167036 |
| å¼æ°ã ãã§ã¯åããæ±ºã¾ããªãé¢æ°ãåãé¢ã | https://note.com/rosy_flax9582/n/nf9f732ec9708 |


---

## Kindle本紹介の記事末尾追加

### 概要

note.com の記事末尾に Kindle 本紹介ブロック（前文 + H3見出し + 書籍説明 + Amazonカード）を追加する手順。  
スクリプト: `src/kindle_book_append.js`

### Amazon カード埋め込みの仕組み（重要）

note.com エディタに Amazon カードを埋め込むには **`<figure>` 形式の ClipboardEvent ペースト** が必須。

| 方法 | 結果 |
|------|------|
| `<p>https://www.amazon.co.jp/dp/XXXX</p>` をペースト | ❌ URLテキストのまま（カード変換なし） |
| `text/plain` で URL をペースト | ❌ 同上 |
| `<figure embedded-service="external-article" data-src="URL">` をペースト | ✅ Amazonカード表示 |

```javascript
// Amazonカード埋め込みのコアコード
const figHtml =
  '<figure data-src="https://www.amazon.co.jp/dp/B0FR4FNM67"' +
  ' data-identifier="null"' +
  ' embedded-service="external-article"' +
  ' contenteditable="false" draggable="true"></figure>';

const dt = new DataTransfer();
dt.setData('text/html', figHtml);
dt.setData('text/plain', '');
editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
```

この形式は公開済み記事（`https://note.com/rosy_flax9582/n/na4ff430261c2`）のエディタ DOM を inspect して発見した。

### 手順

1. note.com エディタ画面を開く（下書き or 公開済み記事の編集）
2. ブラウザのコンソール（F12 → Console）を開く
3. `src/kindle_book_append.js` の内容を全コピー → コンソールに貼り付け → Enter
4. 記事末尾に以下が自動挿入される：
   - 前文段落（「この記事が少しでも参考になった方へ...」）
   - H3「関連書籍」
   - 書籍タイトル・説明文（P タグ）
   - Amazon カード（`<figure embedded-service="external-article">`）× 書籍数
5. コンソールに「✅ Kindle本紹介を末尾に追加しました」と表示されたら成功
6. 「公開に進む」→「更新する」で保存

### 書籍・テキストのカスタマイズ

`src/kindle_book_append.js` 内の `KINDLE_BOOKS` 配列を編集するだけで書籍情報を変更できる：

```javascript
const KINDLE_BOOKS = [
  {
    title: '書籍タイトル',
    description: '書籍説明文',
    amazonUrl: 'https://www.amazon.co.jp/dp/[ASIN]',
  },
  // 追加書籍はここに続ける
];
```

### トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| Amazonカードが表示されずURLテキストになる | figure形式以外でペーストしている | `text/html` に `<figure embedded-service="external-article">` を使う |
| 前文が末尾でなく途中に挿入される | カーソル位置がずれている | TreeWalker で末尾テキストノードに setStart してから paste |
| 前文がH3の中に入り込む | ペースト時の選択範囲がH3内にある | H3の中身を選択した状態でペーストしない。カーソルをH3の**前**の段落末尾に置く |
| 同じテキストが二重になる | ペースト時にカーソルが段落末尾にあり既存テキストに追記された | 段落全体を selectNodeContents で選択してからペーストし既存内容を置き換える |
