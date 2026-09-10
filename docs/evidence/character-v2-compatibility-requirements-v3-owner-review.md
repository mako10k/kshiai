# キャラクター顕在意識ガイダンス移行 — 要件候補・改訂3 オーナーレビュー（日本語）

- レビュー対象: `docs/character-v2-compatibility-requirements-v3.md`
- 英語正本のSeal: `edf4341932f2…`
- 同一性: 英語正本の作業ファイルはSeal済み内容と一致
- 文書の位置づけ: 本書は判断用の日本語訳であり、規範上の正本は英語版
- 状態: Step 1 自己レビュー完了、最初のオーナーレビュー待ち
- 日付: 2026-09-10
- 決定者: プロダクトオーナー
- レビュー上の置換対象: `character-v2-compatibility-requirements-v2.md`

## 概要

改訂3は、恒久的なV2互換読取例外を追加する案ではなく、影響を受ける既存の
readyキャラクター8件を、追記型・決定論的に新しいキャラクター定義世代へ移す
要件である。セレクターを持たないsoft guidanceを、行動規範ではなく顕在意識が
判断材料として読む専用フィールドへ移す。旧世代と旧試合のバインドは保持し、
行動セレクターは推測・創作しない。明示的な切替後は、すべての作成系経路を
新スキーマに統一する。

新規キャラクター作成を妨げているprovider応答スキーマの同一性欠陥は別問題で
あり、その修正は引き続き必要である。ただし切替後の作成応答契約は、選択された
キャラクター定義バージョンを出力対象にしなければならない。

## 改訂2からの主な差分

1. Accepted ADR-0011を明示的に権限表へ追加し、維持する事項と、後継ADRで
   supersedeまたは限定的に変更すべきV2固有事項を列挙した。
2. `CharacterDefinitionV3`を、ADR-0028が既に所有する各種V3契約から完全に
   区別した。既存名の意味を黙って変更することを禁止した。
3. guidanceの影響を「機械判定・同一遷移のpsycheへの直接書込みは禁止」と、
   「顕在意識の選択が変わり、その後の経験を介して間接影響することは正当」に
   分けた。
4. 移行時に説明メタデータを省略せず、凍結対象の全値を無損失で写す要件を追加した。
5. 世代・current pointer・ready/compatibility状態・成功記録の観測可能な原子的
   成功境界を定めた。ただし物理テーブル設計は後継ADRに残した。
6. 切替を専用の`characterDefinitionSchemaVersion`で明示し、V2のrestore、
   import、derived入力も同じ決定論的変換を通すかfail closedとした。

## 権限関係

### ADR-0010 — 共通の不変アセット包絡

不変世代、明示的ready状態、サーバー側適格性、compare-and-swapによるcurrent
pointer有効化、試合からのread-onlyバインド、試合中変換の禁止を維持する。
推測による一括変換の禁止も維持する。後継ADRが変更できるのは、オーナー起点の
upgradeと一括操作禁止の条項のうち、今回オーナーが承認する凍結manifest・
決定論的移行を許可するために必要な範囲だけである。

### ADR-0011 — 構造化キャラクター定義

構造化されたキャラクター正本、利用者別の派生projection、有効化前の確認、
決定論的な行動意味論、開示ゲート、未対応アセットのオーナー管理、正確な世代への
試合バインド、in-place変更禁止を維持する。後継ADRは、次のV2固有部分を明示的に
supersedeまたは限定的に変更しなければならない。

- `CharacterDefinitionV2`だけが最新のauthoring定義であること
- readyかつcurrentのV2世代だけが選択可能であること
- create、revision、upgrade、restore、import、derived経路がV2を出力すること
- 今回の限定された決定論的一括移行をAccepted範囲から除外していたこと

既存の履歴V2世代と試合バインドには、引き続きADR-0011を適用し、読取可能なまま
保持する。改訂3は保存済みバイト列の意味を再解釈しない。

### ADR-0027 — 顕在意識の主体性と深層心理の境界

