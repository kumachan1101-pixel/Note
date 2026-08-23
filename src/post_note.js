#!/usr/bin/env node
/**
 * post_note.js - note.com 記事投稿スクリプト（Playwright完全自動版）
 * ファイル: src/post_note.js
 *
 * 【使い方】
 *   # 1. 初回のみ：Chromeをデバッグポート付きで起動
 *   open -a "Google Chrome" --args --remote-debugging-port=9222 --no-first-run
 *
 *   # 2. 依存インストール（初回のみ）
 *   npm install playwright marked
 *
 *   # 3. 設定ファイルを作成（記事ごと）
 *   cp src/post_config.example.json post_config.json
 *   # → post_config.json を編集してタイトル・タグ・画像パスを設定
 *
 *   # 4. 実行（1コマンドで全自動）
 *   node src/post_note.js article.md post_config.json
 *
 * 【動作】
 *   1. article.md を HTML に変換（marked.js）
 *   2. note.com の新規記事ページを開く
 *   3. タイトル入力
 *   4. 本文ペースト
 *   5. 目次挿入
 *   6. カバー画像アップロード（setInputFiles で直接セット）
 *   7. 本文内画像挿入（setInputFiles で直接セット）
 *   8. Kindle末尾追加
 *   9. 投稿後チェック
 *  10. タグ設定・公開
 *
 * 【依存】
 *   npm install playwright marked
 *   （playwright はブラウザのダウンロード不要 — 既存のChromeに接続するため）
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ===== Markdown→HTML変換（convert.js相当の処理をインライン実装） =====
let marked;
try {
  marked = require('marked');
} catch (e) {
  console.error('❌ marked が見つかりません: npm install marked');
  process.exit(1);
}

const renderer = new marked.Renderer();
renderer.heading = (text, level) => {
  if (level === 1) return '';
  return `<h${level}>${text}</h${level}>`;
};
renderer.paragraph = (text) => {
  if (text.startsWith('<img ')) return ''; // 画像行は除外（別途挿入）
  return `<p>${text}</p>`;
};
renderer.table = (header, body) =>
  `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
renderer.tablerow = (content) => `<tr>${content}</tr>`;
renderer.tablecell = (content, flags) => {
  const tag = flags.header ? 'th' : 'td';
  return `<${tag}>${content}</${tag}>`;
};
renderer.code = (code, language) => {
  const lang = language || '';
  return `<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`;
};
renderer.codespan = (code) => `<code>${code}</code>`;
renderer.blockquote = (quote) => `<blockquote>${quote}</blockquote>`;
renderer.list = (body, ordered) => {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${body}</${tag}>`;
};
renderer.listitem = (text) => `<li>${text}</li>`;
renderer.strong = (text) => `<strong>${text}</strong>`;
renderer.em = (text) => `<em>${text}</em>`;
renderer.link = (href, title, text) => `<a href="${href}">${text}</a>`;
renderer.hr = () => '';

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mdToHtml(markdown) {
  marked.setOptions({ renderer, gfm: true, breaks: false });
  return marked.parse(markdown).replace(/^\s*\n/gm, '').trim();
}

// ===== ユーティリティ =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 10000, interval = 300) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await sleep(interval);
  }
  throw new Error('waitFor timeout');
}

// ===== 引数・設定の読み込み =====
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('使い方: node src/post_note.js <article.md> <post_config.json>');
  console.error('');
  console.error('post_config.json の例:');
  console.error(JSON.stringify({
    title: '記事タイトル',
    tags: ['AI', '設計'],
    coverImage: 'cover.jpg',
    bodyImages: [{ file: 'body-image.png', afterText: '段落テキスト（この段落の直後に挿入）' }],
    kindleBooks: [
      'https://www.amazon.co.jp/dp/B0FR4FNM67',
      'https://www.amazon.co.jp/dp/B0GSMK45YY',
    ],
    cdpUrl: 'http://localhost:9222',
    isUpdate: false,      // true: 既存記事の更新, false: 新規作成
    updateNoteId: '',     // isUpdate=true の場合に記事IDを指定
  }, null, 2));
  process.exit(1);
}

const mdPath = path.resolve(args[0]);
const configPath = path.resolve(args[1]);

if (!fs.existsSync(mdPath)) { console.error(`❌ ${mdPath} が見つかりません`); process.exit(1); }
if (!fs.existsSync(configPath)) { console.error(`❌ ${configPath} が見つかりません`); process.exit(1); }

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const {
  title,
  tags = [],
  coverImage,
  bodyImages = [],
  kindleBooks = [],
  cdpUrl = 'http://localhost:9222',
  isUpdate = false,
  updateNoteId = '',
} = config;

const markdown = fs.readFileSync(mdPath, 'utf-8');
const bodyHtml = mdToHtml(markdown);

// ===== メイン処理 =====
(async () => {
  console.log('🔗 Chrome に接続中...');
  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl);
  } catch (e) {
    console.error('❌ Chrome に接続できません。以下を実行してから再試行してください:');
    console.error('   open -a "Google Chrome" --args --remote-debugging-port=9222 --no-first-run');
    process.exit(1);
  }

  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();

  // note.com のエディタページを探す or 新規作成
  let page;
  if (isUpdate && updateNoteId) {
    const editorUrl = `https://editor.note.com/notes/${updateNoteId}/edit/`;
    page = pages.find((p) => p.url().includes(updateNoteId)) || await context.newPage();
    if (!page.url().includes(updateNoteId)) {
      await page.goto(editorUrl, { waitUntil: 'networkidle' });
    }
    console.log(`📝 既存記事編集モード: ${updateNoteId}`);
  } else {
    page = pages.find((p) => p.url().includes('note.com')) || await context.newPage();
    await page.goto('https://note.com/notes/new', { waitUntil: 'networkidle' });
    console.log('📄 新規記事作成モード');
  }

  // ===== 1. タイトル入力 =====
  console.log('✏️  タイトル入力中...');
  await page.waitForSelector('input[placeholder*="タイトル"], input[class*="title"]', { timeout: 10000 });
  await page.evaluate((t) => {
    const input = document.querySelector('input[placeholder*="タイトル"], input[class*="title"]');
    if (!input) throw new Error('タイトルフィールドが見つかりません');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, t);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, title);
  await sleep(500);

  // ===== 2. 本文ペースト =====
  console.log('📋 本文ペースト中...');
  await page.waitForSelector('.ProseMirror', { timeout: 10000 });
  await page.evaluate((html) => {
    const editor = document.querySelector('.ProseMirror');
    editor.focus();
    document.execCommand('selectAll');
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', editor.textContent);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, bodyHtml);
  await sleep(1000);

  // ===== 3. 目次挿入 =====
  console.log('📑 目次挿入中...');
  // Ctrl+Home でエディタ先頭へ
  await page.keyboard.press('Control+Home');
  await sleep(300);
  // 「+」ボタンをクリックして目次を挿入
  await page.evaluate(() => {
    // 先頭ノードにカーソルを設定
    const editor = document.querySelector('.ProseMirror');
    const firstNode = editor.firstChild;
    if (firstNode) {
      const range = document.createRange();
      range.setStart(firstNode, 0);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      editor.focus();
    }
  });
  await sleep(300);

  // 「+」ボタンを探してクリック
  const plusBtn = await page.$('button:has-text("+"), [aria-label*="追加"], [aria-label*="コンテンツ"]');
  if (plusBtn) {
    await plusBtn.click();
    await sleep(400);
    const tocBtn = await page.$('button:has-text("目次")');
    if (tocBtn) {
      await tocBtn.click();
      await sleep(500);
      console.log('✅ 目次挿入完了');
    }
  }

  // TOCが先頭にあるか確認、なければ最初のH2ブロックを下へ移動
  const isTocFirst = await page.evaluate(() => {
    const first = document.querySelector('.ProseMirror')?.firstChild;
    return first?.nodeName?.toLowerCase().includes('table-of-contents') ||
           first?.nodeName?.toLowerCase().includes('toc');
  });
  if (!isTocFirst) {
    // H2にカーソルを置いてCtrl+Shift+Downで下へ移動
    await page.evaluate(() => {
      const h2 = document.querySelector('.ProseMirror h2');
      if (h2) { h2.click(); }
    });
    await page.keyboard.press('Control+Shift+ArrowDown');
    await sleep(300);
  }

  // ===== 4. カバー画像アップロード =====
  if (coverImage) {
    const coverPath = path.resolve(path.dirname(configPath), coverImage);
    if (fs.existsSync(coverPath)) {
      console.log('🖼️  カバー画像アップロード中...');
      // file inputをインターセプト
      const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 5000 }).catch(() => null),
        page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find(
            (b) => (b.getAttribute('aria-label') || '').includes('カバー') ||
                   (b.textContent || '').includes('カバー画像') ||
                   (b.getAttribute('aria-label') || '').includes('画像の配置')
          );
          if (btn) btn.click();
        }),
      ]);
      if (fileChooser) {
        await fileChooser.setFiles(coverPath);
        await sleep(1000);
        // 「保存」ボタンがあればクリック
        const saveBtn = await page.$('button:has-text("保存")');
        if (saveBtn) await saveBtn.click();
        await sleep(500);
        console.log('✅ カバー画像アップロード完了');
      } else {
        console.warn('⚠️  カバー画像のfile chooserが開きませんでした（手動で設定してください）');
      }
    } else {
      console.warn(`⚠️  カバー画像ファイルが見つかりません: ${coverPath}`);
    }
  }

  // ===== 5. 本文内画像挿入 =====
  for (const bodyImage of bodyImages) {
    const imgPath = path.resolve(path.dirname(configPath), bodyImage.file);
    if (!fs.existsSync(imgPath)) {
      console.warn(`⚠️  本文画像が見つかりません: ${imgPath}`);
      continue;
    }

    console.log(`🖼️  本文画像挿入中: ${bodyImage.file} （「${bodyImage.afterText}」の直後）`);

    // 対象段落を探してカーソルを設定
    const found = await page.evaluate((afterText) => {
      const editor = document.querySelector('.ProseMirror');
      const targetP = [...editor.childNodes].find(
        (n) => n.textContent?.trim() === afterText
      );
      if (!targetP) return false;
      const range = document.createRange();
      range.selectNodeContents(targetP);
      range.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      editor.focus();
      targetP.scrollIntoView({ block: 'center' });
      return true;
    }, bodyImage.afterText);

    if (!found) {
      console.warn(`⚠️  対象段落が見つかりません: "${bodyImage.afterText}"`);
      continue;
    }

    await sleep(300);

    // 「+」ボタン → 「画像」を選択してfile chooserをキャプチャ
    const [imgChooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 5000 }).catch(() => null),
      page.evaluate(async () => {
        // 「画像」ボタンが既に表示されている場合
        let imgBtn = [...document.querySelectorAll('button')].find(
          (b) => b.textContent.trim() === '画像' && b.offsetParent !== null
        );
        if (!imgBtn) {
          // 「+」ボタンをクリックしてメニューを開く
          const plusBtn = [...document.querySelectorAll('button')].find(
            (b) => b.offsetParent !== null &&
                   (b.textContent.trim() === '+' || (b.getAttribute('aria-label') || '').includes('追加'))
          );
          if (plusBtn) {
            plusBtn.click();
            await new Promise((r) => setTimeout(r, 400));
            imgBtn = [...document.querySelectorAll('button')].find(
              (b) => b.textContent.trim() === '画像' && b.offsetParent !== null
            );
          }
        }
        if (imgBtn) imgBtn.click();
      }),
    ]);

    if (imgChooser) {
      await imgChooser.setFiles(imgPath);
      await sleep(2000); // アップロード完了を待つ
      console.log(`✅ 本文画像挿入完了: ${bodyImage.file}`);
    } else {
      console.warn(`⚠️  本文画像のfile chooserが開きませんでした: ${bodyImage.file}`);
    }
  }

  // ===== 6. Kindle末尾追加 =====
  if (kindleBooks.length > 0) {
    console.log('📚 Kindle末尾追加中...');
    await page.evaluate(async (books) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const editor = document.querySelector('.ProseMirror');
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

      await pasteHTML('<p>この記事が少しでも参考になった方へ</p>', 500);
      await pasteHTML(
        '<p>関連書籍として以下もあわせて紹介します。Kindle Unlimitedの対象になっている場合は、追加費用なしでそのまま読むことができます。</p>',
        500
      );
      for (const url of books) {
        await pasteHTML(
          `<figure data-src="${url}" data-identifier="null" embedded-service="external-article" contenteditable="false" draggable="true"></figure>`,
          3000
        );
      }
    }, kindleBooks);
    console.log('✅ Kindle末尾追加完了');
  }

  // ===== 7. 投稿後チェック =====
  const check = await page.evaluate((kindleCount) => {
    const editor = document.querySelector('.ProseMirror');
    const nodes = editor ? [...editor.childNodes] : [];
    const hasCover = !!document.querySelector('[class*="eyecatch"] img, [class*="cover"] img');
    const hasBodyImage = nodes.some(
      (n) => n.tagName === 'FIGURE' && n.querySelector?.('img') && !n.getAttribute('embedded-service')
    );
    const kindleCards = nodes.filter(
      (n) => n.getAttribute?.('embedded-service') === 'external-article'
    ).length;
    return { hasCover, hasBodyImage, kindleCards };
  }, kindleBooks.length);

  console.log('\n=== 投稿前チェック ===');
  console.log('表紙画像  :', check.hasCover ? '✅' : '⚠️  未設定');
  console.log('本文画像  :', bodyImages.length === 0 ? '－ (設定なし)' : check.hasBodyImage ? '✅' : '⚠️  未挿入');
  console.log(`Kindle紹介: ${check.kindleCards}冊 ${check.kindleCards >= kindleBooks.length ? '✅' : '⚠️'}`);

  // ===== 8. タグ設定・公開 =====
  console.log('\n🚀 公開フローへ進みます...');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === '公開に進む'
    );
    if (btn) btn.click();
  });
  await page.waitForURL('**/publish/**', { timeout: 10000 });
  await sleep(1000);

  // タグ入力
  if (tags.length > 0) {
    console.log('🏷️  タグ設定中...');
    for (const tag of tags) {
      const tagInput = await page.$('input[placeholder*="タグ"], input[placeholder*="ハッシュ"]');
      if (tagInput) {
        await tagInput.fill(tag);
        await tagInput.press('Enter');
        await sleep(300);
      }
    }
  }

  // 公開 or 更新
  const publishBtnText = isUpdate ? '更新する' : '公開する';
  await page.evaluate((btnText) => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === btnText
    );
    if (btn) btn.click();
  }, publishBtnText);

  await sleep(2000);
  const finalUrl = page.url();
  console.log(`\n✅ 公開完了！`);
  console.log(`   URL: ${finalUrl}`);

  await browser.disconnect();
})().catch((e) => {
  console.error('❌ エラー:', e.message);
  process.exit(1);
});
