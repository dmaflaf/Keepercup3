/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [{ source: '/', destination: '/index.html' }]
  },
  experimental: {
    // El reglamento vive fuera de /public: se incluye en la función que lo entrega tras verificar la cédula
    outputFileTracingIncludes: { '/api/reglamento': ['./privado/**'] },
  },
}

module.exports = nextConfig
