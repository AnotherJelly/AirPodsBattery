import { PermissionsAndroid, type Permission } from 'react-native';

export function scanPermissions(androidApi: number): Permission[] {
  if (androidApi >= 31) {
    return [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN];
  }
  return [
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ];
}
