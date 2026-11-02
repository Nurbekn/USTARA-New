import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // This repository is published at https://nurbekn.github.io/USTARA-New/
  base: '/USTARA-New/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
