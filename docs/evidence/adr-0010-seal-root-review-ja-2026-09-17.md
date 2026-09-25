# ADR-0010の既存Accepted基準をSealに登録するためのレビュー

状態: 2026-09-17にオーナー承認を受け、提示したCandidateをSeal済み。

## 承認と公開記録

全文日本語訳を含む本候補のroot登録について、オーナーが「承認します。」と回答した。原文SHAと予定Sealが提示時から変わっていないことを確認し、`acceptance/adr-0010-existing-baseline` を `c18419afb42060d887b3f7f86970b45312cb77a7665dfbc7398a697e3e3d7ad5` として公開した。CLI LLMThink監査はfatal/error/warning 0。公開後のstatusは非draft・非stale、Candidateなし、`WORKFILE_MATCHES_HEAD`。以下の判断対象・翻訳は提示時の記録として保持する。

## 今回の判断対象

既存のAccepted ADR-0010の変更されていない原文を、既存承認の出発点を表すSealGraph rootとして登録する。

- REF: `acceptance/adr-0010-existing-baseline`
- 正本: `docs/adr/0010-structured-selectable-asset-envelope.md`
- 原文SHA-256: `b0012cb731921a85e1e13340c13b2b1e0bb362598b8a9e6c58b30cde19855b63`
- Candidateの予定Seal: `c18419afb42060d887b3f7f86970b45312cb77a7665dfbc7398a697e3e3d7ad5`
- 設定: root=true、draft=false、Causeなし、正本へのsource bindingあり。

現在はこのADRのsourceに結び付くSealがない。ADR自体は2026-08-13のAccepted文書であり、commit `7710812` 以降変更されていない。ADR-0015以降の `.think` 手続を遡及して、この既存承認を無効とは扱わない。

変更するのは根拠の登録だけで、ADR本文、仕様、実装は変更しない。このrootは当時受け入れられた固定snapshotを示す。後のAccepted要件・ADRによる置換や適用範囲を優先し、旧workflowの権威を復活させない。下流は、依拠する条項と後継決定の関係を個別に確認してCauseを結ぶ。

ADRがnormativeとする `docs/structured-asset-envelope-design.md` は従属する設計として扱う。同文書も同commit以降変更されておらず、SHA-256は `33dc428d719782e8f54b7cdc6e34cf48e8412dcfcec3022a0d29a8bf4d2ae1b0`。そのSealを作る際は設計からADRへCauseを向ける。

推奨: このroot登録を承認する。独立Lunaレビューは、既存Acceptedを保持した候補の提示が可能で、現在の基盤v3・キャラクタv5との具体的な新矛盾を確認しなかった。

代替: 登録を保留し、別の既存承認記録を調べる。その場合、このADR固有の契約を使う下流の現行根拠化は未完了のままになる。仕様からその契約を削ることは代替案に含めない。

限界: rootは真実性や実装適合を証明しない。後継判断に反する旧条項を、rootの存在だけで再適用することはできない。全Sealの健全化、テストadmission、移行実行は未完了。

## 正本全文の日本語訳（レビュー補助）

以下は変更していないADR-0010全体の翻訳。第二の正本ではない。「現在」「予定」「P1」等は元文書の2026-08-13時点の記述として読む。

### ADR-0010: 選択可能アセットに共通の不変エンベロープを使用する

- 状態: Accepted
- 日付: 2026-08-13
- 決定者: プロダクトオーナー
- 置換対象: ADR-0003
- 関連: `docs/structured-domain-assets.pert` の `SDA_ENVELOPE_DESIGN`、`docs/structured-asset-envelope-design.md`、`docs/structured-domain-assets-current-inventory.md`、ADR-0003。

### 背景

キャラクタ、戦場プリセット、ナレーションスタイルはいずれも編集・選択できるが、現在は各ファミリが複数の関心事を一つのcurrent JSON行に混在させている。構造化された戦闘入力、公開用の説明文、非公開・内部フィールド、自由形式のLLM指示に、共通の開示・互換性契約がない。生成処理は通常、一回のprovider操作で構造的なフィールドと公開説明文を作る。

