// In production nginx routes /api → backend. For `npm run dev` set API_ORIGIN=http://localhost:4000.
export default {
  output: 'standalone',
  async rewrites() {
    return process.env.API_ORIGIN ? [{ source: '/api/:path*', destination: `${process.env.API_ORIGIN}/api/:path*` }] : [];
  },
};
