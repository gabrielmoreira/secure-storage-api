#!/usr/bin/env zx
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, '..');
const exampleAppDir = path.join(repoRoot, 'apps', 'react-native-secure-storage-example');
const androidDir = path.join(exampleAppDir, 'android');
const metroLogPath = path.join(os.tmpdir(), 'react-native-secure-storage-example-metro.log');
const appId = 'com.gabrielmoreira.reactnativesecurestorageexample';
const maestroFlowPath = process.env.MAESTRO_FLOW ?? '.maestro/all.yaml';
const shouldStartMetro = !process.argv.includes('--no-metro');
const shouldInstallApp = !process.argv.includes('--no-install');
const shouldWarmLaunch = !process.argv.includes('--no-warm-launch');

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const gradleCommand = isWindows ? 'gradlew.bat' : './gradlew';
const adbCommand = isWindows ? 'adb.exe' : 'adb';
const maestroCommand = isWindows ? 'maestro.exe' : 'maestro';

let metroProcess = null;
let metroProcessClosed = null;
let metroLogStream = null;

try {
  await access(path.join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew'));
} catch {
  throw new Error('Android project not found. Run `mise run example:prebuild` first.');
}

const androidSerial = process.env.ANDROID_SERIAL ?? await detectAndroidSerial();
console.log(`Using Android device: ${androidSerial}`);

try {
  await runCommand(adbCommand, ['-s', androidSerial, 'wait-for-device'], { cwd: repoRoot });
  await normalizeGeneratedAndroidBuildGradle();
  await waitForAndroidSystem(androidSerial);

  if (shouldStartMetro) {
    await freeMetroPortIfNeeded();
    await startMetro();
    await waitForMetro();
  }

  await runCommand(adbCommand, ['-s', androidSerial, 'reverse', 'tcp:8081', 'tcp:8081'], { cwd: repoRoot });

  if (shouldStartMetro) {
    await prewarmBundle();
  }

  if (shouldInstallApp) {
    await runCommand(gradleCommand, ['app:installDebug'], { cwd: androidDir });
  }

  if (shouldWarmLaunch) {
    await warmLaunchApp(androidSerial);
  }

  await runCommand(maestroCommand, ['test', maestroFlowPath], { cwd: exampleAppDir });
} catch (error) {
  await printMetroLogTail();
  throw error;
} finally {
  await cleanup();
}

async function detectAndroidSerial() {
  const lines = await captureCommand(adbCommand, ['devices']);
  const deviceLine = lines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('List of devices') && line.endsWith('\tdevice'));

  if (!deviceLine) {
    throw new Error('No Android device in `device` state was found through adb.');
  }

  return deviceLine.split('\t')[0];
}

async function waitForAndroidSystem(androidSerial) {
  const deadline = Date.now() + 120_000;
  let lastStatus = 'waiting-for-android-services';

  while (Date.now() < deadline) {
    const bootCompleted = (await captureCommand(adbCommand, ['-s', androidSerial, 'shell', 'getprop', 'sys.boot_completed'], {
      cwd: repoRoot,
    }).catch(() => '')).trim() === '1';

    const packageManagerReady = await captureCommand(adbCommand, ['-s', androidSerial, 'shell', 'pm', 'path', 'android'], {
      cwd: repoRoot,
    }).then((output) => output.trim().startsWith('package:')).catch((error) => {
      lastStatus = error instanceof Error ? error.message : String(error);
      return false;
    });

    if (bootCompleted && packageManagerReady) {
      return;
    }

    lastStatus = `bootCompleted=${bootCompleted} packageManagerReady=${packageManagerReady}`;
    await sleep(2000);
  }

  throw new Error(`Timed out waiting for Android system readiness. Last status: ${lastStatus}`);
}

async function normalizeGeneratedAndroidBuildGradle() {
  const appBuildGradlePath = path.join(androidDir, 'app', 'build.gradle');
  const source = await readFile(appBuildGradlePath, 'utf8');
  const nextSource = source
    .replace(/\n\s*debuggableVariants = \[\]\s*/g, '\n')
    .replace(/\n\s*root = file\("\.\.\/\.\."\)\s*/g, '\n');

  if (nextSource !== source) {
    await writeFile(appBuildGradlePath, nextSource, 'utf8');
  }
}