リポジトリには既に不変generationとbattle manifestの記録がある。しかし汎用generation payloadには型がなく、appendとcurrent pointerのactivationが一つの操作で、current行にready状態もない。このため選択queryはschema/compiler非互換のassetを除外できない。battle作成は現在、選択されたキャラクタ、ナレーションスタイル、戦場プリセットについてgenerationのwrite-and-activate操作を呼ぶ。authoring時と異なるsnapshot形状を書く場合もあり、battleを始めるだけでgenerationが追加され、assetのcurrent pointerが動き得る。

受入済み製品workflowは、自然文sourceから構造化定義、そこから派生した公開説明という順序、オーナーが明示的に開始するupgrade、未対応objectのserver側除外を要求するようになった。キャラクタ・戦場・ナレーションのschema実装に先立って、共通のアーキテクチャ境界が必要である。

### 判断要因

- 表現豊かな説明を捨てずに、mechanics、knowledge、perspective、privacy、presentationの権威を分離する。
- 二段階のmodel生成をretry可能にし、activationをatomicにする。
- 選択とbattle作成によるauthoring済みassetの変更を防ぐ。
- ADR-0003が要求する、互換性のある正確なgenerationへの新battleのbindingを実現する。
- 公開前のlegacy assetをオーナーが管理できるようにしながら、battle選択には入れない。
- target・channel・consumer・runtime knowledgeに基づくprojectionを、promptではなくserver codeで強制する。
- P2–P4に一つのlifecycle契約を与え、各domain schemaは独立に発展可能にする。

### 検討した選択肢

1. mutableなcurrent行をファミリごとに拡張し、不足generationをbattle開始時に作り続ける。局所変更は小さいが、lifecycle規則が分岐し、二段階activationのatomic性を保証できず、read/selection経路がasset identityを変更できてしまう。
2. generationごとに汎用JSONを保存し、開示・consumerの挙動をpromptで説明する。表現力は維持できるが、privacyとknowledgeのgateが非決定的になり、信頼できるeligibilityテストを妨げる。
3. 共通の不変envelope、永続化されたauthoring attempt、server所有projection compiler、明示的互換性状態、atomic activation、read-only battle bindingを導入する。P1の費用が最も大きいが、全assetファミリに強制可能な一つのlifecycle・privacy境界を提供する。

### 決定

選択肢3を採用する。

選択可能なキャラクタ、戦場プリセット、ナレーションスタイルは、安定した論理asset IDと、不変の `AssetGenerationEnvelopeV2` を使う。ready generationは、検証済みasset固有構造化定義、schemaに制限された開示policy、凍結した自然文sourceと表示安全なprojectionから派生して保存された公開説明、sourceとgeneratorのprovenance digest、projection/compiler version、canonical content digestを含む。構造化定義が正本であり、公開説明はruntime ruleのsourceではない。

Authoringは永続化された冪等state machineとする。構造生成・検証を完了してから説明生成を行う。attemptが期待するcurrent generationを再確認するtransactionだけが、完成envelopeのappendとcurrent pointerの移動を行える。失敗しても既存pointerは変えない。activation transactionの中でproviderを呼ばない。

管理用の互換性状態の正確な語彙は `unsupported`、`upgrading`、`upgrade_failed`、`ready` とする。初回作成失敗はfailed attemptだけに記録し、activation成功前に論理assetを可視化しない。管理画面はオーナーがアクセスできる非互換assetとupgrade操作を表示する。選択query、検索、対戦相手・random pool、battle作成は、アクセス可能で、必要なcompiler versionをすべて満たすready generationだけを受け入れる。

開示はserver側の四つのgateの共通部分で決める。schema ceiling、値ごとのtarget/channel allowlist、登録済みconsumer契約、runtimeのknowledge/self-awareness/perspective証拠である。ceilingは `required_public`、`public_eligible`、`restricted`。allow-only/default-denyとし、安定した論理target IDまたは登録済みrelationship roleを使い、schema ceilingを広げない。範囲を制限した説明は指定consumerに提供できるが、正本となるmechanicsを作ったり上書きしたりできない。

Battle作成は正確なready current generationとcompiler outputを読み取ってbindする。選択可能assetのgenerationをappend・activateしてはならない。具体的な戦場instanceは、battle所有の別の不変artifactとする。明示指定されたナレーションスタイルが利用できなければ、黙ってfallbackせず失敗とする。指定が省略された場合は、適格なdefaultを選択できる。

