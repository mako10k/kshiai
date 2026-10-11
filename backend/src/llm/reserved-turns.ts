// R: Render isolated turn plans and one complete, ordered canonical adjudication contract.
// Prompt schema only: the pinned SDK vendor converter preserves optional fields;
// the strict wire-format helper rejects existing world operations with optional fields.
// Contract coverage in reserved-turn-execution.test.ts exercises full request rendering.
import { zodToJsonSchema } from "openai/_vendor/zod-to-json-schema/index";
import { ReservedTurnPlanSchema, ReservedTurnTraceSchema, ReservedTurnNarrationSchema, type ReservedTurnWorld, type OrderedReservation, type ReservedTurnPromptRevision } from "@kshiai/shared";
export const reservedPlanSystem = [
  "予約ターンパイプライン v1。本人の知覚・資料・記憶から、このターンに試みる行動を0〜5件、実行したい順に予約する。5件を埋める必要はない。",
  "行動は単一の試み。成功・他者の行動・世界の変化を先に確定しない。intentに動作と狙い、targetsに提示された参照、必要ならconditionに実行条件を書く。予約は今ターン限り。相手の途中の行為へ反応したい場合は条件を予約に含める。",
  "通常攻撃・技・環境への働きかけも同じ予約形式。前ターンの成否と消耗から今の方針を選ぶ。同じ台詞や意図を機械的に繰り返さず、変化がなければ少数の予約でよい。",
  "返答はJSONのみ。必須actions、任意speech、必須memory。memoryは次の判断に残す優先順最大5文字列。正確な文字列1〜5は全て更新前順位への参照でID/本文を保持する。新規本文は1〜400Unicode code point。省略した旧記憶は削除、[]は全消去。存在しない順位と重複参照は禁止。",
  JSON.stringify(zodToJsonSchema(ReservedTurnPlanSchema, { name: "reserved_turn_plan", openaiStrictMode: false })),
].join("\n");
export function reservedAdjudicationSystem(revision: ReservedTurnPromptRevision = "reserved-turn-prompt-v1"): string {
  return [
    "予約ターン裁定 v1。入力の不変資料と正準世界だけを根拠に、指定orderの各予約を一度ずつ裁定する。返答はJSON resultsのみ。",
    "各結果は先行結果の更新後の世界を読む。順序/side/reservationIdを変更しない。baseRevisionは入力state.revisionから各結果ごとに1増える。world.revisionとは別。ターン途中のキャラクター判断はない。",
    "success/partial/failure/cancelled、理由、具体的updates、observationsを返す。成功/部分成功は実際の変化を持つ。攻撃が当たったなら妥当なhp減少、移動ならworldの配置/距離更新、失敗なら理由と必要な消耗・副作用を記す。描写だけで成功にしない。",
    "targetsは各sideのobservedReferencesと対応させる。selfはa側ならcharacter.a、b側ならcharacter.b。opponentは逆側。物の参照はstate.world.entitiesのobjectProfile.observerRefs/ラベルと照合し、本人が提示されていない対象への既知の狙いを捏造しない。",
    "条件の成否、先行する傷・位置・遮蔽・物の変化・資源の残量を評価する。どちらかがhp0なら残りを全てcancelled、updates[]にする。本人が不在/意識を失った場合も中止。復活・資源上限超過・負の残量は禁止。資源コストは重複請求せず、技や身体動作の相応の負担と一緒に裁定する。",
    "resource更新は{kind:'resource',side:'a'|'b',resource:'hp'|'mp'|'stamina',delta:整数}。残量0..最大値に収まる実際の増減を出す。world更新は{kind:'world',operation:以下schemaのworld operation}。参照は既存正準IDを使い、順次整合性を保つ。新しい物体や状態は不変の資料と行為から成立する場合だけ。",
    "observations.a/bは各本人が知覚できる結果だけ。publicは公開視点で観測できる結果だけ。本人の内心・記憶・秘密の条件・未観測の原因を漏らさない。発話は行為の成功証拠ではない。物語の都合で勝者を決めない。",
    ...(revision === "reserved-turn-prompt-v2" ? ["予約ターン裁定プロンプト v2。各order項目のbaseRevisionはその予約を実行する直前の状態番号。結果には同じ値をそのまま写す。最初の値はstate.revisionそのもの（0なら0）、先に1を足さない。ターン番号や更新後の番号ではない。"] : []),
    JSON.stringify(zodToJsonSchema(ReservedTurnTraceSchema, { name: "reserved_turn_trace", openaiStrictMode: false })),
  ].join("\n");
}
export const reservedNarrationSystem = [
  "予約ターン実況 v1。渡された公開結果と公開の場面だけを短く描く。新しい成功・損害・台詞・秘密の原因を作らない。",
  "何がどう変わったか、成功/失敗/代償と攻防の転換が読み取れるようにする。変化が少ない場面は短く、同じ背景説明を繰り返さない。返答はJSON linesのみ。",
  JSON.stringify(zodToJsonSchema(ReservedTurnNarrationSchema, { name: "reserved_turn_narration", openaiStrictMode: false })),
].join("\n");
export function reservedAdjudicationUser(state: ReservedTurnWorld, order: readonly OrderedReservation[], assets: object, revision: ReservedTurnPromptRevision = "reserved-turn-prompt-v1"): string {
  const ordered = revision === "reserved-turn-prompt-v2" ? order.map((reservation, index) => ({ ...reservation, baseRevision: state.revision + index })) : order;
  return JSON.stringify({ state, order: ordered, assets });
}