async function freeMetroPortIfNeeded() {
  try {
    if (isWindows) {
      const shell = await detectWindowsPreferredPowerShell();
      if (!shell) {
        return;
      }

      await captureCommand(shell, [
        '-NoProfile',
        '-Command',
        "Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }",
      ]);
      return;
    }

    await captureCommand('bash', ['-lc', 'lsof -ti tcp:8081 | xargs -r kill']);
  } catch {
    // Best effort only.
  }
}

async function startMetro() {
  metroLogStream = createWriteStream(metroLogPath, { flags: 'w' });
  metroProcess = spawnCommand(
    npmCommand,
    ['run', 'start', '-w', 'react-native-secure-storage-example', '--', '--dev-client', '--localhost', '--port', '8081'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    },
  );

  metroProcess.stdout.pipe(metroLogStream);
  metroProcess.stderr.pipe(metroLogStream);
  metroProcessClosed = new Promise((resolve) => {
    metroProcess.on('close', () => resolve(undefined));
  });
}

async function waitForMetro() {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const request = http.get('http://127.0.0.1:8081/status', (response) => {
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

    if (ok) {
      return;
    }

    if (metroProcess?.exitCode !== null) {
      throw new Error(`Metro exited early. See log at ${metroLogPath}.`);
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for Metro. See log at ${metroLogPath}.`);
}
async function prewarmBundle() {
  const bundleUrl = 'http://127.0.0.1:8081/index.bundle?platform=android&dev=true&minify=false';
  const deadline = Date.now() + 90_000;
  let lastStatus = 'no-response';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(bundleUrl);
      if (response.ok) {
        await response.arrayBuffer();
        return;
      }

      lastStatus = `HTTP ${response.status}`;
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error);
    }

    await sleep(2000);
  }

  console.warn(`Metro bundle prewarm did not succeed; continuing anyway. Last status: ${lastStatus}`);
}

async function warmLaunchApp(androidSerial) {
  await runCommand(adbCommand, ['-s', androidSerial, 'shell', 'monkey', '-p', appId, '1'], { cwd: repoRoot });
  await sleep(15000);
  await runCommand(adbCommand, ['-s', androidSerial, 'shell', 'am', 'force-stop', appId], { cwd: repoRoot });
}

async function printMetroLogTail() {
  try {
    const log = await readFile(metroLogPath, 'utf8');
    const tail = log.split(/\r?\n/).slice(-80).join('\n');
    if (tail.trim().length > 0) {
      console.log('\n--- Metro log tail ---\n' + tail + '\n--- End Metro log tail ---\n');
    }
  } catch {
    // Best effort only.
  }
}

async function detectWindowsPreferredPowerShell() {
  for (const command of ['pwsh.exe', 'powershell.exe']) {
    try {
      await captureCommand(command, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']);
      return command;
    } catch {
      // Try the next shell.
    }
  }

  return null;
}

async function captureCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}.\n${stdout}\n${stderr}`));
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

async function cleanup() {
  if (metroProcess && !metroProcess.killed) {
    try {
      if (isWindows && typeof metroProcess.pid === 'number') {
        await captureCommand('taskkill', ['/PID', String(metroProcess.pid), '/T', '/F']);
      } else if (typeof metroProcess.pid === 'number') {
        await captureCommand('bash', ['-lc', `pkill -TERM -P ${metroProcess.pid} || true; kill -TERM ${metroProcess.pid} || true`]);
      }
    } catch {
      // Best effort only.
    }

    try {
      await Promise.race([
        metroProcessClosed ?? Promise.resolve(),
        sleep(5000),
      ]);
    } catch {
      // Best effort only.
    }

    try {
      if (!isWindows && typeof metroProcess.pid === 'number') {
        await captureCommand('bash', ['-lc', `pkill -KILL -P ${metroProcess.pid} || true; kill -KILL ${metroProcess.pid} || true`]);
      }
    } catch {
      // Best effort only.
    }

    metroProcess.stdout?.destroy();
    metroProcess.stderr?.destroy();
  }

  if (metroLogStream) {
    metroLogStream.end();
    await Promise.race([
      new Promise((resolve) => metroLogStream.on('finish', resolve)),
      sleep(2000),
    ]);
    metroLogStream.destroy();
  }

  await sleep(250);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
