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
  Typography,
} from '@mui/material';
import { Close, Add, SwapHoriz } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import TransactionForm from './TransactionForm';
import ExchangeForm from './ExchangeForm';

export default function AddFab() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const router = useRouter();

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleSuccess = () => {
    router.refresh(); // refresca las cards de balance / listas
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
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        {/* Barra superior con título, cerrar y pestañas */}
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pb: 0,
          }}
        >
          <Typography variant="h6">Nueva operación</Typography>
          <IconButton onClick={handleClose} aria-label="Cerrar" size="small">
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
            <TransactionForm onSuccess={handleSuccess} />
          ) : (
            <ExchangeForm onSuccess={handleSuccess} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
