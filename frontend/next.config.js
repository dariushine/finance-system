/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  async rewrites() {
    const isProduction = process.env.NODE_ENV === 'production';
    const backendUrl = process.env.API_UPSTREAM
      ? process.env.API_UPSTREAM                    // override explícito (dev en Docker)
      : isProduction
        ? 'http://backend:3002'                       // Docker network (prod)
        : 'http://localhost:3002';                    // Desarrollo local

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  
  transpilePackages: ['@mui/material', '@mui/icons-material'],
};

module.exports = nextConfig;