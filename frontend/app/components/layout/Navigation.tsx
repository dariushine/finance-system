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
} from '@mui/icons-material';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const navItems = [
  { label: 'Dashboard', icon: <HomeIcon />, path: '/' },
  { label: 'Billeteras', icon: <WalletIcon />, path: '/wallets' },
  { label: 'Transacciones', icon: <TransactionIcon />, path: '/transactions' },
  { label: 'Exchanges', icon: <ExchangeIcon />, path: '/exchanges' },
  { label: 'Reportes', icon: <ReportIcon />, path: '/reports' },
  { label: 'Tasas', icon: <RatesIcon />, path: '/rates' },
];

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

  const bottomNavValue = navItems.findIndex(item =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
  );

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
      {/* Barra superior (solo escritorio): tasas del día + flecha para ocultar/mostrar */}
      {!isMobile && (
        <AppBar
          position="fixed"
          sx={{
            zIndex: theme.zIndex.drawer + 1,
            width: `calc(100% - ${sidebarWidth}px)`,
            ml: `${sidebarWidth}px`,
            transition: theme.transitions.create(['width', 'margin-left'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          }}
        >
          <Toolbar>
            {appBarOpen ? (
              <>
                <DashboardIcon sx={{ mr: 1 }} />
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                  Sistema de Finanzas
                </Typography>

                {rates ? (
                  <Box display="flex" gap={1}>
                    <Chip
                      size="small"
                      label={`BCV: ${rates.bcv.toFixed(2)}`}
                      sx={{ color: 'white' }}
                    />
                    <Chip
                      size="small"
                      label={`Paralelo: ${rates.paralelo.toFixed(2)}`}
                      variant="outlined"
                      sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)' }}
                    />
                  </Box>
                ) : (
                  <Chip
                    size="small"
                    label="Tasas —"
                    sx={{ color: 'white' }}
                  />
                )}

                <Tooltip title="Ocultar tasas">
                  <IconButton
                    color="inherit"
                    onClick={() => setAppBarOpen(false)}
                    sx={{ ml: 1 }}
                  >
                    <AppBarCollapseIcon />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <Box display="flex" justifyContent="flex-end" width="100%">
                <Tooltip title="Mostrar tasas">
                  <IconButton color="inherit" onClick={() => setAppBarOpen(true)}>
                    <AppBarExpandIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Toolbar>
        </AppBar>
      )}

      {/* Drawer móvil */}
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
        {renderDrawer(false)}
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
              router.push(navItems[newValue].path);
            }}
          >
            {navItems.map((item) => (
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
          </BottomNavigation>
        </Paper>
      )}

      {/* Spacer for bottom nav on mobile */}
      {isMobile && <Box sx={{ height: 56 }} />}
    </>
  );
}
