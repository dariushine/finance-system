import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';
import AppChrome from './components/AppChrome';
import AuthProvider from './components/AuthProvider';
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
            <AuthProvider />
            <AppChrome>{children}</AppChrome>
            </TimeZoneProvider>
            </NumberFormatProvider>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
