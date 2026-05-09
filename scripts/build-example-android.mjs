#!/usr/bin/env zx
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, '..');
const exampleAppDir = path.join(repoRoot, 'apps', 'react-native-secure-storage-example');
const androidDir = path.join(exampleAppDir, 'android');
const isWindows = process.platform === 'win32';
const gradleCommand = isWindows ? 'gradlew.bat' : './gradlew';

try {
  await access(path.join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew'));
} catch {
  throw new Error('Android project not found. Run `mise run example:prebuild` first.');
}

const scriptPath = fileURLToPath(import.meta.url);
const scriptFileName = path.basename(scriptPath);
const gradleTasks = process.argv.slice(2).filter((value) => {
  if (value === scriptPath) {
    return false;
  }

  const normalizedValue = value.replace(/\\/g, '/');
  return !normalizedValue.endsWith(`/scripts/${scriptFileName}`) && !normalizedValue.endsWith(`/${scriptFileName}`) && normalizedValue !== scriptFileName;
});

await normalizeGeneratedAndroidBuildGradle();
await runCommand(gradleCommand, gradleTasks.length > 0 ? gradleTasks : ['app:assembleDebug'], { cwd: androidDir });

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
