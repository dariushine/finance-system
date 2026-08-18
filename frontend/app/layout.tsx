import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';
import { Box, Container } from '@mui/material';
import Navigation from './components/layout/Navigation';
import AddFab from './components/AddFab';
import RateFetcher from './components/RateFetcher';
import theme from './theme';
import { NumberFormatProvider } from './lib/NumberFormat';
import { TimeZoneProvider } from './lib/timeZone';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Sistema de Finanzas',
  description: 'Gestión personal de finanzas con múltiples billeteras y monedas',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <NumberFormatProvider>
            <TimeZoneProvider>
            <RateFetcher />
            <AddFab />
            <Box sx={{ display: 'flex', minHeight: '100vh' }}>
              <Navigation />
              <Box
                component="main"
                sx={{
                  flexGrow: 1,
                  minWidth: 0,
                  p: { xs: 2, sm: 3 },
                  pt: { md: 8 }, // clears the fixed AppBar on desktop
                  pb: { xs: 8, md: 3 }, // Extra padding for mobile bottom nav
                }}
              >
                <Container maxWidth="xl">
                  {children}
                </Container>
              </Box>
            </Box>
            </TimeZoneProvider>
            </NumberFormatProvider>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
