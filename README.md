# NOTE記事 自動アップグレードシステム（Gemini無料版）

> 「書くな、再設計しろ」  
> Google Gemini APIを使用 — **完全無料・クレカ不要**

---

## ⚡ セットアップ（3ステップ）

### 1. APIキー取得（無料・2分）
1. [aistudio.google.com](https://aistudio.google.com) を開く
2. Googleアカウントでログイン
3. 「**Get API key**」→「**Create API key**」
4. `AIza...` で始まるキーをコピー

### 2. インストール
```bash
pip install google-generativeai
export GEMINI_API_KEY="AIza..."
```

### 3. 実行
```bash
# 単一記事
python src/article_flow.py --file articles/your_article.txt

# バッチ処理（未処理を最大3件）
python src/article_flow.py --batch --max 3
```

---

## 📁 ディレクトリ構成

```
note-upgrader/
├── articles/          ← .txtをここに置く
├── outputs/           ← 再設計記事が生成される（.md）
├── skills/skills.py   ← 10スキルのプロンプト定義
├── src/article_flow.py  ← 実行エンジン（Gemini対応）
└── .github/workflows/upgrade.yml  ← 6時間ごと自動実行
```

---

## 📥 記事フォーマット

`articles/` に `.txt` ファイルを作成：

```
TITLE: 記事タイトル

CONTENT:
記事本文...
```

---

## ⏰ GitHub自動化

1. リポジトリの `Settings > Secrets and variables > Actions`
2. 「**New repository secret**」
3. Name: `GEMINI_API_KEY` / Value: `AIza...`
4. `articles/` に記事を追加してpush → 6時間ごとに自動処理！

---

## 🆓 無料枠の目安

| モデル | 1日の上限 | 1記事あたり |
|-------|-----------|------------|
| Gemini 2.5 Flash | 250リクエスト | 約10リクエスト |
| → 1日 **25記事** まで無料 | | |

---

## 🔥 基本思想
- AIに「自律」させない → Flowで制御する
- スキルは単機能に分割し、順番に実行
- 記事は「書く」のではなく「再設計」する
