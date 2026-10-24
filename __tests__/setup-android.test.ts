/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(
  path.join(__dirname, '../scripts/setup-android.cjs'),
  'utf8',
);

function fixture(platform: 'win32' | 'linux' = 'linux', keytoolFails = false) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const root = platform === 'win32' ? 'C:\\project' : '/project';
  const files = new Map<string, string>();
  const credentials = paths.join(root, 'credentials.json');
  const key = paths.join(root, 'android', 'app', 'release.keystore');
  const output: string[] = [];
  const randomBytes = jest.fn(() => Buffer.alloc(32, 0x5a));
  const spawnSync = jest.fn(
    (_command: string, args: string[], _options: unknown) => {
      if (keytoolFails) return { status: 1 };
      files.set(args[args.indexOf('-keystore') + 1], 'generated-test-key');
      return { status: 0 };
    },
  );
  const modules: Record<string, unknown> = {
    'node:path': paths,
    'node:crypto': { randomBytes },
    'node:child_process': { spawnSync },
    'node:fs': {
      existsSync: (file: string) => files.has(file),
      readFileSync: (file: string) => {
        if (!files.has(file)) throw new Error('Missing virtual file: ' + file);
        return files.get(file);
      },
      writeFileSync: (
        file: string,
        contents: string,
        options: { flag: string },
      ) => {
        if (options.flag === 'wx' && files.has(file))
          throw new Error('File already exists');
        files.set(file, contents);
      },
      renameSync: (from: string, to: string) => {
        files.set(to, files.get(from)!);
        files.delete(from);
      },
      unlinkSync: (file: string) => files.delete(file),
    },
  };
  function run() {
    const processMock = { platform, env: {}, exitCode: 0 };
    new vm.Script(source, { filename: 'setup-android.cjs' }).runInNewContext({
      __dirname: paths.join(root, 'scripts'),
      process: processMock,
      require: (name: string) => {
        if (!(name in modules))
          throw new Error('Unexpected dependency: ' + name);
        return modules[name];
      },
      console: {
        log: (message: string) => output.push(message),
        error: (message: string) => output.push(message),
      },
    });
    return processMock.exitCode;
  }
  return { files, credentials, key, run, output, spawnSync, randomBytes };
}

test.each(['win32', 'linux'] as const)(
  'creates private signing settings on %s without external tools',
  platform => {
    const f = fixture(platform);
    expect(f.run()).toBe(0);
    expect(f.randomBytes).toHaveBeenCalledWith(32);
    expect(f.files.has(f.key)).toBe(true);
    const signing = JSON.parse(f.files.get(f.credentials)!).android.keystore;
    expect(signing.keystorePath).toBe('android/app/release.keystore');
    expect(signing.keystorePassword).toHaveLength(43);
    const args = f.spawnSync.mock.calls[0][1];
    expect(args).toEqual(
      expect.arrayContaining(['PKCS12', 'RSA', '3072', 'SHA256withRSA']),
    );
  },
);

test('repeated setup preserves both key and password', () => {
  const f = fixture();
  expect(f.run()).toBe(0);
  const key = f.files.get(f.key);
  const credentials = f.files.get(f.credentials);
  expect(f.run()).toBe(0);
  expect(f.files.get(f.key)).toBe(key);
  expect(f.files.get(f.credentials)).toBe(credentials);
  expect(f.spawnSync).toHaveBeenCalledTimes(1);
});

test('migrates the old public template key configuration', () => {
  const f = fixture();
  f.files.set(
    f.credentials,
    JSON.stringify({
      android: { keystore: { keystorePath: 'android/app/debug.keystore' } },
    }),
  );
  expect(f.run()).toBe(0);
  expect(
    JSON.parse(f.files.get(f.credentials)!).android.keystore.keystorePath,
  ).toBe('android/app/release.keystore');
});

test('missing private key is not silently replaced with a new identity', () => {
  const f = fixture();
  const original = JSON.stringify({
    android: { keystore: { keystorePath: 'android/app/release.keystore' } },
  });
  f.files.set(f.credentials, original);
  expect(f.run()).toBe(1);
  expect(f.spawnSync).not.toHaveBeenCalled();
  expect(f.files.get(f.credentials)).toBe(original);
});

test('an orphaned key is never overwritten', () => {
  const f = fixture();
  f.files.set(f.key, 'existing-key');
  expect(f.run()).toBe(1);
  expect(f.files.get(f.key)).toBe('existing-key');
  expect(f.spawnSync).not.toHaveBeenCalled();
});

test('keytool failure preserves old settings and removes incomplete recovery data', () => {
  const f = fixture('linux', true);
  const original = JSON.stringify({
    android: { keystore: { keystorePath: 'android/app/debug.keystore' } },
  });
  f.files.set(f.credentials, original);
  expect(f.run()).toBe(1);
  expect(f.files.get(f.credentials)).toBe(original);
  expect(f.files.has(f.credentials + '.tmp')).toBe(false);
});

test('password is passed through the child environment and is never printed', () => {
  const f = fixture();
  expect(f.run()).toBe(0);
  const password = JSON.parse(f.files.get(f.credentials)!).android.keystore
    .keystorePassword;
  const [, args, options] = f.spawnSync.mock.calls[0];
  expect(args).not.toContain(password);
  expect(options).toMatchObject({
    env: { AIRPODS_SIGNING_PASSWORD: password },
  });
  expect(f.output.join('\n')).not.toContain(password);
});
