/**
 * note_auto_post.js — note.com 記事の下書きを決定論的に構築する
 *
 * 特徴: 座標クリック・スクリーンショット判断を一切使わない。
 *       すべてセレクタ + JSイベントで完結するため、AIの判断に依存しない。
 *       同じロジックを post_note.js(Playwright) の page.evaluate にも移植可能。
 *
 * 使い方（ブラウザのページ内で）:
 *   window.notePost({
 *     serverBase: 'http://localhost:8989',
 *     title: '記事タイトル',
 *     bodyHtmlUrl: 'article_body.html',      // 本文HTML(表は箇条書き済み, 画像位置は <p id="img-slot">)
 *     coverImage: 'cover.jpg',               // カバー画像ファイル名（本文画像とは別）
 *     bodyImage: {                           // 本文内画像（省略可）
 *       file: 'ai-verifiable-output.png',
 *       afterText: 'AIへの依頼でも同じだと考えています。'
 *     },
 *     kindleBooks: [                         // Kindle書籍URL（省略可）
 *       'https://www.amazon.co.jp/dp/B0FR4FNM67',
 *       'https://www.amazon.co.jp/dp/B0GSMK45YY'
 *     ]
 *   }).then(r => console.log(JSON.stringify(r)));
 *
 * 公開(投稿する/更新する)は安全のためこの関数には含めない。別途手動で行う。
 */
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 指定URLの画像を fetch して File を返す（キャッシュ回避付き）
  async function fetchFile(url, name, mime) {
    const resp = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    const blob = await resp.blob();
    return new File([blob], name, { type: mime });
  }

  // 次に現れる file input に File を注入し、OSダイアログを封じる
  function armFileInjection(file, timeoutMs = 8000) {
    return new Promise((resolve) => {
      let done = false;
      const origClick = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function () {
        if (this.type === 'file') return; // ネイティブダイアログを封鎖
        return origClick.call(this);
      };
      const finish = (result) => {
        if (done) return;
        done = true;
        obs.disconnect();
        HTMLInputElement.prototype.click = origClick;
        resolve(result);
      };
      const obs = new MutationObserver((muts) => {
        if (done) return;
        for (const m of muts) for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const inputs = node.matches && node.matches('input[type="file"]')
            ? [node]
            : (node.querySelectorAll ? [...node.querySelectorAll('input[type="file"]')] : []);
          for (const input of inputs) {
            const dt = new DataTransfer();
            dt.items.add(file);
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(input, dt.files);
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            finish('injected size=' + file.size);
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => finish('timeout: file input not found'), timeoutMs);
    });
  }

  // 完全クリック（単純 .click() で反応しない要素向け）
  function fireFullClick(el) {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  }

  const byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => (e.textContent || '').trim() === text);
  const byTextStarts = (sel, text) => [...document.querySelectorAll(sel)].find((e) => (e.textContent || '').trim().startsWith(text));

  async function pasteHtmlAtSelection(html, waitMs = 700) {
    const editor = document.querySelector('.ProseMirror');
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', '');
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    await sleep(waitMs);
  }

  async function notePost(cfg) {
    const report = { steps: {} };
    const base = cfg.serverBase.replace(/\/$/, '');
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return { error: 'editor(.ProseMirror) not found' };

    // 1. タイトル
    const ta = document.querySelector('textarea[placeholder*="タイトル"]');
    if (ta) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, cfg.title);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      report.steps.title = 'ok';
    } else report.steps.title = 'title textarea not found';

    // 2. 本文
    const bodyHtml = await (await fetch(base + '/' + cfg.bodyHtmlUrl + '?t=' + Date.now(), { cache: 'no-store' })).text();
    editor.focus();
    const first = editor.firstChild;
    if (first) {
      const range = document.createRange();
      range.setStart(first, 0); range.collapse(true);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    }
    await pasteHtmlAtSelection(bodyHtml, 900);
    report.steps.body = { h2: editor.querySelectorAll('h2').length, chars: editor.innerText.length };

    // 3. カバー画像
    if (cfg.coverImage) {
      const coverBtn = document.querySelector('button[data-id="ButtonIcon"]');
      if (coverBtn) {
        const file = await fetchFile(base + '/' + cfg.coverImage, cfg.coverImage, 'image/jpeg');
        const inj = armFileInjection(file);
        coverBtn.click();
        await sleep(700);
        const uploadItem = byTextStarts('button, a, li, [role="menuitem"]', '画像をアップロード');
        if (uploadItem) uploadItem.click();
        report.steps.cover = await inj;
        // トリミングダイアログの「保存」を、ダイアログが閉じるまでリトライする。
        // （crop描画前にクリックが空振りして、2枚目のダイアログが残ることがあるため）
        let saved = false;
        for (let attempt = 0; attempt < 6; attempt++) {
          await sleep(1000);
          const saveBtn = byText('button', '保存');
          if (!saveBtn) { saved = true; break; } // ダイアログ無し＝閉じた
          fireFullClick(saveBtn);
          await sleep(1200);
          if (!byText('button', '保存')) { saved = true; break; }
        }
        report.steps.coverSave = saved ? 'ok' : 'dialog not closed';
      } else report.steps.cover = 'cover button not found';
    }

    // 4. 本文内画像
    if (cfg.bodyImage && cfg.bodyImage.file && cfg.bodyImage.afterText) {
      const paras = [...editor.querySelectorAll('p')];
      const idx = paras.findIndex((p) => p.innerText.includes(cfg.bodyImage.afterText));
      const empty = paras[idx + 1];
      if (idx >= 0 && empty) {
        empty.scrollIntoView({ block: 'center' });
        const range = document.createRange();
        range.selectNodeContents(empty); range.collapse(true);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        editor.focus();
        await sleep(500);
        const plusBtn = document.querySelector('button[aria-label="メニューを開く"]');
        if (plusBtn) {
          const file = await fetchFile(base + '/' + cfg.bodyImage.file, cfg.bodyImage.file, 'image/png');
          const inj = armFileInjection(file);
          plusBtn.click();
          await sleep(700);
          const imgItem = byText('button', '画像');
          if (imgItem) imgItem.click();
          report.steps.bodyImage = await inj;
          await sleep(1500);
        } else report.steps.bodyImage = 'plus(メニューを開く) button not found';
      } else report.steps.bodyImage = 'afterText paragraph not found';
    }

    // 5. Kindle末尾追加
    // 【重要】figureを1つずつ連続ペーストすると note のカード変換タイミングで1枚取りこぼす。
    //         紹介文 + 全figure を「空段落 <p></p> 区切りで1回のペースト」にまとめると確実。
    if (cfg.kindleBooks && cfg.kindleBooks.length) {
      editor.focus();
      const lastEl = editor.lastElementChild;
      lastEl.scrollIntoView({ block: 'center' });
      const range = document.createRange();
      range.selectNodeContents(lastEl); range.collapse(false);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      await sleep(300);
      const figs = cfg.kindleBooks
        .map((url) => `<figure data-src="${url}" data-identifier="null" embedded-service="external-article" contenteditable="false" draggable="true"></figure>`)
        .join('<p></p>'); // figure間は空段落で区切る
      const block =
        '<p>この記事が少しでも参考になった方へ</p>' +
        '<p>関連書籍として以下もあわせて紹介します。Kindle Unlimitedの対象になっている場合は、追加費用なしでそのまま読むことができます。</p>' +
        figs;
      await pasteHtmlAtSelection(block, Math.max(6000, 3000 * cfg.kindleBooks.length)); // カード変換待ち
      const html = editor.innerHTML;
      report.steps.kindle = cfg.kindleBooks.map((u) => {
        const id = u.split('/dp/')[1] || u;
        return { book: id, present: html.includes(id) };
      });
    }

    report.ok = true;
    return report;
  }

  window.notePost = notePost;
})();
