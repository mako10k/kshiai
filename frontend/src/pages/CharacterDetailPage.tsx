import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { BattleListItem, CharacterPublic } from "@kshiai/shared";
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

  useEffect(() => {
    if (!id) return;
    setError(null);
    void api
      .getCharacter(id)
      .then(({ character: c, isOwner: owner }) => {
        setCharacter(c);
        setIsOwner(owner);
        if (owner) void reloadQuota(id);
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
  }, [id, reloadQuota, reloadHistory]);

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
      setAssistant(res.assistantMessage);
      clearChat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
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
        {character.appearance.imageUrl ? (
          <img
            key={mediaSrc(character.appearance.imageUrl, character.updatedAt)}
            src={mediaSrc(character.appearance.imageUrl, character.updatedAt)}
            alt={character.displayName}
            style={{ width: 160, borderRadius: 12 }}
          />
        ) : (
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: 12,
              background: "#0b0e14",
              display: "grid",
              placeItems: "center",
              color: "#5b6780",
            }}
          >
            No Image
          </div>
        )}
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
        <div className="panel">
          <h2>会話で微調整</h2>
          <p className="muted">印象や戦い方の雰囲気を言葉で伝えてください。</p>
          <form className="grid" onSubmit={(e) => void onChat(e)}>
            <textarea
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              placeholder={CHAT_PLACEHOLDER}
              rows={3}
            />
            <button className="btn primary" type="submit" disabled={busy || imageBusy}>
              送信
            </button>
          </form>
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
