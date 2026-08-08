import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  preview: {
    port: 8080,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  server: {
    origin: "http://0.0.0.0:8080",
    strictPort: true,
    host: true,
    port: 8080,
    hmr: {
      overlay: false
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  plugins: [
    react(),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    outDir: 'dist/client',    // output directory
    sourcemap: false,   // disable source maps for production to save memory
    minify: 'esbuild',  // use esbuild for faster, less memory-intensive minification
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // External vendor packages
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor';
            }
            if (id.includes('@radix-ui')) {
              return 'ui';
            }
            // Other large vendors
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            return 'vendor';
          }
          
          // Force services into their own chunk to resolve dynamic/static import warnings
          if (id.includes('/services/sqlite.svc') || id.includes('/services/email.svc')) {
            return 'services';
          }
          
          // Group utility functions that use services
          if (id.includes('/utils/currencyFormatting') || 
              id.includes('/utils/dateFormatting') || 
              id.includes('/utils/emailConfigUtils') || 
              id.includes('/utils/invoiceNumbering')) {
            return 'utils';
          }
          
          // Group all settings components together
          if (id.includes('/components/settings/')) {
            return 'settings';
          }
          
          // Group invoice components
          if (id.includes('/components/invoices/')) {
            return 'invoices';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    // Minimal optimization to save memory
    treeShaking: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  },
});
