import{cp,mkdir,writeFile}from'node:fs/promises';
import{resolve,dirname}from'node:path';
import{fileURLToPath}from'node:url';
const root=dirname(fileURLToPath(import.meta.url));await mkdir(resolve(root,'dist'),{recursive:true});await cp(resolve(root,'src'),resolve(root,'dist'),{recursive:true});console.log('Website built: website/dist');
