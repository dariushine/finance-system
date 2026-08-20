'use client';

import { usePathname } from 'next/navigation';
import { Box, Container } from '@mui/material';
import Navigation from './layout/Navigation';
import AddFab from './AddFab';
import RateFetcher from './RateFetcher';

// Envuelve el contenido de la app con todo el "chrome" (navegación, FAB,
// fetcher de tasas) SOLO cuando no estamos en el login (raíz '/'). Así la
// pantalla de login queda limpia, sin sidebar ni llamadas al API sin sesión.
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login (raíz): sin navegación ni chrome de la app.
  if (pathname === '/') {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        {children}
      </Box>
    );
  }

  return (
    <>
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
          <Container maxWidth="xl">{children}</Container>
        </Box>
      </Box>
    </>
  );
}
