#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  osascript -e 'display alert "需要 Node.js" message "请先安装 Node.js 22.13 或更新版本，再重新运行此启动器。"'
  exit 1
fi
if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||(major===22&&minor>=13)?0:1)' >/dev/null 2>&1; then
  osascript -e 'display alert "Node.js版本过旧" message "请安装Node.js 22.13或更新版本后重新运行。"'
  exit 1
fi
if ! node --input-type=module -e 'import {builtinModels} from "@earendil-works/pi-ai/providers/all"; builtinModels().getProviders()' >/dev/null 2>&1; then
  if [[ -f package-lock.json ]]; then
    npm ci --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1
  else
    npm install --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1
  fi
  if ! node --input-type=module -e 'import {builtinModels} from "@earendil-works/pi-ai/providers/all"; builtinModels().getProviders()' >/dev/null 2>&1; then
    osascript -e 'display alert "模型连接器安装失败" message "网页将以本地规则模式打开。请确认能够访问 npm 后重新运行启动器；页面会显示明确的依赖缺失提示。"'
  fi
fi
base_port="${FA_AI_PORT:-8779}"
port=""
is_current_service(){
  local check_port="$1" health home
  health=$(curl -fsS --max-time 1 "http://127.0.0.1:${check_port}/api/health" 2>/dev/null || true)
  home=$(curl -fsS --max-time 1 "http://127.0.0.1:${check_port}/" 2>/dev/null || true)
  print -r -- "$health" | node -e 'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{try{const h=JSON.parse(s);process.exit(h.appVersion==="0.0.0"&&h.buildId==="baseline-r0"&&h.packageRoot===process.argv[1]?0:1)}catch{process.exit(1)}})' "$PWD" && print -r -- "$home" | grep -q '<title>FA Issue Dashboard v0.0.0</title>'
}
for offset in 0 1 2 3 4; do
  candidate=$((base_port + offset))
  if is_current_service "$candidate"; then
    port="$candidate"
    break
  fi
  if ! lsof -nP -iTCP:"${candidate}" -sTCP:LISTEN >/dev/null 2>&1; then
    port="$candidate"
    FA_AI_PORT="$port" nohup node server.mjs > fa-dashboard.log 2>&1 &
    echo $! > .fa-dashboard.pid
    for i in {1..25}; do
      is_current_service "$port" && break
      sleep .2
    done
    break
  fi
done
if [[ -z "$port" ]] || ! is_current_service "$port"; then
  osascript -e 'display alert "FA Issue Dashboard v0.0.0 could not start" message "Ports 8779-8783 are occupied or the current release did not pass its version check. Stop the older dashboard and try again."'
  exit 1
fi
if [[ "${FA_DASHBOARD_NO_OPEN:-0}" == "1" ]]; then
  print -r -- "http://127.0.0.1:${port}/"
else
  open "http://127.0.0.1:${port}/"
fi
