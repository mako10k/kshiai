import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  BattleListItem,
  CharacterImprovementPublic,
  CharacterPublic,
} from "@kshiai/shared";
import { api, ApiError, type ImageGenQuota } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";
import { mediaSrc } from "../media";

const CHAT_PLACEHOLDER = "もっと慎重で、相手を観察するタイプにして";

function formatNextAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function quotaHint(q: ImageGenQuota | null): string {
  if (!q) return "";
  if (q.allowed) {
    return `顔生成の残り: 1時間 ${q.remainingHour}/${q.limitHour} ・ 本日 ${q.remainingDay}/${q.limitDay}`;
  }
  const next = formatNextAt(q.nextAllowedAt);
  return next
    ? `顔生成は上限です。次回可能: ${next}`
    : "顔生成は上限です。しばらく待ってから再度お試しください。";
}

export function CharacterDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [character, setCharacter] = useState<CharacterPublic | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [history, setHistory] = useState<BattleListItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [chat, setChat, clearChat] = useLocalDraft(
    `characters:chat:${id ?? "unknown"}`,
    "",
  );
  const [assistant, setAssistant] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [quota, setQuota] = useState<ImageGenQuota | null>(null);
  const [improvement, setImprovement] =
    useState<CharacterImprovementPublic | null>(null);
  const [improvementBusy, setImprovementBusy] = useState(false);

  const reloadQuota = useCallback(async (charId: string) => {
    try {
      const res = await api.imageQuota(charId);
      setQuota(res.quota);
    } catch {
      /* non-fatal — quota only for owners */
    }
  }, []);

  const reloadHistory = useCallback(async (charId: string) => {
    setHistoryLoading(true);
    try {
      const res = await api.listCharacterBattles(charId, { limit: 40 });
      setHistory(res.battles);
      setHistoryTotal(res.total);
    } catch {
      setHistory([]);
      setHistoryTotal(0);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const reloadImprovement = useCallback(async (charId: string) => {
    try {
      const res = await api.getCharacterImprovement(charId);
      setImprovement(res);
    } catch {
      // Keep UI usable offline from analysis; eligibility will re-fetch later.
      setImprovement({
        memo: {
          strengths: [],
          improvements: [],
          summary: "",
          lastAnalyzedAt: null,
          lastAnalyzedBattleCount: 0,
          analysisCount: 0,
        },
        eligibility: {
          finishedBattles: 0,
          canAnalyze: false,
          battlesUntilNext: 5,
          reason: "改善メモを取得できませんでした。再読み込みしてください。",
          lastAnalyzedAt: null,
          lastAnalyzedBattleCount: 0,
          analysisCount: 0,
          nextAnalyzeAtBattleCount: 5,
        },
      });
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    setError(null);
    void api
      .getCharacter(id)
      .then(({ character: c, isOwner: owner }) => {
        setCharacter(c);
        setIsOwner(owner);
        if (owner) {
          void reloadQuota(id);
          void reloadImprovement(id);
        } else {
          setImprovement(null);
        }
        void reloadHistory(id);
      })
      .catch((e) => {
        setCharacter(null);
        setError(
          e instanceof ApiError && e.status === 404
            ? "not_found"
            : String(e instanceof Error ? e.message : e),
        );
      });
  }, [id, reloadQuota, reloadHistory, reloadImprovement]);

  // Refresh countdown label while waiting for next slot
  useEffect(() => {
    if (!quota || quota.allowed || !quota.nextAllowedAt || !id) return;
    const tick = () => {
      const t = Date.parse(quota.nextAllowedAt!);
      if (Number.isFinite(t) && Date.now() >= t) {
        void reloadQuota(id);
      }
    };
    const idTimer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(idTimer);
  }, [quota, id, reloadQuota]);

  async function onChat(e: FormEvent) {
    e.preventDefault();
    if (!id || !isOwner) return;
    const text = chat.trim();
    if (!text) {
      setError("調整内容を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.chatCharacter(id, text);
      setCharacter(res.character);
      setAssistant(
        `${res.assistantMessage}（気に入らなければ「調整前に戻す」で直前の内容に戻せます）`,
      );
      clearChat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRestoreRevision() {
    if (!id || !isOwner) return;
    if (
      !confirm(
        "直前の会話調整の前の内容に戻します。いまの調整結果は失われます。よろしいですか？",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.restoreCharacterRevision(id);
      setCharacter(res.character);
      setAssistant(res.assistantMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "復元に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!id) return;
    const res = await api.copyCharacter(id);
    nav(`/characters/${res.character.id}`);
  }

  async function onDelete() {
    if (!id || !isOwner) return;
    if (!confirm("削除しますか？")) return;
    await api.deleteCharacter(id);
    nav("/characters");
  }

  async function onImage() {
    if (!id || !isOwner) return;
    if (quota && !quota.allowed) {
      setError(quotaHint(quota));
      return;
    }
    setImageBusy(true);
    setError(null);
    try {
      const res = await api.generateImage(id);
      setCharacter(res.character);
      setAssistant(res.note ?? "画像を更新しました");
      if (res.quota) setQuota(res.quota);
      else void reloadQuota(id);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.quota) setQuota(err.quota);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "failed");
      }
    } finally {
      setImageBusy(false);
    }
  }

  async function onToggleImage() {
    if (!id || !isOwner) return;
    setImageBusy(true);
    setError(null);
    try {
      const res = await api.toggleCharacterImage(id);
      setCharacter(res.character);
      setAssistant(res.assistantMessage);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "画像の切り替えに失敗しました",
      );
    } finally {
      setImageBusy(false);
    }
  }

  async function onAnalyzeImprovement() {
    if (!id || !isOwner) return;
    setImprovementBusy(true);
    setError(null);
    try {
      const res = await api.analyzeCharacterImprovement(id);
      setImprovement({
        memo: res.memo,
        eligibility: res.eligibility,
      });
      setAssistant(res.assistantMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析に失敗しました");
    } finally {
      setImprovementBusy(false);
    }
  }

  async function onGenerateImprovementPrompt() {
    if (!id || !isOwner) return;
    setImprovementBusy(true);
    setError(null);
    try {
      const res = await api.generateCharacterImprovementPrompt(id);
      setChat(res.prompt);
      setAssistant(res.assistantMessage);
      // Scroll chat panel into view for the filled revision prompt.
      document
        .getElementById("character-chat-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "プロンプト生成に失敗しました",
      );
    } finally {
      setImprovementBusy(false);
    }
  }

  function openBattle(b: BattleListItem) {
    if (b.canResume) {
      nav(`/battles/${b.id}?resume=1`);
    } else {
      nav(`/battles/${b.id}?view=1`);
    }
  }

  if (!character && !error) return <p className="muted">読み込み中…</p>;
  if (!character) return <p className="error">キャラが見つかりません</p>;

  // Tolerate a rolling deployment where the frontend sees an older DTO once.
  const basicAttackName = character.basicAttackName || "基本アクション";
  const basicAttackDescription =
    character.basicAttackDescription ||
    "消耗時にも使える、そのキャラクターらしい基本行動。";
  const skillSummaries = Array.isArray(character.skillSummaries)
    ? character.skillSummaries
    : (character.skillNames ?? []).map((name) => ({ name, description: "" }));
  const names = character.names ?? {
    realName: null,
    nicknames: [],
    selfNames: [],
    epithets: [],
  };
  const nameRows = [
    names.realName ? ["本名", names.realName] : null,
    names.nicknames.length ? ["通用名・あだ名", names.nicknames.join("、")] : null,
    names.selfNames.length ? ["一人称名", names.selfNames.join("、")] : null,
    names.epithets.length ? ["二つ名", names.epithets.join("、")] : null,
  ].filter((row): row is string[] => row != null);

  const imageBlocked = Boolean(quota && !quota.allowed);
  const imageLabel = imageBusy
    ? "生成中…"
    : imageBlocked
      ? "顔生成は上限です"
      : character.appearance.imageUrl
        ? "顔を再生成"
        : "顔を AI 生成";

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{character.displayName}</h1>
        <div className="row" style={{ gap: "0.45rem" }}>
          {isOwner ? (
            <Link
              className="btn primary"
              to={`/match?my=${encodeURIComponent(character.id)}`}
            >
              このキャラで対戦
            </Link>
          ) : (
            <Link
              className="btn primary"
              to={`/match?opp=${encodeURIComponent(character.id)}`}
            >
              このキャラと対戦
            </Link>
          )}
          <Link to="/characters">← 一覧</Link>
        </div>
      </div>

      <div className="panel grid" style={{ gridTemplateColumns: "160px 1fr", gap: "1rem" }}>
        <div className="portrait-column">
          {character.appearance.imageUrl ? (
            <img
              key={mediaSrc(character.appearance.imageUrl, character.updatedAt)}
              src={mediaSrc(character.appearance.imageUrl, character.updatedAt)}
              alt={character.displayName}
              className="portrait-main"
            />
          ) : (
            <div className="portrait-placeholder">No Image</div>
          )}
          {isOwner && character.canToggleImage && character.appearance.previousImageUrl ? (
            <div className="portrait-toggle-panel">
              <p className="muted portrait-toggle-label">顔画像の切替（プレビュー）</p>
              <div className="portrait-toggle-row">
                <button
                  type="button"
                  className="portrait-option is-active"
                  disabled={imageBusy || busy}
                  title="いま使っている顔"
                >
                  <img
                    src={mediaSrc(
                      character.appearance.imageUrl,
                      character.updatedAt,
                    )}
                    alt="現在の顔"
                  />
                  <span>現在</span>
                </button>
                <button
                  type="button"
                  className="portrait-option"
                  disabled={imageBusy || busy}
                  onClick={() => void onToggleImage()}
                  title="直前の顔に切り替える"
                >
                  <img
                    src={mediaSrc(
                      character.appearance.previousImageUrl,
                      `${character.updatedAt}:prev`,
                    )}
                    alt="直前の顔"
                  />
                  <span>直前</span>
                </button>
              </div>
              <button
                type="button"
                className="btn"
                style={{ width: "100%", marginTop: "0.4rem" }}
                disabled={imageBusy || busy}
                onClick={() => void onToggleImage()}
              >
                現在 ⇔ 直前を切替
              </button>
            </div>
          ) : null}
        </div>
        <div>
          <p>{character.narrativeBlurb}</p>
          {nameRows.length > 0 ? (
            <dl className="profile-names">
              {nameRows.map(([label, value]) => (
                <div key={label} className="row" style={{ gap: "0.5rem" }}>
                  <dt className="muted">{label}</dt>
                  <dd style={{ margin: 0 }}>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="muted">
            <strong>外見:</strong> {character.appearance.summary}
          </p>
          <div className="record-block">
            <p className="record-line" style={{ marginBottom: "0.35rem" }}>
              <strong>公開成績</strong>
              <span className="muted">（他アカウントとの対戦のみ・誰でも見える）</span>
              <br />
              <span className="rating">
                RT {Math.round(character.record.rating)}
                {character.record.provisional ? (
                  <span className="tag">暫定</span>
                ) : (
                  <span className="tag">確定寄り</span>
                )}
              </span>{" "}
              <span className="muted">
                {character.record.wins}勝 {character.record.losses}敗
                {character.record.draws ? ` ${character.record.draws}分` : ""}
                ／ {character.record.gamesPlayed} 試合
              </span>
            </p>
            {character.recordOverall ? (
              <p className="record-line record-overall">
                <strong>全体成績</strong>
                <span className="muted">（自分のキャラ同士を含む・本人のみ）</span>
                <br />
                <span className="rating">
                  RT {Math.round(character.recordOverall.rating)}
                  {character.recordOverall.provisional ? (
                    <span className="tag">暫定</span>
                  ) : (
                    <span className="tag">確定寄り</span>
                  )}
                </span>{" "}
                <span className="muted">
                  {character.recordOverall.wins}勝{" "}
                  {character.recordOverall.losses}敗
                  {character.recordOverall.draws
                    ? ` ${character.recordOverall.draws}分`
                    : ""}
                  ／ {character.recordOverall.gamesPlayed} 試合
                </span>
              </p>
            ) : null}
          </div>
          <p>
            通常攻撃: <strong>{basicAttackName}</strong> — {basicAttackDescription}
          </p>
          <div>
            特技:
            {skillSummaries.length > 0 ? (
              <ul style={{ margin: "0.35rem 0" }}>
                {skillSummaries.map((skill) => (
                  <li key={skill.name}>
                    <strong>{skill.name}</strong> — {skill.description}
                  </li>
                ))}
              </ul>
            ) : (
              " —"
            )}
          </div>
          <p>
            武器: {character.weaponName ?? "—"} / 防具: {character.armorName ?? "—"}
            {character.weaponDescription || character.armorDescription ? (
              <>
                <br />
                <span className="muted">
                  {[character.weaponDescription, character.armorDescription]
                    .filter(Boolean)
                    .join(" / ")}
                </span>
              </>
            ) : null}
          </p>
          <div className="row">
            {isOwner ? (
              <Link
                className="btn primary"
                to={`/match?my=${encodeURIComponent(character.id)}`}
              >
                対戦する
              </Link>
            ) : (
              <Link
                className="btn primary"
                to={`/match?opp=${encodeURIComponent(character.id)}`}
              >
                相手にする
              </Link>
            )}
            {isOwner && (
              <button
                className="btn"
                type="button"
                disabled={imageBusy || busy || imageBlocked}
                onClick={() => void onImage()}
                title={quotaHint(quota)}
              >
                {imageLabel}
              </button>
            )}
            <button className="btn" type="button" onClick={() => void onCopy()}>
              コピー
            </button>
            {isOwner && (
              <button
                className="btn danger"
                type="button"
                onClick={() => void onDelete()}
              >
                削除
              </button>
            )}
          </div>
          {isOwner && quota && (
            <p className={`image-quota-hint${imageBlocked ? " is-blocked" : ""}`}>
              {quotaHint(quota)}
              {imageBlocked && quota.nextAllowedAt ? (
                <>
                  <br />
                  <span className="muted">
                    （制限: 1時間に{quota.limitHour}回 / 1日に{quota.limitDay}回）
                  </span>
                </>
              ) : null}
            </p>
          )}
        </div>
      </div>

      {isOwner && (
        <div className="panel improvement-panel">
          <h2>改善提案（戦績コーチ）</h2>
          <p className="muted help-text">
            直近の終了試合から良い点・改善点を分析してメモに残します。
            特徴やコンセプトは壊さず、良い点を伸ばし、キャラらしさに影響しない部分だけ整える前提です。
            分析は初回 5 戦後、以後 10 戦ごとに実行できます。
            「改善プロンプトを生成」は下の修正欄に文案を入れるだけで、送信するまでキャラには適用されません。
          </p>

          {improvement ? (
            <>
              <p className="muted improvement-meta">
                終了試合 {improvement.eligibility.finishedBattles} 戦
                {improvement.memo.analysisCount > 0
                  ? ` · 分析 ${improvement.memo.analysisCount} 回`
                  : " · 未分析"}
                {improvement.memo.lastAnalyzedAt
                  ? ` · 最終分析 ${formatWhen(improvement.memo.lastAnalyzedAt)}`
                  : ""}
              </p>

              <div className="improvement-memo grid" style={{ gap: "0.75rem" }}>
                <div className="improvement-col">
                  <h3 className="improvement-heading">良い点</h3>
                  {improvement.memo.strengths.length > 0 ? (
                    <ul className="improvement-list">
                      {improvement.memo.strengths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">まだ登録がありません</p>
                  )}
                </div>
                <div className="improvement-col">
                  <h3 className="improvement-heading">改善点</h3>
                  {improvement.memo.improvements.length > 0 ? (
                    <ul className="improvement-list">
                      {improvement.memo.improvements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">まだ登録がありません</p>
                  )}
                </div>
              </div>

              {improvement.memo.summary ? (
                <p className="improvement-summary">{improvement.memo.summary}</p>
              ) : null}

              <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  className="btn primary"
                  type="button"
                  disabled={
                    improvementBusy ||
                    busy ||
                    imageBusy ||
                    !improvement.eligibility.canAnalyze
                  }
                  onClick={() => void onAnalyzeImprovement()}
                  title={
                    improvement.eligibility.reason ??
                    "戦績を分析してメモに登録"
                  }
                >
                  {improvementBusy
                    ? "処理中…"
                    : improvement.memo.analysisCount > 0
                      ? "戦績を再分析して登録"
                      : "戦績を分析して登録"}
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={
                    improvementBusy ||
                    busy ||
                    imageBusy ||
                    (improvement.memo.strengths.length === 0 &&
                      improvement.memo.improvements.length === 0)
                  }
                  onClick={() => void onGenerateImprovementPrompt()}
                  title="会話での修正欄に改善プロンプトを入れます"
                >
                  改善プロンプトを生成
                </button>
              </div>
              {!improvement.eligibility.canAnalyze &&
              improvement.eligibility.reason ? (
                <p className="muted improvement-gate">
                  {improvement.eligibility.reason}
                </p>
              ) : (
                <p className="muted improvement-gate">
                  分析可能です。LLM が戦績ツールで試合を参照してメモを更新します。
                </p>
              )}
            </>
          ) : (
            <p className="muted">改善メモを読み込み中…</p>
          )}
        </div>
      )}

      {isOwner && (
        <div className="panel" id="character-chat-panel">
          <h2>会話で微調整</h2>
          <p className="muted">
            印象や戦い方の雰囲気を言葉で伝えてください。改善プロンプト生成を使うと、ここに案が入ります。
            送信したときだけシートに反映され、直前の内容は「調整前に戻す」で取り消せます。
          </p>
          <form className="grid" onSubmit={(e) => void onChat(e)}>
            <textarea
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              placeholder={CHAT_PLACEHOLDER}
              rows={chat.trim().length > 80 ? 6 : 3}
            />
            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                className="btn primary"
                type="submit"
                disabled={busy || imageBusy || improvementBusy}
              >
                送信して適用
              </button>
              <button
                className="btn"
                type="button"
                disabled={
                  busy ||
                  imageBusy ||
                  improvementBusy ||
                  !character.canRestoreRevision
                }
                onClick={() => void onRestoreRevision()}
                title={
                  character.canRestoreRevision
                    ? character.revisionSavedAt
                      ? `${character.revisionLabel ?? "調整前"}（${formatWhen(character.revisionSavedAt)}）に戻す`
                      : "直前の調整前に戻す"
                    : "まだ戻せる調整履歴がありません"
                }
              >
                {character.revisionLabel
                  ? `${character.revisionLabel}に戻す`
                  : "調整前に戻す"}
              </button>
            </div>
          </form>
          {character.canRestoreRevision && character.revisionSavedAt ? (
            <p className="muted improvement-gate">
              保存済み: {character.revisionLabel ?? "調整前"}（
              {formatWhen(character.revisionSavedAt)}
              ）。次の送信で上書きされます。
            </p>
          ) : null}
          {assistant && <p className="ok">{assistant}</p>}
          {error && error !== "not_found" && <p className="error">{error}</p>}
        </div>
      )}

      {!isOwner && error && error !== "not_found" && (
        <p className="error">{error}</p>
      )}

      <div className="panel">
        <h2>このキャラの対戦履歴</h2>
        <p className="muted help-text">
          {historyLoading
            ? "読み込み中…"
            : historyTotal === 0
              ? "まだ試合がありません"
              : `${historyTotal} 件`}
        </p>
        <div className="history-list char-history-list">
          {history.map((b) => {
            const fieldBg = mediaSrc(
              b.battlefieldImageUrl,
              b.battlefieldName ?? b.id,
            );
            const faceA = mediaSrc(b.sideAImageUrl, b.sideAName);
            const faceB = mediaSrc(b.sideBImageUrl, b.sideBName);
            const focusA = b.sideACharacterId === id;
            const focusB = b.sideBCharacterId === id;
            return (
              <article
                key={b.id}
                className={`history-card${b.canResume ? " is-active" : ""}${fieldBg ? " has-field" : ""}`}
                style={
                  fieldBg
                    ? ({
                        ["--field-bg" as string]: `url(${fieldBg})`,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                {fieldBg ? (
                  <div className="history-card-field" aria-hidden />
                ) : null}
                <button
                  type="button"
                  className="history-card-main"
                  onClick={() => openBattle(b)}
                >
                  <div className="history-card-top">
                    <div className="history-vs-row">
                      <span
                        className={`history-mini-face${focusA ? " is-focus" : ""}`}
                        aria-hidden
                      >
                        {faceA ? (
                          <img src={faceA} alt="" />
                        ) : (
                          <span className="history-mini-face-ph" />
                        )}
                      </span>
                      <strong className="history-vs">
                        <span className={focusA ? "char-history-self" : undefined}>
                          {b.sideAName}
                        </span>
                        <span className="muted"> vs </span>
                        <span className={focusB ? "char-history-self" : undefined}>
                          {b.sideBName}
                        </span>
                      </strong>
                      <span
                        className={`history-mini-face${focusB ? " is-focus" : ""}`}
                        aria-hidden
                      >
                        {faceB ? (
                          <img src={faceB} alt="" />
                        ) : (
                          <span className="history-mini-face-ph" />
                        )}
                      </span>
                    </div>
                    <span className={`status-pill${b.canResume ? " live" : ""}`}>
                      {b.canResume ? "進行中" : (b.resultLabel ?? "終了")}
                    </span>
                  </div>
                  <p className="history-meta muted">
                    {b.battlefieldName || b.scene}
                    {b.canResume
                      ? ` · ターン ${b.turn}/${b.turnLimit}`
                      : b.turn > 0
                        ? ` · ${b.turn} ターン`
                        : ""}
                  </p>
                  <p className="history-when muted">{formatWhen(b.updatedAt)}</p>
                  <span className="history-cta">
                    {b.canResume ? "続きから再開 →" : "記録を見る →"}
                  </span>
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
