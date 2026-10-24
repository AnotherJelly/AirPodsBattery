import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  AppState,
  NativeModules,
  PermissionsAndroid,
  Platform,
  type AppStateStatus,
} from 'react-native';
import App from '../App';
import { scanModels } from '../src/airpods';
import type { ScanReport } from '../src/scanReport';

jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  native.NativeModules.AirPodsScanner = { scan: jest.fn(), cancel: jest.fn() };
  return native;
});
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

type Grants = Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>;
const scanner = NativeModules.AirPodsScanner as {
  scan: jest.Mock<Promise<ScanReport>>;
  cancel: jest.Mock;
};
const originalAppState = AppState.currentState;
const removeListener = jest.fn();
let tree: ReactTestRenderer.ReactTestRenderer | undefined;
let onStateChange: ((state: AppStateStatus) => void) | undefined;

function makeReport({
  pods = 0x87,
  flags = 0x56,
  model = 0x0f20,
} = {}): ScanReport {
  return {
    hasAppleData: true,
    advertisements: [
      {
        id: 'pair',
        rssi: -35,
        data: [
          7,
          25,
          1,
          Math.floor(model / 256),
          model % 256,
          32,
          pods,
          flags,
          ...Array(19).fill(0),
        ],
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  scanner.scan.mockReset().mockResolvedValue(makeReport());
  scanner.cancel.mockReset();
  removeListener.mockReset();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(36);
  AppState.currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((event, callback) => {
      if (event === 'change') onStateChange = callback;
      return { remove: removeListener };
    });
  jest
    .spyOn(PermissionsAndroid, 'requestMultiple')
    .mockImplementation(async permissions => {
      const result = {} as Grants;
      for (const permission of permissions)
        result[permission] = PermissionsAndroid.RESULTS.GRANTED;
      return result;
    });
});

afterEach(async () => {
  try {
    await ReactTestRenderer.act(async () => {
      tree?.unmount();
    });
  } finally {
    tree = undefined;
    onStateChange = undefined;
    AppState.currentState = originalAppState;
    jest.restoreAllMocks();
  }
});

async function render() {
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
}
function button() {
  return tree!.root.findAllByProps({ accessibilityRole: 'button' })[0];
}
async function press() {
  await ReactTestRenderer.act(async () => {
    await button().props.onPress();
  });
}
async function changeState(state: AppStateStatus) {
  await ReactTestRenderer.act(async () => {
    AppState.currentState = state;
    if (!onStateChange) throw new Error('AppState listener is missing');
    onStateChange(state);
  });
}
function rows(label: string) {
  return tree!.root.findAll(
    node =>
      node.props.accessible === true &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith(label + ':'),
  );
}
function expectBattery(label: string, percent: number | null) {
  const row = rows(label)[0];
  expect(row).toBeDefined();
  const text = percent === null ? '—' : '≈ ' + percent + '%';
  expect(
    row.findAll(node => node.props.children === text).length,
  ).toBeGreaterThan(0);
  if (percent === null)
    expect(row.props.accessibilityLabel).toBe(label + ': нет данных');
}
function expectMessage(text: string) {
  expect(tree!.root.findAllByProps({ children: text }).length).toBeGreaterThan(
    0,
  );
}

test('launch is idle and does not request permissions', async () => {
  await render();
  expect(button().props.disabled).toBe(false);
  expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled();
  expect(scanner.scan).not.toHaveBeenCalled();
});

test('requests scanning only and displays all received batteries', async () => {
  await render();
  await press();
  expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledWith([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ]);
  expect(scanner.scan).toHaveBeenCalledWith(scanModels);
  expectBattery('Левый наушник', 70);
  expectBattery('Правый наушник', 80);
  expectBattery('Кейс', 60);
  expect(button().props.disabled).toBe(false);
});

test('deadline result with unknown case still displays both earbuds', async () => {
  scanner.scan.mockResolvedValue(makeReport({ flags: 0x7f }));
  await render();
  await press();
  expectBattery('Левый наушник', 70);
  expectBattery('Правый наушник', 80);
  expectBattery('Кейс', null);
});

test('a single available earbud is enough to display a partial result', async () => {
  scanner.scan.mockResolvedValue(makeReport({ pods: 0xf7, flags: 0x0f }));
  await render();
  await press();
  expectBattery('Левый наушник', 70);
  expectBattery('Правый наушник', null);
  expectBattery('Кейс', null);
});

test('zero percent is shown as zero, not as unavailable', async () => {
  scanner.scan.mockResolvedValue(makeReport({ pods: 0, flags: 0 }));
  await render();
  await press();
  expectBattery('Левый наушник', 0);
  expectBattery('Правый наушник', 0);
  expectBattery('Кейс', 0);
});

test('Max displays one battery without a fictitious case', async () => {
  scanner.scan.mockResolvedValue(
    makeReport({ model: 0x0a20, pods: 0xf8, flags: 0x1f }),
  );
  await render();
  await press();
  expectBattery('Наушники', 80);
  expect(rows('Левый наушник')).toHaveLength(0);
  expect(rows('Правый наушник')).toHaveLength(0);
  expect(rows('Кейс')).toHaveLength(0);
});

test('a fresh scan does not reuse old case charge', async () => {
  await render();
  await press();
  expectBattery('Кейс', 60);
  scanner.scan.mockResolvedValue(makeReport({ flags: 0x0f }));
  await press();
  expectBattery('Кейс', null);
});

test.each([
  [false, 'AirPods не найдены. Открой кейс рядом с телефоном.'],
  [true, 'Заряд недоступен. Открой кейс рядом с телефоном и повтори.'],
])(
  'handles an empty result with Apple data = %s',
  async (hasAppleData, message) => {
    scanner.scan.mockResolvedValue({ hasAppleData, advertisements: [] });
    await render();
    await press();
    expectMessage(message);
    expectBattery('Кейс', null);
    expect(button().props.disabled).toBe(false);
  },
);

test.each([
  PermissionsAndroid.RESULTS.DENIED,
  PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
])('permission result %s prevents Bluetooth access', async result => {
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
    [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: result,
  } as Grants);
  await render();
  await press();
  expect(scanner.scan).not.toHaveBeenCalled();
  expectMessage('Разреши доступ к устройствам поблизости.');
});

test.each([
  ['BLUETOOTH_OFF', 'Включи Bluetooth.'],
  ['PERMISSION', 'Разреши доступ к устройствам поблизости.'],
  ['LOCATION_OFF', 'Включи местоположение для Bluetooth-поиска.'],
  ['CANCELLED', 'Проверка остановлена.'],
])(
  'native error %s releases the button and allows retry',
  async (code, message) => {
    scanner.scan.mockRejectedValueOnce({ code });
    await render();
    await press();
    expectMessage(message);
    expect(button().props.disabled).toBe(false);
    await press();
    expectBattery('Левый наушник', 70);
  },
);

test('repeated button presses cannot start simultaneous scans', async () => {
  const scan = deferred<ScanReport>();
  scanner.scan.mockReturnValue(scan.promise);
  await render();
  let check!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    check = button().props.onPress();
    await button().props.onPress();
  });
  expect(scanner.scan).toHaveBeenCalledTimes(1);
  expect(button().props.disabled).toBe(true);
  await ReactTestRenderer.act(async () => {
    scan.resolve(makeReport());
    await check;
  });
  expect(button().props.disabled).toBe(false);
});