目標・行動・発話の判断主体は顕在意識であり、思考を伴わない深層心理および
エンジン検証とは分離する。conscious guidanceは、顕在意識が判断材料として
消費する作者定義のキャラクター入力である。深層心理状態でも、エンジンへの行動
命令でも、独立した行動選択主体でもない。

### ADR-0028 — バージョン化された顕在意識契約

次の既存のV3識別子と責務はすべて維持する。

- `BattleAssetManifest` schemaVersion 3: 不変の試合バインド
- `CharacterBattleCompilerInputsV3`: 試合に固定されたcompile済み入力
- dialogue schemaVersion 3およびCompact mode: dialogue入力契約
- conscious input/output contract version 3: runtime判断I/O
- `CharacterAgentStateV3`: 可変の試合中agency状態

`CharacterDefinitionV3`とその`schemaVersion: 3`は、これらより上流にある作者定義の
不変アセットを表し、既存のいずれも置き換えない。CharacterDefinitionV3からの
compileによって既存出力の形または意味が変わるなら、後継ADRは新しい限定名付き
compiler identityを割り当てる。`CharacterBattleCompilerInputsV3`等の既存V3名を
意味変更したまま再利用してはならない。

### Proposedおよび履歴候補

Proposed ADR-0029改訂1は恒久V2互換readerを選んでおり、本要件と競合するため、
現状のままAcceptedにしてはならない。本要件がAcceptedになった後、まだProposedの
ADR-0029を改訂するか、移行用の後継ADRを発行する。要件改訂1・2は未承認の履歴で
あり、そのレビュー状態は改訂3へ継承しない。

## 必須スキーマ意味論

R1. `CharacterDefinitionV3`は、`actionNorms`とは別の、上限を持つ専用
`consciousGuidance` collectionを持つ。

R2. conscious-guidance entryは、安定ID、適用条件とmatch mode、statement、
priority、`preference`または`commitment`のforce、self-awareness、exceptions、
説明メタデータを含む。action reference、action kind、tactic tag、fallback action、
restrictive dispositionは持たない。

R3. 適用可能な場合、conscious guidanceはawareness gateを通ったstatementを
顕在意識の判断材料として供給できる。ただし、engine candidate/result fieldへ直接
projectionせず、決定論的な合法・順位付け・除外action集合を変更せず、同じ遷移で
psyche stateへ直接書き込まない。一方で顕在意識の判断が変わることは正当であり、
選択行動とその後の経験が変わる結果、後続のpsyche反応を含む間接影響は起こり得る。

R4. V3の各`actionNorm`は実行可能で、最低1つの`actionRef`、`actionKind`、
`tacticTag`を選択する。セレクターのない`constraint`、`allow_only`、`forbid`、
soft action normはV3有効化時に不正とする。

R5. 専用の明示的切替がcharacter definition schema 3を選んだ後、create、
revision、upgrade、restore、import、derived authoringはV3候補を生成する。
セレクターなしaction normを出力せず、移行互換性をauthoring fallbackに使わない。

## 決定論的移行マッピング

R6. 本番移行入力は、2026-09-10に`ready`として観測された正確なcurrent generation
ID 8件を含む、凍結済み・オーナーレビュー済みmanifestである。各write前にlogical
asset ID、current generation ID、ready状態、source schema、source content identityを
再確認する。

R7. action norm entryを移動対象にできるのは、全selectorが空、dispositionが
`prefer`、forceが`preference`または`commitment`の場合だけである。移行は当該entryを
置換後の`actionNorms`から除き、LLMも意味的書換えも使わず、次を複写する。

- norm ID、`when.match`、clauses、statement、priority、force、self-awareness
- 各exceptionのclausesとdescription
- text、consumer tags、source support referencesを含むnorm description全体

V3 guidance fieldの上限は、凍結された全対象を無損失で表せる大きさ以上にする。
新規authoring向け上限をさらに狭くしても、移行元を切り詰めてはならない。

