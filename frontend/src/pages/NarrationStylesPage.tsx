import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  perspectiveLabel,
  type NarrationPerspective,
  type NarrationStylePublic,
} from "@kshiai/shared";
import { api } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";

const PERSPECTIVE_OPTIONS: { value: NarrationPerspective; label: string }[] = [
  { value: "external", label: "三人称限定（内心なし）" },
  { value: "self", label: "一人称（自分側の内心）" },
  { value: "foe", label: "相手視点（相手の内心）" },
  { value: "omniscient", label: "全知（両方）" },
  { value: "fluid", label: "可変視点（ターンごとに焦点）" },
];

const GEN_PLACEHOLDER =
  "昭和のラジオ実況みたいに熱く、でも下品にならない感じで";

export function NarrationStylesPage() {
  const [list, setList] = useState<NarrationStylePublic[]>([]);
  const [prompt, setPrompt, clearPrompt] = useLocalDraft(
    "narration-styles:generate",
    "",
  );
  const [manual, setManual] = useLocalDraft("narration-styles:manual", {
    displayName: "",
    description: "",
    instruction: "",
    perspective: "external" as NarrationPerspective,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const { styles } = await api.listNarrationStyles();
    setList(styles);
  }

  useEffect(() => {
    void reload().catch((e) => setError(String(e)));
  }, []);

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) {
      setError("雰囲気を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.generateNarrationStyle(text);
      setMessage(`「${res.style.displayName}」を作成しました`);
      clearPrompt();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onManual(e: FormEvent) {
    e.preventDefault();
    if (!manual.displayName.trim() || !manual.instruction.trim()) {
      setError("名前と指示文は必須です");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.createNarrationStyle({
        displayName: manual.displayName.trim(),
        description: manual.description.trim() || undefined,
        instruction: manual.instruction.trim(),
        perspective: manual.perspective,
      });
      setMessage(`「${res.style.displayName}」を保存しました`);
      setManual({
        displayName: "",
        description: "",
        instruction: "",
        perspective: "external",
      });
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
          <Link className="btn primary" to="/match">
            対戦セットアップ
          </Link>
          <Link to="/">← メニュー</Link>
        </div>
      </div>

      <p className="muted">
        試合の語り口と<strong>視点</strong>（内心をナレに渡す範囲）です。標準プリセットに加え、自分用を作れます。試合開始時に選択します。
      </p>

      <div className="panel">
        <h2>自然文から生成</h2>
        <form className="grid" onSubmit={(e) => void onGenerate(e)}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={GEN_PLACEHOLDER}
            rows={3}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "生成中…" : "スタイルを生成して保存"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>手入力で作成</h2>
        <form className="grid" onSubmit={(e) => void onManual(e)}>
          <label className="field">
            <span className="field-label">名前</span>
            <input
              value={manual.displayName}
              onChange={(e) =>
                setManual((m) => ({ ...m, displayName: e.target.value }))
              }
              placeholder="例: 毒舌解説"
            />
          </label>
          <label className="field">
            <span className="field-label">説明（任意）</span>
            <input
              value={manual.description}
              onChange={(e) =>
                setManual((m) => ({ ...m, description: e.target.value }))
              }
              placeholder="ピッカーに出す短い説明"
            />
          </label>
          <label className="field">
            <span className="field-label">語りへの指示</span>
            <textarea
              value={manual.instruction}
              onChange={(e) =>
                setManual((m) => ({ ...m, instruction: e.target.value }))
              }
              placeholder="LLM に渡すスタイル指示（口調・密度など）。内心の権限は下の視点で制御"
              rows={4}
            />
          </label>
          <label className="field">
            <span className="field-label">視点（情報範囲）</span>
            <select
              value={manual.perspective}
              onChange={(e) =>
                setManual((m) => ({
                  ...m,
                  perspective: e.target.value as NarrationPerspective,
                }))
              }
            >
              {PERSPECTIVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary" type="submit" disabled={busy}>
            保存
          </button>
        </form>
        {message && <p className="ok">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="panel">
        <h2>一覧</h2>
        <div className="grid" style={{ gap: "0.75rem" }}>
          {list.map((s) => (
            <div className="card" key={s.id} style={{ padding: "0.85rem" }}>
              <strong>
                {s.displayName}
                {s.isSystem ? (
                  <span className="tag" style={{ marginLeft: 6 }}>
                    システム
                  </span>
                ) : null}
              </strong>
              <p className="muted" style={{ margin: "0.35rem 0" }}>
                {s.description || "—"}
                <span className="tag" style={{ marginLeft: 6 }}>
                  {perspectiveLabel(s.perspective)}
                </span>
              </p>
              <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.45 }}>
                {s.instruction}
              </p>
              <div style={{ marginTop: "0.5rem" }}>
                {s.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              {!s.isSystem && (
                <div className="row" style={{ marginTop: "0.65rem" }}>
                  <button
                    className="btn danger"
                    type="button"
                    onClick={() => void onDelete(s.id, s.displayName)}
                  >
                    削除
                  </button>
                </div>
              )}
            </div>
          ))}
          {list.length === 0 && (
            <p className="muted">スタイルがありません。</p>
          )}
        </div>
      </div>
    </>
  );
}
