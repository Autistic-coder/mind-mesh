import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import console from 'node:console'
import path from 'node:path'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
let backend
try {
  backend = new URL(process.env.MINDMESH_BACKEND_URL ?? '')
} catch {
  throw new Error('Set MINDMESH_BACKEND_URL to the deployed HTTPS Render service origin.')
}
if (
  backend.protocol !== 'https:' ||
  backend.username ||
  backend.password ||
  backend.pathname !== '/' ||
  backend.search ||
  backend.hash
)
  throw new Error(
    'MINDMESH_BACKEND_URL must be an HTTPS origin without credentials, paths, or query parameters.',
  )
const source = path.join(root, 'dist')
if (!existsSync(path.join(source, 'index.html'))) throw new Error('Run npm run build first.')
const output = path.join(root, '.vercel', 'output')
mkdirSync(path.join(output, 'static'), { recursive: true })
cpSync(source, path.join(output, 'static'), { recursive: true })
writeFileSync(
  path.join(output, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: '/api/(.*)',
          dest: `${backend.origin}/api/$1`,
          headers: { 'Cache-Control': 'no-store' },
        },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ) + '\n',
)
console.log('Prepared Vercel static frontend with authenticated API proxy routing.')
