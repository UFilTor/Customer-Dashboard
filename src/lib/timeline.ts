export function formatGroupDuration(enteredGroupAt: string | undefined): string | null {
  if (!enteredGroupAt) return null;
  const entered = new Date(enteredGroupAt).getTime();
  if (isNaN(entered)) return null;

  const days = Math.floor((Date.now() - entered) / 86400000);

  if (days < 1) return "new today";
  if (days < 30) return `in group ${days}d`;
  return `in group ${Math.floor(days / 30)}mo`;
}
