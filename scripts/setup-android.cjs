// Create a private release key once. Existing private signing keys are preserved.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const credentialsPath = path.join(root, 'credentials.json');
const keystorePath = 'android/app/release.keystore';
const keystore = path.join(root, keystorePath);
const temporaryCredentials = credentialsPath + '.tmp';

function setup() {
  const credentials = fs.existsSync(credentialsPath)
    ? JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
    : {};
  const existing = credentials.android?.keystore;
  if (existing) {
    const configuredKey = path.resolve(root, existing.keystorePath);
    const oldTemplateKey = path.join(root, 'android', 'app', 'debug.keystore');
    if (configuredKey !== oldTemplateKey) {
      if (!fs.existsSync(configuredKey)) {
        throw new Error(
          'Файл ключа отсутствует. Восстанови его из резервной копии; новый ключ автоматически не создаётся.',
        );
      }
      console.log('Существующий ключ подписи сохранён.');
      return;
    }
  }
  if (fs.existsSync(keystore) || fs.existsSync(temporaryCredentials)) {
    throw new Error(
      'Найдены файлы предыдущей настройки. Восстанови соответствующий credentials.json; существующий ключ не перезаписывается.',
    );
  }

  const password = crypto.randomBytes(32).toString('base64url');
  const executable = process.platform === 'win32' ? 'keytool.exe' : 'keytool';
  const keytool = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', executable)
    : executable;
  const nextCredentials = {
    ...credentials,
    android: {
      ...credentials.android,
      keystore: {
        keystorePath,
        keystorePassword: password,
        keyAlias: 'airpods-battery',
        keyPassword: password,
      },
    },
  };
  // Save recovery information before generating the key, without printing secrets.
  fs.writeFileSync(
    temporaryCredentials,
    JSON.stringify(nextCredentials, null, 2) + '\n',
    {
      flag: 'wx',
      mode: 0o600,
    },
  );
  const result = spawnSync(
    keytool,
    [
      '-genkeypair',
      '-noprompt',
      '-storetype',
      'PKCS12',
      '-keystore',
      keystore,
      '-storepass:env',
      'AIRPODS_SIGNING_PASSWORD',
      '-alias',
      'airpods-battery',
      '-keypass:env',
      'AIRPODS_SIGNING_PASSWORD',
      '-dname',
      'CN=AirPods Battery',
      '-keyalg',
      'RSA',
      '-keysize',
      '3072',
      '-sigalg',
      'SHA256withRSA',
      '-validity',
      '10000',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, AIRPODS_SIGNING_PASSWORD: password },
    },
  );
  if (result.error || result.status !== 0) {
    if (!fs.existsSync(keystore)) fs.unlinkSync(temporaryCredentials);
    throw new Error(
      'Не удалось создать ключ. Проверь JDK и JAVA_HOME. Если ключ успел создаться, настройки сохранены в credentials.json.tmp.',
    );
  }
  fs.renameSync(temporaryCredentials, credentialsPath);
  console.log(
    'Создан секретный ключ подписи. Сохрани release.keystore и credentials.json отдельно от Git.',
  );
}

try {
  setup();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
