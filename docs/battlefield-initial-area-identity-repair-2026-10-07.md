# 初期戦場のエリア同一性の修正

状態: 採用済み契約の実装修正。新しい製品ルール、外部API、保存形式、移行方針を追加しない。

## 根拠と終了条件

ADR-0012 の deterministic compilation / stable areas・object/effect IDs、ADR-0020 D1 の frozen topology に沿う1行動1隣接移動、ADR-0022 の canonical placement/topology と観測の分離を守る。原因分析は `docs/evidence/reposition-original-area-id-rca-2026-10-07.think` とCLI監査に記録した。

構造化戦場の初期世界が元の全エリアID、A/Bのentry ID、物体/effectのarea IDを保持する。表示名を識別子として使わない。同名エリア、空の中間エリア、generated area.N と元IDの衝突でも崩れない。3エリアの経路を1回で中間、2回で相手側へ進む。保存済みworldは読み直しで変更しない。世界のない旧保存データの従来の決定論的補完は変えない。

## 内部受け渡し

`BattlefieldCreation` を legacy / structured の判別unionにする。structured側は既存 `BattlefieldInstance` と `BattleWorldInitialLayout` が必須。layoutは全宣言エリアとscene実体ID→areaIDの写像を持つ。一方だけの入力は型で拒否する。これは試合作成時だけの内部データであり、BattleState.battlefield、asset manifest、公開DTOへlayoutを複製しない。

`prepareStructuredBattlefieldCreationV2` は既存の純粋なinstance compilerと同じ frozen definition を検証して、インスタンスと初期配置を組にする。terrain実体はarea自体、present objectはobject.areaId、area/area_occupants effectはtarget.areaId、従来scene/all_combatants effectは従来同様entry Aに置く。新しい効果処理や感覚・係数解釈は追加しない。

`battlefield-creation.ts` がこの組の準備だけを所有する。`battle-world.ts` は初期配置の参照・上限を検証し、渡された安定IDを使って初期世界を作る。`battle-engine.ts` は組からインスタンスと世界を作り、インスタンスだけを既存stateに保存する。`battle-service.ts` はready generationから必須の組を取得して渡す。GET、既存試合のensure、LLM呼び出し数はこの修正の対象外。

legacyの新規テスト用入力は明示的なlegacy分岐で扱う。宣言されたareas/entriesがあればそのIDを保持し、その他の古いsceneラベルは宣言IDと衝突しないIDへ対応づける。宣言名が重複し、実体の配置を識別できない場合は推測して選ばず拒否する。構造化compilerのインスタンスをlegacyとして渡すことも拒否する。元からworldのある保存済み試合、world未保存の歴史的補完は従来経路のまま。

## 検証

既存の3エリア移動試験を弱めず、中間エリアIDを確認する。構造化compilerからengineへの同名エリア・物体/effect配置、型の必須組、旧worldの維持を回帰試験で確認する。共有全体と影響するHTTP試合開始・表示の試験、厳密な型検査、全workspace型検査を実施する。Sealは修正後の実装と合格した全試験ファイルを現在の根拠へ結んで行う。実モデル品質や公開配備の証拠とは扱わない。
