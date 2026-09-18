# Seal健全化の独立レビュー — 2026-09-17

担当: 独立Luna subagent `seal_health_inventory`。主担当による以下の転記・判断は製品承認ではない。

## キャラクタ要件v5 — 作成前

対象本文SHA-256: `17596f17d6514d5ada160b9d95453ab2bcb9cee9e4b2d2991acb8238b55ee27b`。
対象受入記録SHA-256: `64a60866b32f30d27be31816a6593db7d703261ecee47f1dfe3f8c2050584211`。

Luna所見: 構成・限定意味適合とも条件付きPASS。条件は、受入記録bytesを維持し、foundation v3 snapshot・Accepted V2互換要件v6・Accepted ADR-0030へCauseを持つ非rootの現行受入記録を作り、その記録へ要件本文snapshotを結ぶこと。歴史的candidateヘッダは、既存owner acceptanceが現行効力を示すことをCause messageで明記する。新root・再受入は不要。

限定意味レビューの範囲: 旧workflow全文supersede、基盤v3固定依存、V2のsource preservation・typed deferral・drift・production gates、ADR-0030の従来上限・source-based retry・migrator-only capsule・disclosure/runtime limits、分類されたsynthesisとfocused reconciliation。確認範囲に新たな具体的矛盾なし。全実装適合やテストadmissionは対象外。

主担当判断: 条件をすべて反映して2つの新REFを作成した。旧REFと本文は変更しない。CLI監査はfatal/error/warning 0。

## キャラクタ要件v5 — 作成後

Luna readback: `acceptance/character-v3-authoring-v5-current` (`d4827ddf…`) と `requirement/character-v3-authoring-v5-accepted-snapshot` (`3942057f…`) は指定headと一致。双方draft=false、SEALED_STATE_CLEAN、WORKFILE_MATCHES_HEAD。上記source SHAも一致し、Cause構成がレビュー条件と一致。fsck ok。新rootなし、旧REF不変。

## ADR-0032と継承元ADR-0031 — 未適用

Luna所見: 限定意味適合は条件付きPASS。ADR-0032はADR-0031をlifecycle containerとしてSupersedeし、D1–D6・D8–D11およびD7非時間部分を保持し、elapsed-time D7だけを置換する。旧workflowのlive authorityや現行foundation/v5/ADR-0030との新たな矛盾は確認されない。

候補構成: ADR-0031のSuperseded状態を含むbytesを固定した非root accepted-history snapshotと、それを参照するADR-0032現行記録。過去の決定を単独で現行権威として復活させない。必要な上位Causeを確定するまで作成しない。

Lunaの当初報告はADR-0010/0011/0014/0024のSealが見つからないとした。主担当の一次確認では、ADR-0011は `adr/structured-character` (`a16926e3…`) に存在するため、その部分を訂正した。ADR-0028もprojectionだけでなく、正本 `.think` に結び付いた `proposal/adr-0028` (`a50bf967…`) が存在する。REF名だけでは文書の現在のAccepted状態を判定しない。

ADR-0010/0014/0024はAccepted文書がある一方、全REF source一覧で対応Sealが見つからない。必要な継承主張を現行foundationで充足できる範囲と、これらの独立した根拠が必要な範囲を確認中。新rootが必要な場合はオーナーレビュー対象とする。

## ADR-0010 — 指摘の訂正とroot候補

Lunaは当初 `.think` や独立した承認digestがないことをblockerとして報告した。主担当は、その手続はADR-0015以降であり、ADR-0010へ遡及できないと判断し、再確認を依頼した。Lunaはその指摘を撤回した。また、PERT・inventory・実装レビューをADRの上位authorityにするCauseは要求しない。

訂正後のLuna所見: Accepted Markdownと2026-08-13から変わらない正本identityにより、既存Accepted状態を維持する。旧workflow全文supersedeは、このADR自体の無効化ではない。基盤v3・キャラクタv5のAccepted envelope semanticsとの新たな具体的矛盾は確認されない。既存のready predicate、4 disclosure gates、exact generation/compiler binding、battleによるasset write禁止を仕様から除外しない。

原文不変のprovenance root候補をオーナーレビューへ提示可能。rootは当時のAccepted snapshotの出発点を固定するもので、後継決定に優先する現行全条項の無条件復活ではない。normativeなenvelope designはADR配下へCauseを向ける。

主担当判断: この限定所見を採用し、`acceptance/adr-0010-existing-baseline` Candidateを作成した。未Seal。オーナーのrootレビューという既存の明示条件を待つ。全文日本語訳を含む [レビュー資料](adr-0010-seal-root-review-ja-2026-09-17.md) を用意した。

作成後Lunaレビュー: PASS（オーナーレビュー用）。HEADなし、予定Seal `c18419af…`、root=true、draft=false、Causeなし。Candidateと原文がbyte一致し、SHAも一致。提示資料は既存Accepted snapshotの登録、後継優先、旧workflow非復活、設計の従属性、実装・テスト等の限界を明示している。日本語訳は全セクションを含み、重大な欠落や意味逆転なし。CLI監査fatal/error/warning 0。rootは未公開。

