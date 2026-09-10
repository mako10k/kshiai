# キャラクター顕在意識ガイダンス移行 — 要件候補・改訂4 オーナーレビュー（日本語）

- レビュー対象: `docs/character-v2-compatibility-requirements-v4.md`
- 英語正本のSeal: `061093e71d42…`
- 同一性: 英語正本の作業ファイルはSeal済み内容と一致
- 文書の位置づけ: 本書は判断用の完全な日本語訳であり、規範上の正本は英語版
- 状態: Step 1 自己レビュー完了、最初のオーナーレビュー待ち
- 日付: 2026-09-10
- 決定者: プロダクトオーナー
- レビュー上の置換対象: `character-v2-compatibility-requirements-v3.md`

## 目的と概要

恒久的なV2互換reader例外を追加せず、影響を受けるready済みキャラクター8件を復旧する。
それぞれのselectorless soft guidanceを、新しい不変キャラクター定義世代の明示的な
`consciousGuidance` fieldへ決定論的に移す。旧世代と旧試合のbindingを保持し、action
selectorを推測・創作せず、明示的cutover後のすべてのauthoring経路をstrictにする。

新規キャラクター作成を妨げているprovider response-schema identity欠陥は別問題である。
identityを保持する修正は引き続き必要だが、cutover後のauthoring response contractは、
選択されたcharacter-definition versionを出力対象にしなければならない。

## 改訂3からの重要差分

1. ADR-0010の「推測によるeager bulk conversion禁止」と、ADR-0011の「bulk migrationを
   Accepted範囲として許可していない」を正しい出典へ分離した。
2. 存在しない`CharacterAgentStateV3`を削除し、ADR-0028の実在するqualified identity
   `CharacterAgentState.consciousAgencyV1`へ訂正した。
3. V2のliteral disclosure pathをV3のguidance pathへ決定論的に写し、権限を広げず、
   `consumerTags`自体をaccess authorityにしないことをR8と受入条件へ追加した。
4. `character_generation_v2`の意味をV3 source向けに黙って変更しないことを明示した。
   V3表現の正確な名前・形は後継ADRに残した。

移行対象、8件と21 entryという観測数、追記型実行、LLM不使用、旧試合保持、no-state 16件の
除外、R1〜R7・R9〜R15・R17〜R18の結果は変更していない。

## 権限関係

### ADR-0010 — 共通の不変アセット包絡

不変generation、明示的readiness、server-side eligibility、compare-and-swapによるcurrent
pointer有効化、read-only battle binding、明示的latest-version処理、定義済み決定論mapping、
推測によるeager bulk conversion禁止、battle-time conversion禁止を維持する。

本要件の凍結済み・owner-reviewed操作はこれらの制御に従う。rowが存在するだけで対象を推測せず、
battle作成中にも実行しない。このorchestrationがADR-0010の明示的latest-version actionの意味を
変える場合、後継ADRは変更範囲を明示して限定し、assetごとのvalidationとactivationを維持する。

### ADR-0011 — 構造化キャラクター定義

構造化されたキャラクター正本、利用者別の派生projection、有効化前の確認、決定論的な行動意味論、
disclosure gate、未対応assetのowner管理、正確なgenerationへのbattle binding、in-place変更禁止を
維持する。後継ADRは次のV2固有部分を明示的にsupersedeまたは限定的に変更する。

- `CharacterDefinitionV2`だけが最新authoring定義であること
- ready-current-V2だけが選択可能なcurrent character generationであること
- create、revision、upgrade、restore、import、derived経路がV2を出力すること
- 今回の限定された決定論的bulk migrationをADR-0011のAccepted設計範囲から除外していること

production実行は引き続き別ゲートである。既存の履歴V2 generationとbattle bindingには
ADR-0011を適用し、読取可能なまま保持する。改訂4は保存済みbytesの意味を再解釈しない。

### ADR-0027 — 顕在意識の主体性と深層心理の境界

目標・行動・発話の判断主体は顕在意識であり、思考を伴わない深層心理およびengine validationとは
分離する。conscious guidanceは顕在意識が判断材料として消費する作者定義のcharacter inputである。
psyche stateでも、engineへのaction commandでも、独立したaction-selection authorityでもない。

### ADR-0028 — versioned conscious-agency contract

次の既存qualified V3 identityと責務を維持する。

