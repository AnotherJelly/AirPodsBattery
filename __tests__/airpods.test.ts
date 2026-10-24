import { decodeAirPods } from '../src/airpods';

function packet(status = 0x20, pods = 0x87, flags = 0x56, model = 0x0220) {
  return {
    id: 'test',
    rssi: -45,
    data: [
      7,
      25,
      1,
      model >> 8,
      model & 255,
      status,
      pods,
      flags,
      ...Array(19).fill(0),
    ],
  };
}

test('decodes primary-left, case and charging flags independently', () => {
  const d = decodeAirPods(packet())!;
  expect(d.left).toEqual({ percent: 70, charging: true });
  expect(d.right).toEqual({ percent: 80, charging: false });
  expect(d.case).toEqual({ percent: 60, charging: true });
});

test('maps both battery and charging flags when right is primary', () => {
  const d = decodeAirPods(packet(0))!;
  expect(d.right).toEqual({ percent: 70, charging: true });
  expect(d.left).toEqual({ percent: 80, charging: false });
});

test('unknown battery is absent, not zero or charging', () => {
  const d = decodeAirPods(packet(0x20, 0xff, 0x7f))!;
  expect(d.left).toEqual({ percent: null, charging: null });
  expect(d.right).toEqual({ percent: null, charging: null });
  expect(d.case).toEqual({ percent: null, charging: null });
});

test('zero battery remains zero; values above ten are capped', () => {
  const d = decodeAirPods(packet(0x20, 0xe0, 0x0a))!;
  expect(d.left.percent).toBe(0);
  expect(d.right.percent).toBe(100);
  expect(d.case.percent).toBe(100);
});

test('recognizes second-generation model', () => {
  expect(decodeAirPods(packet(0, 0x88, 0x08, 0x0f20))?.model).toBe('AirPods 2');
});

test('rejects unrelated, truncated, encrypted and unsupported packets', () => {
  const valid = packet();
  expect(decodeAirPods({ ...valid, data: valid.data.slice(0, 9) })).toBeNull();
  expect(
    decodeAirPods({ ...valid, data: [8, ...valid.data.slice(1)] }),
  ).toBeNull();
  const badPrefix = packet();
  badPrefix.data[2] = 7;
  expect(decodeAirPods(badPrefix)).toBeNull();
  const badLength = packet();
  badLength.data[1] = 17;
  expect(decodeAirPods(badLength)).toBeNull();
  expect(decodeAirPods(packet(0, 0x88, 0x08, 0x1920))).toBeNull();
});
