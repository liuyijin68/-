#!/bin/bash
# 小淘听写王 - 持久化启动脚本
# 功能：终止 Taro 开发服务器，确保 NestJS 稳定运行在 5000 端口

LOG_FILE="/tmp/app-watcher.log"
PORT=5000
WORKDIR="/workspace/projects"

log() { echo "[$(date '+%H:%M:%S')] $1" >> "$LOG_FILE"; }

log "=== 启动服务 ==="

# 1. 杀掉所有占用 5000 端口的进程（包括 Taro Vite）
fuser -k ${PORT}/tcp 2>/dev/null
sleep 1

# 2. 确保 NestJS 已编译
cd "$WORKDIR/server"
npx nest build > /dev/null 2>&1
log "NestJS 编译完成"

# 3. 启动 NestJS 在 5000 端口
nohup node dist/main.js -p ${PORT} > /tmp/nestjs.log 2>&1 &
NESTJS_PID=$!
log "NestJS 已启动 (PID=$NESTJS_PID, 端口=$PORT)"

# 4. 每 30 秒检查一次，挂了自动重启
while true; do
  sleep 30
  if ! kill -0 $NESTJS_PID 2>/dev/null; then
    log "服务已停止，重启中..."
    fuser -k ${PORT}/tcp 2>/dev/null
    sleep 1
    nohup node dist/main.js -p ${PORT} > /tmp/nestjs.log 2>&1 &
    NESTJS_PID=$!
    log "已重启 (新PID=$NESTJS_PID)"
  fi
done
