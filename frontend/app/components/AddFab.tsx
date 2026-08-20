'use client';

import { useState } from 'react';
import {
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tabs,
  Tab,
  Box,
  Snackbar,
  Alert,
} from '@mui/material';
import { Close, Add, SwapHoriz } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import TransactionForm from './TransactionForm';
import ExchangeForm from './ExchangeForm';
import { notifyDataChanged } from '../lib/dataEvents';

export default function AddFab() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const router = useRouter();
  const theme = useTheme();
  // Pantallas pequeñas: a pantalla completa. Grandes: modal centrado.
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleSuccess = (msg: string) => {
    router.refresh();      // refresca server components
    notifyDataChanged();   // avisa a las páginas client para que recarguen sus datos
    setOpen(false);       // cierra el diálogo tras una operación exitosa
    setSuccessMsg(msg);   // muestra un aviso a nivel de app (sobrevive al cierre)
  };

  return (
    <>
      {/* Botón flotante "+" */}
      <Fab
        color="primary"
        aria-label="Crear transacción o exchange"
        onClick={handleOpen}
        sx={{
          position: 'fixed',
          zIndex: 1200,
          right: { xs: 20, md: 32 },
          bottom: { xs: 84, md: 28 }, // por encima del bottom nav en móvil
        }}
      >
        <Add />
      </Fab>

      <Dialog
        open={open}
        onClose={handleClose}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth={!isMobile}
        PaperProps={{
          sx: isMobile ? {} : { borderRadius: 3, overflow: 'hidden' },
        }}
      >
        {/* Barra superior con título, cerrar y pestañas */}
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pb: 0,
            pr: 1,
            ...(isMobile && { bgcolor: '#1976d2', color: '#fff' }),
          }}
        >
          Nueva operación
          <IconButton
            onClick={handleClose}
            aria-label="Cerrar"
            size="small"
            sx={{ color: isMobile ? '#fff' : undefined }}
          >
            <Close />
          </IconButton>
        </DialogTitle>

        <Box sx={{ px: 3, pt: 1 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="fullWidth"
            textColor="primary"
          >
            <Tab icon={<Add />} iconPosition="start" label="Transacción" />
            <Tab icon={<SwapHoriz />} iconPosition="start" label="Exchange" />
          </Tabs>
        </Box>

        <DialogContent sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'background.default' }}>
          {tab === 0 ? (
            <TransactionForm onSuccess={() => handleSuccess('Transacción creada')} />
          ) : (
            <ExchangeForm onSuccess={() => handleSuccess('Exchange creado')} />
          )}
        </DialogContent>
      </Dialog>

      {/* Aviso de éxito a nivel de app: queda visible aunque el diálogo se cierre */}
      <Snackbar
        open={!!successMsg}
        autoHideDuration={3000}
        onClose={() => setSuccessMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMsg(null)} severity="success" variant="filled" sx={{ width: '100%' }}>
          {successMsg}
        </Alert>
      </Snackbar>
    </>
  );
}
