"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const exec_1 = require("@actions/exec");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const cross_fetch_1 = require("cross-fetch");
function ex(cmd, ...args) {
    return __awaiter(this, void 0, void 0, function* () {
        let err = '';
        if (!(yield exec_1.exec(cmd, args, { listeners: { stdout: d => (err += `${d}`) } }))) {
            core.error(err);
            throw new Error(`command ${args.join(' ')} failed`);
        }
    });
}
function linuxGHC(version) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!fs.existsSync(`/opt/ghc/${version}/bin`)) {
            // This assumes the existance of the GHC PPA `ppa:hvr/ghc`
            yield ex('sh', 'sudo', 'apt-get', 'install', '-y', `ghc-${version}`);
        }
        core.addPath(path.join('opt', 'cabal', '3.0', 'bin'));
        core.addPath(path.join('opt', 'ghc', version, 'bin'));
        [
            `::set-output name=store-dir::${os.homedir()}/.cabal/store`,
            '::add-path::/opt/cabal/3.0/bin',
            '::add-path::/opt/ghc/$GHCVER/bin'
        ].forEach(core.info);
    });
}
function macGHC(version) {
    return __awaiter(this, void 0, void 0, function* () {
        const cabalTar = path.join(os.tmpdir(), 'cabal.tar.xz');
        const cabalBin = path.join('opt', 'cabal', '3.0', 'bin');
        yield io.mkdirP(cabalBin);
        fs.writeFileSync(cabalTar, yield cross_fetch_1.fetch('https://downloads.haskell.org/cabal/cabal-install-3.0.0.0/cabal-install-3.0.0.0-x86_64-apple-darwin17.7.0.tar.xz').then(r => r.blob()));
        yield ex('sh', 'sudo', 'tar', '-xvJf', cabalTar, '-C', cabalBin);
        fs.unlinkSync(path.join(cabalTar));
        yield io.mkdirP(path.join('opt', 'ghc'));
        yield exec_1.exec('sh', ['sudo', 'chown', 'runner:wheel', path.join('opt', 'ghc')]);
        const ghcURL = {
            '7.10.3': 'https://downloads.haskell.org/ghc/7.10.3/ghc-7.10.3b-x86_64-apple-darwin.tar.xz ',
            '8.0.2': 'https://downloads.haskell.org/~ghc/8.0.2/ghc-8.0.2-x86_64-apple-darwin.tar.xz ',
            '8.2.2': 'https://downloads.haskell.org/~ghc/8.2.2/ghc-8.2.2-x86_64-apple-darwin.tar.xz ',
            '8.4.4': 'https://downloads.haskell.org/~ghc/8.4.4/ghc-8.4.4-x86_64-apple-darwin.tar.xz ',
            '8.6.5': 'https://downloads.haskell.org/~ghc/8.6.5/ghc-8.6.5-x86_64-apple-darwin.tar.xz '
        }[version];
        const ghcFile = path.join(os.tmpdir(), 'ghc.tar.xz');
        fs.writeFileSync(ghcFile, yield cross_fetch_1.fetch(ghcURL).then(r => r.blob()));
        if (!fs.existsSync(ghcFile)) {
            throw new Error('ghc download failed');
        }
        const ghcInst = path.join(os.tmpdir(), 'ghcinst');
        const ghcVer = path.join('opt', 'ghc', version);
        io.mkdirP(ghcInst);
        yield exec_1.exec('sh', ['tar', '-xJf', ghcFile, '-C', ghcInst]);
        fs.unlinkSync(ghcFile);
        yield ex('sh', path.join(ghcInst, 'configure'), '--prefix', ghcVer);
        yield ex('sh', 'make', '-C', ghcInst, 'install');
        fs.rmdirSync(ghcInst);
        core.addPath(cabalBin);
        core.addPath(path.join(ghcVer, 'bin'));
        [
            `::set-output name=store-dir::${os.homedir()}/.cabal/store`,
            '::add-path::/opt/cabal/3.0/bin',
            '::add-path::/opt/ghc/$GHCVER/bin'
        ].forEach(core.info);
    });
}
function windowsGHC(version) {
    return __awaiter(this, void 0, void 0, function* () {
        const msys = path.join('c', 'tools', 'msys64', 'mingw64', 'lib');
        io.mkdirP(msys);
        yield ex('choco', 'install', '-r', '-y', 'cabal', '--version', '3.0.0.0');
        yield ex('cabal', 'user-config', 'diff');
        yield ex('cabal', 'user-config', 'update', '-a', `"store-dir: ${path.join('C:\\', 'SR')}"`, '-v3');
        const versionFixes = {
            '8.0.2': '8.0.2.2',
            '7.10.3': '7.10.3.2',
            '7.8.4': '7.8.4.1',
            '7.6.3': '7.6.3.1'
        };
        const ghcVer = version in versionFixes
            ? versionFixes[version]
            : version;
        yield ex('choco', 'install', '-r', '-y', 'ghc', `--version=${ghcVer}`);
        const ghcPath = path.join('C:\\', 'ProgramData', 'chocolatey', 'lib', 'ghc', 'tools', `ghc-${ghcVer}`, 'bin');
        core.addPath(ghcPath);
        [
            '::set-env name=CABAL_DIR::C:\\CABAL',
            '::set-output name=store-dir::C:\\SR',
            `::add-path::${ghcPath}`
        ].forEach(core.info);
    });
}
function installGHC(version) {
    return __awaiter(this, void 0, void 0, function* () {
        const RUNNEROS = process.env.RUNNEROS;
        switch (RUNNEROS) {
            case 'Linux':
                yield linuxGHC(version);
                break;
            case 'macOS':
                yield macGHC(version);
                break;
            case 'Windows':
                yield windowsGHC(version);
        }
    });
}
exports.installGHC = installGHC;
