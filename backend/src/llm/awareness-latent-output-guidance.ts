// R: Explain compact latent output within the bound token budget using a schema-validated example.
import { AwarenessLatentOutputSchema, type AwarenessLatentOutput, type AwarenessLatentInput } from "@kshiai/shared";

export function compactLatentOutputExample(tick: number, side: AwarenessLatentInput["side"]): AwarenessLatentOutput {
  const prefix = `example-${side}${tick}`;
  return AwarenessLatentOutputSchema.parse({
    state: {
      updatedTick: tick,
      sensations: [{ id: `${prefix}s`, feeling: "ぞくっ", awareness: 0.2 }],
      emotions: [{ id: `${prefix}e`, feeling: "いや", awareness: 0.1 }],
      tendencies: [{ id: `${prefix}t`, feeling: "びくっ", awareness: 0.1,
        cue: "手が上がる", response: "身構える", strength: 0.7, validUntilTick: tick + 2 }],
      feltProjection: "なんだかいや",
    },
    reflexDesires: [{ id: `${prefix}r`, source: "reflex", strength: 0.8,
      startTick: tick, validUntilTick: tick + 1, resource: "body", action: { kind: "defend" } }],
    affectiveDesires: [{ id: `${prefix}a`, source: "subconscious", strength: 0.4,
      startTick: tick, validUntilTick: tick + 1, resource: "voice", speech: "うっ" }],
    reconsider: false,
    cancelThought: false,
  });
}

export function renderLatentOutputBudget(input: { tick: number; side: AwarenessLatentInput["side"]; outputTokens: number }): string {
  return [
    `返答全体の出力上限は${input.outputTokens}トークン。上限に達する前に全項目と最後の閉じ括弧まで完結させる。改行・字下げ・説明文を付けない短いJSONにする。`,
    "feeling・cue・response・feltProjection・speechは短い語句にし、同じ意味の説明を重ねない。idは短く、意欲のidは今回のsideとtickを含めた新しい値にする。必要な状態・反応傾向・意欲の意味は残し、入力の文章を逐語反復せず圧縮する。履歴を追記しない。不要な一覧は[]。",
    "次は全体の形を示す短い例。件数の上限ではない。例の感情・傾向・行為・発声を採用する指示ではなく、今回の知覚・特性・現在状態から判断する。",
    JSON.stringify(compactLatentOutputExample(input.tick, input.side)),
  ].join("\n");
}
