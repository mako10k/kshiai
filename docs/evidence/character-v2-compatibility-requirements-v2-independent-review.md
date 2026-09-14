# キャラクター顕在意識ガイダンス移行要件 revision 2 — 独立レビュー

- 状態: `completed`
- ライフサイクル: Step 3完了、Step 4オーナー判断待ち
- 対象正本: [`docs/character-v2-compatibility-requirements-v2.md`](../character-v2-compatibility-requirements-v2.md)
- 対象Seal: `proposal/character-conscious-guidance-migration-v2`、短縮識別子`4b4d18b8b9ae`
- レビュー入力: [初回オーナーレビューと全範囲日本語訳](character-v2-compatibility-requirements-v2-owner-review.md)
- 同一性: レビュー前後とも正本・レビュー入力は各Seal済み内容と一致
- 因果監査: CLI LLMThink `fatal=0 / error=0 / warning=0`

完全digestは機械向けSealgraph記録に保持し、このユーザーレビューでは同一性と短縮識別子を用いる。
独立レビューは候補本文を変更しておらず、以下の結果も自動的に要件本文にはならない。

## 結論

レビューは実施可能であり完了した。ただし、revision 2をそのまま承認する根拠は不足している。
Step 1のauthority列挙に2件の矛盾があり、直接効果の受入表現にも修正が必要である。
推奨経路は`REVISE`であり、revision 3を新しいStep 1候補として発行する。

## 分類別結果

### 要件または上位authorityとの矛盾

#### C1 — ADR-0011のauthority disposition欠落（high）

Accepted ADR-0011は次を直接所有している。

- 不変`CharacterDefinitionV2`
- ready current V2だけを選択・戦闘束縛へ使う規則
- V2のcreate、revision、upgrade、restore
- bulk migrationと本番操作を既存受入範囲から除外する規則

revision 2はADR-0010、ADR-0027、Proposed ADR-0029を扱っているが、ADR-0011を列挙して
いない。後続ADRはADR-0010の限定移行例外だけでなく、ADR-0011のV2定義authority、
ready V2 binding、V2 authoring/restore規則について、何を保持し、何をrefineまたは
supersedeするか明示する必要がある。

最早期の原因段階は、要件Step 1における既存authorityの列挙不足である。

#### C2 — 既存V3 namespace inventory不足（high）

`CharacterDefinitionV3`という修飾名は共存可能だが、Accepted ADR-0028はすでに次を所有する。

- `BattleAssetManifest` schemaVersion 3
- `CharacterBattleCompilerInputsV3`
- dialogue schema V3
- conscious output V3
- 戦闘・発話系のV3 tupleと互換性規則

revision 2は`CharacterAgentStateV3`とCompact発話版だけを挙げており、既存V3 ownerの
列挙が不完全である。revision 3では`CharacterDefinitionV3`がこれらを置換せず、
別namespaceとして接続されることを明示する必要がある。

### 証拠不足または未確認事項

#### U1 — 記述由来フィールドの写像（low）

過去の顕在判断効果に使われていたID、条件、match、statement、priority、force、awareness、
exception clauseはR2/R7で保持される。旧コンパイラーが消費していなかった
`description.text`、`consumerTags`、`sourceSupportRefs`、例外descriptionについては、
新フィールドへの正確な写像と上限が未決である。

これは歴史的効果との矛盾ではなく、後続ADRで決める設計unknownである。

#### U2 — 直接流入と間接的結果の区別（high）

R3の意図である次の直接境界は検証可能である。

- guidanceをengine fieldへ投影しない
- legal candidate集合と機械的ranked/excluded keyを変えない
- 同じtransitionでpsyche stateを書かない

一方、guidanceが顕在意識の行動選択を変えれば、その行動結果や後続experienceを介して、
将来のpsyche reactionが間接的に変わる可能性がある。「engine inputやpsyche stateへ一切
影響しない」という絶対表現は証明できない。revision 3では直接流入禁止と、通常の
間接的因果を区別する必要がある。

#### U3 — 成功receiptを含む原子境界（medium）

R11〜R13は、対象単位の独立commit、CAS drift停止、失敗の可観測性、冪等再試行を
要求している。しかしsource世代、target世代、current pointer、compatibility state、
成功receiptを結ぶ一意キーと同一transaction境界は未決である。

これは新しい製品要件ではなく、後続設計でR11〜R13を満たすための実装unknownである。

#### U4 — strict authoringのcutover判定（medium）

R4/R5は切替後の全作成経路でセレクターのないaction normを拒否する。しかし、cutoverを
選ぶ正確な判定子と、V2を入力にするrestore/import/derivedをV3へ決定論的に変換するか、
fail-closedにするかは未決である。現行restoreは過去のV2 envelopeを新しいV2世代として
複製するため、後続ADRでtransitionを決める必要がある。

### 将来候補

追加findingなし。

### 対象外

追加findingなし。デプロイ、本番移行実行、LLM再生成、no-state 16件の移行は、候補に
記載されたとおり対象外である。

## 7つのレビュー論点への回答

1. ADR-0010との整合: 不変性、CAS、ready-only、read-only bindingは整合する。ただし
   ADR-0011のauthority処理が欠けている。
2. R2/R7の意味保持: 歴史的に消費された意味は保持できる。未使用の記述metadata写像は未決。
3. 行動・engine・psyche境界: 直接流入禁止は検証可能。間接的影響まで否定してはならない。
4. 追記型世代と旧戦闘: 矛盾なし。旧世代と旧battle bindingを保持する。
5. 原子性・冪等性・drift: 必要結果は妥当。receiptを含むtransaction設計は未決。
6. V3識別子: 修飾名は妥当だが、ADR-0028が所有する既存V3一覧が不足。
7. 新規作成切替: strict方針は明確。cutover判定とV2 restore/import入力の扱いは未決。

## 修正案と対案

### 推奨: revision 3へ改訂

- ADR-0011の保持・refine・supersede範囲を追加する。
- ADR-0028の既存V3 namespaceを完全に列挙し、別identityとして扱う。
- engine/psycheへの影響を「直接流入禁止」と「間接的結果」に分ける。
- metadata、成功receipt、cutoverは必要結果を保持した設計unknownとして明記する。

一括移行、追記型世代、8件／21要素、LLM不使用という中心方針は変更しない。

### 対案: revision 2を変更せず再レビュー

追加質問の検証には使えるが、確認済みのauthority欠落は本文に残る。再レビューだけでは
候補bytesが変わらないため、矛盾を解消しない。

### 対案: revision 2をそのまま承認

ライフサイクル上の選択肢ではあるが、ADR-0011とV3 namespaceの未処理を既知のまま
受け入れることになる。現在の証拠からは推奨しない。

## Step 4オーナー判断

- `REVISE`: Step 1へ戻り、上記修正を含むrevision 3を発行する。推奨。
- `REREVIEW`: 候補を変更せず、具体的な追加質問を指定してStep 3を再実施する。
- `ACCEPT`: 現在のrevision 2をそのまま承認する。上記矛盾が残るため非推奨。

どの経路も、別途明示されない限りADR承認、実装、デプロイ、本番移行を許可しない。
