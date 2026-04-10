"""
article_flow.py - Google Gemini API版（Gemini 2.5対応・サーバー負荷対策済み）
"""
import os, json, re, sys, time, datetime
from pathlib import Path
from google import genai

BASE_DIR = Path(__file__).parent.parent
ARTICLES_DIR = BASE_DIR / "articles"
OUTPUTS_DIR  = BASE_DIR / "outputs"
LOGS_DIR     = BASE_DIR / "outputs" / "logs"

# スキル定義の読み込み
sys.path.insert(0, str(BASE_DIR / "skills"))
try:
    from skills import SKILLS
except ImportError:
    print("Error: skills.py が見つかりません。")
    SKILLS = {}

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
MODEL = "models/gemini-2.0-flash"

def load_article(filepath):
    text = filepath.read_text(encoding="utf-8")
    title, content = "", text
    if "TITLE:" in text and "CONTENT:" in text:
        m = re.search(r"TITLE:\s*(.+?)\nCONTENT:\s*(.*)", text, re.DOTALL)
        if m:
            title   = m.group(1).strip()
            content = m.group(2).strip()
    return {"title": title, "content": content, "filepath": str(filepath)}

def call_gemini(system, user, retry=5):
    """
    指数バックオフを搭載したAPI呼び出し
    """
    prompt = f"{system}\n\n---\n\n{user}"
    for attempt in range(retry):
        try:
            response = client.models.generate_content(model=MODEL, contents=prompt)
            return response.text
        except Exception as e:
            err = str(e)
            if any(code in err for code in ["429", "503", "500", "UNAVAILABLE", "RESOURCE_EXHAUSTED"]):
                wait = 60 * (2 ** attempt)
                print(f"    [WAIT] 制限回避のため待機します... {wait}秒後に再開 (試行 {attempt+1}/{retry})")
                time.sleep(wait)
            else:
                print(f"    [ERROR] 致命的なエラーが発生しました: {err}")
                raise e
    raise RuntimeError(f"Gemini API: {retry}回のリトライに失敗しました。")

def clean_markdown(text: str) -> str:
    """
    Geminiが返却するMarkdownコードブロック囲みを除去し、
    純粋なMarkdownテキストを返す。
    """
    text = text.strip()
    # ```markdown ... ``` や ``` ... ``` の除去
    text = re.sub(r"^```(?:markdown)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()

def safe_json(text):
    # JSON以外の文字を削ぎ落とす
    text = re.sub(r"```json|```", "", text).strip()
    try:
        return json.loads(text)
    except:
        return {"raw": text}

def fmt(template, ctx):
    result = template
    for k, v in ctx.items():
        val = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)
        result = result.replace("{" + k + "}", val)
    return result

# テキスト出力スキル（JSONではなくMarkdownテキストを返す）
TEXT_ONLY_SKILLS = {
    "intro_reconstruction",
    "example_reinforcement",
    "emotion_hook_design",
    "cta_design",
    "final_article_generation",
}

def run_skill(skill_name, ctx):
    if skill_name not in SKILLS:
        print(f"    [WARN] スキル '{skill_name}' が未定義です。スキップします。")
        return {}
    skill = SKILLS[skill_name]
    raw = call_gemini(skill["system"], fmt(skill["user"], ctx))

    if skill_name in TEXT_ONLY_SKILLS:
        return clean_markdown(raw)
    return safe_json(raw)

def save_log(article_stem, ctx):
    """中間結果をJSONログとして保存（デバッグ用）"""
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / f"{article_stem}_log.json"
    # 保存するキーはスキル名のみ（filepathなど除外）
    log_data = {k: v for k, v in ctx.items() if k in SKILL_ORDER or k in ("title", "original_intro")}
    log_path.write_text(json.dumps(log_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  [LOG] ログ保存 -> {log_path.name}")

def assemble_article(ctx):
    """
    final_article_generation スキルの出力（完成版Markdown）のみを返す。
    """
    final_text = ctx.get("final_article_generation", "")

    # デバッグ：最終生成結果の冒頭を確認
    if final_text:
        preview = final_text[:200].replace("\n", " ")
        print(f"  [PREVIEW] 最終出力冒頭: {preview}...")
    else:
        print("  [WARN] final_article_generation が空です。フォールバックを使用します。")

    if not final_text:
        return "# エラー\n記事の最終生成に失敗しました。APIの応答を確認してください。"

    return final_text

SKILL_ORDER = [
    "article_diagnosis",
    "value_gap_analysis",
    "angle_reconstruction",
    "emotion_hook_design",       # NEW: 感情フック設計
    "intro_reconstruction",
    "structure_reorganization",
    "depth_injection",
    "example_reinforcement",
    "tone_refinement",
    "title_reconstruction",
    "cta_design",                # NEW: CTA・締め文設計
    "final_article_generation",
]


def run_flow(article_path):
    print(f"\n{'='*50}\n[START] 処理開始: {article_path.name}\n{'='*50}")
    ctx = load_article(article_path)
    ctx["original_intro"] = ctx["content"][:300]
    print(f"  [記事] {ctx['title']}")

    for skill_name in SKILL_ORDER:
        print(f"  [SKILL] {skill_name}...")
        result = run_skill(skill_name, ctx)
        ctx[skill_name] = result
        # ステップ間のウェイト（レート制限対策）
        time.sleep(30)

    # 中間ログ保存（デバッグ用）
    save_log(article_path.stem, ctx)

    OUTPUTS_DIR.mkdir(exist_ok=True)
    out_path = OUTPUTS_DIR / f"{article_path.stem}_upgraded.md"
    out_path.write_text(assemble_article(ctx), encoding="utf-8")
    print(f"  [DONE] 完了 -> {out_path.name}")
    return out_path

def run_batch(max_articles=3):
    files     = sorted(ARTICLES_DIR.glob("*.txt"))
    processed = {p.stem.replace("_upgraded", "") for p in OUTPUTS_DIR.glob("*_upgraded.md")}
    targets   = [f for f in files if f.stem not in processed][:max_articles]

    if not targets:
        print("[INFO] 処理対象の記事がありません"); return

    print(f"[INFO] 処理対象: {len(targets)}件")
    for f in targets:
        run_flow(f)
        print("  [WAIT] 次の記事まで10秒待機中...")
        time.sleep(10)

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--file")
    p.add_argument("--batch", action="store_true")
    p.add_argument("--max", type=int, default=3)
    args = p.parse_args()

    if args.file:
        run_flow(Path(args.file))
    elif args.batch:
        run_batch(max_articles=args.max)
    else:
        print("使い方:")
        print("  python src/article_flow.py --file articles/sample_python.txt")
        print("  python src/article_flow.py --batch --max 3")