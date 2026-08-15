import { NestFactory } from '@nestjs/core';
import { AppModule } from '../backend/src/app.module';
import { WalletsService } from '../backend/src/wallets/wallets.service';

async function bootstrap() {
  console.log('🌱 Inicializando base de datos...');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const walletsService = app.get(WalletsService);
  
  try {
    // Crear billeteras iniciales
    console.log('💰 Creando billeteras iniciales...');
    const wallets = await walletsService.seedInitialWallets();
    console.log(`✅ ${wallets.length} billeteras creadas`);
    
    // Mostrar resumen
    const allWallets = await walletsService.findAll();
    console.log('\n📋 Billeteras disponibles:');
    allWallets.forEach(wallet => {
      console.log(`   ${wallet.name} (${wallet.currency}): ${wallet.balance.toFixed(2)}`);
    });
    
    // Calcular balance total
    const balance = await walletsService.calculateTotalBalance();
    console.log(`\n💰 Balance total: $${balance.totalUSD.toFixed(2)} USD`);
    
    console.log('\n✨ Base de datos inicializada exitosamente');
    
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();