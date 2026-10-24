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
  native.NativeModules.AirPodsScanner = {
    scan: jest.fn(),
    cancel: jest.fn(),
  };
  return native;
});
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

const scanner = NativeModules.AirPodsScanner as {
  scan: jest.Mock<Promise<ScanReport>>;
  cancel: jest.Mock;
};
const report: ScanReport = {
  hasAppleData: true,
  advertisements: [
    {
      id: 'pair',
      rssi: -35,
      data: [7, 25, 1, 15, 32, 32, 0x87, 0x56, ...Array(19).fill(0)],
    },
  ],
};
let tree: ReactTestRenderer.ReactTestRenderer | undefined;
let onStateChange: ((state: AppStateStatus) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(36);
  AppState.currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((event, callback) => {
      if (event === 'change') {
        onStateChange = callback;
      }
      return { remove: jest.fn() };
    });
  jest
    .spyOn(PermissionsAndroid, 'requestMultiple')
    .mockImplementation(async permissions => {
      const result = {} as Awaited<
        ReturnType<typeof PermissionsAndroid.requestMultiple>
      >;
      for (const permission of permissions) {
        result[permission] = PermissionsAndroid.RESULTS.GRANTED;
      }
      return result;
    });
  scanner.scan.mockResolvedValue(report);
});

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    tree?.unmount();
  });
  tree = undefined;
  onStateChange = undefined;
  jest.restoreAllMocks();
});

async function render() {
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
}

function button() {
  return tree!.root.findAllByProps({ accessibilityRole: 'button' })[0];
}

test('does not request permissions or start Bluetooth on launch', async () => {
  await render();
  expect(JSON.stringify(tree!.toJSON())).toContain('Проверить заряд');
  expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled();
  expect(scanner.scan).not.toHaveBeenCalled();
});

test('requests only scanning and displays a completed native reading', async () => {
  await render();
  await ReactTestRenderer.act(async () => {
    await button().props.onPress();
  });
  expect(PermissionsAndroid.requestMultiple).toHaveBeenCalledWith([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ]);
  expect(scanner.scan).toHaveBeenCalledWith(scanModels);
  const screen = JSON.stringify(tree!.toJSON());
  expect(screen).toContain('AirPods 2');
  expect(screen).toContain('≈ 70%');
  expect(screen).toContain('≈ 80%');
  expect(screen).toContain('≈ 60%');
});

test('denied permission prevents Bluetooth access', async () => {
  jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
    [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]:
      PermissionsAndroid.RESULTS.DENIED,
  } as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>);
  await render();
  await ReactTestRenderer.act(async () => {
    await button().props.onPress();
  });
  expect(scanner.scan).not.toHaveBeenCalled();
  expect(JSON.stringify(tree!.toJSON())).toContain(
    'Разреши доступ к устройствам поблизости.',
  );
});

test('backgrounding cancels a scan and discards its late result', async () => {
  let resolve: (value: ScanReport) => void = () => {};
  scanner.scan.mockReturnValue(
    new Promise<ScanReport>(done => {
      resolve = done;
    }),
  );
  await render();
  await ReactTestRenderer.act(async () => {
    button().props.onPress();
    button().props.onPress();
  });
  expect(scanner.scan).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => {
    AppState.currentState = 'background';
    onStateChange?.('background');
  });
  expect(scanner.cancel).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => {
    resolve(report);
  });
  const screen = JSON.stringify(tree!.toJSON());
  expect(screen).toContain('Проверка остановлена.');
  expect(screen).not.toContain('AirPods 2');
});
