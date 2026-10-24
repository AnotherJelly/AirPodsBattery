import type { Advertisement } from './airpods';

export type ScanReport = {
  advertisements: Advertisement[];
  packetCount: number;
  applePacketCount: number;
  formats: string[];
};

export function scanFailureMessage(report: ScanReport): string {
  if (report.packetCount === 0) {
    return 'Android не вернул ни одного BLE-пакета. Проверь системную геолокацию и разрешения, затем выключи и включи Bluetooth и повтори.';
  }
  if (report.applePacketCount === 0) {
    return 'Bluetooth-поиск работает, но пакетов Apple нет. Положи оба наушника в кейс, запусти проверку и открой крышку рядом с телефоном.';
  }
  return 'Пакеты Apple получены, но заряд AirPods не распознан. Данные поиска ниже помогут уточнить модель и формат.';
}

export function scanDiagnostics(report: ScanReport): string {
  const formats = report.formats.length
    ? `\nФорматы: ${report.formats.join('; ')}`
    : '';
  return `BLE-пакеты: ${report.packetCount}. Apple: ${report.applePacketCount}.${formats}`;
}
