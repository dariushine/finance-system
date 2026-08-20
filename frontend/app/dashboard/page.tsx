import BalanceCard from '../components/BalanceCard';
import WalletList from '../components/WalletList';
import RecentTransactions from '../components/RecentTransactions';
import { Box, Typography } from '@mui/material';

export default function Home() {
  return (
    <Box sx={{ width: '100%' }}>
      {/* Hero Section - Mobile First */}
      <Box sx={{ mb: { xs: 3, sm: 4 } }}>
        <Typography 
          variant="h5" 
          component="h1" 
          sx={{ 
            fontWeight: 700,
            mb: 1,
            fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' }
          }}
        >
          📱 Gestor de Finanzas
        </Typography>
        <Typography 
          variant="body2" 
          color="text.secondary"
          sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
        >
          Gestiona tus billeteras, transacciones y exchanges desde cualquier dispositivo
        </Typography>
      </Box>

      {/* Balance Card - Full width on mobile */}
      <Box sx={{ mb: { xs: 3, sm: 4 } }}>
        <BalanceCard />
      </Box>

      {/* Wallets - Responsive grid */}
      <Box sx={{ mb: { xs: 3, sm: 4 } }}>
        <WalletList />
      </Box>

      {/* Últimas transacciones */}
      <Box sx={{ mb: { xs: 3, sm: 4 } }}>
        <RecentTransactions />
      </Box>

      {/* Features Footer - Mobile optimized */}
      <Box 
        sx={{ 
          textAlign: 'center',
          mt: { xs: 4, sm: 5 },
          px: { xs: 1, sm: 2 }
        }}
      >
        <Typography 
          variant="body2" 
          color="text.secondary"
          sx={{ 
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            lineHeight: 1.6
          }}
        >
          📱 <strong>App móvil-friendly</strong> | 💰 <strong>Billeteras múltiples</strong> | 
          💱 <strong>Exchanges automáticos</strong> | 🎯 <strong>Mobile-first design</strong>
        </Typography>
        
        <Typography 
          variant="caption" 
          color="text.disabled"
          sx={{ 
            display: 'block',
            mt: 1,
            fontSize: { xs: '0.625rem', sm: '0.75rem' }
          }}
        >
          Optimizado para pantallas desde 320px (iPhone SE) hasta 4K
        </Typography>
      </Box>
    </Box>
  );
}