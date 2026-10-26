#!/bin/sh
set -eu
# Run as root from the extracted release. No proxy or other service changes.
# Rollback plan: keep the stopped old container plus a consistent database snapshot.
# Never start an older version against a newer database schema: restore its snapshot first.
: "${PUBLIC_ORIGIN:?Set the exact existing HTTPS origin, including port 8443}"
IMAGE="${IMAGE:-starlight-checkin:3.0.0}"
test -f server.mjs && test -f lib/migrate.mjs && test -f test/v2.test.mjs
if [ -n "${ENV_FILE:-}" ]; then
  test -r "$ENV_FILE" || { echo 'Configured environment file is unreadable; application left running.'; exit 1; }
fi
old_image=$(docker inspect --format '{{.Config.Image}}' starlight-checkin)
stamp=$(date -u +%Y%m%d-%H%M%S)
old_container="starlight-checkin-before-v2-$stamp"
docker build --pull=false -t "$IMAGE" .
docker run --rm --network none --read-only --cap-drop ALL --pids-limit 64 --memory 192m --cpus 0.75 \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m -v "$PWD:/verify:ro" -w /verify \
  --entrypoint sh "$IMAGE" -c 'node --test --test-concurrency=1 --test-reporter=dot test/*.test.mjs'
# Stop only this application; make the snapshot after the final writes have ended.
docker stop starlight-checkin
if ! docker run --rm --network none --read-only --cap-drop ALL \
  -v /var/lib/starlight:/var/lib/starlight --entrypoint node "$old_image" scripts/backup.mjs; then
  docker start starlight-checkin
  echo 'Snapshot failed; original application restarted without migration.'
  exit 1
fi
docker rename starlight-checkin "$old_container"
export IMAGE PUBLIC_ORIGIN
sh deploy/run-container.sh
attempt=0
until curl --fail --silent http://127.0.0.1:8801/healthz >/dev/null; do
  attempt=$((attempt+1))
  if [ "$attempt" -ge 15 ]; then
    echo "New application not healthy. Keep data and stopped container $old_container for recovery."
    exit 1
  fi
  sleep 2
done
docker exec starlight-checkin node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.DB_PATH,{readOnly:true});if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')process.exit(1);console.log('Database integrity: ok; schema version:',db.prepare('PRAGMA user_version').get().user_version);db.close()"
echo "Application upgraded. Previous container retained as $old_container. Verify the public URL before announcing completion."
