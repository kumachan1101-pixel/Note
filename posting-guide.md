# note.com 記事投稿手順（確定版）

最終更新: 2026-08-29

---

## ★ 完全自動化パイプライン（AI非依存・推奨）

座標クリックやスクリーンショット判断を使わず、**セレクタ + JSイベントだけ**で下書きを構築する決定論的な手順を確立済み。AIの判断に依存せず、同じ入力から常に同じ結果が得られる。

### 使うファイル

- `prep_svg.js` … SVG図を PNG に変換（Playwright＝ブラウザのフォント描画。日本語の□化を防ぐ）
- `src/post_note.js` … Playwrightで note を全自動操作（タイトル・本文・カバー・本文画像・Kindle）
- `note_auto_post.js` … 拡張機能/コンソールから流し込む版（同じロジックのブラウザ内ルーチン `window.notePost(cfg)`）
- `post_config.json` … タイトル・タグ・カバー・本文画像位置・Kindle書籍URLを定義

### 手順（例）

```bash
# 1. SVG図をPNGへ変換（フォント化けを防ぐ）
node prep_svg.js images/ai-verifiable-output.svg ai-verifiable-output.png 1280 720

# 2. カバー画像を用意（本文画像とは別ファイル。例: cover.jpg）

# 3. 全自動投稿（下書き作成）
node src/post_note.js article.md post_config.json
```

### この方式で自動化された「判断が要らない」ポイント

- **表 → 箇条書き変換**：note に表機能は無く `<table>` は潰れるため、`mdToHtml` が Markdown の表を自動で箇条書きへ変換する（`| 2列 |`→「**左**：右」、3列以上→「**左** — 見出し：値 ／ …」）。
- **カバー画像ボタン**：`button[data-id="ButtonIcon"]`（座標不要）。
- **本文画像の「+」ボタン**：`button[aria-label="メニューを開く"]`（座標不要）。
- **画像アップロード**：`fileChooser.setFiles()`（Playwright）／ `input.files` への native setter 注入（拡張機能）でOSダイアログを回避。
- **カバー保存**：トリミングの「保存」を**ダイアログが閉じるまでリトライ**（1回では2枚目のダイアログが残ることがある）。
- **Kindleカード**：figureを1枚ずつ連続ペーストすると1枚取りこぼすため、**紹介文＋全figureを空段落区切りで“1回のペースト”**にまとめる。

以降は、上記が使えない場合の手動フロー（Claude in Chrome）の詳細。

---

## 概要

Claude in Chrome（ブラウザ直接操作）で note.com に記事を投稿する。Pythonスクリプト・セッションCookie取得は不要。

記事は以下の要素で構成する：

1. タイトル
2. 本文（Markdown → HTML）
3. **カバー画像（表紙）** ← 本文画像とは必ず別の画像
4. **本文内画像**（特定段落の直後に挿入）
5. **Kindle書籍リンク（末尾）**
6. ハッシュタグ（`#ソフトウェア設計` を含め計5個）

> ⚠️ **カバー画像と本文画像は別物。** 本文中の図解をカバーに流用しないこと。カバーは記事ごとに用意した `cover.jpg` を使う。

---

## 事前準備：画像の用意（SVG→PNG変換）

図解を **SVG** で受け取った場合は、必ず **PNG に変換してから** アップロードする。note の画像アップロードは PNG/JPG を想定しており、SVG のままだと崩れる。

### 日本語フォントの文字化け対策（重要）

SVG 内のフォント指定が `Noto Sans JP` などの場合、変換環境にそのフォント名が無いと **日本語がすべて □（豆腐）になる**。変換前にフォント名を、環境にインストール済みの CJK フォント名へ置換する。

```bash
# フォント名を環境のCJKフォントに置換
sed 's/Noto Sans JP/Noto Sans CJK JP/g; \
     s/Yu Gothic/Noto Sans CJK JP/g; \
     s/Hiragino Kaku Gothic ProN/Noto Sans CJK JP/g' \
     input.svg > fixed.svg

# cairosvg で PNG 変換（本文図は 1280x720、カバーは 1280x670 推奨）
python3 -c "import cairosvg; cairosvg.svg2png(url='fixed.svg', write_to='output.png', output_width=1280, output_height=720)"
```

