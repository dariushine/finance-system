'use client';

import { useState } from 'react';
import {
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Slide,
} from '@mui/material';
import { Close, Add, SwapHoriz } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { TransitionProps } from '@mui/material/transitions';
import { forwardRef, ReactElement, Ref } from 'react';
import TransactionForm from './TransactionForm';
import ExchangeForm from './ExchangeForm';

// Transición a pantalla completa (como en apps móviles nativas)
const FullScreenTransition = forwardRef(function FullScreenTransition(
  props: TransitionProps & { children: ReactElement },
  ref: Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

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
        fullScreen
        open={open}
        onClose={handleClose}
        TransitionComponent={FullScreenTransition}
      >
        {/* Barra superior con título y pestañas */}
        <AppBar position="static" color="primary">
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              onClick={handleClose}
              aria-label="Cerrar"
            >
              <Close />
            </IconButton>
            <Typography variant="h6" sx={{ ml: 1, flexGrow: 1 }}>
              Nueva operación
            </Typography>
          </Toolbar>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            textColor="inherit"
            indicatorColor="secondary"
            variant="fullWidth"
          >
            <Tab icon={<Add />} iconPosition="start" label="Transacción" />
            <Tab icon={<SwapHoriz />} iconPosition="start" label="Exchange" />
          </Tabs>
        </AppBar>

        <DialogContent sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'background.default' }}>
          {tab === 0 ? (
            <TransactionForm onSuccess={handleSuccess} />
          ) : (
            <ExchangeForm onSuccess={handleSuccess} />
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} color="inherit">
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
