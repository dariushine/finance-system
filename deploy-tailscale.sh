#!/bin/bash

# ===========================================
# Script de despliegue Tailscale
# Uso: ./deploy-tailscale.sh user@vps-ip
# ===========================================

set -e  # Salir en error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables
REMOTE_USER_HOST="$1"
PROJECT_NAME="finance-system"
REMOTE_DIR="/opt/$PROJECT_NAME"
LOCAL_DIR="$(pwd)"

# Validar argumentos
if [ -z "$REMOTE_USER_HOST" ]; then
    echo -e "${RED}❌ Error: Debes especificar user@vps-ip${NC}"
    echo "Uso: $0 user@vps-ip"
    exit 1
fi

echo -e "${GREEN}🚀 Iniciando despliegue Tailscale-only${NC}"
echo -e "VPS: $REMOTE_USER_HOST"
echo -e "Directorio remoto: $REMOTE_DIR"
echo ""

# Paso 1: Validar estructura local
echo -e "${YELLOW}📋 Paso 1: Validando estructura local...${NC}"
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ Error: No encuentro docker-compose.yml${NC}"
    exit 1
fi

if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo -e "${RED}❌ Error: Estructura de proyecto incorrecta${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Estructura local OK${NC}"

# Paso 2: Crear archivo comprimido (excluyendo archivos de desarrollo)
echo -e "${YELLOW}📦 Paso 2: Creando paquete para despliegue...${NC}"
TEMP_DIR="/tmp/finance-deploy-$(date +%s)"
mkdir -p "$TEMP_DIR"

# Copiar solo archivos necesarios (excluir desarrollo, tests, etc.)
echo "Copiando backend..."
mkdir -p "$TEMP_DIR/backend"
cp backend/exchange-server-correct.js "$TEMP_DIR/backend/"
cp backend/package.json "$TEMP_DIR/backend/"
cp backend/Dockerfile "$TEMP_DIR/backend/" 2>/dev/null || true

echo "Copiando frontend..."
cp -r frontend "$TEMP_DIR/"
rm -rf "$TEMP_DIR/frontend/node_modules" 2>/dev/null || true
rm -rf "$TEMP_DIR/frontend/.next" 2>/dev/null || true

echo "Copiando archivos raíz..."
cp docker-compose.yml "$TEMP_DIR/"
cp Dockerfile "$TEMP_DIR/" 2>/dev/null || true
cp README.md "$TEMP_DIR/"
cp DEPLOY-TAILSCALE.md "$TEMP_DIR/"
cp .gitignore "$TEMP_DIR/"

# Crear directorio para base de datos
mkdir -p "$TEMP_DIR/backend/data"

echo -e "${GREEN}✅ Paquete creado en: $TEMP_DIR${NC}"

# Paso 3: Copiar al VPS
echo -e "${YELLOW}📤 Paso 3: Copiando al VPS...${NC}"
echo "Esto puede tomar unos segundos..."

# Crear directorio temporal en VPS
ssh "$REMOTE_USER_HOST" "mkdir -p /tmp/finance-deploy"

# Copiar archivos
rsync -avz --exclude='node_modules' --exclude='.next' --exclude='*.db' \
    "$TEMP_DIR/" "$REMOTE_USER_HOST:/tmp/finance-deploy/"

echo -e "${GREEN}✅ Archivos copiados al VPS${NC}"

# Paso 4: Desplegar en VPS
echo -e "${YELLOW}🚀 Paso 4: Desplegando en VPS...${NC}"

