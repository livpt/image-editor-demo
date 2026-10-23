#!/usr/bin/env bash
# Verification harness control for the image editor (Vite dev server).
#
#   control.sh up        start an isolated dev server and wait until it is usable
#   control.sh doctor    read-only: is the instance we started worth driving?
#   control.sh evidence  print (and create) the evidence directory for this run
#   control.sh down      stop only the server this script started; keep evidence
#
# Environment:
#   IMAGE_EDITOR_VERIFY_PORT  port for the verification server (default 5199, never 5173)
#   IMAGE_EDITOR_VERIFY_DIR   state root (default /tmp/image-editor-verify)
#   RUN_ID                    evidence sub-directory name (default: UTC timestamp)
set -euo pipefail

PORT="${IMAGE_EDITOR_VERIFY_PORT:-5199}"
STATE_ROOT="${IMAGE_EDITOR_VERIFY_DIR:-/tmp/image-editor-verify}"
STATE_DIR="$STATE_ROOT/$PORT"
PID_FILE="$STATE_DIR/vite.pid"
LOG_FILE="$STATE_DIR/vite.log"
URL="http://127.0.0.1:$PORT/"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
TITLE="Simple Web Image Editor"

run_id() {
  if [ -n "${RUN_ID:-}" ]; then
    printf '%s' "$RUN_ID"
  elif [ -f "$STATE_DIR/run-id" ]; then
    cat "$STATE_DIR/run-id"
  else
    date -u +%Y%m%dT%H%M%SZ
  fi
}

pid_alive() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

port_owner() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true
}

serves_title() {
  curl -sf --max-time 2 "$URL" 2>/dev/null | grep -q "<title>$TITLE</title>"
}

cmd_up() {
  if [ "$PORT" = "5173" ]; then
    echo "refusing to use port 5173: that is the developer's own 'npm run dev' port" >&2
    exit 2
  fi
  mkdir -p "$STATE_DIR"
  if pid_alive; then
    echo "already up (pid $(cat "$PID_FILE")) at $URL"
    exit 0
  fi
  owner="$(port_owner)"
  if [ -n "$owner" ]; then
    echo "port $PORT is owned by pid $owner, which this script did not start; pick another IMAGE_EDITOR_VERIFY_PORT" >&2
    exit 2
  fi
  id="$(run_id)"
  printf '%s\n' "$id" > "$STATE_DIR/run-id"
  # Detach into its own session so the server outlives the shell (and the
  # agent tool call) that started it. `detached: true` is a setsid on macOS/Linux.
  node -e '
    const { spawn } = require("node:child_process");
    const fs = require("node:fs");
    const [root, port, log, pidFile] = process.argv.slice(1);
    const out = fs.openSync(log, "a");
    const child = spawn(
      process.execPath,
      [root + "/node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", port, "--strictPort"],
      { cwd: root, detached: true, stdio: ["ignore", out, out] }
    );
    fs.writeFileSync(pidFile, String(child.pid) + "\n");
    child.unref();
  ' "$REPO_ROOT" "$PORT" "$LOG_FILE" "$PID_FILE"
  for _ in $(seq 1 40); do
    if serves_title; then
      echo "up (pid $(cat "$PID_FILE")) at $URL"
      echo "log: $LOG_FILE"
      exit 0
    fi
    if ! pid_alive; then
      echo "vite exited during startup; see $LOG_FILE" >&2
      cat "$LOG_FILE" >&2
      rm -f "$PID_FILE"
      exit 1
    fi
    sleep 0.25
  done
  echo "timed out waiting for $URL to serve '$TITLE'; see $LOG_FILE" >&2
  exit 1
}

cmd_doctor() {
  status=0
  if pid_alive; then
    echo "process:  ok (pid $(cat "$PID_FILE"))"
  else
    echo "process:  MISSING (no live pid in $PID_FILE)"; status=1
  fi
  owner="$(port_owner)"
  if [ -n "$owner" ] && [ -f "$PID_FILE" ] && [ "$owner" = "$(cat "$PID_FILE")" ]; then
    echo "port:     ok ($PORT owned by our pid)"
  elif [ -n "$owner" ]; then
    echo "port:     FOREIGN ($PORT owned by pid $owner, not ours)"; status=1
  else
    echo "port:     CLOSED (nothing listens on $PORT)"; status=1
  fi
  if serves_title; then
    echo "page:     ok ($URL serves '$TITLE')"
  else
    echo "page:     FAIL ($URL does not serve '$TITLE')"; status=1
  fi
  echo "revision: $(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown) ($(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ') dirty files)"
  echo "evidence: $STATE_ROOT/evidence/$(run_id)"
  echo "url:      $URL"
  exit $status
}

cmd_evidence() {
  dir="$STATE_ROOT/evidence/$(run_id)"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

cmd_down() {
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.1
      done
      kill -9 "$pid" 2>/dev/null || true
      echo "stopped pid $pid"
    else
      echo "pid $pid was not running"
    fi
    rm -f "$PID_FILE" "$STATE_DIR/run-id"
  else
    echo "nothing to stop (no $PID_FILE)"
  fi
  echo "evidence kept under $STATE_ROOT/evidence/"
}

case "${1:-}" in
  up) cmd_up ;;
  doctor) cmd_doctor ;;
  evidence) cmd_evidence ;;
  down) cmd_down ;;
  *) sed -n '2,13p' "$0" >&2; exit 2 ;;
esac