**確認：** 変換後の PNG を必ず目視で開き、日本語が □ になっていないかチェックする。ファイルサイズが極端に小さい（数KB）場合はフォント未適用の疑い。正しく描画されていれば通常 100KB 前後になる。

---

## 画像アップロードの共通方式（fetch注入・低コスト）

note の画像挿入は OS のファイル選択ダイアログを開く。このダイアログはブラウザ自動化からは操作できず、スクリーンショットもフリーズする。そこで **ローカルHTTPサーバー経由の fetch 注入** を使う。画像バイト列がコンテキストを通らないため、通信コストも最小になる。

### 準備：ローカルサーバー起動

`cors_server.py`（CORS許可付き）を Downloads で起動し、`http://localhost:8989/` から画像を配信する。変換した PNG を Downloads に置く。

### 注入手順

1. **file input を先回りで捕捉するパッチを仕込む**（ネイティブダイアログを封じ、`fetch`した画像を注入）：

```javascript
window.__imgInjected = false;
window.__imgResult = null;
const origClick = HTMLInputElement.prototype.click;
HTMLInputElement.prototype.click = function () {
  if (this.type === 'file') return;      // ネイティブダイアログを封鎖
  return origClick.call(this);
};
window.__imgObserver = new MutationObserver(async (muts) => {
  if (window.__imgInjected) return;
  for (const m of muts) for (const node of m.addedNodes) {
    if (node.nodeType !== 1) continue;
    const inputs = node.matches?.('input[type="file"]')
      ? [node] : [...(node.querySelectorAll?.('input[type="file"]') || [])];
    for (const input of inputs) {
      if (window.__imgInjected) continue;
      window.__imgInjected = true;
      // ?t= と no-store でキャッシュ回避（古い画像配信を防ぐ）
      const resp = await fetch('http://localhost:8989/output.png?t=' + Date.now(), { cache: 'no-store' });
      const blob = await resp.blob();
      const file = new File([blob], 'output.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const ns = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set;
      ns.call(input, dt.files);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      window.__imgResult = 'injected size=' + file.size;
      HTMLInputElement.prototype.click = origClick;   // パッチ解除
    }
  }
});
window.__imgObserver.observe(document.body, { childList: true, subtree: true });
```

2. 画像メニューの「画像」ボタンを **JSで** クリックする（`computer` でのクリックだとダイアログが開いてフリーズする）。パッチが file input を捕捉し、`window.__imgResult` に `injected size=...` が入れば成功。

> **キャッシュ回避を必ず入れる。** 前回、サーバー上の画像を差し替えたのにブラウザが旧版（文字化けPNG）をキャッシュから返し、失敗した。`?t=Date.now()` + `cache:'no-store'` で防ぐ。

---

## 投稿フロー

### 1. 新規ノート作成

`https://note.com/notes/new` に navigate → URLが `note.com/login` になった場合はログイン切れのためユーザーに報告して停止。

### 2. タイトル設定（javascript_tool）

```javascript
const titleEl = document.querySelector('textarea[placeholder="記事タイトル"]');
const titleSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
titleSetter.call(titleEl, 'タイトル文字列');
titleEl.dispatchEvent(new Event('input', { bubbles: true }));
```

### 3. 本文ペースト（javascript_tool 1回）

本文HTMLは Downloads に置いてローカルサーバー経由で `fetch` すると、巨大な文字列をコンテキストに通さずに済む（低コスト）。

```javascript
const resp = await fetch('http://localhost:8989/article_body.html?t=' + Date.now(), { cache: 'no-store' });
const BODY_HTML = await resp.text();

const editor = document.querySelector('.ProseMirror');
editor.focus();
document.execCommand('selectAll');
const dt = new DataTransfer();
dt.setData('text/html', BODY_HTML);
dt.setData('text/plain', editor.textContent);
editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
await new Promise(r => setTimeout(r, 1000));
```

**HTML変換ルール：**
- `##` → `<h2>`
- 先頭の `## タイトル` ラベル行、および `# タイトル`（H1）は本文から除去する（タイトルは別欄で設定するため）
- 画像を入れる位置には空段落を残しておく（後で本文画像を挿入）
- コードブロック → `<pre><code class="language-X">`
- `<table>` タグ使用禁止（ProseMirrorで展開されない）。表は `<p><strong>ラベル</strong> → 値</p>` 形式で書く

