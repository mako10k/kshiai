# 知覚プロンプト評価テストの型構築

全テストの因果整理・成立・Seal指示とAGENTS Type escapesの範囲で、既存perception-prompt-strategy.test.tsを確認する。既存11ケースとassertionを残し、実装、品質閾値、モデル選択、生成呼出数を変更しない。

## 根拠

requirements F-BTL32/33/36と、現行Accepted ADR0051の継続採用に基づくdesign D23/D24/D27を使用する。維持されたbattle-perception.md §2.2/§9.9はcombined/splitの独立評価と固定構成を説明する。perception-prompt-evaluation.mdの固定matrix・Metrics and floorsは保存された評価ハーネス仕様として使用し、現在のモデル能力・価格・live品質やawareness-v5の生成構成を再採用するものではない。

## 修正

生成JSON Schemaの$defsのうち実際にassertするdirection/distance/status enumだけをZodで検証して読み取る。未知のrawWorldResponseはobjectとして検証してから展開する。不正帰属のfixture変更はPerceptionEvidenceSetSchemaで既存の知覚配列を検証してから行う。uncheckedなRecord/response型断言を削除し、assertionは増やしても元の意味を維持する。一般的なLLM出力を強制的に正しいfixtureへキャストしない。

## 検証範囲

Node22・隔離DBで11件全件を実行しstrict型検査を行う。3fixture×3repetitionのcombined9回とsplit18回は注入されたfake clientへの27回であり課金呼出しではない。モデル名と過去のreview registryは保存された文字列とlookupの回帰検査のみ。評価器による実provider選択やproduction配備は非対象。
