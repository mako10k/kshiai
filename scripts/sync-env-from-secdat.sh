#!/usr/bin/env bash
# Pull LLM API keys from secdat into gitignored .env (values never echoed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v secdat >/dev/null; then
  echo "secdat not found" >&2
  exit 1
fi

if ! secdat get XAI_API_KEY --stdout >/dev/null 2>&1; then
  echo "secdat domain is locked or XAI_API_KEY missing." >&2
  echo "Run: secdat --dir /home/mako10k unlock" >&2
  echo "Then re-run: npm run sync:secdat" >&2
  exit 1
fi

XAI="$(secdat get XAI_API_KEY --stdout)"
VENICE=""
if secdat get VENICEAI_API_KEY --stdout >/dev/null 2>&1; then
  VENICE="$(secdat get VENICEAI_API_KEY --stdout)"
elif secdat get VENICE_API_KEY --stdout >/dev/null 2>&1; then
  VENICE="$(secdat get VENICE_API_KEY --stdout)"
fi

ENV_FILE="$ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/.env.example" "$ENV_FILE"
fi

set_kv() {
  local key="$1" value="$2" file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    # portable in-place replace without printing value
    python3 - "$key" "$value" "$file" <<'PY'
import re, sys
key, value, path = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
pat = re.compile(rf"^{re.escape(key)}=.*$", re.M)
line = f"{key}={value}"
text = pat.sub(line, text) if pat.search(text) else text.rstrip("\n") + "\n" + line + "\n"
open(path, "w").write(text if text.endswith("\n") else text + "\n")
PY
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

set_kv LLM_PROVIDER xai "$ENV_FILE"
set_kv XAI_API_KEY "$XAI" "$ENV_FILE"
set_kv XAI_BASE_URL "https://api.x.ai/v1" "$ENV_FILE"
set_kv XAI_MODEL "grok-4.5" "$ENV_FILE"
if [[ -n "$VENICE" ]]; then
  set_kv VENICE_API_KEY "$VENICE" "$ENV_FILE"
  set_kv VENICEAI_API_KEY "$VENICE" "$ENV_FILE"
fi

echo "Updated $ENV_FILE from secdat"
echo "  LLM_PROVIDER=xai"
echo "  XAI_API_KEY=*** (len=${#XAI})"
if [[ -n "$VENICE" ]]; then
  echo "  VENICE_API_KEY=*** (len=${#VENICE})"
else
  echo "  VENICE_API_KEY=(not found in secdat)"
fi
