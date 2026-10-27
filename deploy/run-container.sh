#!/bin/sh
set -eu
# Intentionally does not replace an existing container or alter the proxy.
# Update/rollback should preserve /var/lib/starlight and use a new image tag.
: "${PUBLIC_ORIGIN:?Set the final HTTPS origin without a trailing slash}"
IMAGE="${IMAGE:-starlight-checkin:3.4.1}"
set --
if [ -n "${ENV_FILE:-}" ]; then
  test -f "$ENV_FILE" || { echo 'Configured environment file is missing.'; exit 1; }
  set -- --env-file "$ENV_FILE"
fi
docker inspect starlight-checkin >/dev/null 2>&1 && { echo 'Container already exists; use the documented update workflow.'; exit 1; }
install -d -m 700 -o 1000 -g 1000 /var/lib/starlight
docker run -d --name starlight-checkin --restart unless-stopped \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 64 --memory 192m --cpus 0.75 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -p 127.0.0.1:8801:3210 \
  -v /var/lib/starlight:/var/lib/starlight \
  "$@" \
  -e PUBLIC_ORIGIN="$PUBLIC_ORIGIN" -e BASE_PATH=/starlight/ -e TRUST_PROXY=1 \
  "$IMAGE"