- `BattleAssetManifest` schemaVersion 3: 不変のbattle binding
- `CharacterBattleCompilerInputsV3`: battleに固定されたcompile済みinput
- dialogue schemaVersion 3およびCompact mode: dialogue input contract
- conscious input/output contract version 3: runtime judgment I/O
- `CharacterAgentState.consciousAgencyV1`: `CharacterAgentState`内のclosedかつ可変な
  battle-runtime conscious-agency state

`CharacterDefinitionV3`とその`schemaVersion: 3`は、これらより上流にある作者定義の不変assetを
表し、既存のいずれも置き換えない。CharacterDefinitionV3からのcompileにより既存outputの形または
意味が変わる場合、後継ADRは新しいqualified compiler identityを割り当てる。
`CharacterBattleCompilerInputsV3`等の既存V3名を意味変更したまま再利用しない。

現在のgeneration-backed basic-attack provenance discriminatorである
`character_generation_v2`はV2の意味を維持する。V3 sourceにはqualified successor表現、または
意味を保持することが明示的に証明されたmappingを使用し、意味を変えて同じdiscriminatorを使わない。

### Proposedおよび履歴候補

Proposed ADR-0029改訂1は恒久V2 compatibility readerを選択して本要件と競合するため、現状のまま
Acceptedにしてはならない。本要件がAcceptedになった後、まだProposedのADR-0029を改訂するか、
migration用の後継ADRを発行する。要件改訂1〜3は未承認の履歴であり、レビュー状態を改訂4へ継承しない。

## 必須schema意味論

R1. `CharacterDefinitionV3`は`actionNorms`とは別に、上限を持つ専用の
`consciousGuidance` collectionを持つ。

R2. conscious-guidance entryはstable ID、applicability clausesとmatch mode、statement、
priority、`preference`または`commitment`のforce、self-awareness、exceptions、descriptive
metadataを含む。action reference、action kind、tactic tag、fallback action、restrictive
dispositionは持たない。

R3. 適用可能な場合、conscious guidanceはawareness gateを通ったstatementを顕在意識の判断材料として
供給できる。ただしengine candidate/result fieldへ直接projectionせず、決定論的なlegal・ranked・
excluded action集合を変更せず、同じtransitionでpsyche stateへ直接書き込まない。一方、顕在意識の
判断が変わることは正当であり、選択行動と後続experienceが変わる結果、後のpsyche反応を含む間接影響は
起こり得る。

R4. V3の各`actionNorm`は実行可能で、最低1つの`actionRef`、`actionKind`、`tacticTag`を選択する。
selectorなしの`constraint`、`allow_only`、`forbid`、soft action normはV3 activation時に不正とする。

R5. 明示的cutover selectorがcharacter definition schema 3を選択した後、create、revision、upgrade、
restore、import、derived authoringはV3 candidateを生成する。selectorなしaction normを出力せず、
migration compatibilityをauthoring fallbackに使わない。

## 決定論的migration mapping

R6. production migration inputは、2026-09-10に`ready`として観測された正確なcurrent generation ID
8件を含む、凍結済み・owner-reviewed manifestである。各write前にlogical asset ID、current
generation ID、ready状態、source schema、source content identityを再確認する。

R7. action-norm entryを移動対象にできるのは、全selectorが空、dispositionが`prefer`、forceが
`preference`または`commitment`の場合だけである。移行は当該entryを置換後の`actionNorms`から除き、
LLMも意味的書換えも使わず次を複写する。

- norm ID、`when.match`、clauses、statement、priority、force、self-awareness
- 各exceptionのclausesとdescription
- text、consumer tags、source support referencesを含むnorm description全体

V3 guidance fieldの上限は、凍結対象をすべて無損失で表せる大きさ以上にする。新規authoring向け上限を
さらに狭くしても、migration sourceを切り詰めてはならない。

R8. selectorを備えたaction normと、それ以外のdefinition、disclosure、public presentation、media、
operational valueは意味を変えない。公開文面を再生成しない。移動値ごとにversioned deterministic
mappingを使い、V2のliteral `actionNorms` disclosure pathを対応するV3 `consciousGuidance` pathへ
変換する。effective grantを広げない。R3のために狭める必要がある場合は明示してテストする。複写した
consumer tagはdescriptive named-consumer guidanceのままで、それ自体にaccess許可を与えない。
置換後content/provenance digestと必要なcompiler receiptを再計算し、source generationとmigration
contractを識別できるようにする。