2026-09-17公開追記: 上記候補に対するオーナーの「承認します。」を受け、同一CandidateをSealした。主担当の公開後readbackはhead `c18419afb42060d887b3f7f86970b45312cb77a7665dfbc7398a697e3e3d7ad5`、非draft・非stale、source一致、Candidateなし。原文は変更していない。ADR-0014の次の個別レビューを同じLunaに依頼した。

## ADR-0014と不足するADR-0006 — 未公開

LunaはADR-0010公開後のroot/非draft/Causeなし/source一致を確認。ADR-0014（原文SHA `2439e6894f0bd54a05aa9903436f89e8cc57cfe8e7355fa73c333ca5020a244f`）は明示的な既存owner acceptanceを持つ。ADR-0010/0011をCauseにする非root構成は妥当だが、耐久wake/fenceの実質依存ADR-0006が未登録。ADR-0024は後継refinementでありADR-0014の上位Causeではない。旧workflowは歴史参照として扱い、現在の基盤v3/v5との具体的矛盾は確認されない。監査fatal/error/warning 0。（digestは再実測により転記時の末尾f欠落を訂正。）

主担当はADR-0006の不足を隠してADR-0014を公開しない。同じLunaにADR-0006を別件レビュー依頼。Luna所見はowner-review候補としてPASS。Accepted原文はSHA `dde999ff40599efb88cebe2e4b918b82fbb42d460479a455f0b8934bd880110f`、ADR-0005をSupersede。旧workflowへの直接依存なし。耐久outbox、Cloud Tasks OIDC wake、専用lease、delivery generation/recovery、checkpoint fencingの固有決定を登録する原文不変rootは妥当。監査fatal/error/warning 0。

主担当の候補作成前監査もfatal/error/warning 0。`acceptance/adr-0006-existing-baseline` に予定Seal `78f9fec1b418020c221d67930654a6ead967fb85393603a544651cea83a61371` のCandidateを作成し、全文日本語訳を用意。未公開であり、現行Causeに使用しない。

作成後Luna最終readback: PASS（owner review提示可）。予定Seal一致、HEADなし、root=true、draft=false、Cause0、6396 bytes。Candidateと原文がbyte一致し、上記SHA一致。日本語訳の全セクションに重大な省略・意味逆転なし。後継優先、旧ADR/workflow非復活、製品変更なし、別認可境界を確認。最終CLI監査fatal/error/warning 0。主担当のfsckはok（911 Seals/392 refs）、source compareはWORKFILE_MATCHES_CANDIDATE、git diff --check成功。オーナーのこのrootに対する承認は未取得。

## 根拠チェーン単位の継続 — ADR-0006/0014/0024公開

オーナーはADR-0006 root候補を承認し、より大きい目標単位での進行を指定した。同一候補を公開し、主担当が非draft・非stale・source一致・候補なしを確認した。

LunaによるADR-0014最終レビューはPASS。ADR-0010（atomic activation）、ADR-0011（validated candidate、owner review、digest binding）、ADR-0006（durable wake/fence）の3 Causeを確認。原文とCandidateのbyte一致・正確な64桁SHAを再確認した。主担当が `acceptance/adr-0014-current`、Seal `7e4349a9d219cac18bbb4723824fa1e5249282dd5534675730d0ed7e5ecd46aa` を公開しreadbackした。

LunaによるADR-0024個別レビューもPASS。正本SHA `7c48b07d1776ca841984a37e4ea776dbbce81d6d06197637a854a626ef936f0d`、OWNER_ACCEPTANCE/ACCEPTANCEを確認。D1-D6の既存queue契約はADR-0014へ、durable wake patternはADR-0006へCauseを向ける。foundation/v5との限定fitに新しい矛盾なし。逆向きCauseや実装/設計を上位authorityにしない。

主担当はCLI監査fatal/error/warning 0の後、指定2 Causeと原文一致をcandidate compare/source compareで確認し、`acceptance/adr-0024-current`、Seal `d11da35e926e202d6841f3cc7e29620d23370ba40b0e10cf005de86d2b58bd8f` を公開。0014/0024とも非root・非draft・非stale・source一致・候補なし。0014/0024は既存承認内の修復であり追加owner gateは不要。Lunaの一報にあった0014のowner gate表現は、rootのみ本人レビューという既存条件に照らして採用しない。

## ADR-0031/0032 — 継承元と現行決定

Luna限定レビューPASS、監査fatal/error/warning 0。前回の意味適合レビューを無理由にやり直さず、欠落していた上位Causeの充足を確認した。0031正本SHA `d7001ab17da3367abb043ea97b999d2818de6b3003b76e395fd37ee4a0389aff`、0032正本SHA `a0b456e1f587c0687da9ae4449b81fc51b3da7811c6e136d4a5f173855604c91`。

