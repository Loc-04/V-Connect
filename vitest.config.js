import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['shared-backend/tests/**/*.test.js'],
    setupFiles: ['shared-backend/tests/setupTests.js'],
    coverage: {
      enabled: false
    }
  }
})
