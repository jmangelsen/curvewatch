import {defineConfig} from 'vite';
import path from 'node:path';
export default defineConfig({
  build:{outDir:'../public/scoring',emptyOutDir:false,lib:{entry:path.resolve('src/main.jsx'),formats:['es'],fileName:()=> 'scoring-v1.js'},cssCodeSplit:false,rollupOptions:{output:{assetFileNames:'scoring-v1.[ext]'}}},
  define:{'process.env.NODE_ENV':JSON.stringify('production')}
});
