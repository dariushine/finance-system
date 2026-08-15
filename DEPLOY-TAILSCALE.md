# 🚀 Despliegue Tailscale-only

Instrucciones para desplegar el sistema de finanzas en un VPS accesible solo por Tailscale.

## 📋 Requisitos

1. **VPS** con Ubuntu/Debian y Docker instalado
2. **Tailscale** configurado en el VPS
3. **Tailscale** en tus dispositivos (móvil, PC)

## 🛠️ Paso 1: Preparar el VPS

```bash
# 1. SSH al VPS
ssh user@tu-vps.com

# 2. Instalar Docker (si no está)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 3. Instalar Docker Compose
sudo apt-get install docker-compose-plugin

# 4. Verificar instalación
docker --version
docker compose version
```

## 📦 Paso 2: Copiar el proyecto

### Opción A: Desde tu máquina local
```bash
# 1. Comprimir el proyecto (excluyendo archivos de desarrollo)
cd /home/node/.openclaw/workspace
tar --exclude='*.db' --exclude='node_modules' --exclude='.next' \
    --exclude='test-*' --exclude='simple-*' \
    -czf finance-system-tailscale.tar.gz finance-system/

# 2. Copiar al VPS
scp finance-system-tailscale.tar.gz user@tu-vps.com:/tmp/

# 3. En el VPS, extraer
ssh user@tu-vps.com
cd /opt
tar -xzf /tmp/finance-system-tailscale.tar.gz
cd finance-system
```

### Opción B: Clonar desde git (si subes a repo)
```bash
# En el VPS
cd /opt
git clone <tu-repo> finance-system
cd finance-system
```

## 🐳 Paso 3: Configurar Docker

```bash
# 1. Crear archivo .env (opcional)
cat > .env << EOF
NODE_ENV=production
BACKEND_PORT=3002
FRONTEND_PORT=3000
EOF

# 2. Crear directorio para la base de datos
mkdir -p backend/data
chmod 777 backend/data
```

## 🚀 Paso 4: Iniciar servicios

```bash
# Iniciar todo con Docker Compose
docker-compose up -d

# Verificar que está corriendo
docker-compose ps

# Ver logs
docker-compose logs -f
```

## 🔒 Paso 5: Configurar firewall (opcional pero recomendado)

```bash
# Solo permitir acceso desde Tailscale (100.64.0.0/10)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 100.64.0.0/10 to any port 3000  # Frontend
sudo ufw allow from 100.64.0.0/10 to any port 3002  # Backend
sudo ufw enable
```

## 📱 Paso 6: Acceder desde tus dispositivos

### 1. **Obtener IP del VPS en Tailscale:**
```bash
# En el VPS
tailscale ip -4
# Devuelve algo como: 100.x.x.x
```

### 2. **URLs de acceso:**
```
Frontend (Dashboard): http://100.x.x.x:3000
Backend (API):        http://100.x.x.x:3002/api/health
```

### 3. **Desde tu móvil:**
1. Abrir app Tailscale → Conectar
2. Abrir navegador → `http://100.x.x.x:3000`
3. ¡Dashboard mobile-first listo!

## 🤖 Paso 7: Configurar Skill OpenClaw

### En tu máquina local (donde corre OpenClaw):
```bash
# Configurar URL de la API
export FINANCE_API_URL=http://<vps-tailscale-ip>:3002/api

# Probar
/finance-app status
/finance-app wallets
```

### Comandos disponibles:
```bash
# Ver estado
/finance-app status

# Ver billeteras  
/finance-app wallets

# Ver balance
/finance-app balance

# Registrar gasto
/finance-app add expense 1200 food "Efectivo VES" "Perro caliente"

# Registrar ingreso
/finance-app add income 500 salary "Cuenta Bancaria USD" "Salario"

# Hacer exchange (con spread)
/finance-app xchg 100 "Crypto Wallet" 60000 "Efectivo VES" 635 "Cambio Binance"

# Hacer exchange (sin spread)
/finance-app xchg 100 "Crypto Wallet" 60000 "Efectivo VES" "Cambio simple"
```

## 🛠️ Comandos útiles de mantenimiento

```bash
# Ver estado de los servicios
docker-compose ps

# Ver logs en tiempo real
docker-compose logs -f backend
docker-compose logs -f frontend

# Detener servicios
docker-compose down

# Reiniciar servicios
docker-compose restart

# Actualizar (después de cambios)
docker-compose build --no-cache
docker-compose up -d

# Backup base de datos
docker cp finance-system_backend_1:/app/data/finance.db ./backup/finance-$(date +%Y%m%d).db

# Restaurar backup
docker cp ./backup/finance.db finance-system_backend_1:/app/data/finance.db
docker-compose restart backend
```

## 🔍 Solución de problemas

### 1. **Puertos ya en uso:**
```bash
# Ver qué usa los puertos
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :3002

# Liberar puertos
sudo kill -9 <PID>
```

### 2. **Docker no inicia:**
```bash
# Ver logs de Docker
sudo journalctl -u docker.service

# Reiniciar Docker
sudo systemctl restart docker
```

### 3. **Frontend no carga:**
```bash
# Verificar que backend responde
curl http://localhost:3002/api/health

# Reconstruir frontend
docker-compose build frontend --no-cache
docker-compose up -d frontend
```

### 4. **Base de datos corrupta:**
```bash
# Detener servicios
docker-compose down

# Backup manual
cp backend/data/finance.db backend/data/finance.db.backup

# Restaurar desde backup anterior
cp backend/data/finance.db.backup backend/data/finance.db

# Reiniciar
docker-compose up -d
```

## 📊 Monitoreo simple

```bash
# Health check manual
curl http://localhost:3002/api/health

# Ver uso de recursos
docker stats

# Ver logs recientes
docker-compose logs --tail=50

# Espacio en disco
df -h
du -sh backend/data/
```

## 🔄 Actualizaciones futuras

### Cuando hagas cambios locales:
```bash
# 1. En tu máquina local
cd /home/node/.openclaw/workspace/finance-system
git add .
git commit -m "Mejoras"
git push

# 2. En el VPS
cd /opt/finance-system
git pull
docker-compose build --no-cache
docker-compose up -d
```

## 🎯 URLs finales

```
Dashboard:      http://<tailscale-ip>:3000
API Backend:    http://<tailscale-ip>:3002/api
Health check:   http://<tailscale-ip>:3002/api/health
```

**¡Sistema listo!** ✅ Solo accesible por tu red Tailscale privada y cifrada.