import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = Object.freeze({
  host: process.env.HOST ?? '127.0.0.1',
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  rootDir,
  dataFile: process.env.BAIWANQUAN_DB ?? path.join(rootDir, 'data', 'baiwanquan.sqlite'),
  staticDir: path.join(rootDir, 'dist'),
  bodyLimit: 1_000_000,
});
