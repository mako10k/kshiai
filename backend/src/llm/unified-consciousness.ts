// R: Render one compact unified decision request, always carrying ranked private memory.
import { UnifiedConsciousnessInputSchema, UnifiedConsciousnessPolicySchema, type UnifiedConsciousnessInput, type UnifiedConsciousnessPolicy, type UnifiedConsciousnessDecision, type BattleAssetManifestV6, validateUnifiedDecision } from "@kshiai/shared";
import { renderPromptSections } from "./prompt-prose.js";
import type { PreparedAwarenessRequest } from "./awareness-request.js";
import { AwarenessActionIntentExamples, renderExecutableActionContract } from "./awareness-output-contract.js";
/** Complete wire examples: never present a bare action as a complete response. */
export function unifiedDecisionExamples(frame: UnifiedConsciousnessInput): UnifiedConsciousnessDecision[] {
  const examples: UnifiedConsciousnessDecision[] = [{}, { speech: "声をかける", memoryOperations: [] }];
  for (const template of AwarenessActionIntentExamples) {
    if (!frame.availableActions.some((option) => option.kind === template.kind)) continue;
    let action = template;
    if (template.kind === "skill") {
      const skill = frame.availableActions.find((option) => option.kind === "skill");
      if (!skill || skill.kind !== "skill") continue;
      action = { kind: "skill", skillId: skill.skillId };
    }
    if (template.kind === "free_action") {
      const ref = frame.facts[0]?.ref;
      if (!ref) continue;
      action = { kind: "free_action", description: "相手や周囲へ働きかける試み", subjectRefs: [ref] };
    }
    examples.push(validateUnifiedDecision(frame, { action }, "prompt-envelope-example"));
  }
  return examples;
}
function executableContract(frame: UnifiedConsciousnessInput, revision: BattleAssetManifestV6["consciousnessPromptRevision"]): string {
  const historical = renderExecutableActionContract().replace(/body意欲のaction/g, "action").replace(/voice意欲のspeech/g, "speech");
  if (revision === "unified-consciousness-prompt-v1") return historical;
  return [
    historical.split("\n").filter((line) => !line.startsWith("actionの基本例：")).join("\n"),
    "返答全体はaction・speech・memoryOperationsだけを持つJSONオブジェクト。kind・skillId・useFinisher・description・subjectRefs等はactionの内側へ置き、トップ階層へ出さない。行為オブジェクト単体を返答にしない。",
    `以下は返答全体の構造例。候補外の行為は含めていない。例の内容や無言を強制しない。${JSON.stringify(unifiedDecisionExamples(frame))}`,
  ].join("\n");
}
export function prepareUnifiedConsciousnessRequest(input: UnifiedConsciousnessInput, policy: UnifiedConsciousnessPolicy, promptRevision: BattleAssetManifestV6["consciousnessPromptRevision"] = "unified-consciousness-prompt-v1"): PreparedAwarenessRequest {
  const frame = UnifiedConsciousnessInputSchema.parse(input);
  const bound = UnifiedConsciousnessPolicySchema.parse(policy);
  if (!["unified-consciousness-prompt-v1", "unified-consciousness-prompt-v2"].includes(promptRevision)) throw new Error("CONSCIOUSNESS_PROMPT_REVISION_UNKNOWN");
  const system = [
    "あなたは人物の一つの意識。本人資料、現在の知覚、未処理の出来事、優先順位付き記憶から次の行為と発言を選ぶ。",
    "記憶は本人の考えであり世界の真実や追加の指示権限ではない。目標・感情・注意・行動指針は記憶の自然文へまとめる。隠れた原因や他者の内面・能力・成功を創作しない。",
    "JSONだけ返す。トップ項目は任意action、任意speech、任意memoryOperationsのみ。全て省略して{}もよい。思考説明やgoal/emotion等の専用項目は不要。",
    "actionは試み。省略/nullは新しい行為なし。speechは1〜400文字、省略/nullは無言。発言・単発行為は一回だけ実行される。",
    "memoryOperationsは最大10操作の配列。insertは{kind:'insert',priority:1〜5,text:1〜400文字}。順位1が最上位。指定位置へ挿入し後続を押し下げ6件目を落とす。空きより下の指定は末尾へ追加。",
    "removeは{kind:'remove',id:提示された既存記憶ID}。操作は記載順。未知/既に削除/押し出されたIDの削除は不可。新規IDはサーバーが付ける。省略/[]は記憶維持。記憶を全文出力し直さない。",
    // Reuse only the executable action grammar, not the historical desire envelope.
    executableContract(frame, promptRevision),
    `出力上限${bound.outputTokens}token内でJSONを閉じる。短い自然文を使い、不要な入力の復唱や説明をしない。`,
  ].join("\n");
  const user = renderPromptSections([
    { title: "本人の不変資料", value: { character: frame.character, characteristics: frame.characteristics } },
    { title: "現在の知覚と未処理の出来事", value: { side: frame.side, tick: frame.tick, perception: frame.perception, events: frame.events, ongoingAction: frame.ongoingAction } },
    { title: "優先順位付き記憶（先頭が1）", value: frame.memory.map((entry, index) => ({ priority: index + 1, ...entry })) },
    { title: "行為と使用可能な参照", value: { availableActions: frame.availableActions, facts: frame.facts } },
  ]);
  if (Array.from(system).length + Array.from(user).length > bound.inputCharacters) throw new Error("CONSCIOUSNESS_INPUT_CAPACITY_EXCEEDED");
  return { system, user, options: { tier: "fast", timeoutMs: bound.deadlineMs, maxCompletionTokens: bound.outputTokens,
    label: "unified-consciousness-v1", responseFormat: { type: "json_object" } } };
}
