import { scanPermissions } from '../src/permissions';

test.each([31, 32, 33, 34, 35, 36])(
  'Android API %i requests scanning only, without connection or location',
  api => {
    expect(scanPermissions(api)).toEqual(['android.permission.BLUETOOTH_SCAN']);
  },
);

test.each([24, 28, 29, 30])(
  'Android API %i retains legacy scan permissions',
  api => {
    expect(scanPermissions(api)).toEqual([
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
    ]);
  },
);
