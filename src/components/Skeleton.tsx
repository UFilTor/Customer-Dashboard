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

export function SkeletonPayMigration() {
  return (
    <div className="animate-pulse">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-3">
            <div className="h-3 w-16 bg-[var(--beige-gray)] rounded mb-2 mx-auto" />
            <div className="h-6 w-20 bg-[var(--beige-gray)] rounded mx-auto" />
          </div>
        ))}
      </div>
      {/* Pipeline bar */}
      <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4 mb-6">
        <div className="h-4 w-48 bg-[var(--beige-gray)] rounded mb-3" />
        <div className="h-8 bg-[var(--beige-gray)] rounded-lg mb-3" />
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-3 w-24 bg-[var(--beige-gray)] rounded" />
          ))}
        </div>
      </div>
      {/* Owner cards */}
      <div className="h-4 w-32 bg-[var(--beige-gray)] rounded mb-3" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4">
            <div className="flex justify-between mb-3">
              <div className="h-4 w-28 bg-[var(--beige-gray)] rounded" />
              <div className="h-5 w-16 bg-[var(--beige-gray)] rounded" />
            </div>
            <div className="h-2 bg-[var(--beige-gray)] rounded-full mb-3" />
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
