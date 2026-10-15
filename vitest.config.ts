import { defineConfig } from 'vitest/config';

// Separate from Vite app configuration: tests never load server env files.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
    // Limit concurrent jsdom environments on the Windows dev workstation.
    // A 24-worker run exhausted resources and timed out synchronous UI tests;
    // the same assertions pass with two workers without relaxing timeouts.
    maxWorkers: 2,
  },
});