Legacyの選択可能行はオーナーが管理できるが、明示的な最新版への操作が成功するまではunsupportedとする。Upgradeは、既存の表示説明を自然文sourceとし、定義済みで決定論的なlegacy field mappingだけを補助として使う。一括の先行推論、暗黙のbattle時変換、恒久的なlegacy選択経路は設けない。既存battleは記録済みlegacy manifestを保持し、黙って再bindしない。

詳細な論理schema、transaction順序、検証matrixは `docs/structured-asset-envelope-design.md` を規範とする。この決定によってP1設計milestoneを閉じる。最初の共通実装はP2で予定し、引き続きAcceptedなcharacter-schema ADRを必要とする。asset-family schemaをここで事前承認するものではない。

### 結果 — 利点

- 全選択可能assetのcreate、明示upgrade、eligibility、bindingを一つのlifecycleで扱える。
- 公開説明の表現力を維持しながら、それがmechanicsやprivacyの権威になることを防ぐ。
- 公開前のunsupported objectを管理画面から復旧でき、古いclientがbattleへの混入を強制することを防ぐ。
- Battle作成が、authoring済みassetのread-and-bind操作になる。
- 冪等性、provider失敗、pointer競合、compiler互換性を観測・テストできる。

### 結果 — 不利な点とリスク

- 可視のcharacter作業を始める前に、P1で新しいattempt・互換性の永続化とrepository/API分離が必要になる。
- 二段階のmodel処理によりauthoring latencyとprovider利用量が増える。
- 表現豊かな公開説明の事実的裏付けの検証は、妥当な文章も拒否する場合があり、family固有の調整が必要になる。
- P2–P4の一時的read modelにはdual-writeリスクがあるため、P5はlaunch前にすべての迂回経路を除去または凍結しなければならない。
- 既存のsystem seedはready envelopeに再構築またはimportする必要があり、行が存在するだけでは選択可能にならない。

### 互換性と移行

- 既存battleとversion-1 manifestは、埋め込まれた不変snapshotを使って読み取り可能なままにする。架空のversion-2 asset generationを割り当てない。
- 既存のcurrent character・battlefield・narration行は、明示upgradeまたは再構築まで、新しい選択ではunsupportedになる。
- オーナー・運用者はunsupportedまたはfailed assetの詳細閲覧・削除・upgradeアクセスを保持する。
- 明示upgradeが成功するとversion-2 generationをappendし、その論理assetのcurrent pointerだけを動かす。失敗時は旧pointerを保持する。
- 既存mutable tableを一時的read modelとして利用してよいが、ready状態とbattle bindingはversion-2 current generationが所有する。
- 受入時、このADRはADR-0003の新battle binding実装を具体化し、公開前cutoverに関するselectable-asset legacy継続の選択肢を置き換える。ADR-0003の不変のhistorical bindingは維持する。

### 検証

- 汎用attempt/activation契約について、authoring順序、部分失敗、冪等retry、current pointer競合のテストが通ること。
- Projectionテストで四つのgate、安定target ID、二target間の差、restricted fieldの非漏洩、narrator perspective、observer knowledge、character self-awarenessを確認すること。
- 管理一覧にはunsupported/upgrading/failed assetを残し、すべての選択・直接battle経路ではserver側でそれらを除外すること。
- Battle作成がselectable-asset generationを書き込まず、正確なready generation IDとcompiler versionをbindし、明示選択されたstyleを別のものに置き換えないこと。
- Battle作成後の編集・upgradeが、retry、resume、narration、history、replayの入力を変更できないこと。
- System seedとlegacy current行がversion-2 activationを迂回できないこと。

### 実装参照

- 詳細設計: `docs/structured-asset-envelope-design.md`
- 現状一覧: `docs/structured-domain-assets-current-inventory.md`
- 受入済み製品workflow: `docs/structured-asset-authoring-workflow.md`
- 情報projection方針: `docs/structured-asset-information-projection-design.md`
- `backend/src/repositories/asset-generations.ts`
- `backend/src/services/battle-service.ts`
- `packages/shared/src/battle.ts`