test('backgrounding cancels and discards a late native result', async () => {
  const scan = deferred<ScanReport>();
  scanner.scan.mockReturnValue(scan.promise);
  await render();
  let check!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    check = button().props.onPress();
  });
  await changeState('background');
  expect(scanner.cancel).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => {
    scan.resolve(makeReport());
    await check;
  });
  expectMessage('Проверка остановлена.');
  expectBattery('Левый наушник', null);
});

test('late cancellation of an old scan cannot overwrite a newer result', async () => {
  const old = deferred<ScanReport>();
  scanner.scan.mockReturnValueOnce(old.promise);
  await render();
  let check!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    check = button().props.onPress();
  });
  await changeState('background');
  await changeState('active');
  await press();
  await ReactTestRenderer.act(async () => {
    old.reject({ code: 'CANCELLED' });
    await check;
  });
  expectBattery('Кейс', 60);
  expect(button().props.disabled).toBe(false);
});

test('temporarily leaving for the permission dialog does not cancel the request', async () => {
  const permission = deferred<Grants>();
  jest
    .spyOn(PermissionsAndroid, 'requestMultiple')
    .mockReturnValueOnce(permission.promise);
  await render();
  let check!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    check = button().props.onPress();
  });
  await changeState('background');
  expect(scanner.cancel).not.toHaveBeenCalled();
  await changeState('active');
  await ReactTestRenderer.act(async () => {
    permission.resolve({
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: 'granted',
    } as Grants);
    await check;
  });
  expect(scanner.scan).toHaveBeenCalledTimes(1);
});

test('granting permission while still backgrounded must not start Bluetooth', async () => {
  const permission = deferred<Grants>();
  jest
    .spyOn(PermissionsAndroid, 'requestMultiple')
    .mockReturnValueOnce(permission.promise);
  await render();
  let check!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    check = button().props.onPress();
  });
  await changeState('background');
  await ReactTestRenderer.act(async () => {
    permission.resolve({
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: 'granted',
    } as Grants);
    await check;
  });
  expect(scanner.scan).not.toHaveBeenCalled();
  expect(button().props.disabled).toBe(false);
});

test('unmount removes the listener, cancels scanning and ignores completion', async () => {
  const scan = deferred<ScanReport>();
  scanner.scan.mockReturnValue(scan.promise);
  await render();
  let check!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    check = button().props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    tree!.unmount();
    tree = undefined;
  });
  expect(removeListener).toHaveBeenCalledTimes(1);
  expect(scanner.cancel).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => {
    scan.resolve(makeReport());
    await check;
  });
});

test('a permission result arriving after unmount cannot start Bluetooth', async () => {
  const permission = deferred<Grants>();
  jest
    .spyOn(PermissionsAndroid, 'requestMultiple')
    .mockReturnValueOnce(permission.promise);
  await render();
  let check!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    check = button().props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    tree!.unmount();
    tree = undefined;
  });
  await ReactTestRenderer.act(async () => {
    permission.resolve({
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: 'granted',
    } as Grants);
    await check;
  });
  expect(scanner.scan).not.toHaveBeenCalled();
  expect(removeListener).toHaveBeenCalledTimes(1);
});
