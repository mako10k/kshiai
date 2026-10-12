// R: Render isolated turn plans and one complete, ordered canonical adjudication contract.
// Prompt schema only: the pinned SDK vendor converter preserves optional fields;
// the strict wire-format helper rejects existing world operations with optional fields.
// Contract coverage in reserved-turn-execution.test.ts exercises full request rendering.
import { zodToJsonSchema } from "openai/_vendor/zod-to-json-schema/index";
import { ReservedTurnPlanSchema, ReservedTurnTraceSchema, ReservedTurnTraceV2Schema, ReservedTurnNarrationSchema, type ReservedTurnWorld, type OrderedReservation, type ReservedTurnPromptRevision } from "@kshiai/shared";
export const reservedPlanSystem = [
  "予約ターンパイプライン v1。本人の知覚・資料・記憶から、このターンに試みる行動を0〜5件、実行したい順に予約する。5件を埋める必要はない。",
  "行動は単一の試み。成功・他者の行動・世界の変化を先に確定しない。intentに動作と狙い、targetsに提示された参照、必要ならconditionに実行条件を書く。予約は今ターン限り。相手の途中の行為へ反応したい場合は条件を予約に含める。",
  "通常攻撃・技・環境への働きかけも同じ予約形式。前ターンの成否と消耗から今の方針を選ぶ。同じ台詞や意図を機械的に繰り返さず、変化がなければ少数の予約でよい。",
  "返答はJSONのみ。必須actions、任意speech、必須memory。memoryは次の判断に残す優先順最大5文字列。正確な文字列1〜5は全て更新前順位への参照でID/本文を保持する。新規本文は1〜400Unicode code point。省略した旧記憶は削除、[]は全消去。存在しない順位と重複参照は禁止。",
  JSON.stringify(zodToJsonSchema(ReservedTurnPlanSchema, { name: "reserved_turn_plan", openaiStrictMode: false })),
].join("\n");
export function reservedPlanSystemFor(revision: ReservedTurnPromptRevision): string {
  if (revision !== "reserved-turn-prompt-v5") return reservedPlanSystem;
  return reservedPlanSystem + "\n予約ターン計画プロンプト v5。失敗・中止した予約も今ターンの貴重な枠を消費し、破棄される。追加や差し替えはできない。失敗しただけで一律の追加資源罰は課さないが、実際の消耗や副作用は裁定される。本人の性格と状況から枠の使い方を選ぶ。慎重なら成功確率・余力・安全な条件を重視し、投機的なら失敗の代償を承知で大きな効果を狙い、計画的なら先行予約の成否・消耗・相手の割込みを予測して順序と条件を組み立てる。これらは例であり性格を固定分類しない。前の予約が成功したと決めつけず、不成立の場合も考える。裁定の補正は既存予約の評価だけで、本人の再計画ではない。";
}
// Prompt metadata only: factor identical schema objects without dropping any fields or constraints.
export function compactReservedAdjudicationSchema(revision: ReservedTurnPromptRevision = "reserved-turn-prompt-v3"): object {
  const schema = zodToJsonSchema((revision === "reserved-turn-prompt-v4" || revision === "reserved-turn-prompt-v5") ? ReservedTurnTraceV2Schema : ReservedTurnTraceSchema, { $refStrategy: "none", openaiStrictMode: false });
  const counts = new Map<string, number>();
  function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function count(value: unknown): void {
    if (Array.isArray(value)) { for (const item of value) count(item); return; }
    if (!object(value)) return;
    const key = JSON.stringify(value);
    const schemaNode = typeof value.type === "string" || [value.anyOf, value.oneOf, value.allOf, value.enum].some(Array.isArray);
    if (schemaNode && key.length >= 60) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const item of Object.values(value)) count(item);
  }
  count(schema);
  const definitions: Record<string, unknown> = {};
  const names = new Map<string, string>();
  function factor(value: unknown, inline = false): unknown {
    if (Array.isArray(value)) return value.map((item: unknown) => factor(item));
    if (!object(value)) return value;
    const key = JSON.stringify(value);
    if (!inline && (counts.get(key) ?? 0) * (key.length - 40) > key.length + 30) {
      let name = names.get(key);
      if (!name) {
        name = `reserved${names.size}`; names.set(key, name);
        definitions[name] = factor(value, true);
      }
      return { $ref: `#/$defs/${name}` };
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, factor(item)]));
  }
  const compact = factor(schema, true);
  if (!object(compact)) throw new Error("RESERVED_SCHEMA_OBJECT_REQUIRED");
  return { ...compact, $defs: definitions };
}
export function reservedAdjudicationSystem(revision: ReservedTurnPromptRevision = "reserved-turn-prompt-v1"): string {
  return [
    "予約ターン裁定 v1。入力の不変資料と正準世界だけを根拠に、指定orderの各予約を一度ずつ裁定する。返答はJSON resultsのみ。",
    "各結果は先行結果の更新後の世界を読む。順序/side/reservationIdを変更しない。baseRevisionは入力state.revisionから各結果ごとに1増える。world.revisionとは別。ターン途中のキャラクター判断はない。",
    (revision === "reserved-turn-prompt-v4" || revision === "reserved-turn-prompt-v5")
      ? "予約ターン出力 v2。success/partial/failure/cancelled、理由、updates、observationsを返す。観察など情報を得る行動は、知覚できた具体的な結果をobservationsに記せばupdates[]で成功/部分成功としてよい。理由だけの空の成功は禁止。条件や根拠がなければ失敗とする。物理的な行動は実際の変化をupdatesに記す。攻撃が当たったなら妥当なhp減少、移動ならworldの配置/距離更新。形式を満たすためだけの損害・消耗・姿勢変更を作らない。失敗時も必要な消耗・副作用を記す。"
      : "success/partial/failure/cancelled、理由、具体的updates、observationsを返す。成功/部分成功は実際の変化を持つ。攻撃が当たったなら妥当なhp減少、移動ならworldの配置/距離更新、失敗なら理由と必要な消耗・副作用を記す。描写だけで成功にしない。",
    "targetsは各sideのobservedReferencesと対応させる。selfはa側ならcharacter.a、b側ならcharacter.b。opponentは逆側。物の参照はstate.world.entitiesのobjectProfile.observerRefs/ラベルと照合し、本人が提示されていない対象への既知の狙いを捏造しない。",
    "条件の成否、先行する傷・位置・遮蔽・物の変化・資源の残量を評価する。どちらかがhp0なら残りを全てcancelled、updates[]にする。本人が不在/意識を失った場合も中止。復活・資源上限超過・負の残量は禁止。資源コストは重複請求せず、技や身体動作の相応の負担と一緒に裁定する。",
    "resource更新は{kind:'resource',side:'a'|'b',resource:'hp'|'mp'|'stamina',delta:整数}。残量0..最大値に収まる実際の増減を出す。world更新は{kind:'world',operation:以下schemaのworld operation}。参照は既存正準IDを使い、順次整合性を保つ。新しい物体や状態は不変の資料と行為から成立する場合だけ。",
    "observations.a/bは各本人が知覚できる結果だけ。publicは公開視点で観測できる結果だけ。本人の内心・記憶・秘密の条件・未観測の原因を漏らさない。発話は行為の成功証拠ではない。物語の都合で勝者を決めない。",
    ...(revision !== "reserved-turn-prompt-v1" ? [`予約ターン裁定プロンプト ${revision === "reserved-turn-prompt-v5" ? "v5" : revision === "reserved-turn-prompt-v4" ? "v4" : revision === "reserved-turn-prompt-v3" ? "v3" : "v2"}。各order項目のbaseRevisionはその予約を実行する直前の状態番号。結果には同じ値をそのまま写す。最初の値はstate.revisionそのもの（0なら0）、先に1を足さない。ターン番号や更新後の番号ではない。`] : []),
    ...(revision === "reserved-turn-prompt-v5" ? ["予約ターン出力 v3・裁定プロンプト v5。各行動を裁定する前にHP/MP/staminaの現在残量を確認し、更新後の残量を逐次計算する。MP1で4消費する技は成功できない。資源不足ならfailureと本人向け理由を返し、その消費や効果を付けない。単なる観察はスキル使用と区別し、必要のないコストを捏造しない。機械検証に拒否された更新は行動失敗となり、本人へ理由が返る。補正要求のvalidationErrorsがあれば具体的な誤りを直した完全なresultsを返す。全予約を一度ずつ含め、既知の予約IDだけを使う。$refは$defsを参照する。"] : []),
    ...(revision === "reserved-turn-prompt-v4" ? ["予約ターン裁定プロンプト v4。応答schema内の$refは$defsの共通定義を参照する。情報だけの成功でもbaseRevisionは予約ごとに1増える。世界・資源の整合性制約と知覚の公開範囲を維持する。"] : revision === "reserved-turn-prompt-v3" ? ["予約ターン裁定プロンプト v3。応答schema内の$refは$defsの共通定義を参照する。全予約の逐次裁定と既存の世界・資源制約は同じ。"] : []),
    JSON.stringify((revision === "reserved-turn-prompt-v3" || revision === "reserved-turn-prompt-v4" || revision === "reserved-turn-prompt-v5") ? compactReservedAdjudicationSchema(revision) : zodToJsonSchema(ReservedTurnTraceSchema, { name: "reserved_turn_trace", openaiStrictMode: false })),
  ].join("\n");
}
export const reservedNarrationSystem = [
  "予約ターン実況 v1。渡された公開結果と公開の場面だけを短く描く。新しい成功・損害・台詞・秘密の原因を作らない。",
  "何がどう変わったか、成功/失敗/代償と攻防の転換が読み取れるようにする。変化が少ない場面は短く、同じ背景説明を繰り返さない。返答はJSON linesのみ。",
  JSON.stringify(zodToJsonSchema(ReservedTurnNarrationSchema, { name: "reserved_turn_narration", openaiStrictMode: false })),
].join("\n");
export function reservedAdjudicationUser(state: ReservedTurnWorld, order: readonly OrderedReservation[], assets: object, revision: ReservedTurnPromptRevision = "reserved-turn-prompt-v1"): string {
  const ordered = revision !== "reserved-turn-prompt-v1" ? order.map((reservation, index) => ({ ...reservation, baseRevision: state.revision + index })) : order;
  return JSON.stringify({ state, order: ordered, assets });
}
