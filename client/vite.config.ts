import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const clientRoot=fileURLToPath(new URL('.',import.meta.url));
const projectRoot=fileURLToPath(new URL('..',import.meta.url));
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,projectRoot,'');
 const base=env.BASE_PATH ? `${env.BASE_PATH.replace(/\/+$/, '')}/` : '/';
 return {root:clientRoot,base,plugins:[react()],envDir:projectRoot,server:{host:'0.0.0.0',port:4173,strictPort:true,proxy:{[`${base}api`]:`http://127.0.0.1:${env.PORT||6001}`}}};
});
