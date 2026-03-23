import { TaskItem, OwnerMap } from "@/lib/types";

interface Props {
  tasks: TaskItem[];
  owners: OwnerMap;
}

export function TasksTab({ tasks, owners }: Props) {
  if (tasks.length === 0) {
    return <p className="text-[#9ca3af] text-sm py-4">No upcoming tasks</p>;
  }

  return (
    <div className="space-y-2">
      {tasks.map((task, index) => (
        <div
          key={`${task.subject}-${task.dueDate}-${index}`}
          className="bg-white border border-[#e5e7eb] rounded-2xl p-4 flex items-center justify-between"
        >
          <div>
            <h4 className="font-medium text-[#022C12] text-sm">{task.subject || "-"}</h4>
            <div className="text-xs text-[#9ca3af] mt-1">
              {owners[task.owner] || task.owner || "-"} &middot; Due: {formatDate(task.dueDate)}
            </div>
          </div>
          <span className="inline-block bg-[#f0fdf4] text-[#022C12] px-2 py-1 rounded text-xs font-medium">
            {task.status || "-"}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr || "-";
  return date.toLocaleDateString("sv-SE");
}