R9. selectorなしrestrictive norm、未知reference、receipt欠落、pointer不一致、非ready、想定外schema、
source identity変更、上限外の凍結値、その他unmapped valueがあれば、そのassetだけfail closedとする。
推測、欠落、切詰め、repairを行わず、pointerを移動しない。

R10. 正確なready V2状態を持たないowner character 16件は対象外とする。未対応のままとし、既存の
明示的authoringまたはupgrade workflowを使う。

## 追記型実行と原子的success receipt

R11. 既存generation bytesは編集しない。対象characterごとに検証済みV3 generationを1件追記し、
凍結source generationに対するcompare-and-swapで、そのlogical assetのcurrent pointerだけを移動する。
旧battleは記録済みgenerationに固定されたままにする。

R12. 「bulk」とは凍結manifestに対する1つの限定操作であり、全characterをまたぐ単一transactionではない。
各characterは独立してcommitする。1件の失敗で完了済みitemをrollbackせず、pending itemを完了扱いにしない。

R13. assetごとの1つの原子的success boundaryにはreplacement generation、current pointer、
compatibility/readiness state、durable success receiptを含める。receiptはmigration contract、logical
asset、source generation、target generationを一意に結び付ける。対応receiptのないmigrated current
pointer、または対応pointerのないsuccess receiptを観測できる状態にしない。物理table・key配置は後継設計で決める。

R14. source-generationとmigration-contract identityの組合せで冪等にする。完了済みの再実行は記録された
targetを返し、重複generationを追加しない。failed itemのretryではsource不変性とfailure dispositionを
再検証する。pointer driftがあればそのitemを停止し、新しいowner作業を上書きしない。

## Cutoverと履歴inputの扱い

R15. cutoverは、時刻、deployment version、dialogue schemaVersion、限定されない`V3`ではなく、明示的な
qualified `characterDefinitionSchemaVersion` authoring policy値で選択する。永続化・activation方式は
後継ADRで決める。defaultを暗黙に変えない。

R16. 必要な履歴V2と新V3 generationを読み、V3 guidanceをcompileし、disclosure pathを変換し、qualified
V3 generation provenanceを表現し、mixed contract tupleを拒否できるcodeをdeployment・検証してから、
schema 3選択またはmigration実行を行う。

R17. schema-3 cutover後、V2 sourceからのrestore、import、derived authoringは同じ決定論的V2-to-V3 mapperを
通す。selectorを完備したV2 sourceは空の`consciousGuidance`を生成し、対象となるselectorless soft entryは
R7に従って移す。無損失mapping不能ならfail closedとする。これらの経路から新しいcurrent V2 generationを作らない。

R18. deployment、authoring-policy activation、production migration、pointer rollbackは別々の作用である。
この要件候補はいずれも実行権限を与えない。

## 受入条件

- 後継判断をADR-0010・ADR-0011まで追跡し、ADR-0010のno-inference制御を維持し、bulk-migration authorityが
  ADR-0011で未許可だったことを正しく帰属できる。
- `CharacterDefinitionV3`と`BattleAssetManifestV3`、`CharacterBattleCompilerInputsV3`、dialogue V3、
  conscious I/O V3、`CharacterAgentState.consciousAgencyV1`をnamespaceテストで区別し、mixed tupleをfail closedにする。
- V3 generation-backed basic-action sourceはqualified successor identityまたは意味保持を証明したmappingを使用し、
  変更されたV3 provenanceを`character_generation_v2`と表示しない。
- V3 parserはconscious guidanceを受理し、selectorなしaction normをactivation前に拒否する。
- 決定論的fixtureは対象となるselectorless soft entryだけを移し、provider callなしでR7の全値を切詰めず保持する。
- disclosure fixtureは影響するすべてのV2 literal pathを対応V3 guidance pathへ移し、effective grantを維持または
  明示的に狭め、grant wideningがなく、複写consumer tagがaccess authorityでないことを証明する。
- mechanical inputを固定してguidanceだけ変えてもlegal/ranked/excluded action keyは変わらない。projectionテストで、
  guidance fieldがengine candidate/resultまたは同一transitionのpsyche writerへ直接送られないことを示す。
- conscious-decisionテストではguidance差により別actionを選べる。その後のstateはguidanceの直接writeではなく、
  選択actionの間接的結果として記録する。
- mixed generationではselectorを備えたaction normを変更せず、対象guidanceだけを移す。
- restrictive selectorless entry、未知値、receipt欠落、source/pointer drift、lossy mappingは新current generationを
  作らずfail closedにする。