0031 E1/E2/D10の9 Causeは、基盤v3、キャラv5、ADR-0030/0010/0011/0014/0024/0027/0028。本文のSuperseded状態を含む固定履歴として登録し、単独の現行ADRとして復活させない。0032はその固定履歴をCauseとし、D1-D6/D8-D11およびD7非時間部分を継承し、時間意味だけをD1-D4で置換する。reviewは証拠であって上位製品authorityではない。

主担当は各候補の原文一致とexact Cause一覧を確認して公開。0031履歴Seal `63499128ab704e86f169d3ca42fd561e1e2ca95d77ffcfe0dc44f01b88ce3b50`、0032現行Seal `996c4d1144c9bdac462d595a9baf46e8ed29548e8044b0131e67ad940bc6b66b`。双方非root・非draft・非stale・source一致。数値Configや実行権限は追加していない。

## ADR-0033/0035 — 現行判断の個別レビュー

Lunaは各正本を独立に確認し、それぞれPASS。CLI監査fatal/error/warning 0。

- 0033正本SHA `d0c1ee2a4b4003efa54745ebd25109f7c7e9cea625db9c2fd0caf727d5e0cdc0`。E1/E4/D1-D3のCauseは基盤v3と0032現行。実装設計rev6は下位なので上位Causeにしない。runtime Configとdurable correctnessの区分を保持。
- 0035正本SHA `afb3c9fcb06d0cfae737487afda2236721417a47d50a57086605aad93dedff36`。E1/D1-D3のCauseはキャラv5 R2/R3/R13、基盤F1/会計、0032経由のfocused kernel。cc304計画、設計、診断テストを製品authorityにしない。scope推定の同一attempt会計、single-cluster初回試行、曖昧・複数領域の扱い、paid calls等の除外を保持。headerは過去のproposal記述で、本文OWNER_ACCEPTANCE/ACCEPTANCEが受入を示す。

主担当はCLI監査後に候補対応を確認し、0033現行Seal `52ac744769e34ae6b7998d4bfc40fed48543f3aa9b51192a8dd51175aec23972`、0035現行Seal `137fb216bdd17be1b005ed6ec66c949dceed3b262a93daedc66a512128db5a1a` を公開。非root・非draft・非stale・source一致・候補なし。旧draft REFは不変であり、そのconsumerを自動的に有効化してはいない。

## 実装設計rev6 — 個別レビュー

LunaレビューPASS、監査fatal/error/warning 0。正本reasoning SHA `523e516a0bda74c18b79824804df1e8e220e8a8c0cbc936da8b5e15e23ea6093`、Markdown SHA `900a98f123f89e2ebbcdde6c8edeaa0ecb2015aaf4b93a41f56b8b02eabaf246`。主担当も既存Sealとのsource一致、受入記録、適用境界を確認。

reasoning E1/E2/E5/E8/E9およびD1-D8は基盤v3、キャラv5、現行0032/0033をCauseとする。設計Markdownはその受入済みreasoningに従属する。旧workflowは現行authorityとして復活させない。0035は後続のscope解決決定であり、rev6がその実装済み状態を主張していないため今回の固定rev6に追加Cause不要。なお「設計→ADR」という方向自体は禁止ではなく、今回の0035追加が不要という限定判断である。

公開するのは既存Accepted設計の原文不変snapshot。設計受入は実装、provider実行、route cutover、移行実行、候補受入、pointer/policy activationを認可しない。旧draft consumerの修復とテストadmissionは後続で個別確認する。

## 今回9REFの独立最終readback

Luna最終結果PASS。回復記録の9REF全期待IDが一致、全件非draft、Candidateなし、self/direct/transitive staleなし。全9のraw contentと対応workfileがbyte一致。rootは承認済みADR-0006だけ、他8件は非root。Cause件数は順に0/3/2/9/1/2/3/4/1、事前の個別レビューと一致。CLI監査fatal/error/warning 0。fsck ok、920 Seals/401 REFs。主担当readbackとも一致。これはADRからAccepted設計までの限定結果で、全repo健全化完了ではない。

## 別途観測したリポジトリ全体ADR検査の残件

`npm run adr:check` はexit 1。今回登録した対象のthink監査とstatus projectionは通過したが、変更していないADR-0015/0016/0017に、AcceptedのOWNER_ACCEPTANCE/ACCEPTANCE形式要件と先頭statementのDSLエラー、ADR-0019にProposedのpending OWNER_ACCEPTANCE形式要件と78行目premise宣言のDSLエラーが出た。エラーの発生理由や歴史的受入の有効性を、この検査だけで決めない。これらの本文・statusは変更せず残件として保持する。`git diff --check` は成功。アプリコードを変更していないため、今回の登録を製品動作テストの合格とは報告しない。
