import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DialoguePipelineSettings } from "@kshiai/shared";
import { ApiError, api } from "../api";

type FormState = Pick<
  DialoguePipelineSettings,
  | "enabled"
  | "conversationHistoryLimit"
  | "contextProjectionMode"
  | "recentExchangeLimit"
  | "relevantMemoryLimit"
  | "psychologyGuidance"
>;

function toFormState(settings: DialoguePipelineSettings): FormState {
  return {
    enabled: settings.enabled,
    conversationHistoryLimit: settings.conversationHistoryLimit,
    contextProjectionMode: settings.contextProjectionMode,
    recentExchangeLimit: settings.recentExchangeLimit,
    relevantMemoryLimit: settings.relevantMemoryLimit,
    psychologyGuidance: settings.psychologyGuidance,
  };
}

function formatWhen(value: string | null): string {
  if (!value) return "既定値（未保存）";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP");
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "この画面は管理者のみ利用できます。";
  }
  return error instanceof Error ? error.message : "設定の読み込みに失敗しました。";
}

export function AdminDialoguePipelinePage() {
  const [settings, setSettings] = useState<DialoguePipelineSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (message?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getDialoguePipelineSettings();
      setSettings(response.settings);
      setForm(toFormState(response.settings));
      setNotice(message ?? null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!settings || !form) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.updateDialoguePipelineSettings({
        expectedRevision: settings.revision,
        ...form,
      });
      setSettings(response.settings);
      setForm(toFormState(response.settings));
      setNotice("保存しました。次に進行するキャラ思考から反映されます。");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        await load("別の管理者による更新を検出したため、最新の設定を読み込み直しました。");
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setSaving(false);
    }
  }, [form, load, settings]);

  return (
    <div className="admin-dialogue-page">
      <div className="page-header">
        <div>
          <h1>会話パイプライン設定</h1>
          <p className="muted">キャラの内面・発話コンテキストを運用中に調整します。</p>
        </div>
        <div className="row">
          <button className="btn ghost" type="button" disabled={loading || saving} onClick={() => void load()}>
            再読込
          </button>
          <Link className="btn ghost" to="/">戻る</Link>
        </div>
      </div>

      <section className="panel admin-dialogue-panel">
        <p className="admin-dialogue-boundary">
          ここで変えるのは発話前の深層心理と会話参照範囲です。正準の人物設定、行動判定、ダメージ・勝敗、JSON契約はサーバー側で固定され、この設定では変更できません。
        </p>
        <p className="muted admin-dialogue-boundary">
          保存後は次に開始する試合から反映されます。開始済みの試合は開始時点の設定スナップショットを維持します。
        </p>

        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="ok">{notice}</p> : null}
        {loading && !form ? <p className="muted">読み込み中…</p> : null}

        {form && settings ? (
          <form
            className="admin-dialogue-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="admin-dialogue-toggle">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
              <span>
                <strong>深層心理の指針を有効にする</strong>
                <small>無効時も会話履歴は渡しますが、以下の指針は発話前の心理層へ送信しません。</small>
              </span>
            </label>

            <label className="field">
              <span className="field-label">コンテキスト投影</span>
              <select
                value={form.contextProjectionMode}
                onChange={(event) => setForm({
                  ...form,
                  contextProjectionMode: event.target.value as FormState["contextProjectionMode"],
                })}
              >
                <option value="legacy">従来入力（互換）</option>
                <option value="compact">圧縮コンテキスト</option>
              </select>
              <span className="field-hint">圧縮では、結果観測・会話継続・表出ブリーフを分離して渡します。</span>
            </label>

            <label className="field">
              <span className="field-label">表出へ渡す直近会話数（2〜8）</span>
              <input
                type="number"
                min={2}
                max={8}
                value={form.recentExchangeLimit}
                onChange={(event) => setForm({ ...form, recentExchangeLimit: Number(event.target.value) })}
              />
            </label>

            <label className="field">
              <span className="field-label">関連メモリ数（0〜2）</span>
              <input
                type="number"
                min={0}
                max={2}
                value={form.relevantMemoryLimit}
                onChange={(event) => setForm({ ...form, relevantMemoryLimit: Number(event.target.value) })}
              />
            </label>

            <label className="field">
              <span className="field-label">過去会話の保持数（4〜24）</span>
              <input
                type="number"
                min={4}
                max={24}
                value={form.conversationHistoryLimit}
                onChange={(event) => setForm({
                  ...form,
                  conversationHistoryLimit: Number(event.target.value),
                })}
              />
              <span className="field-hint">深層心理が関係の連続性を受け取るための、直近の会話記録数です。</span>
            </label>

            <label className="field">
              <span className="field-label">深層心理の指針</span>
              <textarea
                value={form.psychologyGuidance}
                maxLength={3000}
                rows={10}
                onChange={(event) => setForm({ ...form, psychologyGuidance: event.target.value })}
              />
              <span className="field-hint">
                キャラが結果・会話・相手との関係をどう受け止めるかの運用上の指針です。反復や沈黙も、人物自身の理由があるときだけ自然な選択として扱えます。
              </span>
            </label>

            <div className="admin-dialogue-meta muted">
              リビジョン {settings.revision} · 最終更新 {formatWhen(settings.updatedAt)}
              {settings.updatedBy ? ` · ${settings.updatedBy}` : ""}
            </div>
            <div className="row">
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={saving}
                onClick={() => setForm(toFormState(settings))}
              >
                保存済みに戻す
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
