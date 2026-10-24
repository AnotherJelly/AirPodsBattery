import {
  scanDiagnostics,
  scanFailureMessage,
  ScanReport,
} from '../src/scanReport';

const report: ScanReport = {
  advertisements: [],
  packetCount: 0,
  applePacketCount: 0,
  formats: [],
};

test('distinguishes Android returning no scan results', () => {
  expect(scanFailureMessage(report)).toContain('ни одного BLE-пакета');
});

test('distinguishes working BLE scan without Apple packets', () => {
  expect(scanFailureMessage({ ...report, packetCount: 12 })).toContain(
    'пакетов Apple нет',
  );
});

test('does not call unrecognized Apple data a missing device', () => {
  expect(
    scanFailureMessage({ ...report, packetCount: 12, applePacketCount: 3 }),
  ).toContain('заряд AirPods не распознан');
});

test('reports counts and protocol metadata without full payloads', () => {
  const diagnostics = scanDiagnostics({
    ...report,
    packetCount: 12,
    applePacketCount: 3,
    formats: ['type=07 bytes=27 prefix=01 model=0220'],
  });
  expect(diagnostics).toContain('BLE-пакеты: 12. Apple: 3.');
  expect(diagnostics).toContain('model=0220');
});
