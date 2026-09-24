// Static dev server for the game (no build step needed).
//   bun tools/serve.ts [--port=8080] [--root=.]
import { join, normalize } from 'node:path';

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const root = normalize(join(import.meta.dir, '..', arg('root', '.')));
const port = Number(arg('port', process.env.PORT ?? '8080'));

export function startServer(p = port, dir = root) {
  return Bun.serve({
    port: p,
    async fetch(req) {
      const url = new URL(req.url);
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(dir, path));
      if (!file.startsWith(dir)) return new Response('forbidden', { status: 403 });
      const f = Bun.file(file);
      if (!(await f.exists())) return new Response('not found', { status: 404 });
      return new Response(f, { headers: { 'Cache-Control': 'no-store' } });
    },
  });
}

if (import.meta.main) {
  const s = startServer();
  console.log(`Moonlit Acres dev server: http://localhost:${s.port}/`);
}
