// HubSpot only exposes booking volume snapshots (12m/6m/3m/2m/1m) — there's no
// monthly history series. The volume chart in the new company detail expects a
// 12-point trend, so we synthesize one by reverse-deriving period buckets from
// the snapshots and smearing each bucket evenly across the months it covers.

export interface VolumeSnapshots {
  volume12m?: number;
  volume6m?: number;
  volume3m?: number;
  volume2m?: number;
  volume1m?: number;
}

// Returns 12 monthly values, oldest first, newest last.
// Each value represents booking volume in that single month.
export function synthesizeMonthlyTrend(s: VolumeSnapshots): number[] {
  const v12 = s.volume12m ?? 0;
  const v6 = s.volume6m ?? 0;
  const v3 = s.volume3m ?? 0;
  const v2 = s.volume2m ?? 0;
  const v1 = s.volume1m ?? 0;

  // Buckets: months 1, 2, 3, 4-6, 7-12 (working backward from "now")
  // Each volume_Nm field is the cumulative volume over the past N months.
  const month1 = Math.max(0, v1);
  const month2 = Math.max(0, v2 - v1);
  const month3 = Math.max(0, v3 - v2);
  const months4to6 = Math.max(0, v6 - v3);
  const months7to12 = Math.max(0, v12 - v6);

  const per4to6 = months4to6 / 3;
  const per7to12 = months7to12 / 6;

  // Index 0 = oldest month (12 months ago), index 11 = current month.
  const out = new Array<number>(12);
  for (let i = 0; i < 6; i++) out[i] = per7to12;
  for (let i = 6; i < 9; i++) out[i] = per4to6;
  out[9] = month3;
  out[10] = month2;
  out[11] = month1;

  // If everything is zero, return a flat short series so charts don't error.
  if (out.every((v) => v === 0)) return new Array(12).fill(0);
  return out;
}

// Quick variance smoother — turns the stair-step bucket trend into a softer
// monthly curve. Stays cheap (single pass) and keeps the totals roughly intact.
export function smoothTrend(points: number[]): number[] {
  if (points.length < 3) return points.slice();
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[i - 1] ?? points[i];
    const next = points[i + 1] ?? points[i];
    out.push((prev + 2 * points[i] + next) / 4);
  }
  return out;
}