ssh "$REMOTE_USER_HOST" "
    set -e
    
    echo '1. Deteniendo servicios previos...'
    cd /opt 2>/dev/null && docker-compose down 2>/dev/null || true
    
    echo '2. Limpiando directorio anterior...'
    rm -rf '$REMOTE_DIR' 2>/dev/null || true
    
    echo '3. Moviendo nuevos archivos...'
    mkdir -p '$REMOTE_DIR'
    mv /tmp/finance-deploy/* '$REMOTE_DIR/'
    
    echo '4. Configurando permisos...'
    mkdir -p '$REMOTE_DIR/backend/data'
    chmod 777 '$REMOTE_DIR/backend/data'
    
    echo '5. Iniciando servicios con Docker Compose...'
    cd '$REMOTE_DIR'
    docker-compose up -d
    
    echo '6. Esperando que servicios inicien...'
    sleep 5
    
    echo '7. Verificando salud de los servicios...'
    if curl -s http://localhost:3002/api/health > /dev/null; then
        echo '✅ Backend funcionando'
    else
        echo '❌ Backend no responde'
        docker-compose logs backend | tail -20
        exit 1
    fi
"

# Paso 5: Obtener IP de Tailscale
echo -e "${YELLOW}📡 Paso 5: Obteniendo información de Tailscale...${NC}"

TAILSCALE_IP=$(ssh "$REMOTE_USER_HOST" "tailscale ip -4 2>/dev/null | head -1 || echo 'No-Tailscale'")

if [ "$TAILSCALE_IP" = "No-Tailscale" ]; then
    echo -e "${RED}⚠️  Advertencia: Tailscale no configurado en VPS${NC}"
    echo "El sistema estará desplegado pero solo accesible localmente en el VPS"
    ACCESS_IP="localhost"
else
    echo -e "${GREEN}✅ VPS Tailscale IP: $TAILSCALE_IP${NC}"
    ACCESS_IP="$TAILSCALE_IP"
fi

# Paso 6: Limpiar temporal
echo -e "${YELLOW}🧹 Paso 6: Limpiando archivos temporales...${NC}"
rm -rf "$TEMP_DIR"
ssh "$REMOTE_USER_HOST" "rm -rf /tmp/finance-deploy"

# Resumen final
echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}🎉 DESPLIEGUE COMPLETADO${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${YELLOW}📊 URLs de acceso:${NC}"
echo -e "  Dashboard:    ${GREEN}http://$ACCESS_IP:3000${NC}"
echo -e "  API Backend:  ${GREEN}http://$ACCESS_IP:3002/api${NC}"
echo -e "  Health check: ${GREEN}http://$ACCESS_IP:3002/api/health${NC}"
echo ""
echo -e "${YELLOW}🤖 Configurar skill OpenClaw:${NC}"
echo -e "  export FINANCE_API_URL=http://$ACCESS_IP:3002/api"
echo -e "  /finance-app status"
echo ""
echo -e "${YELLOW}🛠️  Comandos útiles:${NC}"
echo -e "  Ver logs:      ${GREEN}ssh $REMOTE_USER_HOST 'cd $REMOTE_DIR && docker-compose logs -f'${NC}"
echo -e "  Detener:       ${GREEN}ssh $REMOTE_USER_HOST 'cd $REMOTE_DIR && docker-compose down'${NC}"
echo -e "  Reiniciar:     ${GREEN}ssh $REMOTE_USER_HOST 'cd $REMOTE_DIR && docker-compose restart'${NC}"
echo -e "  Ver estado:    ${GREEN}ssh $REMOTE_USER_HOST 'cd $REMOTE_DIR && docker-compose ps'${NC}"
echo ""
echo -e "${GREEN}✅ ¡Sistema listo para usar!${NC}"
echo -e "${YELLOW}🔒 Recordatorio: Solo accesible por Tailscale${NC}"

# Verificar que todo funciona
echo -e "\n${YELLOW}🔍 Verificando conexión final...${NC}"
sleep 2

if curl -s --connect-timeout 5 "http://$ACCESS_IP:3002/api/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Conexión exitosa al backend${NC}"
else
    echo -e "${YELLOW}⚠️  No se pudo conectar automáticamente${NC}"
    echo "Puede que necesites:"
    echo "1. Verificar que Tailscale está conectado en ambos extremos"
    echo "2. Verificar firewall en VPS"
    echo "3. Revisar logs: ssh $REMOTE_USER_HOST 'cd $REMOTE_DIR && docker-compose logs'"
fi

echo -e "\n${GREEN}✨ Despliegue completado exitosamente${NC}"