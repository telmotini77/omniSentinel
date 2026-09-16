import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve(process.cwd(), 'public');
const destination = resolve(process.cwd(), 'dist', 'public');

if (!existsSync(source)) {
  throw new Error(`Static asset directory not found: ${source}`);
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
console.log(`Copied static assets to ${destination}`);
