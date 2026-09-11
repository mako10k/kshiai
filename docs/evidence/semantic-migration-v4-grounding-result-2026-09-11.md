# Semantic Migration V4：レビュー根拠化と公開由来分離の結果

日付: 2026-09-11  
対象: `character-semantic-migration-prompt-v4` の未実行ローカル実装

## 結論

残っていた二つの欠陥経路をV4限定で是正した。

1. LLMレビューのパスが正しいだけでは、その主張を自動修復命令として扱わない。
   レビューはR14どおり修復範囲を広げられるが、修復プロンプトへエラーとして渡すのは
   独立したサーバ検出事項だけである。サーバ検出で裏付けられないレビュー主張は、値を
   変更せずオーナーレビュー対象として保持する。
2. disclosureの継承を操作全体ではなく対象テキスト葉ごとに判定する。公開statementと
   非公開selfAwarenessを同じ操作の由来に含めても、statementが公開元と完全一致する場合は
   その公開権限だけを継承し、selfAwarenessから公開権限を作らない。

V1からV3の履歴再現動作は変更していない。Sealgraph本体にも変更を加えていない。

## RCA

- 根本原因1: レビュー応答の構造・パス妥当性を、レビュー主張の事実妥当性と同一視し、
  そのまま修復エラーへ昇格していた。
- 根本原因2: disclosure由来を対象テキスト単位ではなく操作単位で判定し、ひとつの公開規則が
  操作の全sourcePathsを覆うことを要求していた。
- 寄与要因: 修復closureが意味的隣接項目を許可するため、誤った主張がスキーマ上正しい複数の
  値変更へ波及できた。
- 逃逸原因: スキーマ検査・登録パス検査・全候補検査は構造を証明するが、レビュー説明文が
  主張する事実までは検査していなかった。

この因果分類と実装判断はCLI版LLMThinkで監査し、fatal/error/warningはいずれも0だった。

## 実装した境界

- V4レビューの全targetPaths/sourcePathsが関連するサーバ検出事項に対応するかを照合する。
- レビュー由来のtargetPathsとsemanticDependantsはclosureへ追加するが、レビューfinding自体は
  自動修復のerrorsへ追加しない。
- 未裏付けレビューは`review_claim_unverified`として結果へ残し、修復すべきサーバ検出事項が
  なければ`review_required`で停止する。
- V4では、selectorを持つV2 action normの欠落を決定論的に検出する。またtarget selectorが
  指すnormとは別のsource normを根拠にした変更を検出する。
- V4 disclosure継承では、sourcePathsの祖先指定を登録済み葉へ展開し、同じ役割かつ同一文字列の
  公開元だけから対象規則を生成する。重複規則は除去する。

## 検証結果

- 全784テスト合格（shared 339、backend 417、frontend 20、deployment 3、release 5）。
- 全workspaceとdeploymentのTypeScript型検査合格。
- 本番build合格。Viteの既存chunk-size警告だけが残った。
- jscpd合格。
- Lizard 1.23.0合格: 211 files / 3527 functions、cyclomatic complexity超過
  117/許容121、function length超過67/67、parameter count超過5/5。
- `git diff --check`合格。

局所回帰では、次を確認した。

- fallbackが存在するのに「欠落」としたレビューで修復呼び出しは発生せず、値が保持される。
- サーバが実際にfallback欠落を検出した場合は、レビューが追加した意味的影響範囲を保って修復する。
- V4だけが`consciousGuidance.0.statement`へprofile/publicと二つのnarrator権限を継承し、
  selfAwareness向け規則は作らない。
- executable norm欠落と、別norm由来のpriority差替えを検出する。

## 残る限界

- 実LLMを呼んだ収束確認は今回実施していない。
- 機械的に裏付けられない純粋な意味判断は自動修復せず、オーナーレビューで止まる。この停止は
  誤修復より優先した意図的な境界である。
- 言い換えた公開文は同一文字列として追跡できないため、自動では公開せずprivateのままになる。
- activation、production変更、commit、push、deployは実施していない。
