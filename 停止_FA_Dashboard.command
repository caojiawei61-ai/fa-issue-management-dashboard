#!/bin/zsh
cd "${0:A:h}"
if [[ -f .fa-dashboard.pid ]]; then
  pid="$(<.fa-dashboard.pid)"
  if [[ "$pid" == <-> ]] && kill -0 "$pid" 2>/dev/null; then kill "$pid"; fi
  rm -f .fa-dashboard.pid
fi
