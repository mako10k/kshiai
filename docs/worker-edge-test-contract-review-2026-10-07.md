# Worker edge局所契約の照合

元のindex.test.ts 3ケースとindex.tsを変更しない。現行docs/release_process.mdのRelease flow5/8のdirect origin保護、docs/cloud_runtime.mdのDecision/API streaming proxy/Deployment artifactsのclient header上書きとfail-closed proxyが根拠。cloud_runtime内の旧価格・resource数値・歴史的配備は今回のauthority範囲外。

独立レビュー /root/llm_boundary_seal_audit は全3ケース確認、INSIDE矛盾なし。証跡docs/evidence/worker-adr-exception-independent-review-2026-10-07.json。1は静的asset転送とruntime marker。2はAPIのmethod/body/query、固定backend originへのpath/query、偽originヘッダーのsecret上書きとforwarded host、SSE content-type/marker。3はsecret未設定時の503/no-store。503は既存binding未設定時の局所HTTP応答契約であり、Cloudflareの全障害応答規則ではない。

fake fetch/in-memory assetを使い実ネットワークを呼ばない。全SSE分割の時間挙動、実Cloudflare配備、backend verifierや公開完走はこのテストの保証外。旧cutoverやprice/resource数値を再承認しない。全251files範囲とunsealed停止を保持。
