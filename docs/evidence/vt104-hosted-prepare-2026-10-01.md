# vt104 Hosted CI・RC・準備イメージの確定

所有者の2026-10-01「お願いします。」は、説明したCI用PR作成・RCタグ作成・prepare実行を許可した。この3操作と独立readbackを完了した。mainへのmerge、GitHub Release、実環境配備、DB処分、認証変更、Googleログイン、課金LLM呼出しは行っていない。

- Draft PR: https://github.com/mako10k/kshiai/pull/152
- 試用ソース: 4f3aaa7f0556644b10c51d27f94d57401572cea2
- 569パスaggregate: 6edaf6c726a6154f5534100ce0c4d955a1d9e3ad299847d0ec50a9514d6c2dfa
- CI: https://github.com/mako10k/kshiai/actions/runs/36841509755 。validate/security/backend-image/workerの4検査が、同ソースSHAに対して成功。
- annotated RC: v0.23.0-rc.1 。タグobject50023ca1e88ef0f690a1e7dad98c60670fc1b935とpeeled source4f3aaa7をremoteで一致確認。
- prepare: https://github.com/mako10k/kshiai/actions/runs/36841952094 。phase=prepare、同タグ・同ソース、成功。
- GitHub artifact: v3-trial-image-36841952094、ID11152410082。
- Cloud Build: 9c3b3f04-3b41-4e35-a07f-fc29e58591b2、project kshiai / asia-northeast1、SUCCESS。
- 固定イメージ: asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:43d084a20629758a6157170350fb287678c38790d8e6008c1f1e8b417757f1aa

GitHub artifactの5フィールドを検証し、Cloud Buildの唯一のimage resultと一致、Artifact Registryでも同digestの実在を読み戻した。原artifact JSONはvt104-prepared-image-2026-10-01.json、詳細metadataはvt104-hosted-prepare-2026-10-01.json。workflow・DB/Cloud Run/Worker/queueの配備ステップはskippedだった。gcloudignore/dockerignore/gitignoreにgha-creds-*.jsonの除外があることも確認した。秘密値は記録しない。

この後の文書・PERT・証跡commitは継続用metadataである。RCタグ・prepareの試用ソースは4f3aaa7に固定し、継続ブランチの後続HEADと同一視しない。metadata commitへRCタグを移動しない。

## 次の境界

次は上記imageを使う配備packetの確定。既存docs/evidence/vt104-execution-candidate-2026-10-01.mdはprepare前の観測を含む旧候補で、source/tag/image/runは本記録を参照する。project=kshiai、region=asia-northeast1、service=kshiai-api、job=kshiai-v3-trial-preflight、queue=kshiai-narration、Worker=kshiai-webを維持する。

未取得の実receiptを捏造しない。共有writer/tag/queue/DBを新たにread-only確認し、exact旧unfinished集合と処分方法、finished outboxの完了会計、必要migration集合、numeric secret versions、停止上限1800秒、Google callbackのexact追加値を固定する。snapshotを条件へ戻さず、既存helperとの不整合があれば最初に影響する設計へ戻す。停止・処分・配備・認証変更の具体対象/上限/readbackを示した後、必要な所有者判断を得る。今回のprepare成功だけで実行を許可しない。

ゴールまでの見込時間: 今回の3操作は残0h。vt104のpacket残0.25〜0.75 agent h、ログイン前まで0.5〜2h、初回試用1.25〜4h、親csm0014.25〜11h（暫定・低確度、外部待ちは別）。仮定はpacket0.25〜0.75＋起動/認証0.25〜1.25h、試用は追加0.75〜2h、親は追加3〜7h。実試用価値は0、寄与は品質検証済みソースと準備イメージの一致した固定identity。

vt104は18:15:32+09:00に観測resumeを記録したが、packetを残したpartial phaseなのでタスク全体を完了扱いしない。既存observe-velocityはvt103の単一標本25p/17hであり、person-hourとは異なる。次の測定点はpacketが揃ってvt104を完了できる時点。共有勤務日のstop/endは操作しない。
