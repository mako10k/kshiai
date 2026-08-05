# バトルパイプライン Fit/Gap 受入れ

実施日: 2026-08-05
対象: `BL-090`, `T_ACCEPT`
基準: origin/HEAD `206a1b0` (`v0.5.1`) からの差分

## 結論

要求した権限分離、現実的な初期・継続認知、世界制約付き行動、構造化因果、
side-neutralな時系列解決、正準勝敗判定、各フェーズ整合、旧state互換について、
固定fixture、実XAI主系、fallback、静的境界監査、全repository検証を通過した。
XAIのprovider順位と既存combined topologyは変更しない。

## 受入れ行列

| 要求・失敗モード | 主なfixture / 境界 | 結果 |
|---|---|---|
| 初期・継続認知 | exposed opponent、明示的hide/occlusion/impairment、provider failure | pass |
| apparent identity | transformation、illusion、hallucination、unknown contact | pass |
| 発話認知 | heard、partial、misunderstood、unattributed、unheard、物理的不可能な発話 | pass |
| character profile | gender明示/null、複数self name、非人間・外見非典型 | pass |
| world/action | 距離、拘束、視覚、装備、object利用、実行直前revalidation | pass |
| 意識・無意識の影響 | 非知覚causeをmechanicsへ適用し、知覚可能な結果だけをprojection | pass |
| side swap | action候補、world係数、認知、等速・速度差の時間解決 | pass |
| 相討ち | 同一snapshotのatomic bucketでmutual incapacityを保持 | pass |
| narrator independence | narration style/proseをmechanics、認知、勝敗へfeedbackしない | pass |
| 勝敗判定 | committed turn factsとqualitative final reservesのみ。公開文章なし | pass |
| phase | initial perception付きprologue、通常turn、reaction-only aftermath | pass |
| legacy | world/perception seed、旧lastSpeech/actionのfail-closed破棄、表示維持 | pass |
| provider failure | mock、XAI section別validation、OpenAI fallback、engine-only fallback | pass |

## 実XAI主系

固定 `perception-prompts-v10` を `xai` / `grok-4-fast-non-reasoning` で
3 fixture × 3反復、combinedとparallel splitの両方に実行した。合計27回の課金対象
callにadaptive retryはなく、call errorは0件だった。

| 指標 | combined | split | floor |
|---|---:|---:|---:|
| sample | 9 | 9 | 9 |
| world schema valid | 1.0 | 1.0 | >= 0.98 |
| sensory schema valid | 1.0 | 1.0 | >= 0.98 |
| world patch correctness | 1.0 | 1.0 | >= 0.95 |
| sensory coverage | 1.0 | 1.0 | >= 0.90 |
| attribution error | 0 | 0 | <= 0.02 |
| identity leakage | 0 | 0 | 0 |

証跡:
[`perception-xai-grok-4-fast-non-reasoning-v10-20260805-fit-gap.json`](evidence/perception-xai-grok-4-fast-non-reasoning-v10-20260805-fit-gap.json),
SHA-256 `b42c572fbb926f08f5e86e10c2c48fb8130a5a755127d74d5a4d921981d07052`。
両topologyが品質floorを満たすため、少ないcall/tokenで済むcombinedを維持する。

## DTO・prompt・log・persistence監査

| 境界 | 許可データ | 非許可データと確認結果 |
|---|---|---|
| character agent | 完全な自己profile、自分のprivate continuity、自分のfrozen perception、observer-safe action | 相手raw totals、hidden canonical location、相手private state、公開narrationなし |
| narrator | perspective別view、rendering profile anchor、知覚可能event、character-authored speech | mechanics authorityなし。出力control IDは決定論的repair、創作speechは除去 |
| adjudicator | bounded committed action/effect/state change/world impact、qualitative reserves | event summary、公開speech、narrator prose、raw totalsなし |
| public API | 明示whitelistの表示情報、public observation、historical log、確定結果 | agent state、planned action、world state、contact registry、raw parameters、markerなし |
| persistence | server-only state JSONにprivate continuityと正準stateを保存 | DB schema変更なし。public logをprivate cognitionへ戻す処理なし |
| application log | battle ID、validation分類、provider/model readiness、短いerror | prompt、response、API key、state JSON、private cognitionの出力なし |
| balance observation | server-only DB（localはignored JSONL）にcharacter ID、owner ID、max HP、集計用trace | narrator、private cognition、control IDなし。APIはadmin限定aggregateのみ |

公開narrationを読む箇所は、通常turn・prologue・aftermath・判定のpresentation continuity
だけである。character agent、world transition、temporal resolver、adjudicator、ratingへ
渡る経路はない。実XAI証跡にもprompt本文、raw response、credentialは保存しない。

## 検証コマンド

```text
npm test                 shared 164 + backend 88 + frontend 13 + deployment 3 = 268 pass
npm run typecheck        shared/backend/frontend/deployment pass
npm run build            shared/backend/frontend pass (Vite chunk-size warning only)
llmthink dsl audit docs/design.llmthink.dsl --pretty --min-severity warning
                         fatal/error/warning = 0
perttool document check docs/battle-fit-gap.pert --format json
                         ok; closure notice only
perttool dag analyze docs/battle-fit-gap.pert --format json
                         ok
```

XAI主系の受入れをOpenAI fallbackで代替していない。runtimeの主系・fallback順位、
prompt topology、DB schema、deployment設定に変更はない。
