#!/usr/bin/env node
/**
 * convert.js - Markdown → note.com 用 HTML 変換スクリプト
 * ファイル: src/convert.js
 *
 * 【使い方】
 *   node src/convert.js article.md
 *   → stdout に HTML を出力（post_article.js の本文ペーストに使う）
 *
 * 【依存】
 *   npm install marked   （初回のみ）
 *
 * 【変換ルール】
 *   ## 見出し → <h2>
 *   ### 見出し → <h3>
 *   段落       → <p>
 *   太字       → <strong>
 *   リンク     → <a href="...">
 *   テーブル   → <table><thead><tr><th>...<tbody><tr><td>...
 *   コードブロック → <pre><code class="language-X">...
 *   インラインコード → <code>
 *   引用       → <blockquote><p>
 *   番号リスト → <ol><li>
 *   箇条書き   → <ul><li>
 *   水平線     → （無視：note.comでは使用しない）
 *   画像       → （プレースホルダーコメントとして出力）
 *
 * 【注意】
 *   - ## タイトル行（記事タイトル）は出力から除外される
 *   - 画像は post_article.js の prepareBodyImage() で別途挿入すること
 */

const fs = require('fs');
const path = require('path');

// marked がインストールされているか確認
let marked;
try {
  marked = require('marked');
} catch (e) {
  console.error('❌ marked がインストールされていません。以下を実行してください:');
  console.error('   npm install marked');
  process.exit(1);
}

// ===== カスタムレンダラー（note.com用） =====
const renderer = new marked.Renderer();

// 見出し
renderer.heading = (text, level) => {
  if (level === 1) return ''; // H1（記事タイトル）は除外
  return `<h${level}>${text}</h${level}>`;
};

// 段落（画像タグが含まれる場合はコメントとして出力）
renderer.paragraph = (text) => {
  if (text.startsWith('<img ')) {
    // 画像はプレースホルダーとして出力
    const altMatch = text.match(/alt="([^"]+)"/);
    const alt = altMatch ? altMatch[1] : '画像';
    return `<!-- IMAGE: ${alt} → post_article.js の prepareBodyImage() で挿入 -->`;
  }
  return `<p>${text}</p>`;
};

// テーブル
renderer.table = (header, body) => {
  return `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
};
renderer.tablerow = (content) => `<tr>${content}</tr>`;
renderer.tablecell = (content, flags) => {
  const tag = flags.header ? 'th' : 'td';
  return `<${tag}>${content}</${tag}>`;
};

// コードブロック
renderer.code = (code, language) => {
  const lang = language || '';
  return `<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`;
};

// インラインコード
renderer.codespan = (code) => `<code>${code}</code>`;

// 引用
renderer.blockquote = (quote) => `<blockquote>${quote}</blockquote>`;

// リスト
renderer.list = (body, ordered) => {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${body}</${tag}>`;
};
renderer.listitem = (text) => `<li>${text}</li>`;

// 強調
renderer.strong = (text) => `<strong>${text}</strong>`;
renderer.em = (text) => `<em>${text}</em>`;

// リンク
renderer.link = (href, title, text) => `<a href="${href}">${text}</a>`;

// 水平線（note.comでは使用しないため無視）
renderer.hr = () => '';

// ===== HTML エスケープ =====
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== メイン処理 =====
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('使い方: node src/convert.js <article.md>');
  process.exit(1);
}

const inputPath = path.resolve(args[0]);
if (!fs.existsSync(inputPath)) {
  console.error(`❌ ファイルが見つかりません: ${inputPath}`);
  process.exit(1);
}

const markdown = fs.readFileSync(inputPath, 'utf-8');

// marked の設定
marked.setOptions({
  renderer,
  gfm: true,     // GitHub Flavored Markdown（テーブル対応）
  breaks: false, // 改行を <br> に変換しない
});

const html = marked.parse(markdown)
  // 空行を除去
  .replace(/^\s*\n/gm, '')
  // HTMLコメント行の前後の空白を整理
  .trim();

// ===== 出力 =====
// ヘッダー情報（コメント）
process.stderr.write(`✅ 変換完了: ${path.basename(inputPath)}\n`);
process.stderr.write(`   出力をコピーして post_article.js の本文ペーストに使ってください\n`);

// HTML をそのまま stdout に出力
process.stdout.write(html + '\n');
