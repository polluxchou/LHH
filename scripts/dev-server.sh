#!/usr/bin/env bash
# LHH dev server · 后台常驻管理脚本
# 用 nohup 把 `next dev` 脱离终端常驻，并用 supervisor 循环在崩溃时自动重启。
#
#   scripts/dev-server.sh start     启动（后台常驻，关终端也不掉）
#   scripts/dev-server.sh stop      停止
#   scripts/dev-server.sh restart   重启
#   scripts/dev-server.sh status    查看状态
#   scripts/dev-server.sh logs      跟踪日志（Ctrl-C 退出，不影响服务）

set -euo pipefail

PROJECT_DIR="/Users/fengzhou/Code/LHH"
RUN_DIR="$PROJECT_DIR/.dev-server"
PID_FILE="$RUN_DIR/supervisor.pid"
LOG_FILE="$RUN_DIR/dev.log"
PORT=3000

mkdir -p "$RUN_DIR"

supervisor_alive() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

port_pids() {
  lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true
}

start() {
  if supervisor_alive; then
    echo "已在运行（supervisor pid $(cat "$PID_FILE")） → http://localhost:${PORT}"
    return 0
  fi

  # 清掉可能残留占用端口的旧进程
  local stray; stray="$(port_pids)"
  [[ -n "$stray" ]] && kill $stray 2>/dev/null || true

  cd "$PROJECT_DIR"
  nohup bash -c '
    while true; do
      echo "[$(date "+%F %T")] >>> starting: npm run dev"
      npm run dev
      echo "[$(date "+%F %T")] <<< next dev exited ($?); restarting in 2s"
      sleep 2
    done
  ' >>"$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" >"$PID_FILE"
  disown "$pid" 2>/dev/null || true

  echo "已启动（supervisor pid ${pid}） → http://localhost:${PORT}"
  echo "日志：${LOG_FILE}"
}

stop() {
  if supervisor_alive; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  # supervisor 退出后，被它拉起的 next dev 会变成孤儿，按端口收尾
  local pids; pids="$(port_pids)"
  [[ -n "$pids" ]] && kill $pids 2>/dev/null || true
  sleep 1
  pids="$(port_pids)"
  [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
  echo "已停止"
}

status() {
  if supervisor_alive; then
    echo "supervisor: 运行中 (pid $(cat "$PID_FILE"))"
  else
    echo "supervisor: 未运行"
  fi
  local pids; pids="$(port_pids)"
  if [[ -n "$pids" ]]; then
    echo "端口 ${PORT}: 监听中 (pid ${pids//$'\n'/ }) → http://localhost:${PORT}"
  else
    echo "端口 ${PORT}: 空闲"
  fi
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; start ;;
  status)  status ;;
  logs)    touch "$LOG_FILE"; tail -n 40 -f "$LOG_FILE" ;;
  *) echo "用法: $0 {start|stop|restart|status|logs}"; exit 1 ;;
esac
