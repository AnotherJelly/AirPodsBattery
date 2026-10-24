import type { Advertisement } from './airpods';

export type ScanReport = {
  advertisements: Advertisement[];
  hasAppleData: boolean;
};