R8. selectorを備えたaction normと、それ以外のdefinition、disclosure、公開表示、
media、運用値は意味を変えない。公開文面を再生成しない。置換後content/provenance
digestと必要なcompiler receiptは再計算し、source generationとmigration contractを
識別できるようにする。

R9. セレクターのないrestrictive norm、未知reference、receipt欠落、pointer不一致、
非ready、想定外schema、source identity変更、上限外の凍結値、その他未対応値が1つでも
あれば、そのassetだけfail closedとする。推測、欠落、切詰め、修復を行わず、pointerを
移動しない。

R10. 正確なready V2状態を持たないオーナーキャラクター16件は対象外とする。
未対応のままとし、既存の明示的authoringまたはupgrade workflowを使う。

## 追記型実行と原子的成功記録

R11. 既存generationのバイト列は編集しない。対象キャラクターごとに検証済みV3
generationを1件追記し、凍結source generationに対するcompare-and-swapで、そのlogical
assetのcurrent pointerだけを移動する。旧試合は記録済みgenerationに固定されたままにする。

R12. 「一括」とは凍結manifestを対象とする1つの限定操作であり、全キャラクターを
またぐ単一transactionではない。各キャラクターは独立してcommitする。1件の失敗に
より完了済みをrollbackせず、未処理を完了扱いにしない。

R13. assetごとの1つの原子的成功境界には、置換generation、current pointer、
compatibility/readiness状態、永続的success receiptを含める。receiptはmigration contract、
logical asset、source generation、target generationを一意に結び付ける。対応receiptを
持たない移行済みcurrent pointer、または対応pointerを持たないsuccess receiptを外部から
観測できる状態にしてはならない。物理テーブルおよびkey配置は後継設計で決める。

R14. source-generationとmigration-contract identityの組合せで冪等にする。完了済みの
再実行は記録されたtargetを返し、重複generationを追加しない。失敗項目のretry時は、
sourceが不変でありfailure dispositionに適合することを再検証する。pointer driftがあれば
その項目を停止し、新しいオーナー作業を上書きしない。

## 切替と履歴入力の扱い

R15. 切替は、時刻、deployment version、dialogue schemaVersion、限定されない`V3`ではなく、
明示的で限定名付きの`characterDefinitionSchemaVersion` authoring policy値で選択する。
永続化・有効化方式は後継ADRで決める。defaultを暗黙に変えない。

R16. 必要な履歴V2と新V3 generationの読取、V3 guidanceのcompile、混在contract tupleの
拒否ができるcodeをdeployment・検証してから、schema 3選択または移行実行を行う。

R17. schema-3切替後、V2 sourceからのrestore、import、derived authoringは、同じ決定論的
V2-to-V3 mapperを通す。selectorを完備したV2 sourceは空の`consciousGuidance`を生成し、
対象となるselectorless soft entryはR7に従って移す。無損失mapping不能ならfail closedとする。
切替後、これらの経路から新しいcurrent V2 generationを作らない。

R18. deployment、authoring-policy有効化、本番移行、pointer rollbackは別々の作用である。
この要件候補はいずれも実行権限を与えない。

## 受入条件

- 権限テストまたはレビューで、後継判断をADR-0010・ADR-0011まで追跡し、上記の維持・
  変更対象条項をすべて列挙できる。
- `CharacterDefinitionV3`と、`BattleAssetManifestV3`、
  `CharacterBattleCompilerInputsV3`、dialogue V3、conscious I/O V3、
  `CharacterAgentStateV3`をnamespaceテストで区別し、混在tupleをfail closedにする。
- V3 parserはconscious guidanceを受理し、セレクターのないaction normを有効化前に拒否する。
- 決定論的fixtureは、対象となるselectorless soft entryだけを移し、provider callなしで
  R7の全値を切詰めず保持する。
- mechanical inputを固定してguidanceだけ変えても、legal/ranked/excluded action keyは
  変わらない。projectionテストで、guidance fieldがengine candidate/resultまたは
  同一遷移のpsyche writerへ直接送られないことを示す。
