// Runs the API server (with --watch) and the Vite dev server side by side.
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const procs = [];

function run(name, cmd, args, color) {
  const p = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], shell: isWin, env: process.env });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) out.write(tag + line + '\n');
    });
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => {
    console.log(`${tag}exited with code ${code}`);
    shutdown();
  });
  procs.push(p);
}

function shutdown() {
  for (const p of procs) if (!p.killed) p.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('api', 'node', ['--disable-warning=ExperimentalWarning', '--watch', 'server/index.js'], '32');
run('web', 'npx', ['vite'], '36');
