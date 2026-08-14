import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  perspectiveLabel,
  type NarrationStylePublic,
} from "@kshiai/shared";
import { api, type NarrationStyleAuthoringDraft } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";

const GEN_PLACEHOLDER =
  "昭和のラジオ実況みたいに熱く、でも下品にならない感じで";

export function NarrationStylesPage() {
  const [list, setList] = useState<NarrationStylePublic[]>([]);
  const [prompt, setPrompt, clearPrompt] = useLocalDraft(
    "narration-styles:generate",
    "",
  );
  const [draft, setDraft] = useState<NarrationStyleAuthoringDraft | null>(null);
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [{ styles }, latest] = await Promise.all([
      api.listNarrationStyles(),
      api.latestNarrationStyleDraft(),
    ]);
    setList(styles);
    setDraft(latest.draft);
  }

  useEffect(() => {
    void reload().catch((e) => setError(String(e)));
  }, []);

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) {
      setError("語り口の希望を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = revisingId
        ? await api.reviseNarrationStyle(revisingId, text)
        : await api.generateNarrationStyle(text);
      setDraft(result.draft);
      setMessage("構造と公開説明の候補を作成しました。内容を確認してください。");
      setRevisingId(null);
      clearPrompt();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onUpgrade(style: NarrationStylePublic) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.upgradeNarrationStyle(style.id);
      setDraft(result.draft);
      setMessage(`「${style.displayName}」の最新版候補を作成しました。`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.confirmNarrationStyleDraft(draft.id);
      setDraft(null);
      setMessage(`「${result.style.displayName}」を確定しました。`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await api.discardNarrationStyleDraft(draft.id);
      setDraft(null);
      setMessage("候補を破棄しました。");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    await api.deleteNarrationStyle(id);
    await reload();
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>ナレーションスタイル</h1>
        <div className="row" style={{ gap: "0.45rem" }}>
          <Link className="btn primary" to="/match">対戦セットアップ</Link>
          <Link to="/">← メニュー</Link>
        </div>
      </div>

      <p className="muted">
        自然文から視点・声・テンポ・フェーズ別方針を構造化し、公開説明と一緒に確認してから確定します。
      </p>

      <div className="panel">
        <h2>{revisingId ? "最新版の修正候補" : "自然文から候補を生成"}</h2>
        <form className="grid" onSubmit={(e) => void onGenerate(e)}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={GEN_PLACEHOLDER}
            rows={3}
          />
          <div className="row">
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "生成中…" : revisingId ? "修正候補を生成" : "候補を生成"}
            </button>
            {revisingId && (
              <button className="btn" type="button" onClick={() => setRevisingId(null)}>
                キャンセル
              </button>
            )}
          </div>
        </form>
      </div>

      {draft && (
        <div className="panel">
          <h2>確定前の候補</h2>
          <h3>{draft.style.displayName}</h3>
          <p>{draft.style.description}</p>
          <p className="muted">
            視点: {perspectiveLabel(draft.definition.perspective)} · 声: {draft.definition.voice.register}
            /{draft.definition.voice.subjectivity} · 文長: {draft.definition.cadence.sentenceLength}
            · 最大 {draft.definition.cadence.lineBudget} 行
          </p>
          <p className="muted">
            フェーズ: {Object.entries(draft.definition.phases)
              .map(([phase, policy]) => `${phase}:${policy.emphasis}`)
              .join(" / ")}
          </p>
          <p className="muted">
            例 {draft.definition.examples.length} 件 / 反例 {draft.definition.counterexamples.length} 件
            · 推奨表現 {draft.definition.preferredRhetoric.length} 件 / 禁止表現 {draft.definition.forbiddenRhetoric.length} 件
          </p>
          <div className="row">
            <button className="btn primary" type="button" disabled={busy} onClick={() => void onConfirm()}>
              この内容で確定
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => void onDiscard()}>
              破棄
            </button>
          </div>
        </div>
      )}

      {message && <p className="ok">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h2>一覧</h2>
        <div className="grid" style={{ gap: "0.75rem" }}>
          {list.map((style) => (
            <div className="card" key={style.id} style={{ padding: "0.85rem" }}>
              <strong>
                {style.displayName}
                {style.isSystem && <span className="tag" style={{ marginLeft: 6 }}>システム</span>}
                <span className="tag" style={{ marginLeft: 6 }}>
                  {style.selectable ? "選択可能" : "更新が必要"}
                </span>
              </strong>
              <p className="muted" style={{ margin: "0.35rem 0" }}>
                {style.description || "—"}
                <span className="tag" style={{ marginLeft: 6 }}>
                  {perspectiveLabel(style.perspective)}
                </span>
              </p>
              <div>
                {style.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
              </div>
              {!style.isSystem && (
                <div className="row" style={{ marginTop: "0.65rem" }}>
                  {style.selectable ? (
                    <button className="btn" type="button" onClick={() => setRevisingId(style.id)}>
                      修正候補を作る
                    </button>
                  ) : (
                    <button className="btn primary" type="button" disabled={busy} onClick={() => void onUpgrade(style)}>
                      最新版に更新
                    </button>
                  )}
                  <button className="btn danger" type="button" onClick={() => void onDelete(style.id, style.displayName)}>
                    削除
                  </button>
                </div>
              )}
            </div>
          ))}
          {list.length === 0 && <p className="muted">スタイルがありません。</p>}
        </div>
      </div>
    </>
  );
}
