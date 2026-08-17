#!/bin/bash
cd /home/user/HOUSE-OF-SEXTILLION
npx vite build >/tmp/build.log 2>&1
if [ $? -ne 0 ]; then echo BUILD_FAIL; tail -20 /tmp/build.log; exit 1; fi
curl -sS -o /dev/null http://localhost:4173/ || { echo "preview down, restarting"; setsid npx vite preview --port 4173 >/tmp/vite-preview.log 2>&1 </dev/null & disown; sleep 4; }
SHOT_WAIT=${SHOT_WAIT:-6000} node scripts/shoot.mjs 2>&1 | tail -3
