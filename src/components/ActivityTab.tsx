import { Engagement, OwnerMap } from "@/lib/types";

interface Props {
  engagements: Engagement[];
  owners: OwnerMap;
}

const TYPE_COLORS: Record<string, string> = {
  call: "bg-blue-100 text-blue-700",
  meeting: "bg-purple-100 text-purple-700",
  note: "bg-yellow-100 text-yellow-700",
  email: "bg-green-100 text-green-700",
};

export function ActivityTab({ engagements, owners }: Props) {
  if (engagements.length === 0) {
    return <p className="text-[#9ca3af] text-sm py-4">No activity in the last 90 days</p>;
  }

  return (
    <div className="space-y-3">
      {engagements.map((engagement, index) => (
        <div
          key={`${engagement.type}-${engagement.timestamp}-${index}`}
          className="bg-white border border-[#e5e7eb] rounded-2xl p-4"
        >
          <div className="flex items-start gap-3">
            <span
              className={`inline-block px-2 py-1 rounded text-xs font-medium capitalize ${
                TYPE_COLORS[engagement.type] || "bg-gray-100 text-gray-700"
              }`}
            >
              {engagement.type}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <h4 className="font-medium text-[#022C12] text-sm truncate">
                  {engagement.title}
                </h4>
                <span className="text-xs text-[#9ca3af] whitespace-nowrap ml-2">
                  {formatTimestamp(engagement.timestamp)}
                </span>
              </div>
              {engagement.bodyPreview && (
                <p className="text-sm text-[#4D4D4D] mt-1 line-clamp-2">
                  {stripHtml(engagement.bodyPreview)}
                </p>
              )}
              <div className="flex gap-3 mt-1 text-xs text-[#9ca3af]">
                {engagement.direction && <span>Direction: {engagement.direction}</span>}
                {engagement.outcome && <span>Outcome: {engagement.outcome}</span>}
                {engagement.owner && <span>By: {owners[engagement.owner] || engagement.owner}</span>}
                {engagement.fromEmail && <span>From: {engagement.fromEmail}</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTimestamp(ts: string): string {
  const date = new Date(parseInt(ts) || ts);
  if (isNaN(date.getTime())) return ts;
  return date.toLocaleDateString("sv-SE");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
