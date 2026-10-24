import { scanPermissions } from '../src/permissions';

test.each([31, 34, 36])(
  'Android API %i requests nearby devices without location',
  api => {
    expect(scanPermissions(api)).toEqual([
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
    ]);
  },
);

test('Android 11 retains the permissions required by the old scan API', () => {
  expect(scanPermissions(30)).toEqual([
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
  ]);
});
