// Starts Vitest with an uppercase drive letter in every path it is given.
//
// On Windows the working directory can be spelled "c:\..." (a VS Code terminal does this). With
// Vitest 5.1 every test file then fails at its first `describe()` with "Cannot read properties of
// undefined (reading 'config')"; the same run from "C:\..." passes. The likely cause is Vitest
// loading its runner twice, under the two spellings of the path, but that was not confirmed.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const upperDrive = (value) => value.replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const vitestPackage = createRequire(import.meta.url).resolve('vitest/package.json');
const vitestCli = upperDrive(path.join(path.dirname(vitestPackage), 'vitest.mjs'));

const result = spawnSync(process.execPath, [vitestCli, ...process.argv.slice(2)], {
  cwd: upperDrive(process.cwd()),
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
