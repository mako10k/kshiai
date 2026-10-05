// R: Explain existing awareness output intent forms using examples checked against the authoritative schema.
import { CharacterActionIntentSchema, type CharacterActionIntent } from "@kshiai/shared";
export const AwarenessActionIntentExamples: readonly CharacterActionIntent[] = [
  { kind: "basic_attack" }, { kind: "skill", skillId: "提示されたskillId" }, { kind: "defend" },
  { kind: "rest" }, { kind: "wait" }, { kind: "reposition" },
  { kind: "free_action", description: "対象へ手を伸ばす試み", subjectRefs: ["提示された参照ID"] },
  { kind: "reflect", reflectionAnalysis: "本人の分析", reflectionGuideline: "次の指針" },
];
export function renderAwarenessOutputContract(role: "subconscious" | "conscious"): string {
  const examples = AwarenessActionIntentExamples.map((example) => CharacterActionIntentSchema.parse(example));
  return [
    "返答の構造：body意欲のactionは文字列ではなく、kindを持つJSONオブジェクト。action:『防御する』やaction:『defend』は不可。voice意欲のspeechは文字列。",
    "availableActionsは選択候補の資料であり、返答のactionオブジェクトではない。候補のname、target、costMp、costStamina、cooldown等をactionへコピーしない。kindは提示された候補から選び、IDと参照は提示された値を使う。下記の例のIDは形の説明用で、そのまま使わない。",
    `actionの基本例：${examples.map((example) => JSON.stringify(example)).join("、")}。`,
    "basic_attack・skill・defendの任意項目はskillId、useFinisher（真偽）、instrumentRef。skillを選ぶときは提示されたskillIdを指定する。rest・waitの任意項目はskillId、useFinisher。repositionにはkind以外の項目を加えない。使わない任意項目は省略する。",
    "free_actionの必須項目はkind、description（1〜600文字）、subjectRefs（提示された参照IDを1〜4件）。任意項目はdesiredOutcome（1〜400文字）、opportunityId。reflectの必須項目はkind、reflectionAnalysis、reflectionGuideline（各1〜400文字）。他のkindに自由行動や内省の項目を加えない。行為の成功を記さず試みを示す。",
    "各意欲はid、source、strength（数値0〜1）、startTick、validUntilTick、resourceを持つ。bodyにはactionだけ、voiceにはspeechだけを加える。tickは非負整数、validUntilTick-startTickは1〜3。追加の項目は返さない。意欲を出さない一覧は[]。",
    role === "subconscious"
      ? "reflexDesiresのsourceはreflex、affectiveDesiresのsourceはsubconscious。stateの感覚と感情は曖昧なままでよいが、JSONの項目名と型は上記を守る。"
      : "desiresのsourceはconscious。明確な思考はthought、潜在への働きかけはinfluencesのidとcontentに記す。",
  ].join("\n");
}
