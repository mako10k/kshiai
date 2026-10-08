# キャラ定義から世代読取・戦闘束縛までのテスト因果レビュー

2026-10-07。元の7全ファイル43ケースを保持。Accepted ADR0010の不変envelope・世代identity/digest・named consumer disclosure、Accepted0011のDefinition authority / Action and relationship semantics / Psyche and conscious access / Public profile and consumersが根拠。現在の普通の更新はAccepted0043 IMPLEMENT/ACCEPTANCEを優先しV3だけとする。保持V2のschema・表示projection・migration-source reader・内部test importを残すという同じ決定に従い、旧helperの純粋検査を現在の普通のV2新規作成の根拠にしない。旧requirements.mdのV2 authoring記載やProposed0059を実行根拠にしない。0045/0046は既存値の保持と構造型の条件整合だけを継承し新ルールを作らない。

## 確認範囲

- character-definition-check 6件: legacy sheetから構造を作りgapを列挙、gapだけfill、exact-character targetsをupgrade fillから除く、combat/identityを保存、自然description型の正規化、不完全action normの拒否。数値balance、実authoring/provider/DB migrationは証明しない。
- character-definition-rules 10件: 未構造化principleの拒否/明示的defer、登録済みpredicate/action/relationship参照、矛盾/unknown/missing selector拒否、force/priority/specificity/stable IDによる決定論的選択とA/B対称、保存済みV2 normの読み取り。旧V2の普通のauthoringを受入しない。
- structured-character 12件: 必須basicAction、public/self/omniscient等の各projectionと認識/開示分離、appearance-only image brief、relationship target gating、stable ID/reference拒否、material claim rejection/allowed support receipt、utterance event語彙とspeech reactTo語彙の分離。pure schema/compile/projection/validatorであり、実LLMが正しい説明を返すことや全disclosure行列を証明しない。
- character 6件: empty patchの保持、nonempty patch、画像URL入替、revision snapshot復元、戦闘snapshotからowner/record等の可変operational state除外、保持legacy JSON parsing/default/public display。historical utilityの回帰であって0043で撤去した普通のportrait/restore/copy更新を復活させない。default数値/rating formulaを受入する検査でもない。
- character-manifestation 3件: observer packetに根拠がないprivate proposalを落とす、carrier expression確定までは非可視、知覚/commit後のみ表示、A/B交換で同構造。実modelのmanifestation生成、全境界の結線は別証拠。
- battle-asset-manifest 3件: current combat-ready boundaryでbasicAttack必須、保持binding-format-v1の互換defaultに世代/旧version出所を付ける、binding-format-v2のbasicAttack receiptがbound generationと不一致なら拒否。新規旧形式試合作成や本番migrationの根拠ではない。
- character-generation-reader 3件: 合成V2/V3 envelopeを読み、検査したversion/name/prior-image/visibility/compatibility/compiler返却fieldを保持、storage/envelope version混在とcontent digest driftを拒否。タイトルのwithout changing either meaningは全意味保持を主張しない。asset type/id/unsupported/readinessの全分岐やDB loadの証拠ではない。buildImportedCharacterEnvelopeV2は純粋なtest fixture合成だけ。

## 型修正と検証

独立reviewでstructured-characterのregistered event tupleをreadonly string[]へ広げるtest castを発見。CLI RCA audit fatal/error/warning0を確認後に、同じtupleからSet<string>を作るhasへ変更。元のdirect_address queryと期待falseを維持する。Set.has/includesはこの文字列集合で同じ包含判定。全文のexact置換比較でその1expression以外の全byteと他6ファイルを保持。production/schema/語彙/挙動は変えない。nonnull fixture assertionsはoptional fixture fieldへの検査済み参照で、unchecked最終snapshot castではない。

7ファイル43ケースの修正前/後diagnostic、対象とimportのstandalone strict、workspace typecheck、独立差分reviewを根拠にする。backendの既存noImplicitAny:falseに依存せずstandaloneでstrictを適用する。正式全体テストのunsealed停止を維持し、251全ファイルを除外/skipせず残す。sourceとSealIDをcandidate時/登録直後/最後に読み戻し、以前1008headを保持、fsckを確認して初めて今回分完了とする。

## 計測と残課題

7ファイルの共通契約照合を1回行う単位にし、既存独立reviewを再利用して今回2ファイルと変更expressionだけ追加review。総時間とCLI writer時間を分離する。件数やsourceの大きさが異なる単位から性能改善を断定しない。全体の未決定authoring/fallback/数値規範は保持し、本reviewからOwner acceptanceを作らない。
