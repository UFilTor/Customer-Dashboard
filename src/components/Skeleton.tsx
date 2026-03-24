export function SkeletonCard() {
  return (
    <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4 animate-pulse">
      <div className="h-3 w-16 bg-[var(--beige-gray)] rounded mb-2" />
      <div className="h-6 w-24 bg-[var(--beige-gray)] rounded" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex justify-between py-2 animate-pulse">
      <div className="h-4 w-24 bg-[var(--beige-gray)] rounded" />
      <div className="h-4 w-32 bg-[var(--beige-gray)] rounded" />
    </div>
  );
}

export function SkeletonBlock() {
  return (
    <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4 animate-pulse">
      <div className="h-5 w-32 bg-[var(--beige-gray)] rounded mb-4" />
      <div className="space-y-3">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}

export function SkeletonRecap() {
  return (
    <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4 mb-4 animate-pulse">
      <div className="h-3 w-20 bg-[var(--beige-gray)] rounded mb-3" />
      <div className="space-y-2">
        <div className="h-4 w-full bg-[var(--beige-gray)] rounded" />
        <div className="h-4 w-3/4 bg-[var(--beige-gray)] rounded" />
        <div className="h-4 w-5/6 bg-[var(--beige-gray)] rounded" />
      </div>
      <div className="border-t border-[var(--beige-gray)] my-3" />
      <div className="flex justify-between items-center">
        <div className="h-4 w-1/2 bg-[var(--beige-gray)] rounded" />
        <div className="h-8 w-36 bg-[var(--beige-gray)] rounded-[8px]" />
      </div>
    </div>
  );
}
