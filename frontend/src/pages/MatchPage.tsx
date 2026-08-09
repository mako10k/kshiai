import { useCallback, useMemo, useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type {
  BattlefieldPresetPublic,
  BattlePolicyOption,
  BattlePolicyOptionPublic,
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

type PolicyBundle = {
  options: BattlePolicyOptionPublic[];
  engineOptions: BattlePolicyOption[];
  defaultSelectedIds: string[];
  rationale: string;
  fieldHint: string;
};

type MatchDraft = {
  myId: string;
  oppId: string;
  fieldId: string;
  styleId: string;
  step: 1 | 2;
};

/**
 * Explicit wizard — no hidden auto-start, no policy regen on every field flick.
 *
 * Step 1: pick my char / field / opponent (random only fills opponent)
 * Step 2: confirm & start (the character chooses its own strategy at turn 0)
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
      step: 1,
    }),
    [lastStyleId],
  );
  const [draft, setDraft, clearDraft] = useLocalDraft<MatchDraft>(
    "match:setup",
    defaultMatchDraft,
  );
  const [selectionUsage, setSelectionUsage] =
    useLocalDraft<MatchSelectionUsage>("match:selectionUsage", {});
  const { myId, oppId, fieldId, styleId, step } = draft;

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
  const setStep = (s: 1 | 2) => setDraft((d) => ({ ...d, step: s }));

  const [mine, setMine] = useState<CharacterPublic[]>([]);
  const [candidates, setCandidates] = useState<CharacterPublic[]>([]);
  const [fields, setFields] = useState<BattlefieldPresetPublic[]>([]);
  const [styles, setStyles] = useState<NarrationStylePublic[]>([]);

  const [policyOptions, setPolicyOptions] = useState<BattlePolicyOptionPublic[]>(
    [],
  );
  const [engineOptions, setEngineOptions] = useState<BattlePolicyOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rationale, setRationale] = useState<string | null>(null);
  const [fieldHint, setFieldHint] = useState<string | null>(null);
  /** Matchup key policies were generated for */
  const [policyKey, setPolicyKey] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);

  const keyOf = (my: string, opp: string, field: string) =>
    `${my}|${opp}|${field || "random"}`;

  const currentKey = keyOf(myId, oppId, fieldId);
  const matchupReady = Boolean(myId && oppId);
  const policiesFresh = policyKey === currentKey && engineOptions.length > 0;
  const policyGroups = useMemo(() => {
    const groups = new Map<
      string,
      { title: string; options: BattlePolicyOptionPublic[] }
    >();
    for (const option of policyOptions) {
      const group = groups.get(option.perspectiveId) ?? {
        title: option.perspectiveTitle,
        options: [],
      };
      group.options.push(option);
      groups.set(option.perspectiveId, group);
    }
    return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
  }, [policyOptions]);

  useEffect(() => {
    void (async () => {
      const [c, m, f, s] = await Promise.all([
        api.candidates(),
        api.listCharacters(),
        api.listBattlefields(),
        api.listNarrationStyles(),
      ]);
      setCandidates(c.candidates);
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

        // Coming from a character card: start on step 1 with that char selected
        return {
          myId: pickMy,
          oppId: pickOpp && pickOpp !== pickMy ? pickOpp : "",
          fieldId: pickField,
          styleId: pickStyle,
          step: 1,
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

  function invalidatePolicies() {
    setPolicyOptions([]);
    setEngineOptions([]);
    setSelectedIds([]);
    setRationale(null);
    setFieldHint(null);
    setPolicyKey(null);
  }

  async function generatePolicies(): Promise<PolicyBundle> {
    if (!myId || !oppId) throw new Error("キャラと相手を先に選んでください");
    const res = await api.generatePolicies({
      myCharacterId: myId,
      opponentCharacterId: oppId,
      ...fieldOpts(),
    });
    return {
      options: res.options,
      engineOptions: res.engineOptions,
      defaultSelectedIds: res.defaultSelectedIds,
      rationale: res.rationale,
      fieldHint: res.fieldHint,
    };
  }

  function applyBundle(bundle: PolicyBundle) {
    setPolicyOptions(bundle.options);
    setEngineOptions(bundle.engineOptions);
    setSelectedIds([]);
    setRationale(bundle.rationale);
    setFieldHint(bundle.fieldHint);
    setPolicyKey(currentKey);
  }

  async function goToPolicies() {
    if (!matchupReady) {
      setError("自分のキャラと相手を選んでください");
      return;
    }
    setError(null);
    // Only regenerate when matchup changed or empty
    if (!policiesFresh) {
      setPolicyBusy(true);
      try {
        const bundle = await generatePolicies();
        applyBundle(bundle);
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed");
        return;
      } finally {
        setPolicyBusy(false);
      }
    }
    setStep(2);
  }

  async function regeneratePolicies() {
    if (!matchupReady) return;
    setPolicyBusy(true);
    setError(null);
    try {
      const bundle = await generatePolicies();
      applyBundle(bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setPolicyBusy(false);
    }
  }

  function setPerspectiveChoice(perspectiveId: string, id: string | null) {
    const groupIds = new Set(
      policyOptions
        .filter((option) => option.perspectiveId === perspectiveId)
        .map((option) => option.id),
    );
    setSelectedIds((previous) => [
      ...previous.filter((selected) => !groupIds.has(selected)),
      ...(id ? [id] : []),
    ]);
  }

  async function pickRandomOpponent() {
    if (!myId) return;
    setBusy(true);
    setError(null);
    try {
      const { opponent } = await api.randomOpponent(myId);
      setOppId(opponent.id);
      rememberSelections({ opponent: opponent.id });
      // Opponent change invalidates policies; stay on step 1
      invalidatePolicies();
      if (step !== 1) setStep(1);
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
      invalidatePolicies();
      if (step !== 1) setStep(1);
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

      <nav className="wizard-tabs" aria-label="セットアップ手順">
        <button
          type="button"
          className={`wizard-tab${step === 1 ? " is-active" : ""}`}
          onClick={() => setStep(1)}
        >
          <span className="wizard-tab-n">1</span>
          対戦カード
        </button>
        <button
          type="button"
          className={`wizard-tab${step === 2 ? " is-active" : ""}`}
          disabled={!matchupReady}
          onClick={() => void goToPolicies()}
        >
          <span className="wizard-tab-n">2</span>
          ケース方針
        </button>
      </nav>

      {step === 1 && (
        <div className="panel match-setup">
          <p className="muted help-text">
            まず対戦の組み合わせだけ決めます。方針の生成は次の画面です。
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
                invalidatePolicies();
                setStep(1);
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
                // Field affects policies → mark stale, stay on step 1
                invalidatePolicies();
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
                invalidatePolicies();
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
      )}

      {step === 2 && (
        <div className="panel match-setup policy-section">
          <div className="matchup-summary muted help-text">
            {myChar?.displayName ?? "?"} vs {oppChar?.displayName ?? "?"}
            {fieldMeta ? ` ／ ${fieldMeta.displayName}` : " ／ 戦場ランダム"}
          </div>

          <div className="policy-section-head">
            <h2 className="setup-section-title">ケース方針</h2>
            {policiesFresh && (
              <span className="policy-count">
                {selectedIds.length}/{policyGroups.length} 観点指定
              </span>
            )}
          </div>

          <p className="muted help-text">
            観点ごとに二つの案から選べます。決めない観点は「お任せ」にすると、キャラクター自身が状況に合わせます。
          </p>

          {policyBusy && <div className="empty-hint">方針を生成中…</div>}

          {fieldHint && !policyBusy && (
            <p className="field-hint muted">{fieldHint}</p>
          )}
          {rationale && !policyBusy && (
            <p className="rationale muted">{rationale}</p>
          )}

          <div className="policy-toolbar">
            <button
              type="button"
              className="btn"
              disabled={policyBusy || !matchupReady}
              onClick={() => void regeneratePolicies()}
            >
              {policyBusy ? "生成中…" : "再提案"}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={policyOptions.length === 0}
              onClick={() => setSelectedIds([])}
            >
              すべてお任せ
            </button>
          </div>

          <div className="policy-list" aria-label="対決方針の観点">
            {policyGroups.map((group) => {
              const selected = group.options.find((option) =>
                selectedIds.includes(option.id),
              );
              return (
                <fieldset className="policy-perspective" key={group.id}>
                  <legend>{group.title}</legend>
                  <div className="policy-perspective-choices">
                    {group.options.map((opt) => {
                      const checked = selected?.id === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`policy-card${checked ? " is-on" : ""}`}
                          aria-pressed={checked}
                          onClick={() => setPerspectiveChoice(group.id, opt.id)}
                        >
                          <span className="policy-card-check" aria-hidden>
                            {checked ? "✓" : ""}
                          </span>
                          <span className="policy-card-body">
                            <span className="policy-card-title">{opt.title}</span>
                            <span className="policy-card-when">
                              <span className="policy-k">いつ</span>
                              <span className="policy-card-text">{opt.when}</span>
                            </span>
                            <span className="policy-card-then">
                              <span className="policy-k">方針</span>
                              <span className="policy-card-text">{opt.then}</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`policy-card policy-card-unspecified${selected ? "" : " is-on"}`}
                      aria-pressed={!selected}
                      onClick={() => setPerspectiveChoice(group.id, null)}
                    >
                      <span className="policy-card-check" aria-hidden>
                        {selected ? "" : "✓"}
                      </span>
                      <span className="policy-card-body">
                        <span className="policy-card-title">お任せ</span>
                        <span className="policy-card-text">
                          キャラクター自身が状況に合わせる
                        </span>
                      </span>
                    </button>
                  </div>
                </fieldset>
              );
            })}
          </div>

          {!policyBusy && policyOptions.length === 0 && (
            <div className="empty-hint">
              方針がまだありません。「再提案」を押してください。
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <button
            type="button"
            className="btn ghost"
            onClick={() => setStep(1)}
          >
            ← 対戦カードに戻る
          </button>
        </div>
      )}

      <div className="match-action-bar">
        {step === 1 ? (
          <button
            className="btn primary match-start-btn"
            type="button"
            disabled={!matchupReady || busy || policyBusy}
            onClick={() => void startBattle()}
          >
            {busy ? "開始中…" : "試合開始（方針はキャラが決める）"}
          </button>
        ) : (
          <button
            className="btn primary match-start-btn"
            type="button"
            disabled={
              busy ||
              policyBusy ||
              !matchupReady ||
              (!policiesFresh && policyOptions.length === 0)
            }
            onClick={() => void startBattle()}
          >
            {busy
              ? "開始中…"
              : policyBusy
                ? "方針準備中…"
                : `試合開始${
                    selectedIds.length
                      ? `（${selectedIds.length}観点を指定）`
                      : "（お任せ）"
                  }`}
          </button>
        )}
      </div>
    </div>
  );
}
