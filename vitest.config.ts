import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/test/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.git', 'server/dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Application code only: exclude generated output, type-only modules,
      // config, and the tests themselves.
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.test.{ts,tsx}',
        '**/*.test-helper.ts',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/**',
        'server/dist/**',
        // Type declarations carry no executable logic
        'src/types/**',
        'server/types/**',
        // Generated shadcn/ui primitives, vendored rather than authored
        'src/components/ui/**'
      ],
      // The bar applies to the layers where defects actually live: money maths,
      // data access, validation and state. React screens are covered by
      // interaction tests rather than by chasing a line percentage through
      // ~21k lines of markup, so they are not held to this threshold.
      thresholds: {
        'src/utils/**': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'src/services/**': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'src/hooks/**': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'src/contexts/**': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'server/services/**': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'server/middleware/**': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'server/utils/**': { statements: 90, branches: 85, functions: 90, lines: 90 }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
