#!/bin/bash

echo "🚀 Iniciando servidor de finanzas..."
echo "====================================="

cd backend

# Verificar que el código está compilado
if [ ! -f "dist/simple-server.js" ]; then
    echo "🔨 Compilando código..."
    npx tsc src/simple-server.ts --outDir dist --experimentalDecorators --emitDecoratorMetadata --target ES2021 --module commonjs --esModuleInterop --skipLibCheck
fi

# Verificar que las dependencias están instaladas
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
fi

# Crear directorio de datos
mkdir -p ./data

echo ""
echo "🌐 API: http://localhost:3001"
echo "📊 Health: http://localhost:3001/api/health"
echo "💾 DB: ./data/finance.db"
echo "====================================="
echo "Presiona Ctrl+C para detener"
echo ""

# Ejecutar servidor
node dist/simple-server.js