**確認：** `document.querySelector('.ProseMirror').textContent.length` で文字数が一致し、`querySelectorAll('h2').length` が想定の見出し数と一致すればOK。二重ペーストで見出し数が倍になっていないか必ず確認する。

### 4. カバー画像アップロード（本文画像とは別の画像）

上部の画像追加ボタン（📷）をクリック → メニューの「画像をアップロード」（推奨 1280×670px）。

「画像アップロードの共通方式」のパッチを仕込んだうえで、「画像をアップロード」を **JSでクリック**。file input が捕捉され `cover.jpg`（＝カバー専用画像）が注入される。

トリミングダイアログが出るので **「保存」ボタン** をクリックして確定する（座標は `scrollIntoView` 後に再取得）。

**成功確認：**
```javascript
// data:image/png または assets.st-note.com を含む img がカバー領域にあればOK
document.querySelectorAll('img').length
```

> スクリーンショットが白く写ることがある（既知のレンダリング問題）。その場合は JS で `img.naturalWidth/naturalHeight` を確認すれば画像読み込みは判定できる。

### 5. 本文内画像の挿入（特定段落の直後）

図解などの本文画像を、指定した段落の直後に挿入する。

1. 対象段落の **次の空段落** にカーソルを置く：

```javascript
const paras = [...document.querySelectorAll('.ProseMirror p')];
const idx = paras.findIndex(p => p.innerText.includes('挿入したい段落の一部テキスト'));
const empty = paras[idx + 1];               // 直後の空段落
const absTop = empty.getBoundingClientRect().top + window.scrollY;
window.scrollTo({ top: Math.max(0, absTop - 200), behavior: 'instant' });
```

2. `computer` で空段落をクリック → 左に出る **「＋」ボタン** をクリック → 画像メニューを開く。
3. 「画像アップロードの共通方式」のパッチを仕込み、本文画像PNGのURLを指定して「画像」を **JSでクリック**して注入。
4. `window.__imgResult` に `injected size=...` が入り、エディタ内に該当図の `img` が増えれば成功。

### 6. Kindle書籍リンクの末尾追加

本文の最後に、定型文＋書籍の埋め込みカードを追加する。書籍URLは記事ごとに `post_config.json` の `kindleBooks` で指定。

```javascript
const books = [
  'https://www.amazon.co.jp/dp/XXXXXXXXXX',
  'https://www.amazon.co.jp/dp/YYYYYYYYYY',
];
const editor = document.querySelector('.ProseMirror');
editor.focus();
const lastEl = editor.lastElementChild;
lastEl.scrollIntoView({ block: 'center' });
const range = document.createRange();
range.selectNodeContents(lastEl);
range.collapse(false);
window.getSelection().removeAllRanges();
window.getSelection().addRange(range);
await new Promise(r => setTimeout(r, 300));

const pasteHTML = async (html, waitMs = 500) => {
  const dt = new DataTransfer();
  dt.setData('text/html', html);
  dt.setData('text/plain', '');
  editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, waitMs));
};

await pasteHTML('<p>この記事が少しでも参考になった方へ</p>', 500);
await pasteHTML('<p>関連書籍として以下もあわせて紹介します。Kindle Unlimitedの対象になっている場合は、追加費用なしでそのまま読むことができます。</p>', 500);
for (const url of books) {
  await pasteHTML(
    `<figure data-src="${url}" data-identifier="null" embedded-service="external-article" contenteditable="false" draggable="true"></figure>`,
    3000   // 埋め込みカード生成に時間がかかるため長めに待つ
  );
}
```

> `<figure ... embedded-service="external-article">` を貼ると note が Amazon の書籍カードに展開する。各URLの後は 3秒待つ。

### 7. 公開設定画面へ移動

「公開に進む」ボタンをクリック：

```javascript
const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '公開に進む');
btn.click();
```

→ URLが `/publish/` に変わればOK。「タイトル、本文を入力してください」トーストが出た場合は閉じて再クリック。

### 8. タグ設定（javascript_tool）

