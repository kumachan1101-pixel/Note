# note.com 記事投稿手順（確定版）

最終更新: 2026-07-25

## 概要

Claude in Chrome（ブラウザ直接操作）で note.com に記事を投稿する。Pythonスクリプト・セッションCookie取得は不要。

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

```javascript
const BODY_HTML = `<h2>見出し</h2><p>本文</p>`;

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
- コードブロック → `<pre><code class="language-X">`
- `<table>` タグ使用禁止（ProseMirrorで展開されない）。表は `<p><strong>ラベル</strong> → 値</p>` 形式で書く

**確認：** `document.querySelector('.ProseMirror').textContent.length` で文字数が一致すればOK。スクリーンショットでの目視確認は不要。

### 4. カバー画像アップロード

#### ステップ1：file input を出現させる

```javascript
// 「画像を追加」ボタンをクリックしてメニューを出す
document.querySelector('button[aria-label="画像を追加"]').click();
```

→ 「画像をアップロード」をクリック（computer ツールでメニュー項目をクリック）

#### ステップ2：file input を探す

`read_page(filter:'all', depth:1)` で `button [refN] type="file"` を探す

#### ステップ3：画像をアップロード

```
file_upload(ref: refN, paths: ["/path/to/image.png"])
```

#### ステップ4：「保存」ボタンをクリック（改善版）

2秒待ってから以下のJSで座標を取得してクリック：

```javascript
// 保存ボタンを画面中央にスクロールしてから座標取得（ビューポート端での座標ズレ防止）
const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '保存');
btn.scrollIntoView({ block: 'center', inline: 'center' });
await new Promise(r => setTimeout(r, 300));
const rect = btn.getBoundingClientRect();
return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 };
```

→ 返ってきた cx, cy にスケール係数（screenshot幅 / viewport幅 ≈ 0.817）を掛けた座標で `computer left_click` を2回実行。

**成功確認：**
```javascript
const imgs = document.querySelectorAll('img');
// URLに "assets.st-note.com" が含まれる img があればOK
```

### 5. 公開設定画面へ移動

「公開に進む」ボタンをクリック：

```javascript
// ペースト後1秒以上待ってからクリック（React状態同期待ち）
const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '公開に進む');
btn.click();
```

→ URLが `/publish/` に変わればOK。「タイトル、本文を入力してください」トーストが出た場合は閉じて再クリック。

### 6. タグ設定（javascript_tool）

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

**タグのルール：** `#ソフトウェア設計` は必ず含め、記事内容に応じて合計5個設定。

### 7. 投稿（javascript_tool）

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

---

## スクリーンショット方針

| タイミング | 要否 |
|---|---|
| タイトル・本文ペースト後 | ❌ 不要（JS戻り値で確認） |
| カバー画像トリミングダイアログ確認 | ✅ 1枚（ダイアログが見えるか確認） |
| 公開完了確認 | ✅ 1枚（任意） |

**目安：20〜25ターンで完了**

---

## よくあるエラーと対処

| エラー | 対処 |
|---|---|
| `note.com/login` にリダイレクト | ログイン切れ。ユーザーに再ログインを依頼 |
| 「タイトル・本文を入力してください」トースト | React同期待ち不足。1〜2秒待って再クリック |
| 「保存」ボタンクリック後ダイアログが閉じない | 座標ズレの可能性。`scrollIntoView`後に座標を再取得して再クリック |
| `投稿する` ボタンが反応しない | `fireFullClick` を使っているか確認。単純 `.click()` は不可 |

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
