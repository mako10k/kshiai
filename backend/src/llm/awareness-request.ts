import { CurrentAwarenessPromptRevision } from "@kshiai/shared";
// R: Prepare the exact typed awareness prompt and generation options before dispatch admission.
import {
  AwarenessConsciousInputSchema, AwarenessLatentInputSchema, AwarenessDefaultPolicy, AwarenessPolicyV1Schema,
  type AwarenessConsciousInput, type AwarenessLatentInput, type AwarenessPolicyV1,
  AwarenessPromptRevisionSchema,
} from "@kshiai/shared";
import type { AwarenessRequestOptions } from "./awareness-provider-contract.js";
import { renderAwarenessOutputContract } from "./awareness-output-contract.js";
import { renderPromptSections } from "./prompt-prose.js";

const DESIRE_RULES = "意欲の共通項目はid、source、strength（0〜1）、startTick、validUntilTick。寿命は1〜3tick、終了tickは含まない。身体意欲はresource=bodyとaction（提示された行為の構造を保つ）。発声意欲はresource=voiceとspeech。意欲は世界の実行結果ではない。新しい能力・事実・訓練を創作しない。";
const LATENT_PROMPT = [
  "あなたは人物の潜在意識を、短い一回の判断で更新する。入力資料は現在状態と今回の未処理刺激であり、出来事の履歴ではない。",
  "反射と感情由来の意欲を分離する。反射は知覚から身体や短い反射声への近道。感情は快・不快、曖昧な直感、経験による傾向を扱う。意味の不整合や矛盾を解消せず、明晰な論理的思考や説明を作らない。特性・訓練が提示されていれば反応に反映する。",
  "顕在からの介入は受け止め方への働きかけとして扱い、必ず従う命令や世界の事実にしない。",
  "stateのsensationsとemotionsはid、feeling、awareness（0〜1）の一覧。tendenciesは同じ項目にcue、response、strength、validUntilTickを加えた現在の反応傾向。updatedTickは入力tick。",
  "state.feltProjectionは本人が自覚できる短い感覚だけを記す。顕在度が低ければ靄のような感じに留め、隠れた原因・他者の内面・本人が知らない説明を漏らさない。高い値でも正準真実を断定しない。",
  DESIRE_RULES,
  "JSONのみ返す。トップ項目はstate、reflexDesires（source=reflex）、affectiveDesires（source=subconscious）、reconsider（再考を望む真偽）、cancelThought（今の思考を止めたい真偽）。余分な項目を返さない。",
].join("\n");
const CONSCIOUS_PROMPT = [
  "あなたは人物の顕在意識として、凍結された時点の知覚と本人向け感覚から、明確な言葉で考える。人物特性に応じ直感優勢でもよい。現在世界や隠れた潜在状態を推測して補わない。",
  "返答が遅れても入力時点sourceTickの思考である。世界の実行結果を断定せず、許された行動への意欲を提案する。",
  "潜在への働きかけはinfluencesのid、contentとして提案する。感情を受け止め直す、注意を向ける等であり、潜在状態の直接書換えではない。",
  DESIRE_RULES,
  "JSONのみ返す。トップ項目はgoal（短い目標またはnull）、thought（本人の思考）、desires（source=conscious）、influences。余分な項目を返さない。",
].join("\n");

export type AwarenessRequestInput =
  | { role: "subconscious"; input: AwarenessLatentInput }
  | { role: "conscious"; input: AwarenessConsciousInput };
export type PreparedAwarenessRequest = {
  system: string;
  user: string;
  options: AwarenessRequestOptions;
};

/** Rendering is deterministic and performs no token estimation, model call, or semantic rewriting. */
export function prepareAwarenessRequest(request: AwarenessRequestInput, policy: AwarenessPolicyV1 = AwarenessDefaultPolicy, promptRevision: string = CurrentAwarenessPromptRevision): PreparedAwarenessRequest {
  if (!AwarenessPromptRevisionSchema.safeParse(promptRevision).success) throw new Error("AWARENESS_PROMPT_REVISION_UNSUPPORTED");
  const system = (role: "subconscious" | "conscious", content: string) => `${content}\n\n${renderAwarenessOutputContract(role)}`;
  const bound = AwarenessPolicyV1Schema.parse(policy);
  if (request.role === "subconscious") {
    const frame = AwarenessLatentInputSchema.parse(request.input);
    const user = renderPromptSections([
      { title: "本人の不変の特性と提示済み訓練", value: { character: frame.character, characteristics: frame.characteristics, training: frame.training } },
      { title: "今回の知覚と未処理刺激", value: { side: frame.side, tick: frame.tick, perception: frame.perception, stimuli: frame.stimuli } },
      { title: "現在の潜在状態と未受取の働きかけ", value: { currentState: frame.currentState, influences: frame.influences } },
      { title: "知覚で使える参照と選択可能な行為", value: { facts: frame.facts, availableActions: frame.availableActions } },
    ]);
    const limits = bound.roles.subconscious;
    return { system: system("subconscious", LATENT_PROMPT), user, options: {
      tier: "fast", timeoutMs: limits.deadlineMs, maxCompletionTokens: limits.outputTokens,
      label: "awareness-v5:subconscious", responseFormat: { type: "json_object" },
    } };
  }
  const frame = AwarenessConsciousInputSchema.parse(request.input);
  const user = renderPromptSections([
    { title: "本人の不変の特性と提示済み訓練", value: { character: frame.character, characteristics: frame.characteristics, training: frame.training } },
    { title: "思考開始時点の知覚", value: { side: frame.side, sourceTick: frame.sourceTick, perception: frame.perception } },
    { title: "本人に自覚できる感じと受理済み思考", value: { feltProjection: frame.feltProjection, consciousState: frame.consciousState } },
    { title: "知覚で使える参照と選択可能な行為", value: { facts: frame.facts, availableActions: frame.availableActions } },
  ]);
  const limits = bound.roles.conscious;
  return { system: system("conscious", CONSCIOUS_PROMPT), user, options: {
    tier: "engine", timeoutMs: limits.deadlineMs, maxCompletionTokens: limits.outputTokens,
    label: "awareness-v5:conscious", responseFormat: { type: "json_object" },
  } };
}
