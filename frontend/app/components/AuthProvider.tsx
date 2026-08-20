'use client';

import { useEffect } from 'react';
import { installFetchInterceptor } from '../lib/fetchInterceptor';

// Instala el interceptor global de fetch UNA vez en el cliente. Sin child nodes:
// su único trabajo es activar el auto-refresh del access token en toda la app.
export default function AuthProvider() {
  useEffect(() => {
    installFetchInterceptor();
  }, []);

  return null;
}
