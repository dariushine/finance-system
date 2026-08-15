#!/bin/bash

echo "🚀 Iniciando sistema de finanzas en modo desarrollo..."
echo "======================================================"

# Verificar que Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no encontrado. Instala Node.js 20 o superior."
    exit 1
fi

# Verificar que npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm no encontrado."
    exit 1
fi

cd backend

# Instalar dependencias si no existen
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
fi

# Crear directorio de datos si no existe
mkdir -p ./data

# Ejecutar seed de base de datos
echo "🌱 Inicializando base de datos..."
npx ts-node ../scripts/seed-db.ts

# Iniciar servidor en modo desarrollo
echo "🚀 Iniciando servidor backend..."
echo "🌐 API: http://localhost:3001"
echo "📊 Health: http://localhost:3001/api/health"
echo "💾 DB: ./data/finance.db"
echo "======================================================"

npm run start:dev