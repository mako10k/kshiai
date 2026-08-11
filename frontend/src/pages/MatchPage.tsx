import { useCallback, useMemo, useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type {
  BattlefieldPresetPublic,
  CharacterPublic,
  NarrationStylePublic,
} from "@kshiai/shared";
import { formatRatingForDisplay } from "@kshiai/shared";
import { api } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";
import {
  formatMatchRecord,
  formatWinRate,
  matchupStats,
} from "../match-rating";
import {
  matchesSelectionSearch,
  recordMatchSelectionUsage,
  sortByRecentUsage,
  type MatchSelectionUsage,
} from "../match-selection-preferences";
import { mediaSrc } from "../media";

type MatchDraft = {
  myId: string;
  oppId: string;
  fieldId: string;
  styleId: string;
};

/**
 * Match setup chooses only the public matchup. At turn 0, each character
 * privately chooses an opening strategy from its profile, perception, and
 * bounded memory of this opponent's past battles.
 */
export function MatchPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  /** Survives match draft clear — last used narration becomes the next default. */
  const [lastStyleId, setLastStyleId] = useLocalDraft(
    "match:lastNarrationStyleId",
    "nst_default",
  );
  const defaultMatchDraft = useMemo<MatchDraft>(
    () => ({
      myId: "",
      oppId: "",
      fieldId: "",
      styleId: lastStyleId || "nst_default",
    }),
    [lastStyleId],
  );
  const [draft, setDraft, clearDraft] = useLocalDraft<MatchDraft>(
    "match:setup",
    defaultMatchDraft,
  );
  const [selectionUsage, setSelectionUsage] =
    useLocalDraft<MatchSelectionUsage>("match:selectionUsage", {});
  const { myId, oppId, fieldId, styleId } = draft;

  const [myQuery, setMyQuery] = useState("");
  const [oppQuery, setOppQuery] = useState("");
  const [fieldQuery, setFieldQuery] = useState("");
  const [styleQuery, setStyleQuery] = useState("");

  const rememberSelections = useCallback(
    (selections: Parameters<typeof recordMatchSelectionUsage>[1]) => {
      setSelectionUsage((usage) =>
        recordMatchSelectionUsage(usage, selections),
      );
    },
    [setSelectionUsage],
  );

  const setMyId = (id: string) => setDraft((d) => ({ ...d, myId: id }));
  const setOppId = (id: string) => setDraft((d) => ({ ...d, oppId: id }));
  const setFieldId = (id: string) => setDraft((d) => ({ ...d, fieldId: id }));
  const setStyleId = (id: string) => {
    setLastStyleId(id);
    setDraft((d) => ({ ...d, styleId: id }));
  };
  const [mine, setMine] = useState<CharacterPublic[]>([]);
  const [candidates, setCandidates] = useState<CharacterPublic[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [fields, setFields] = useState<BattlefieldPresetPublic[]>([]);
  const [styles, setStyles] = useState<NarrationStylePublic[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matchupReady = Boolean(myId && oppId);

  const loadCandidates = useCallback(async (query?: string) => {
    const c = await api.candidates(query || undefined, {
      limit: 10,
      offset: 0,
    });
    setCandidates(c.candidates);
    setCandidateTotal(c.total);
    return c;
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadCandidates(oppQuery.trim() || undefined).catch((e) =>
        setError(String(e)),
      );
    }, 250);
    return () => window.clearTimeout(handle);
  }, [oppQuery, loadCandidates]);

  useEffect(() => {
    void (async () => {
      const [c, m, f, s] = await Promise.all([
        loadCandidates(),
        api.listCharacters(undefined, { limit: 50, offset: 0 }),
        api.listBattlefields(),
        api.listNarrationStyles(),
      ]);
      setMine(m.characters);
      setFields(f.battlefields);
      setStyles(s.styles);

      // Deep-link from list/detail: /match?my=…&opp=…&field=…
      const qMy = searchParams.get("my") ?? "";
      const qOpp = searchParams.get("opp") ?? "";
      const qField = searchParams.get("field") ?? "";
      const qStyle = searchParams.get("style") ?? "";
      const hasQuery = Boolean(qMy || qOpp || qField || qStyle);

      // Restore draft IDs only if they still exist; query params win when present
      setDraft((d) => {
        const pickMy =
          (qMy && m.characters.some((x) => x.id === qMy) && qMy) ||
          (d.myId && m.characters.some((x) => x.id === d.myId) && d.myId) ||
          m.characters[0]?.id ||
          "";
        const pickOpp =
          (qOpp &&
            c.candidates.some((x) => x.id === qOpp && x.id !== pickMy) &&
            qOpp) ||
          (d.oppId &&
            c.candidates.some((x) => x.id === d.oppId && x.id !== pickMy) &&
            d.oppId) ||
          "";
        const pickField =
          (qField && f.battlefields.some((x) => x.id === qField) && qField) ||
          (d.fieldId && f.battlefields.some((x) => x.id === d.fieldId)
            ? d.fieldId
            : "") ||
          "";
        const pickStyle =
          (qStyle && s.styles.some((x) => x.id === qStyle) && qStyle) ||
          (d.styleId && s.styles.some((x) => x.id === d.styleId) && d.styleId) ||
          (lastStyleId &&
            s.styles.some((x) => x.id === lastStyleId) &&
            lastStyleId) ||
          s.styles.find((x) => x.id === "nst_default")?.id ||
          s.styles[0]?.id ||
          "";

        return {
          myId: pickMy,
          oppId: pickOpp && pickOpp !== pickMy ? pickOpp : "",
          fieldId: pickField,
          styleId: pickStyle,
        };
      });

      // Clear query so refresh keeps draft, not sticky deep-link
      if (hasQuery) {
        setSearchParams({}, { replace: true });
      }
    })().catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fieldOpts = useCallback(
    () =>
      fieldId
        ? ({
            battlefieldMode: "preset" as const,
            battlefieldPresetId: fieldId,
          } as const)
        : ({ battlefieldMode: "random" as const } as const),
    [fieldId],
  );

  const myChar = useMemo(
    () => mine.find((c) => c.id === myId) ?? null,
    [mine, myId],
  );
  const oppChar = useMemo(
    () => candidates.find((c) => c.id === oppId) ?? null,
    [candidates, oppId],
  );
  const opponentStats = useMemo(
    () => (myChar && oppChar ? matchupStats(oppChar, myChar) : null),
    [myChar, oppChar],
  );
  const fieldMeta = useMemo(
    () => fields.find((f) => f.id === fieldId) ?? null,
    [fields, fieldId],
  );
  const styleMeta = useMemo(
    () => styles.find((s) => s.id === styleId) ?? null,
    [styles, styleId],
  );
  const visibleMine = useMemo(
    () =>
      sortByRecentUsage(mine, "mine", selectionUsage).filter(
        (character) =>
          character.id === myId ||
          matchesSelectionSearch(myQuery, [
            character.displayName,
            character.names.realName,
            ...character.names.nicknames,
            ...character.names.epithets,
            ...character.tags,
            ...character.traits,
            character.narrativeBlurb,
          ]),
      ),
    [mine, myId, myQuery, selectionUsage],
  );
  const visibleOpponents = useMemo(
    () =>
      sortByRecentUsage(
        candidates.filter((character) => character.id !== myId),
        "opponent",
        selectionUsage,
      ).filter(
        (character) =>
          character.id === oppId ||
          matchesSelectionSearch(oppQuery, [
            character.displayName,
            character.names.realName,
            ...character.names.nicknames,
            ...character.names.epithets,
            ...character.tags,
            ...character.traits,
            character.narrativeBlurb,
          ]),
      ),
    [candidates, myId, oppId, oppQuery, selectionUsage],
  );
  const visibleFields = useMemo(
    () =>
      sortByRecentUsage(fields, "battlefield", selectionUsage).filter(
        (field) =>
          field.id === fieldId ||
          matchesSelectionSearch(fieldQuery, [
            field.displayName,
            field.categoryLabel,
            ...field.tags,
            ...field.terrainHints,
            ...field.obstacleHints,
            ...field.conditionHints,
            field.narrativeBlurb,
          ]),
      ),
    [fieldId, fieldQuery, fields, selectionUsage],
  );
  const visibleStyles = useMemo(
    () =>
      sortByRecentUsage(styles, "narrationStyle", selectionUsage).filter(
        (style) =>
          style.id === styleId ||
          matchesSelectionSearch(styleQuery, [
            style.displayName,
            style.description,
            ...style.tags,
          ]),
      ),
    [selectionUsage, styleId, styleQuery, styles],
  );

  async function pickRandomOpponent() {
    if (!myId) return;
    setBusy(true);
    setError(null);
    try {
      const { opponent } = await api.randomOpponent(myId);
      setOppId(opponent.id);
      rememberSelections({ opponent: opponent.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function pickAutoOpponent() {
    if (!myId) return;
    setBusy(true);
    setError(null);
    try {
      const { opponent } = await api.autoOpponent(myId);
      setOppId(opponent.id);
      rememberSelections({ opponent: opponent.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function startBattle() {
    if (!myId || !oppId) {
      setError("対戦カードが未完成です");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { battle } = await api.createBattle(myId, oppId, {
        narrationStyleId: styleId || undefined,
        ...fieldOpts(),
      });
      rememberSelections({
        mine: myId,
        opponent: oppId,
        battlefield: fieldId,
        narrationStyle: styleId,
      });
      // Keep narration style for next match; clear only the matchup draft
      if (styleId) setLastStyleId(styleId);
      clearDraft();
      nav(`/battles/${battle.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="match-page">
      <div className="page-header">
        <h1>対戦セットアップ</h1>
        <Link to="/" className="btn ghost page-header-back">
          メニュー
        </Link>
      </div>

      <div className="panel match-setup">
          <p className="muted help-text">
            対戦の組み合わせを決めると、その後はキャラクター自身が相手との過去の方針・反省、現在の戦場と状態から、非公開の開始方針を選びます。
          </p>

          <label className="field">
            <span className="field-label">自分のキャラ</span>
            <input
              type="search"
              value={myQuery}
              onChange={(e) => setMyQuery(e.target.value)}
              placeholder="名前・タグ・特徴で検索"
              aria-label="自分のキャラを検索"
            />
            <select
              value={myId}
              onChange={(e) => {
                const id = e.target.value;
                setMyId(id);
                rememberSelections({ mine: id });
                setOppId("");
              }}
            >
              <option value="">選択…</option>
              {visibleMine.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>

          {myChar && (
            <div className="matchup-chip">
              <Link
                to={`/characters/${myChar.id}`}
                className="matchup-chip-face"
                aria-label={`${myChar.displayName} の詳細`}
              >
                {myChar.appearance.imageUrl ? (
                  <img
                    key={mediaSrc(myChar.appearance.imageUrl, myChar.updatedAt)}
                    src={mediaSrc(myChar.appearance.imageUrl, myChar.updatedAt)}
                    alt=""
                  />
                ) : (
                  <div className="matchup-chip-ph" />
                )}
              </Link>
              <div>
                <Link to={`/characters/${myChar.id}`}>
                  <strong>{myChar.displayName}</strong>
                </Link>
                <p className="muted help-text">
                  公開 RT {formatRatingForDisplay(myChar.record.rating)}
                  {myChar.record.provisional ? " 暫定" : ""} ·{" "}
                  {myChar.record.wins}勝{myChar.record.losses}敗
                  {myChar.recordOverall
                    ? ` ／ 全体 RT ${formatRatingForDisplay(myChar.recordOverall.rating)} · ${myChar.recordOverall.wins}勝${myChar.recordOverall.losses}敗`
                    : ""}
                </p>
              </div>
            </div>
          )}

          <label className="field">
            <span className="field-label">戦場（任意）</span>
            <input
              type="search"
              value={fieldQuery}
              onChange={(e) => setFieldQuery(e.target.value)}
              placeholder="名前・カテゴリ・タグで検索"
              aria-label="戦場を検索"
            />
            <select
              value={fieldId}
              onChange={(e) => {
                const id = e.target.value;
                setFieldId(id);
                rememberSelections({ battlefield: id });
              }}
            >
              <option value="">未指定（開始時にランダム具体化）</option>
              {visibleFields.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.isSystem ? "[標準] " : ""}
                  {b.displayName}
                </option>
              ))}
            </select>
          </label>
          {fieldMeta && (
            <p className="muted help-text">{fieldMeta.narrativeBlurb}</p>
          )}

          <label className="field">
            <span className="field-label">ナレーションスタイル</span>
            <input
              type="search"
              value={styleQuery}
              onChange={(e) => setStyleQuery(e.target.value)}
              placeholder="名前・説明・タグで検索"
              aria-label="ナレーションスタイルを検索"
            />
            <select
              value={styleId}
              onChange={(e) => {
                const id = e.target.value;
                setStyleId(id);
                rememberSelections({ narrationStyle: id });
              }}
            >
              {visibleStyles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.isSystem ? "[標準] " : ""}
                  {s.displayName}
                </option>
              ))}
            </select>
          </label>
          {styleMeta && (
            <p className="muted help-text">
              {styleMeta.description}
              {styleMeta.perspective
                ? ` · 視点: ${
                    (
                      {
                        self: "一人称（自分）",
                        foe: "相手",
                        external: "三人称限定",
                        omniscient: "全知",
                        fluid: "可変",
                      } as Record<string, string>
                    )[styleMeta.perspective] ?? styleMeta.perspective
                  }`
                : ""}
              {" · "}
              <Link to="/narration-styles">スタイルを編集・追加</Link>
            </p>
          )}

          <label className="field">
            <span className="field-label">相手</span>
            <input
              type="search"
              value={oppQuery}
              onChange={(e) => setOppQuery(e.target.value)}
              placeholder="名前・タグ・特徴で検索"
              aria-label="対戦相手を検索"
              disabled={!myId}
            />
            <select
              value={oppId}
              onChange={(e) => {
                const id = e.target.value;
                setOppId(id);
                rememberSelections({ opponent: id });
              }}
              disabled={!myId}
            >
              <option value="">相手を選ぶ…</option>
              {visibleOpponents.map((c) => {
                const stats = myChar ? matchupStats(c, myChar) : null;
                return (
                  <option key={c.id} value={c.id}>
                    {stats
                      ? `${c.displayName} · ${stats.recordScope} ${formatMatchRecord(stats.record)} · 実績勝率 ${formatWinRate(stats.actualWinRate)} · 対あなた予想 ${formatWinRate(stats.predictedWinRate)}`
                      : c.displayName}
                  </option>
                );
              })}
            </select>
            <p className="muted help-text">
              候補は最大10件。全{candidateTotal}件から検索でさらに絞り込みできます。
            </p>
          </label>
          {myChar ? (
            <p className="muted help-text" style={{ marginTop: "-0.35rem" }}>
              実績勝率は勝ち1・引き分け0.5として算出。予想勝率は選択中の自キャラとのレーティング差から算出します。
            </p>
          ) : null}

          <div className="btn-stack">
            <button
              className="btn primary"
              type="button"
              disabled={busy || !myId}
              onClick={() => void pickAutoOpponent()}
            >
              同程度の相手を自動選択
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || !myId}
              onClick={() => void pickRandomOpponent()}
            >
              相手をランダム選択
            </button>
          </div>

          {oppChar && (
            <div className="matchup-chip">
              <Link
                to={`/characters/${oppChar.id}`}
                className="matchup-chip-face"
                aria-label={`${oppChar.displayName} の詳細`}
              >
                {oppChar.appearance.imageUrl ? (
                  <img
                    key={mediaSrc(oppChar.appearance.imageUrl, oppChar.updatedAt)}
                    src={mediaSrc(oppChar.appearance.imageUrl, oppChar.updatedAt)}
                    alt=""
                  />
                ) : (
                  <div className="matchup-chip-ph" />
                )}
              </Link>
              <div>
                <Link to={`/characters/${oppChar.id}`}>
                  <strong>VS {oppChar.displayName}</strong>
                </Link>
                <p className="muted help-text">
                  公開 RT {formatRatingForDisplay(oppChar.record.rating)}
                  {oppChar.record.provisional ? " 暫定" : ""}
                  {oppChar.recordOverall
                    ? ` ／ 全体 RT ${formatRatingForDisplay(oppChar.recordOverall.rating)}`
                    : ""}
                </p>
                {opponentStats ? (
                  <p className="muted help-text">
                    個別戦績（{opponentStats.recordScope}） {formatMatchRecord(opponentStats.record)}
                    {" · "}実績勝率 {formatWinRate(opponentStats.actualWinRate)}
                    {" · "}対あなた予想勝率 {formatWinRate(opponentStats.predictedWinRate)}
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {error && <p className="error">{error}</p>}
          {mine.length === 0 && (
            <p className="muted">
              先に <Link to="/characters">キャラを生成</Link> してください。
            </p>
          )}
      </div>

      <div className="match-action-spacer" aria-hidden="true" />
      <div className="match-action-bar">
        <button
          className="btn primary match-start-btn"
          type="button"
          disabled={!matchupReady || busy}
          onClick={() => void startBattle()}
        >
          {busy ? "開始中…" : "試合開始（方針はキャラが決める）"}
        </button>
      </div>
    </div>
  );
}