- production-shaped fixtureはready V2 character 9件を表す。そのうち8件に対象selectorless soft entry計21件があり、
  Takumi 1件はselectorを完備する。凍結manifestは8 sourceだけを選ぶ。
- 成功fixtureごとにV3 generationを追記し、pointer、readiness、source/targetを一意に結ぶreceiptを原子的にcommitする。
  V2 generationは読取可能で、旧battleはbytes単位で固定される。
- crash境界・partial-failure fixtureでpointerのみまたはreceiptのみを露出せず、冪等retryでtarget generationを重複作成しない。
- no-state 16 characterは未対応のままでmatch selectionに出さない。
- 明示的authoring-policy selectorはdialogue/battle V3 selectorと独立し、defaultでは変わらない。
- cutover後のcreate/revision/upgradeはstrict V3を生成する。V2 restore/import/derivedはR7で無損失mappingするか
  fail closedにし、新しいcurrent V2を再活性化しない。
- dry-runはwriteせず、eligible、rejected、drifted、already-complete itemを正確に列挙する。production実行とreadbackには
  後段の別owner gateを設ける。

## 対案とトレードオフ

### A. 恒久V2 compatibility reader（現ADR-0029改訂1）

短期の変更量は小さくなり得るが、V2の曖昧値をruntimeで長期解釈し、authoring・selectionの二重contractを残す。
不整合を正規化する今回の目的とは合わない。

### B. 改訂4の追記型・決定論的bulk migration

schema、dual reader、mapper、receipt、cutover、disclosure path、qualified provenanceの設計と検証が必要になる。一方、
対象8件を明示的新世代へ正規化し、旧世代・旧battleを保持し、恒久例外を残さない。

### C. 8件をLLMで再生成

新schemaへの自然なre-authoringは可能だが、意味変化、非再現性、provider依存、owner review負荷がある。既存値を無損失で
移す復旧要件には不適切である。

### D. no-state 16件を含む全characterの同時upgrade

選択肢を一度に増やせる可能性はあるが、ready V2正本がない16件には機械的migration sourceがなく、別のauthoring判断が
必要になるため今回の範囲を越える。

## 未決事項とリスク

- qualified compiler identifierの正確な名前
- V3 basic-attack sourceの最終表現
- migration ledgerの物理schema
- `characterDefinitionSchemaVersion` policyの永続化・activation方式
- 凍結manifest外のtest/seed assetを同時に移すか

これらは後継ADRで決める設計事項である。R1〜R18を弱めたり、既存identityの意味を黙って変更したりしてはならない。
主なdelivery riskは、dual-read期間のtuple混在、literal disclosure pathのmapping漏れ、pointerとreceiptのcrash境界である。

## 対象外

production deployment、traffic変更、policy activation、migration実行、pointer rollback、providerによる再生成、no-state 16件の
bulk upgradeは対象外である。別件のresponse-schema identity修正に対するlive xAI検証も、別途権限を得るエビデンス取得とする。

## Proposed independent-review input

改訂4の固定snapshotについて、次を確認する。

- ADR-0010のno-inference制御とADR-0011のbulk-migration authorityが正しく分離されているか
- 実在する`CharacterAgentState.consciousAgencyV1` identityを使用しているか
- ADR-0028の全V3 namespaceと`CharacterDefinitionV3`が分離されているか
- R7 metadataが無損失か
- disclosure pathが決定論的に変換されgrant wideningがないか
- V3 basic-action provenanceがqualifiedか
- direct flow禁止とlegitimate indirect effectが区別されているか
- pointer/readiness/receipt原子性が物理設計を先取りしていないか
- cutover、V2 restore/import、append-only、旧battle保持、strict post-cutover authoringが完全か

deployment、production実行、LLM再生成、no-state 16件migrationを受入条件へ追加しない。

## Step 2で選択できる経路

- `REVISE`: owner指摘を反映した改訂5を作成し、Step 1から再開する。
- `REVIEW_THEN_REVISE`: 独立レビュー後、必ず改訂する。
- `REVIEW_THEN_DECIDE`: 独立レビュー後、改訂か次段階移行かを改めて決める。
- `REVIEW`: owner質問を追加せず独立レビューを実施する。

改訂4では前回の2 contradictionを訂正し、2 unknownをproof obligationとして明示したため、現時点の推奨経路は
`REVIEW`である。これは承認ではなく、改訂4に新たな矛盾や証拠不足が残っていないかを独立コンテキストで確認する段階である。
