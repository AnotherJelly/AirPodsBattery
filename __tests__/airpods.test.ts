import { decodeAirPods, proximityFrames } from '../src/airpods';

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

function earbuds(ad = packet()) {
  const result = decodeAirPods(ad);
  if (!result || result.kind !== 'earbuds') {
    throw new Error('Expected earbuds');
  }
  return result;
}

test('decodes primary-left, case and charging flags independently', () => {
  const d = earbuds();
  expect(d.left).toEqual({ percent: 70, charging: true });
  expect(d.right).toEqual({ percent: 80, charging: false });
  expect(d.case).toEqual({ percent: 60, charging: true });
});
test('maps both battery and charging flags when right is primary', () => {
  const d = earbuds(packet(0));
  expect(d.right).toEqual({ percent: 70, charging: true });
  expect(d.left).toEqual({ percent: 80, charging: false });
});
test('unknown battery is absent, not zero or charging', () => {
  const d = earbuds(packet(0x20, 0xff, 0x7f));
  expect(d.left).toEqual({ percent: null, charging: null });
  expect(d.right).toEqual({ percent: null, charging: null });
  expect(d.case).toEqual({ percent: null, charging: null });
});

test('earbud readings remain available when the case is unknown', () => {
  const d = earbuds(packet(0x20, 0x87, 0x7f));
  expect(d.left).toEqual({ percent: 70, charging: true });
  expect(d.right).toEqual({ percent: 80, charging: true });
  expect(d.case).toEqual({ percent: null, charging: null });
});

test('one unknown earbud does not discard the other earbud or case', () => {
  const d = earbuds(packet(0x20, 0xf7, 0x06));
  expect(d.left.percent).toBe(70);
  expect(d.right).toEqual({ percent: null, charging: null });
  expect(d.case.percent).toBe(60);
});
test('zero battery remains zero; values above ten are capped', () => {
  const d = earbuds(packet(0x20, 0xe0, 0x0a));
  expect(d.left.percent).toBe(0);
  expect(d.right.percent).toBe(100);
  expect(d.case.percent).toBe(100);
});
test.each([
  [0x0220, 'AirPods 1'],
  [0x0f20, 'AirPods 2'],
  [0x1320, 'AirPods 3'],
  [0x1920, 'AirPods 4'],
  [0x1b20, 'AirPods 4 ANC'],
  [0x3620, 'AirPods 5'],
  [0x3020, 'AirPods 5 · беспроводной кейс'],
  [0x0e20, 'AirPods Pro'],
  [0x1420, 'AirPods Pro 2 · Lightning'],
  [0x2420, 'AirPods Pro 2 · USB-C'],
  [0x2720, 'AirPods Pro 3'],
])('recognizes dual-earbud model %i (%s)', (model, name) => {
  const d = earbuds(packet(0x20, 0x87, 0x56, Number(model)));
  expect(d.model).toBe(name);
  expect(d.left.percent).toBe(70);
  expect(d.right.percent).toBe(80);
  expect(d.case.percent).toBe(60);
});
test.each([0x0a20, 0x1f20, 0x2d20])(
  'Max model %i has one battery and no fictitious case',
  model => {
    const d = decodeAirPods(packet(0, 0xf8, 0x1f, model));
    expect(d?.kind).toBe('headphones');
    expect(d).toHaveProperty('headset', { percent: 80, charging: true });
    expect(d).not.toHaveProperty('case');
    expect(d).not.toHaveProperty('left');
  },
);
test('rejects unrelated, truncated, encrypted and unknown packets', () => {
  const valid = packet();
  expect(decodeAirPods({ ...valid, data: valid.data.slice(0, 9) })).toBeNull();
  const encrypted = packet();
  encrypted.data[2] = 7;
  expect(decodeAirPods(encrypted)).toBeNull();
  const badLength = packet();
  badLength.data[1] = 17;
  expect(decodeAirPods(badLength)).toBeNull();
  expect(decodeAirPods(packet(0, 0x88, 0x08, 0xffff))).toBeNull();
  expect(
    decodeAirPods({ ...valid, data: [8, ...valid.data.slice(1)] }),
  ).toBeNull();
});
test('finds proximity data after another complete Continuity message', () => {
  const valid = packet();
  const wrapped = { ...valid, data: [0x10, 2, 0, 0, ...valid.data] };
  expect(earbuds(wrapped).model).toBe('AirPods 1');
  expect(proximityFrames(wrapped.data)).toEqual([valid.data]);
});
test('skips encrypted and unknown records before a known status frame', () => {
  const encrypted = packet();
  encrypted.data[2] = 7;
  const unknown = packet(0, 0x88, 0x08, 0xffff);
  const valid = packet();
  expect(
    earbuds({
      ...valid,
      data: [...encrypted.data, ...unknown.data, ...valid.data],
    }).model,
  ).toBe('AirPods 1');
});
test('handles zero-length TLV and malformed tail without looping or fabricating data', () => {
  const valid = packet();
  expect(proximityFrames([0x10, 0, ...valid.data, 7, 25, 1])).toEqual([
    valid.data,
  ]);
  expect(proximityFrames([7, 25, 1])).toEqual([]);
});

test('does not interpret ciphertext from a 07 11 06 case frame as a model or charge', () => {
  const encryptedCase = [7, 17, 6, 0x50, 0xc3, ...Array(14).fill(0)];
  expect(encryptedCase).toHaveLength(19);
  expect(
    decodeAirPods({ id: 'case', rssi: -30, data: encryptedCase }),
  ).toBeNull();
});

test.each([0x0220, 0x0f20])(
  'accepts short legacy plaintext layout for model %i',
  model => {
    const ad = packet(0x20, 0x85, 3, model);
    const result = earbuds({ ...ad, data: ad.data.slice(0, 24) });
    expect(result.left.percent).toBe(50);
    expect(result.right.percent).toBe(80);
    expect(result.case.percent).toBe(30);
  },
);

test('does not accept a short payload for a different layout or pairing mode', () => {
  const modern = packet(0x20, 0x85, 3, 0x2720);
  expect(
    decodeAirPods({ ...modern, data: modern.data.slice(0, 24) }),
  ).toBeNull();
  const pairing = packet();
  pairing.data[2] = 0;
  expect(
    decodeAirPods({ ...pairing, data: pairing.data.slice(0, 24) }),
  ).toBeNull();
});
