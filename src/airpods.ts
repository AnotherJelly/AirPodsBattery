export type Battery = { percent: number | null; charging: boolean | null };
export type AirPods = {
  id: string;
  model: string;
  rssi: number;
  left: Battery;
  right: Battery;
  case: Battery;
};
export type Advertisement = { id: string; rssi: number; data: number[] };

// Manufacturer payload excludes Apple's two-byte company ID (0x004c).
// Protocol reference: https://github.com/furiousMAC/continuity/blob/master/messages/proximity_pairing.md
// Only the first two generations are enabled until other models are verified.
const models: Record<number, string> = {
  0x0220: 'AirPods 1',
  0x0f20: 'AirPods 2',
};

function battery(nibble: number, charging: boolean): Battery {
  const percent = nibble === 15 ? null : Math.min(nibble * 10, 100);
  return { percent, charging: percent === null ? null : charging };
}

export function decodeAirPods(ad: Advertisement): AirPods | null {
  const d = ad.data;
  if (d.length < 27 || d[0] !== 0x07 || d[1] !== 0x19 || d[2] !== 1) {
    return null;
  }
  const model = models[(d[3] << 8) | d[4]];
  if (!model) {
    return null;
  }
  const primaryLeft = (d[5] & 0x20) !== 0;
  const primary = battery(d[6] & 15, (d[7] & 0x10) !== 0);
  const secondary = battery(d[6] >> 4, (d[7] & 0x20) !== 0);
  return {
    id: ad.id,
    model,
    rssi: ad.rssi,
    left: primaryLeft ? primary : secondary,
    right: primaryLeft ? secondary : primary,
    case: battery(d[7] & 15, (d[7] & 0x40) !== 0),
  };
}
