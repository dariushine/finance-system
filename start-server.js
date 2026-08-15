#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Iniciando sistema de finanzas...');
console.log('====================================');

const serverPath = path.join(__dirname, 'backend/dist/robust-server.js');

const server = spawn('node', [serverPath], {
  stdio: 'inherit',
  detached: false,
});

server.on('error', (error) => {
  console.error('❌ Error iniciando servidor:', error.message);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`📴 Servidor terminado con código: ${code}`);
  process.exit(code);
});

// Manejar Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Recibido Ctrl+C. Cerrando servidor...');
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n👋 Recibido señal de terminación. Cerrando servidor...');
  server.kill('SIGTERM');
});

console.log('✨ Servidor iniciado en segundo plano');
console.log('🌐 Accede a: http://localhost:3001');
console.log('📊 Health: http://localhost:3001/api/health');
console.log('\nPresiona Ctrl+C para detener');