```javascript
const TAGS_ARRAY = ['ソフトウェア設計', 'タグ2', 'タグ3', 'タグ4', 'タグ5'];
const tagEl = document.querySelector('input[placeholder="ハッシュタグを追加する"]');
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

**記事タイプ：** 「無料」を選択（デフォルト）。

### 9. 投稿（javascript_tool）

```javascript
// fireFullClick：単純な .click() は効かないため、完全なPointerEvent/MouseEventシーケンスを使う
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

const publishBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '投稿する');
fireFullClick(publishBtn);
```

→ 数秒後に `location.href` をチェック。URL が `/publish/` から変わっていれば公開完了。「記事が公開されました」ポップアップが出ることもある。

> ⚠️ **テスト時は「公開に進む」以降を実行せず、下書き保存にとどめること。** 公開は本番でのみ行う。

---

## 投稿前チェックリスト

- [ ] タイトルを設定した
- [ ] 本文の見出し数（h2）が想定と一致（二重ペーストなし）
- [ ] **カバー画像を設定した（本文画像とは別の画像）**
- [ ] **本文画像を指定段落の直後に挿入した**
- [ ] 本文画像・カバー画像の日本語が □ になっていない（SVG起因の文字化けなし）
- [ ] **Kindle書籍リンクを末尾に追加した**
- [ ] ハッシュタグを5個設定（`#ソフトウェア設計` を含む）
- [ ] 記事タイプ「無料」を選択

---

## スクリーンショット方針

| タイミング | 要否 |
|---|---|
| タイトル・本文ペースト後 | ❌ 不要（JS戻り値で確認） |
| カバー画像トリミングダイアログ確認 | ✅ 1枚（ダイアログが見えるか確認） |
| 本文画像挿入後 | ✅ 1枚（位置と描画確認） |
| 公開完了確認 | ✅ 1枚（任意） |

**目安：20〜25ターンで完了**

---

## よくあるエラーと対処

| エラー | 対処 |
|---|---|
| `note.com/login` にリダイレクト | ログイン切れ。ユーザーに再ログインを依頼 |
| 画像の日本語が □（豆腐）になる | SVGのフォント名を `Noto Sans CJK JP` 等へ置換してから変換 |
| ファイル選択ダイアログでフリーズ／スクショが白い | `HTMLInputElement.prototype.click` をパッチし、fetch注入方式を使う |
| 差し替えたはずの画像が古いまま | ブラウザキャッシュ。`?t=Date.now()` + `cache:'no-store'` を付ける |
| カバーに本文の図が入ってしまう | カバーと本文画像は別ファイル。カバーは `cover.jpg` を使う |
| 本文が二重になる（h2が倍） | ペースト前に `document.execCommand('selectAll')` で全選択→削除してから貼る |
| 「タイトル・本文を入力してください」トースト | React同期待ち不足。1〜2秒待って再クリック |
| 「保存」ボタンクリック後ダイアログが閉じない | 座標ズレの可能性。`scrollIntoView`後に座標を再取得して再クリック |
| `投稿する` ボタンが反応しない | `fireFullClick` を使っているか確認。単純 `.click()` は不可 |
| Kindleカードが展開されない | 各URLペースト後の待機を 3秒に。`embedded-service="external-article"` の属性を確認 |

---

## 投稿済み記事（ソフトウェア設計シリーズ）

| タイトル | URL |
|---|---|
| まず動かす | https://note.com/rosy_flax9582/n/n68088c41faf0 |
| 非同期処理・責任分離 | https://note.com/rosy_flax9582/n/n9edfbfc70ea3 |
| インターフェースの粒度 | https://note.com/rosy_flax9582/n/ne2a9b0b0b465 |
| チェックリストは始める前に見る | https://note.com/rosy_flax9582/n/n0d32a852dc99 |
| 具体に入り込んだとき抽象に戻る | https://note.com/rosy_flax9582/n/n931c64d23d41 |
| AIとの橋渡しの設計 | https://note.com/rosy_flax9582/n/n97dd8cf6f836 |
| 見えていない部分まで計画に入れる | https://note.com/rosy_flax9582/n/n8f970d167036 |
| 引数だけでは動きが決まらない関数を切り離す | https://note.com/rosy_flax9582/n/nf9f732ec9708 |
