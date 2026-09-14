# Authoring continuation checkpoint — 2026-09-11

## 現在地

共通基盤要件revision 3とキャラクタ要件revision 5は独立レビュー後にオーナー受理済み。
受入記録はそれぞれ同名の -acceptance.md。
本文の作成時ヘッダ・DRAFT Sealと、現在の受入状態は区別する。

このWIPには、以前のsemantic migration修正、Ollama検証コードと失敗を含む観測証拠、
要件候補の変遷、独立レビュー、受入、Seal履歴を保存する。
新共通基盤の実装・実LLM収束の証明ではない。過去のprovider失敗も変更せず保存する。

## 今回の保存検査

- npm test: 成功。
- npm run typecheck: 全workspaceとdeploymentの検査に成功。
- 対象843ファイル、約11.5MBの差分・追加を検査。backend/src、docs、.sealgraph外の対象なし。
- 既知のGitHub/xAI token・private keyパターンの該当なし。網羅的な秘密不在の証明ではない。
- user指示はコミット後の継続。push、merge、deployment、provider実行は行わない。

## 再開位置

受理済み両要件とADR-0010/0011/0014/0030を照合し、共通基盤の責務・型付き境界・
部分作業と検証・回復・機械的安全策・既存契約置換の後継設計をProposed ADRとして作る。
既存ADRは新ADR受理前にSupersededへ変更しない。
具体設計の受理前に新アプリケーションコードを実装しない。
キャラクタ生成・修正・移行を最初の高度利用者とし、他2familyの共通適合検査を維持する。
