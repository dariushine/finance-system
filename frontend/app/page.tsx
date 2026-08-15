import BalanceCard from './components/BalanceCard';
import WalletList from './components/WalletList';
import TransactionForm from './components/TransactionForm';
import ExchangeForm from './components/ExchangeForm';
import { Box, Typography, Grid, Paper } from '@mui/material';

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

      {/* Forms - Stack on mobile, side by side on tablet+ */}
      <Grid container spacing={{ xs: 2, sm: 3, md: 4 }} sx={{ mb: { xs: 3, sm: 4 } }}>
        <Grid item xs={12} md={6}>
          <TransactionForm />
        </Grid>
        <Grid item xs={12} md={6}>
          <ExchangeForm />
        </Grid>
      </Grid>

      {/* Stats Section - Responsive grid */}
      <Paper 
        elevation={0}
        sx={{ 
          p: { xs: 2, sm: 3 },
          mb: { xs: 3, sm: 4 },
          borderRadius: 2,
          backgroundColor: 'background.paper'
        }}
      >
        <Typography 
          variant="h6" 
          sx={{ 
            mb: 2,
            fontSize: { xs: '1.125rem', sm: '1.25rem' },
            fontWeight: 600
          }}
        >
          📊 Estadísticas Rápidas
        </Typography>
        
        <Grid container spacing={{ xs: 1.5, sm: 2 }}>
          <Grid item xs={12} sm={6} md={4}>
            <Box 
              sx={{ 
                p: { xs: 1.5, sm: 2 },
                borderRadius: 1.5,
                backgroundColor: 'primary.50',
                height: '100%'
              }}
            >
              <Typography 
                variant="caption" 
                color="primary.700"
                sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
              >
                Gastos este mes
              </Typography>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontWeight: 700,
                  fontSize: { xs: '1.25rem', sm: '1.5rem' }
                }}
              >
                12,400 VES
              </Typography>
            </Box>
          </Grid>
          
          <Grid item xs={12} sm={6} md={4}>
            <Box 
              sx={{ 
                p: { xs: 1.5, sm: 2 },
                borderRadius: 1.5,
                backgroundColor: 'success.50',
                height: '100%'
              }}
            >
              <Typography 
                variant="caption" 
                color="success.700"
                sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
              >
                Ingresos este mes
              </Typography>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontWeight: 700,
                  fontSize: { xs: '1.25rem', sm: '1.5rem' }
                }}
              >
                500 USD
              </Typography>
            </Box>
          </Grid>
          
          <Grid item xs={12} sm={6} md={4}>
            <Box 
              sx={{ 
                p: { xs: 1.5, sm: 2 },
                borderRadius: 1.5,
                backgroundColor: 'secondary.50',
                height: '100%'
              }}
            >
              <Typography 
                variant="caption" 
                color="secondary.700"
                sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
              >
                Balance neto
              </Typography>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontWeight: 700,
                  fontSize: { xs: '1.25rem', sm: '1.5rem' }
                }}
              >
                2,100 USD
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

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