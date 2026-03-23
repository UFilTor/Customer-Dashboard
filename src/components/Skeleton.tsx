export function SkeletonCard() {
  return (
    <div className="bg-[#f0fdf4] rounded-2xl p-4 animate-pulse">
      <div className="h-3 w-16 bg-[#d1d5db] rounded mb-2" />
      <div className="h-6 w-24 bg-[#d1d5db] rounded" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex justify-between py-2 animate-pulse">
      <div className="h-4 w-24 bg-[#e5e7eb] rounded" />
      <div className="h-4 w-32 bg-[#e5e7eb] rounded" />
    </div>
  );
}

export function SkeletonBlock() {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4 animate-pulse">
      <div className="h-5 w-32 bg-[#e5e7eb] rounded mb-4" />
      <div className="space-y-3">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}
