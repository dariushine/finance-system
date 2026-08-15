import { Wallet } from './shared/entities/wallet.entity';

console.log('🧪 Probando entidades...');

// Crear una billetera de ejemplo
const wallet = new Wallet();
wallet.name = 'Test Wallet';
wallet.type = 'cash';
wallet.currency = 'USD';
wallet.balance = 1000;

console.log('✅ Entidad Wallet creada:');
console.log('   Nombre:', wallet.name);
console.log('   Tipo:', wallet.type);
console.log('   Moneda:', wallet.currency);
console.log('   Balance:', wallet.balance);

console.log('\n✨ Prueba completada exitosamente');