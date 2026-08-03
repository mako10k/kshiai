# Cloudflare Tunnel — kshiai.mk10.org

kaix.mk10.org と同じ構成で、ローカル Vite（`127.0.0.1:5188`）を Cloudflare Tunnel 経由で公開する。

## 前提

- `cloudflared` インストール済み
- `mk10.org` が Cloudflare DNS 管理下
- アプリ: backend `3088` / frontend `5188`（API は Vite proxy `/api`）

## セットアップ（初回）

```bash
cloudflared login
cloudflared tunnel create kshiai
# credentials: ~/.cloudflared/<TUNNEL_ID>.json

# config.yml の tunnel / credentials-file を更新
# 例: tunnel: <TUNNEL_ID>
#     credentials-file: /home/mako10k/.cloudflared/<TUNNEL_ID>.json

cloudflared tunnel route dns kshiai kshiai.mk10.org
```

## systemd

```bash
sudo cp /home/mako10k/kshiai/infra/cloudflare/cloudflared-kshiai.service \
  /etc/systemd/system/cloudflared-kshiai.service
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-kshiai
systemctl status cloudflared-kshiai
```

## アプリ常駐（PM2 — kaix と同系）

フロントは **本番ビルド + `vite preview`**（Cloudflare / iOS 向け。dev サーバは不安定になりやすい）。

```bash
cd /home/mako10k/kshiai
npm run build --workspace=@kshiai/shared
npm run build --workspace=@kshiai/frontend
pm2 start ecosystem.config.cjs
# または再起動
pm2 restart kshiai-backend kshiai-frontend
pm2 save
# 既に pm2-mako10k.service が enable なら reboot 後も復帰
```

## 確認

```bash
curl -I http://127.0.0.1:5188/
curl -I https://kshiai.mk10.org/
cloudflared tunnel info kshiai
```

## SSE / ターン語りストリーミング

バトル進行 `POST /api/battles/:id/advance/stream` は **Server-Sent Events** です。

| 要点 | 内容 |
|------|------|
| Content-Type | オリジンは必ず `text/event-stream`。**これがないと cloudflared が応答をバッファ**し、完了までクライアントに届かない |
| 経路 | Browser → Cloudflare edge → named tunnel `kshiai` → Vite preview `:5188` → proxy `/api` → backend `:3088` |
| keep-alive | 12s ごとに SSE コメント (`: ka …`) を送る。CF **Proxy Write Timeout 30s** で無通信切断されるのを防ぐ |
| タイムアウト | Proxy Read 系はおおよそ **100–125s**。1ターンがそれを超えると 524 になりうる |
| 非対応 | `trycloudflare.com` の quick tunnel は SSE をバッファする。本構成は **named tunnel** なので対象外 |

確認例（ログイン Cookie 付き）:

```bash
curl -N -H "Accept: text/event-stream" -H "Cookie: …" \
  -X POST https://kshiai.mk10.org/api/battles/<id>/advance/stream
# 途中で `data: {"type":"phase"...}` や `: ka` が見えればライブ到達
```

## トラブル

| 症状 | 確認 |
|------|------|
| 530 / 1033 | tunnel connector 未接続、`systemctl status cloudflared-kshiai` |
| ログインできない | `CORS_ORIGIN` に `https://kshiai.mk10.org`、`COOKIE_SECURE=true` |
| Host not allowed | `vite.config.ts` の `allowedHosts` |
| SSE が最後にまとめて出る | 応答 `Content-Type` が `text/event-stream` か、途中プロキシがバッファしていないか |
| 524 mid-stream | 無通信 30s 超（keep-alive 失敗）または 1 リクエストが ~125s 超 |
