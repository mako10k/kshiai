# 継続状態・旧Compact境界の因果契約

既存3ファイル19ケースをコード・assertionの変更なしで検証する。現行awareness-v5の潜在/顕在LLMや実provider品質の受入には使わない。

## 上位契約

- Accepted ADR0018の権威は同名think。不変のactivation receipt、設定由来とdeployment provenance、既存snapshot互換を保持する。
- Accepted ADR0025はexpressionState・utteranceHistory・nextUtteranceを分離し、反復本文を拒否せず、旧処理を保持する。
- Accepted requirement-v3 acceptance recordが指定するcandidate digestは現在のv3要求文書と一致する。schemaVersion1は旧Compact、2は分離契約。snapshotを再解釈しない。
- Accepted ADR0026はstrictなappraisal/refinementと一回の限定repairを規定する。今回のdecoderテストはschema側だけで、repair呼出しを証明しない。
- ADR0028はSuperseded。D3を含む旧心理契約の本文はAccepted ADR0047のhistorical continuationと現行ADR0051の旧世代保持に基づく継承資料としてだけ結ぶ。
- requirements F-BTL13/14/15/23/25/26/37/48の私的継続・知覚・履歴分離を参照する。

## ケース対応

1. dialogue-context.test.tsの10件: observer packetの閉じた形、Compact private guidanceとsocial feedback loop、operator設定のsnapshot、V2 snapshotの表現、旧activation receiptとoverride provenance、observerのchanged perceptだけの抽出、event由来の参照、非観測根拠の非伝達、utterance-prefixed知覚のresult packetからの除外。
2. compact-psyche-decode.test.tsの5件: raw envelopeの余分なキーを投影後strict schemaで検証、legacy cost textのmeaning保持、appraisal欠落とpath、continuity矛盾、空白だけの必須文字列拒否。legacy cost bearerの変換意味はassertされておらず受入を主張しない。
3. psyche-reaction-policy.test.tsの4件: projectionによる状態非更新と式の整合、確定enum/IDによる決定論的更新、直接null入力した旧helperの減衰、impulse/action分離とinhibitionの単調性。現在のLLM潜在反応の代替にはしない。

## 欠落とnullを混同しない

ADR0028 D3の新V3欠落保持はbattle-service.tsでconsciousV3かつdialogueProjectionが欠落する場合にadvancePsycheReactionV1を呼ばない境界にある。helper自身はnullをitems=[]として既存の減衰式を適用する。直接null fixtureの合格を「V3 orchestrationの入力欠落でも減衰を採用する」証拠にしない。今回この呼び出し条件は読取確認であり、欠落時の統合動作をテストした証拠ではない。旧helperのnull挙動とfeature_unavailable_holdという既存receipt値は回帰証拠としてだけ保持する。

## 証拠の境界

「V2だけ選ぶ」のケースはV2 snapshotのround-tripだけ、「conversationへ渡る」のケースはresult packetからの除外だけを実際にassertする。downstreamの選択や別conversation routeへの到達を証明しない。synthetic frame/evidenceに対するpure/helper試験であり、物理LOS、worldState全経路、DB、provider、公開DTO全体、移行、配備は非対象。

Node22で19件全件・strict imported typesを確認する。元のケース/assertionは保持する。root sourceは現在のAccepted権威または明示されたacceptance recordだけを使い、superseded本文は現行の継承causeへ結ぶ。exact parent IDs/source bytes/以前のHEAD維持/fsckを読み戻す。正式全体実行はunsealedがあれば停止する。