- conscious-decisionテストではguidance差により別行動を選べる。その後の状態はguidanceの
  直接書込みではなく、選択行動の間接的結果として記録する。
- 混在generationではselectorを備えたaction normを変更せず、対象guidanceだけを移す。
- restrictive selectorless entry、未知値、receipt欠落、source/pointer drift、lossy mappingは、
  新current generationを作らずfail closedにする。
- 本番形状fixtureはready V2キャラクター9件を表す。そのうち8件に対象となるselectorless
  soft entry計21件があり、Takumi 1件はselectorを完備する。凍結manifestは8 sourceだけを選ぶ。
- 成功fixtureごとにV3 generationを追記し、pointer、readiness、source/targetを一意に結ぶ
  receiptを原子的にcommitする。V2 generationは読取可能で、旧試合はバイト単位で固定される。
- crash境界・部分失敗fixtureで、pointerのみまたはreceiptのみの状態を露出せず、冪等retryで
  target generationを重複作成しない。
- no-state 16キャラクターは未対応のままで、試合選択肢に出さない。
- 明示的authoring-policy selectorはdialogue/battle V3 selectorと独立し、defaultでは変わらない。
- 切替後のcreate/revision/upgradeはstrict V3を生成する。V2 restore/import/derivedはR7で
  無損失mappingするかfail closedにし、新しいcurrent V2を復活させない。
- dry-runはwriteせず、対象、拒否、drift、完了済みを正確に列挙する。本番実行とreadbackには
  後段の別オーナーゲートを設ける。

## 対案と客観的なトレードオフ

### A. 恒久V2互換reader（現ADR-0029改訂1）

短期の変更量は小さくなり得るが、V2の曖昧な値を長期間runtimeで解釈し続け、作成・選択の
二重契約を残す。今回の「不整合を正規化して表に出た欠陥を是正する」という狙いとは合わない。

### B. 改訂3の追記型・決定論的一括移行

schema、dual reader、mapper、receipt、cutoverの設計と検証が必要になる一方、対象8件を
明示的新世代に正規化でき、旧世代・旧試合も保持できる。恒久例外を残さない。

### C. 8件をLLMで再生成

新スキーマへの自然な再authoringは可能だが、意味が変わる、再現不能、provider依存、
オーナーレビュー負荷が大きい。既存値を無損失に移す今回の復旧要件には不適切である。

### D. 16件を含む全キャラクターを同時upgrade

一度に選択肢を増やせる可能性はあるが、ready V2正本がない16件では機械的移行元がなく、
別のauthoring判断が必要になる。今回の復旧範囲を越える。

## 未決事項と論点

- 限定名付きcompiler identifierの正確な名前
- migration ledgerの物理schema
- `characterDefinitionSchemaVersion` policyの永続化・有効化方式
- 凍結manifest外のtest/seed assetを同時に移すか

これらは後継ADRで決める設計事項であり、R1〜R18の結果を弱めたり、既存識別子の意味を
黙って変更したりしてはならない。

## 対象外

本番deployment、traffic変更、policy有効化、移行実行、pointer rollback、providerによる
再生成、no-state 16件の一括upgradeは対象外である。別件であるresponse-schema identity
修正のlive xAI検証も、別途権限を得たエビデンス取得とする。

## Step 2で選択できるレビュー経路

- `REVISE`: オーナー指摘を反映して改訂4を作成し、Step 1から再開する。
- `REVIEW_THEN_REVISE`: 独立レビュー後、必ず改訂する。
- `REVIEW_THEN_DECIDE`: 独立レビュー後、改訂か次段階移行かを改めて決める。
- `REVIEW`: 追加の独立レビューだけを実施する。

改訂3では前回の独立レビュー指摘を要件へ反映済みであるため、現時点の推奨経路は
`REVIEW`である。これは承認ではなく、改訂3そのものに矛盾やエビデンス欠落が残って
いないかを別コンテキストで確認する段階である。
