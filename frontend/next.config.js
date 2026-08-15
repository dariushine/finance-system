/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  async rewrites() {
    const isProduction = process.env.NODE_ENV === 'production';
    const backendUrl = isProduction 
      ? 'http://backend:3002'  // Docker network
      : 'http://localhost:3002'; // Desarrollo local
    
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