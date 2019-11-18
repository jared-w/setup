import * as core from '@actions/core';
import * as io from '@actions/io';
import {exec} from '@actions/exec';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {fetch} from 'cross-fetch';

async function ex(cmd: string, ...args: string[]): Promise<void> {
  let err = '';
  if (!(await exec(cmd, args, {listeners: {stdout: d => (err += `${d}`)}}))) {
    core.error(err);
    throw new Error(`command ${args.join(' ')} failed`);
  }
}

async function linuxGHC(version: string): Promise<void> {
  if (!fs.existsSync(`/opt/ghc/${version}/bin`)) {
    // This assumes the existance of the GHC PPA `ppa:hvr/ghc`
    await ex('sh', 'sudo', 'apt-get', 'install', '-y', `ghc-${version}`);
  }

  core.addPath(path.join('opt', 'cabal', '3.0', 'bin'));
  core.addPath(path.join('opt', 'ghc', version, 'bin'));

  [
    `::set-output name=store-dir::${os.homedir()}/.cabal/store`,
    '::add-path::/opt/cabal/3.0/bin',
    '::add-path::/opt/ghc/$GHCVER/bin'
  ].forEach(core.info);
}

async function macGHC(version: string): Promise<void> {
  const cabalTar = path.join(os.tmpdir(), 'cabal.tar.xz');
  const cabalBin = path.join('opt', 'cabal', '3.0', 'bin');
  await io.mkdirP(cabalBin);
  fs.writeFileSync(
    cabalTar,
    await fetch(
      'https://downloads.haskell.org/cabal/cabal-install-3.0.0.0/cabal-install-3.0.0.0-x86_64-apple-darwin17.7.0.tar.xz'
    ).then(r => r.blob())
  );
  await ex('sh', 'sudo', 'tar', '-xvJf', cabalTar, '-C', cabalBin);
  fs.unlinkSync(path.join(cabalTar));

  await io.mkdirP(path.join('opt', 'ghc'));
  await exec('sh', ['sudo', 'chown', 'runner:wheel', path.join('opt', 'ghc')]);

  const ghcURL = {
    '7.10.3':
      'https://downloads.haskell.org/ghc/7.10.3/ghc-7.10.3b-x86_64-apple-darwin.tar.xz ',
    '8.0.2':
      'https://downloads.haskell.org/~ghc/8.0.2/ghc-8.0.2-x86_64-apple-darwin.tar.xz ',
    '8.2.2':
      'https://downloads.haskell.org/~ghc/8.2.2/ghc-8.2.2-x86_64-apple-darwin.tar.xz ',
    '8.4.4':
      'https://downloads.haskell.org/~ghc/8.4.4/ghc-8.4.4-x86_64-apple-darwin.tar.xz ',
    '8.6.5':
      'https://downloads.haskell.org/~ghc/8.6.5/ghc-8.6.5-x86_64-apple-darwin.tar.xz '
  }[version as '7.10.3'];

  const ghcFile = path.join(os.tmpdir(), 'ghc.tar.xz');
  fs.writeFileSync(ghcFile, await fetch(ghcURL).then(r => r.blob()));
  if (!fs.existsSync(ghcFile)) {
    throw new Error('ghc download failed');
  }
  const ghcInst = path.join(os.tmpdir(), 'ghcinst');
  const ghcVer = path.join('opt', 'ghc', version);
  io.mkdirP(ghcInst);
  await exec('sh', ['tar', '-xJf', ghcFile, '-C', ghcInst]);
  fs.unlinkSync(ghcFile);
  await ex('sh', path.join(ghcInst, 'configure'), '--prefix', ghcVer);
  await ex('sh', 'make', '-C', ghcInst, 'install');
  fs.rmdirSync(ghcInst);

  core.addPath(cabalBin);
  core.addPath(path.join(ghcVer, 'bin'));

  [
    `::set-output name=store-dir::${os.homedir()}/.cabal/store`,
    '::add-path::/opt/cabal/3.0/bin',
    '::add-path::/opt/ghc/$GHCVER/bin'
  ].forEach(core.info);
}

async function windowsGHC(version: string): Promise<void> {
  const msys = path.join('c', 'tools', 'msys64', 'mingw64', 'lib');
  io.mkdirP(msys);
  await ex('choco', 'install', '-r', '-y', 'cabal', '--version', '3.0.0.0');
  await ex('cabal', 'user-config', 'diff');
  await ex(
    'cabal',
    'user-config',
    'update',
    '-a',
    `"store-dir: ${path.join('C:\\', 'SR')}"`,
    '-v3'
  );

  const versionFixes = {
    '8.0.2': '8.0.2.2',
    '7.10.3': '7.10.3.2',
    '7.8.4': '7.8.4.1',
    '7.6.3': '7.6.3.1'
  };
  const ghcVer =
    version in versionFixes
      ? versionFixes[version as keyof typeof versionFixes]
      : version;

  await ex('choco', 'install', '-r', '-y', 'ghc', `--version=${ghcVer}`);
  const ghcPath = path.join(
    'C:\\',
    'ProgramData',
    'chocolatey',
    'lib',
    'ghc',
    'tools',
    `ghc-${ghcVer}`,
    'bin'
  );
  core.addPath(ghcPath);

  [
    '::set-env name=CABAL_DIR::C:\\CABAL',
    '::set-output name=store-dir::C:\\SR',
    `::add-path::${ghcPath}`
  ].forEach(core.info);
}

type OS = 'Linux' | 'macOS' | 'Windows';
export async function installGHC(version: string): Promise<void> {
  const RUNNEROS = (process.env.RUNNEROS as unknown) as OS;
  switch (RUNNEROS) {
    case 'Linux':
      await linuxGHC(version);
      break;

    case 'macOS':
      await macGHC(version);
      break;

    case 'Windows':
      await windowsGHC(version);
      break;
  }
  await ex('cabal', '--version');
  await ex('ghc', '--version');
  await ex(
    'cabal',
    'user-config',
    'update',
    '-a',
    '"http-transport: plain-http"',
    '-v3'
  );
  await ex('cabal', 'user-config', 'diff');
}
