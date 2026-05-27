import { defineConfig } from 'vite'

export default defineConfig({
  // Use BASE_URL env var (set in Pages workflow) or '/' locally
  base: process.env.BASE_URL ?? '/',
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
})
