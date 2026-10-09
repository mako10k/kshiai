# テスト領域のアセット・セッション境界の因果契約

全テスト成立・因果整理・Seal指示の範囲で、既存3ファイル5件をそのまま検証する。実Supabase管理API、実利用者の認証、配備、現在のObserveへのmintを行わない。

## 根拠とケース

Accepted ADR0015 Rules1/2/3/7は、既存2fixture identityの再利用、server-owned admin/developerだけのmint、general/test/e2eへの404、ランダムな一回応答passwordと非secret auditを要求する。persistent-e2e-observation.mdのAccess modelはtest領域のアセット共有とgeneralからの非公開を定める。

- test-realm-assets.test.tsの1件: 隔離SQLiteにE2E所有のfield/styleとユーザーを用意し、generalのlist/直接resolveから除外、testとadminにresolveを許す。styleは既存imported V2 generationとして現行activation helperを使う。migrationや公開authoringの受入には使わない。
- services/e2e-session.test.tsの3件: pure predicateのadmin/developer許可と他role拒否、注入callbackへの新password2回・fixture email/kind保持とpasswordを含まないaudit保存、fixture欠落でrotationへ進まないこと。
- routes-e2e-session.test.tsの1件: 最小Hono appと実middlewareでgeneral/test/e2eの同一404、developerの200とobserver identityを確認。adminはfixtureを作るがrouteとしては試していない。admin許可はserviceのpure predicateの証拠のみ。

## 実装と証拠の境界

fixture email定数・generateEphemeralPasswordをsourceとして結ぶが、e2e-observer.ts全体の観測やe2e-supabase-admin.tsのensureAuthUserは検証しない。auth.tsはrequireE2eSessionOperatorだけ。既存account-accessのserver-owned realm/asset判定を使い、field repoとstyle repoのlist/resolveがこの判定を適用する部分だけを検証する。

rotation callbackはfakeである。実Supabase password更新、旧password失効、password grant、/api/me、正式routes.ts登録、request schema、GUI、既存Observeとの排他は未検証。非secret auditも生成した2件についての検査であり、破損したaudit JSON等のreader耐性を含まない。

別のasset-visibility.test.tsの1件は同時診断で合格したが、public/friends/privateの正確な上位規則を今回の点検で確認できなかったため本Sealから除外する。ファイルとassertionは保持し、正式一覧のunsealed停止対象のままとする。

## 検査

4診断ファイル6件をNode22・隔離DBで実行しstrict imported-path型検査を行った。そのうち上記3ファイル5件を全ファイル単位でSealする。コードとテストは変更しない。source bytes、exact parent IDs、以前のHEAD維持、fsckを読み戻す。未Sealが残る正式全体実行は停止する。
