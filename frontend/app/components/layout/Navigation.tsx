'use client';

import { useState } from 'react';
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
  Paper
} from '@mui/material';
import {
  Menu as MenuIcon,
  Home as HomeIcon,
  AccountBalance as WalletIcon,
  Receipt as TransactionIcon,
  SwapHoriz as ExchangeIcon,
  BarChart as ReportIcon,
  Dashboard as DashboardIcon
} from '@mui/icons-material';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const navItems = [
  { label: 'Dashboard', icon: <HomeIcon />, path: '/' },
  { label: 'Billeteras', icon: <WalletIcon />, path: '/wallets' },
  { label: 'Transacciones', icon: <TransactionIcon />, path: '/transactions' },
  { label: 'Exchanges', icon: <ExchangeIcon />, path: '/exchanges' },
  { label: 'Reportes', icon: <ReportIcon />, path: '/reports' },
];

export default function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  // Bottom navigation value
  const bottomNavValue = navItems.findIndex(item =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
  );

  const drawer = (
    <Box sx={{ width: 250 }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <DashboardIcon color="primary" />
        <Typography variant="h6" fontWeight="bold">
          Finanzas
        </Typography>
      </Box>
      <List>
        {navItems.map((item) => (
          <ListItem
            key={item.path}
            component={Link}
            href={item.path}
            onClick={() => setMobileOpen(false)}
            sx={{
              color: (item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)) ? theme.palette.primary.main : 'inherit',
              bgcolor: (item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)) ? 'action.selected' : 'transparent',
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: (item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)) ? theme.palette.primary.main : 'inherit' }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <>
      {/* Desktop/Tablet AppBar */}
      {!isMobile && (
        <AppBar position="sticky" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2, display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            
            <DashboardIcon sx={{ mr: 1 }} />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Sistema de Finanzas
            </Typography>
            
            <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1 }}>
              {navItems.map((item) => (
                <IconButton
                  key={item.path}
                  component={Link}
                  href={item.path}
                  color={(item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)) ? 'secondary' : 'inherit'}
                  sx={{
                    borderRadius: 2,
                    px: 2,
                    bgcolor: (item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)) ? 'action.selected' : 'transparent',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {item.icon}
                    <Typography variant="body2">{item.label}</Typography>
                  </Box>
                </IconButton>
              ))}
            </Box>
          </Toolbar>
        </AppBar>
      )}

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile.
        }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 250 },
        }}
      >
        {drawer}
      </Drawer>

      {/* Desktop Sidebar */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              width: 250,
              boxSizing: 'border-box',
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      )}

      {/* Mobile Bottom Navigation */}
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
                  color: (item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)) ? theme.palette.primary.main : 'text.secondary',
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
