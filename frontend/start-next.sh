#!/bin/bash
# Arranca el frontend next en producción con el proxy apuntando al backend local (3002)
cd /home/node/.openclaw/workspace/finance-system/frontend
export API_UPSTREAM=http://localhost:3002
exec node node_modules/next/dist/bin/next start -p 3000 > /tmp/next.log 2>&1
