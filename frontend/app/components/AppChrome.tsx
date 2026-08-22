'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Box, Container, CircularProgress } from '@mui/material';
import Navigation from './layout/Navigation';
import AddFab from './AddFab';
import RateFetcher from './RateFetcher';
import { refreshSession } from '../lib/auth';

// Envuelve el contenido de la app con todo el "chrome" (navegación, FAB,
// fetcher de tasas) SOLO cuando no estamos en el login (raíz '/'). Así la
// pantalla de login queda limpia, sin sidebar ni llamadas al API sin sesión.
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Verifica la sesión al entrar a una ruta protegida. Mientras tanto muestra un
  // spinner para no parpadear la UI ni disparar fetchs sin sesión.
  const [checking, setChecking] = useState(false);

  const isLogin = pathname === '/';

  useEffect(() => {
    if (isLogin) {
      // En el login: deja de verificar y vuelve al estado por defecto.
      setChecking(false);
      return;
    }
    let active = true;
    setChecking(true);
    refreshSession().then((ok) => {
      if (!active) return;
      setChecking(false);
      // No hay sesión válida: redirige al login una vez (sin loop).
      if (!ok) {
        router.replace('/');
      }
    });
    return () => { active = false; };
  }, [isLogin, pathname, router]);

  // Login (raíz): sin navegación ni chrome de la app.
  if (isLogin) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        {children}
      </Box>
    );
  }

  // Mientras validamos la sesión, mostramos un spinner en vez de la UI.
  if (checking) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
        <CircularProgress />
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
