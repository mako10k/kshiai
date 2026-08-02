import { useCallback, useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  BattlefieldPresetPublic,
  BattlePolicyOption,
  BattlePolicyOptionPublic,
  CharacterPublic,
} from "@kshiai/shared";
import { api } from "../api";
import { useLocalDraft } from "../hooks/useLocalDraft";
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
  step: 1 | 2;
};

const DEFAULT_MATCH_DRAFT: MatchDraft = {
  myId: "",
  oppId: "",
  fieldId: "",
  step: 1,
};

/**
 * Explicit wizard — no hidden auto-start, no policy regen on every field flick.
 *
 * Step 1: pick my char / field / opponent (random only fills opponent)
 * Step 2: generate policies once (user-triggered), multi-select
 * Step 3: confirm & start
 */
export function MatchPage() {
  const nav = useNavigate();
  const [draft, setDraft, clearDraft] = useLocalDraft<MatchDraft>(
    "match:setup",
    DEFAULT_MATCH_DRAFT,
  );
  const { myId, oppId, fieldId, step } = draft;

  const setMyId = (id: string) => setDraft((d) => ({ ...d, myId: id }));
  const setOppId = (id: string) => setDraft((d) => ({ ...d, oppId: id }));
  const setFieldId = (id: string) => setDraft((d) => ({ ...d, fieldId: id }));
  const setStep = (s: 1 | 2) => setDraft((d) => ({ ...d, step: s }));

  const [mine, setMine] = useState<CharacterPublic[]>([]);
  const [candidates, setCandidates] = useState<CharacterPublic[]>([]);
  const [fields, setFields] = useState<BattlefieldPresetPublic[]>([]);

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

  useEffect(() => {
    void (async () => {
      const [c, m, f] = await Promise.all([
        api.candidates(),
        api.listCharacters(),
        api.listBattlefields(),
      ]);
      setCandidates(c.candidates);
      setMine(m.characters);
      setFields(f.battlefields);
      // Restore draft IDs only if they still exist; otherwise fall back
      setDraft((d) => {
        const myOk = d.myId && m.characters.some((x) => x.id === d.myId);
        const oppOk =
          d.oppId && c.candidates.some((x) => x.id === d.oppId);
        const fieldOk =
          !d.fieldId || f.battlefields.some((x) => x.id === d.fieldId);
        return {
          myId: myOk ? d.myId : m.characters[0]?.id ?? "",
          oppId: oppOk ? d.oppId : "",
          fieldId: fieldOk ? d.fieldId : "",
          step: myOk && oppOk ? d.step : 1,
        };
      });
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
  const fieldMeta = useMemo(
    () => fields.find((f) => f.id === fieldId) ?? null,
    [fields, fieldId],
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
    setSelectedIds(bundle.defaultSelectedIds);
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

  function togglePolicy(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectDefaults() {
    setSelectedIds(
      policyOptions.filter((o) => o.defaultSelected).map((o) => o.id),
    );
  }

  async function pickOpponent(mode: "random" | "auto") {
    if (!myId) return;
    setBusy(true);
    setError(null);
    try {
      const { opponent } =
        mode === "random"
          ? await api.randomOpponent(myId)
          : await api.autoOpponent(myId);
      setOppId(opponent.id);
      // Opponent change invalidates policies; stay on step 1
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
    let policies = engineOptions;
    let selected = selectedIds;

    if (!policiesFresh) {
      setPolicyBusy(true);
      try {
        const bundle = await generatePolicies();
        applyBundle(bundle);
        policies = bundle.engineOptions;
        selected = bundle.defaultSelectedIds;
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed");
        setPolicyBusy(false);
        return;
      } finally {
        setPolicyBusy(false);
      }
    }

    if (selected.length === 0) {
      selected = policies.filter((p) => p.defaultSelected).map((p) => p.id);
    }
    if (selected.length === 0 && policies.length > 0) {
      selected = [policies[0]!.id];
    }
    if (policies.length === 0) {
      setError("方針がありません。再提案してください。");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { battle } = await api.createBattle(myId, oppId, {
        policies,
        selectedPolicyIds: selected,
        ...fieldOpts(),
      });
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
            <select
              value={myId}
              onChange={(e) => {
                setMyId(e.target.value);
                setOppId("");
                invalidatePolicies();
                setStep(1);
              }}
            >
              <option value="">選択…</option>
              {mine.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>

          {myChar && (
            <div className="matchup-chip">
              {myChar.appearance.imageUrl ? (
                <img
                  key={mediaSrc(myChar.appearance.imageUrl, myChar.updatedAt)}
                  src={mediaSrc(myChar.appearance.imageUrl, myChar.updatedAt)}
                  alt=""
                />
              ) : (
                <div className="matchup-chip-ph" />
              )}
              <div>
                <strong>{myChar.displayName}</strong>
                <p className="muted help-text">
                  RT {Math.round(myChar.record.rating)}
                  {myChar.record.provisional ? " 暫定" : ""} ·{" "}
                  {myChar.record.wins}勝{myChar.record.losses}敗
                </p>
              </div>
            </div>
          )}

          <label className="field">
            <span className="field-label">戦場（任意）</span>
            <select
              value={fieldId}
              onChange={(e) => {
                setFieldId(e.target.value);
                // Field affects policies → mark stale, stay on step 1
                invalidatePolicies();
              }}
            >
              <option value="">未指定（開始時にランダム具体化）</option>
              {fields.map((b) => (
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
            <span className="field-label">相手</span>
            <select
              value={oppId}
              onChange={(e) => {
                setOppId(e.target.value);
                invalidatePolicies();
              }}
              disabled={!myId}
            >
              <option value="">相手を選ぶ…</option>
              {candidates
                .filter((c) => c.id !== myId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
            </select>
          </label>

          <div className="btn-stack">
            <button
              className="btn"
              type="button"
              disabled={busy || !myId}
              onClick={() => void pickOpponent("random")}
            >
              相手をランダム選択
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy || !myId}
              onClick={() => void pickOpponent("auto")}
            >
              相手を自動選択
            </button>
          </div>

          {oppChar && (
            <div className="matchup-chip">
              {oppChar.appearance.imageUrl ? (
                <img
                  key={mediaSrc(oppChar.appearance.imageUrl, oppChar.updatedAt)}
                  src={mediaSrc(oppChar.appearance.imageUrl, oppChar.updatedAt)}
                  alt=""
                />
              ) : (
                <div className="matchup-chip-ph" />
              )}
              <div>
                <strong>VS {oppChar.displayName}</strong>
                <p className="muted help-text">
                  RT {Math.round(oppChar.record.rating)}
                  {oppChar.record.provisional ? " 暫定" : ""} ·{" "}
                  {oppChar.record.wins}勝{oppChar.record.losses}敗
                </p>
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
                {selectedIds.length}/{policyOptions.length} 選択
              </span>
            )}
          </div>

          <p className="muted help-text">
            ざっくりした戦い方を複数選べます（例: 劣勢なら守り、機があれば押す）。細部は試合中に任せます。
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
              onClick={selectDefaults}
            >
              推奨に戻す
            </button>
          </div>

          <div className="policy-list" role="group" aria-label="ケース方針">
            {policyOptions.map((opt) => {
              const checked = selectedIds.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`policy-card${checked ? " is-on" : ""}`}
                  aria-pressed={checked}
                  onClick={() => togglePolicy(opt.id)}
                >
                  <span className="policy-card-check" aria-hidden>
                    {checked ? "✓" : ""}
                  </span>
                  <span className="policy-card-body">
                    <span className="policy-card-title">
                      {opt.title}
                      {opt.defaultSelected ? (
                        <span className="tag">推奨</span>
                      ) : null}
                    </span>
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
            onClick={() => void goToPolicies()}
          >
            {policyBusy ? "準備中…" : "次へ：ケース方針を決める"}
          </button>
        ) : (
          <button
            className="btn primary match-start-btn"
            type="button"
            disabled={
              busy ||
              policyBusy ||
              !matchupReady ||
              (!policiesFresh && policyOptions.length === 0) ||
              (policiesFresh && selectedIds.length === 0)
            }
            onClick={() => void startBattle()}
          >
            {busy
              ? "開始中…"
              : policyBusy
                ? "方針準備中…"
                : `試合開始${selectedIds.length ? `（方針 ${selectedIds.length}）` : ""}`}
          </button>
        )}
      </div>
    </div>
  );
}
