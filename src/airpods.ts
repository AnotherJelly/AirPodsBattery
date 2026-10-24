export type Battery = { percent: number | null; charging: boolean | null };
type Device = { id: string; model: string; rssi: number };
export type AirPods = Device &
  (
    | { kind: 'earbuds'; left: Battery; right: Battery; case: Battery }
    | { kind: 'headphones'; headset: Battery }
  );
export type Advertisement = { id: string; rssi: number; data: number[] };

// Protocol facts and model IDs cross-checked against:
// https://github.com/furiousMAC/continuity/blob/master/messages/proximity_pairing.md
// https://github.com/d4rken-org/capod/tree/main/app/src/main/java/eu/darken/capod/pods/core/apple/ble/devices/airpods
// Independent decoder: no connected protocol, keys, background tracking or external BLE library.
const models: Record<number, { name: string; kind: 'earbuds' | 'headphones' }> =
  {
    0x0220: { name: 'AirPods 1', kind: 'earbuds' },
    0x0f20: { name: 'AirPods 2', kind: 'earbuds' },
    0x1320: { name: 'AirPods 3', kind: 'earbuds' },
    0x1920: { name: 'AirPods 4', kind: 'earbuds' },
    0x1b20: { name: 'AirPods 4 ANC', kind: 'earbuds' },
    0x3620: { name: 'AirPods 5', kind: 'earbuds' },
    0x3020: { name: 'AirPods 5 · беспроводной кейс', kind: 'earbuds' },
    0x0e20: { name: 'AirPods Pro', kind: 'earbuds' },
    0x1420: { name: 'AirPods Pro 2 · Lightning', kind: 'earbuds' },
    0x2420: { name: 'AirPods Pro 2 · USB-C', kind: 'earbuds' },
    0x2720: { name: 'AirPods Pro 3', kind: 'earbuds' },
    0x0a20: { name: 'AirPods Max · Lightning', kind: 'headphones' },
    0x1f20: { name: 'AirPods Max · USB-C', kind: 'headphones' },
    0x2d20: { name: 'AirPods Max 2', kind: 'headphones' },
  };

function battery(nibble: number, charging: boolean): Battery {
  const percent = nibble === 15 ? null : Math.min(nibble * 10, 100);
  return { percent, charging: percent === null ? null : charging };
}

// Manufacturer payload excludes Apple's two-byte company ID (0x004c).
// Continuity messages are type/length/value records, not a single fixed packet.
export function proximityFrames(data: number[]): number[][] {
  const frames: number[][] = [];
  for (let offset = 0; offset + 2 <= data.length; ) {
    const length = data[offset + 1];
    const end = offset + 2 + length;
    if (end > data.length) {
      break;
    }
    // Other prefixes contain encrypted/non-status data at the same offsets.
    if (data[offset] === 7 && length === 25 && data[offset + 2] === 1) {
      frames.push(data.slice(offset, end));
    }
    offset = end;
  }
  return frames;
}

export function decodeAirPods(ad: Advertisement): AirPods | null {
  for (const d of proximityFrames(ad.data)) {
    const model = models[(d[3] << 8) | d[4]];
    if (!model) {
      continue;
    }
    const common = { id: ad.id, model: model.name, rssi: ad.rssi };
    if (model.kind === 'headphones') {
      return {
        ...common,
        kind: 'headphones',
        headset: battery(d[6] & 15, (d[7] & 0x10) !== 0),
      };
    }
    const primaryLeft = (d[5] & 0x20) !== 0;
    const primary = battery(d[6] & 15, (d[7] & 0x10) !== 0);
    const secondary = battery(d[6] >> 4, (d[7] & 0x20) !== 0);
    return {
      ...common,
      kind: 'earbuds',
      left: primaryLeft ? primary : secondary,
      right: primaryLeft ? secondary : primary,
      case: battery(d[7] & 15, (d[7] & 0x40) !== 0),
    };
  }
  return null;
}
