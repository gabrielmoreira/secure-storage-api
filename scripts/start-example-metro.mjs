#!/usr/bin/env zx
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, '..');
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const metroUrl = 'http://127.0.0.1:8081/status';

if (await isMetroAlreadyRunning()) {
  console.log('Metro is already running on port 8081. Reusing the existing dev server.');
  process.exit(0);
}

await runCommand(
  npmCommand,
  ['run', 'start', '-w', 'react-native-secure-storage-example', '--', '--dev-client', '--localhost', '--port', '8081'],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      CI: '1',
    },
  },
);

async function isMetroAlreadyRunning() {
  return new Promise((resolve) => {
    const request = http.get(metroUrl, (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve(response.statusCode === 200 && body.includes('packager-status:running'));
      });
    });

    request.on('error', () => resolve(false));
    request.setTimeout(2000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function runCommand(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}.`));
    });
  });
}

function spawnCommand(command, args, options) {
  if (isWindows && /\.(cmd|bat)$/i.test(command)) {
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command, ...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio,
      windowsHide: true,
      shell: false,
      detached: options.detached ?? false,
    });
  }

  return spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio,
    windowsHide: true,
    shell: false,
    detached: options.detached ?? false,
  });
}
