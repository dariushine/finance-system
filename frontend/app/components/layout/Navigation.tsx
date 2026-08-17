'use client';

import { useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Box,
  useMediaQuery,
  useTheme,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Home as HomeIcon,
  AccountBalance as WalletIcon,
  Receipt as TransactionIcon,
  SwapHoriz as ExchangeIcon,
  BarChart as ReportIcon,
  Dashboard as DashboardIcon,
  CalendarMonth as RatesIcon,
  KeyboardDoubleArrowLeft as CollapseLeftIcon,
  KeyboardDoubleArrowRight as CollapseRightIcon,
  KeyboardArrowUp as AppBarCollapseIcon,
  KeyboardArrowDown as AppBarExpandIcon,
  Category as CategoryIcon,
  MoreHoriz as MoreHorizIcon,
  Schedule as ScheduleIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

// Items de primer nivel: van en la barra inferior (mobile) y en el sidebar (desktop)
const primaryItems = [
  { label: 'Dashboard', icon: <HomeIcon />, path: '/' },
  { label: 'Billeteras', icon: <WalletIcon />, path: '/wallets' },
  { label: 'Transacciones', icon: <TransactionIcon />, path: '/transactions' },
  { label: 'Exchanges', icon: <ExchangeIcon />, path: '/exchanges' },
];

// Items secundarios: en el sidebar (desktop) y dentro del menú "Más" (mobile)
const moreItems = [
  { label: 'Pagos Frecuentes', icon: <ScheduleIcon />, path: '/recurring-payments' },
  { label: 'Reportes', icon: <ReportIcon />, path: '/reports' },
  { label: 'Categorías', icon: <CategoryIcon />, path: '/categories' },
  { label: 'Tasas', icon: <RatesIcon />, path: '/rates' },
  // Opciones siempre al final del menú "Más" (sidebar desktop + drawer móvil).
  // NO se agrega al bottom nav móvil (ya está lleno).
  { label: 'Opciones', icon: <SettingsIcon />, path: '/opciones' },
];

// Sidebar de escritorio muestra todo
const navItems = [...primaryItems, ...moreItems];

const EXPANDED_WIDTH = 250;
const COLLAPSED_WIDTH = 68;

interface DailyRate { date: string; bcv: number; paralelo: number }

export default function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Barra lateral colapsable (solo escritorio)
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Barra superior de tasas colapsable (solo escritorio)
  const [appBarOpen, setAppBarOpen] = useState(true);
  const [rates, setRates] = useState<DailyRate | null>(null);

  useEffect(() => {
    fetch('/api/daily-rates/today')
      .then(async (res) => {
        if (!res.ok) throw new Error('No hay tasa');
        const { data } = await res.json();
        setRates(data);
      })
      .catch(() => setRates(null));
  }, []);

  const sidebarWidth = sidebarOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH;
  const drawerTransition = theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  });

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  // Index en la barra inferior. Si la página actual es un item secundario ("Más"),
  // el botón "Más" queda resaltado.
  const primaryIndex = primaryItems.findIndex(item =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
  );
  const inPrimary = primaryIndex >= 0;
  const bottomNavValue = inPrimary ? primaryIndex : primaryItems.length; // primaryItems.length = posición de "Más"

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  const renderList = (collapsed: boolean) => (
    <>
      <List sx={{ flexGrow: 1 }}>
        {navItems.map((item) => (
          collapsed ? (
            <Tooltip key={item.path} title={item.label} placement="right">
              <ListItem
                component={Link}
                href={item.path}
                onClick={() => setMobileOpen(false)}
                sx={{
                  justifyContent: 'center',
                  px: 1,
                  color: isActive(item.path) ? theme.palette.primary.main : 'inherit',
                  bgcolor: isActive(item.path) ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center', color: isActive(item.path) ? theme.palette.primary.main : 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
              </ListItem>
            </Tooltip>
          ) : (
            <ListItem
              key={item.path}
              component={Link}
              href={item.path}
              onClick={() => setMobileOpen(false)}
              sx={{
                color: isActive(item.path) ? theme.palette.primary.main : 'inherit',
                bgcolor: isActive(item.path) ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: isActive(item.path) ? theme.palette.primary.main : 'inherit' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItem>
          )
        ))}
      </List>
    </>
  );

  const renderMobileDrawer = () => (
    <Box sx={{ width: 250, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <DashboardIcon color="primary" />
        <Typography variant="h6" fontWeight="bold">Finanzas</Typography>
      </Box>
      <List sx={{ flexGrow: 1, px: 1 }}>
        {primaryItems.map((item) => (
          <ListItem
            key={`p-${item.path}`}
            component={Link}
            href={item.path}
            onClick={() => setMobileOpen(false)}
            sx={{
              borderRadius: 1,
              color: isActive(item.path) ? theme.palette.primary.main : 'inherit',
              bgcolor: isActive(item.path) ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: isActive(item.path) ? theme.palette.primary.main : 'inherit' }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItem>
        ))}
        <Box sx={{ mt: 2, mb: 0.5, mx: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
            Más
          </Typography>
        </Box>
        {moreItems.map((item) => (
          <ListItem
            key={`m-${item.path}`}
            component={Link}
            href={item.path}
            onClick={() => setMobileOpen(false)}
            sx={{
              borderRadius: 1,
              color: isActive(item.path) ? theme.palette.primary.main : 'inherit',
              bgcolor: isActive(item.path) ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: isActive(item.path) ? theme.palette.primary.main : 'inherit' }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItem>
        ))}
      </List>
    </Box>
  );

  const renderDrawer = (collapsed: boolean) => (
    <Box
      sx={{
        width: collapsed ? COLLAPSED_WIDTH : 250,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Box
        sx={{
          p: collapsed ? 1 : 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 1,
        }}
      >
        <DashboardIcon color="primary" />
        {!collapsed && (
          <Typography variant="h6" fontWeight="bold">Finanzas</Typography>
        )}
      </Box>

      {renderList(collapsed)}

      {/* Flecha para ocultar/mostrar la barra lateral (solo escritorio) */}
      {!isMobile && (
        <Box
          sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'flex-end',
            p: 0.5,
          }}
        >
          <Tooltip title={sidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}>
            <IconButton onClick={() => setSidebarOpen(!sidebarOpen)} size="small">
              {sidebarOpen ? <CollapseLeftIcon /> : <CollapseRightIcon />}
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );

  return (
    <>
      {/* Barra superior (solo escritorio): tasas del día + botón único para ocultar/mostrar.
          El panel se desliza hacia arriba/abajo con animación y, al colapsar, el botón
          se asoma un poco por encima del borde superior de la ventana. */}
      {!isMobile && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: `${sidebarWidth}px`,
            width: `calc(100% - ${sidebarWidth}px)`,
            zIndex: theme.zIndex.drawer + 1,
            transform: appBarOpen ? 'translateY(0)' : 'translateY(-58px)',
            transition: theme.transitions.create('transform', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          }}
        >
          <AppBar position="static" sx={{ borderRadius: 0 }}>
            <Toolbar>
              <DashboardIcon sx={{ mr: 1 }} />
              <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                Sistema de Finanzas
              </Typography>

              {rates ? (
                <Box display="flex" gap={1}>
                  <Chip
                    size="small"
                    label={`BCV: ${rates.bcv.toFixed(2)}`}
                    sx={{ color: 'text.primary', bgcolor: 'action.hover' }}
                  />
                  <Chip
                    size="small"
                    label={`Paralelo: ${rates.paralelo.toFixed(2)}`}
                    variant="outlined"
                    sx={{ color: 'text.primary' }}
                  />
                </Box>
              ) : (
                <Chip size="small" label="Tasas —" sx={{ color: 'text.primary' }} />
              )}
            </Toolbar>
          </AppBar>

          {/* Botón único: pegado al borde inferior del panel, centrado. */}
          <Box sx={{ position: 'relative', height: 0, zIndex: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', position: 'absolute', left: 0, right: 0, bottom: 0 }}>
              <Tooltip title={appBarOpen ? 'Ocultar tasas' : 'Mostrar tasas'}>
                <IconButton
                  onClick={() => setAppBarOpen(!appBarOpen)}
                  aria-label={appBarOpen ? 'Ocultar tasas' : 'Mostrar tasas'}
                  size="small"
                  sx={{
                    transform: 'translateY(50%)',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    width: 24,
                    height: 24,
                    minWidth: 24,
                    p: 0,
                    '& .MuiSvgIcon-root': { fontSize: 16 },
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  {appBarOpen ? <AppBarCollapseIcon /> : <AppBarExpandIcon />}
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Box>
      )}

      {/* Drawer móvil: barra Hamburguesa y el botón "Más" comparten este drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 250 },
        }}
      >
        {renderMobileDrawer()}
      </Drawer>

      {/* Barra lateral escritorio (colapsable) */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            width: sidebarWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: sidebarWidth,
              boxSizing: 'border-box',
              overflowX: 'hidden',
              borderRight: '1px solid',
              borderColor: 'divider',
              transition: drawerTransition,
            },
          }}
          open
        >
          {renderDrawer(!sidebarOpen)}
        </Drawer>
      )}

      {/* Navegación inferior móvil */}
      {isMobile && (
        <Paper
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: theme.zIndex.appBar,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
          elevation={3}
        >
          <BottomNavigation
            showLabels
            value={bottomNavValue}
            onChange={(event, newValue) => {
              // El último item ("Más") abre el drawer en vez de navegar
              if (newValue === primaryItems.length) {
                setMobileOpen(true);
                return;
              }
              router.push(primaryItems[newValue].path);
            }}
          >
            {primaryItems.map((item) => (
              <BottomNavigationAction
                key={item.path}
                label={item.label}
                icon={item.icon}
                sx={{
                  color: isActive(item.path) ? theme.palette.primary.main : 'text.secondary',
                  '& .MuiBottomNavigationAction-label': {
                    fontSize: '0.75rem',
                    mt: 0.5,
                  },
                }}
              />
            ))}
            <BottomNavigationAction
              label="Más"
              icon={<MoreHorizIcon />}
              sx={{
                color: inPrimary ? 'text.secondary' : theme.palette.primary.main,
                '& .MuiBottomNavigationAction-label': {
                  fontSize: '0.75rem',
                  mt: 0.5,
                },
              }}
            />
          </BottomNavigation>
        </Paper>
      )}

      {/* Spacer for bottom nav on mobile */}
      {isMobile && <Box sx={{ height: 56 }} />}
    </>
  );
}
