// Recreate local signing files after cloning; never overwrite an existing key.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const keystore = path.join(root, 'android', 'app', 'debug.keystore');
if (!fs.existsSync(keystore)) {
  const executable = process.platform === 'win32' ? 'keytool.exe' : 'keytool';
  const keytool = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', executable)
    : executable;
  const result = spawnSync(
    keytool,
    [
      '-genkeypair',
      '-noprompt',
      '-storetype',
      'JKS',
      '-keystore',
      keystore,
      '-storepass',
      'android',
      '-alias',
      'androiddebugkey',
      '-keypass',
      'android',
      '-dname',
      'CN=Android Debug,O=Android,C=US',
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
    ],
    { stdio: 'inherit' },
  );
  if (result.error || result.status !== 0) {
    console.error('Не удалось создать ключ. Установи JDK и проверь JAVA_HOME.');
    process.exit(1);
  }
}

const credentials = path.join(root, 'credentials.json');
if (!fs.existsSync(credentials)) {
  fs.writeFileSync(
    credentials,
    JSON.stringify(
      {
        android: {
          keystore: {
            keystorePath: 'android/app/debug.keystore',
            keystorePassword: 'android',
            keyAlias: 'androiddebugkey',
            keyPassword: 'android',
          },
        },
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
}
console.log('Локальные файлы подписи готовы. Существующие файлы сохранены.');
