#!/usr/bin/env node
/**
 * prep_svg.js — SVG を PNG に変換する（Playwright / ブラウザのフォント描画を使用）
 *
 * cairosvg 等はフォント名が環境に無いと日本語が □（豆腐）になるが、
 * ブラウザ描画なら Windows/Chromium の日本語フォントで正しくレンダリングされる。
 *
 * 使い方:
 *   node prep_svg.js <input.svg> <output.png> [width] [height]
 *   例: node prep_svg.js images/ai-verifiable-output.svg ai-verifiable-output.png 1280 720
 *
 * width/height 省略時は SVG の viewBox / width・height 属性から判定する。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const [, , svgPathArg, pngPathArg, wArg, hArg] = process.argv;
  if (!svgPathArg || !pngPathArg) {
    console.error('使い方: node prep_svg.js <input.svg> <output.png> [width] [height]');
    process.exit(1);
  }
  const svgPath = path.resolve(svgPathArg);
  const pngPath = path.resolve(pngPathArg);
  if (!fs.existsSync(svgPath)) {
    console.error(`❌ SVG が見つかりません: ${svgPath}`);
    process.exit(1);
  }
  const svg = fs.readFileSync(svgPath, 'utf-8');

  // 寸法の決定（引数 > viewBox > width/height 属性）
  let width = parseInt(wArg, 10) || 0;
  let height = parseInt(hArg, 10) || 0;
  if (!width || !height) {
    const vb = svg.match(/viewBox\s*=\s*["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i);
    if (vb) { width = width || Math.round(parseFloat(vb[1])); height = height || Math.round(parseFloat(vb[2])); }
    const wAttr = svg.match(/<svg[^>]*\bwidth\s*=\s*["']([\d.]+)/i);
    const hAttr = svg.match(/<svg[^>]*\bheight\s*=\s*["']([\d.]+)/i);
    if (!width && wAttr) width = Math.round(parseFloat(wAttr[1]));
    if (!height && hAttr) height = Math.round(parseFloat(hAttr[1]));
  }
  if (!width || !height) { width = width || 1280; height = height || 720; }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.setContent(
    `<!DOCTYPE html><html><head><meta charset="utf-8">
     <style>*{margin:0;padding:0}html,body{width:${width}px;height:${height}px;overflow:hidden}
     svg{display:block;width:${width}px;height:${height}px}</style></head>
     <body>${svg}</body></html>`,
    { waitUntil: 'networkidle' }
  );
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch (e) {}
  await page.waitForTimeout(300);
  const el = (await page.$('svg')) || page;
  await el.screenshot({ path: pngPath });
  await browser.close();
  console.log(`✅ 変換完了: ${pngPath} (${width}x${height})`);
})().catch((e) => { console.error('❌ 変換失敗:', e.message); process.exit(1); });
