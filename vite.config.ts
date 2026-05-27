import { defineConfig } from 'vite'

export default defineConfig({
  // Use BASE_URL env var (set in Pages workflow) or '/' locally
  base: process.env.BASE_URL ?? '/',
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/torusMath.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80 },
    },
  },
})
