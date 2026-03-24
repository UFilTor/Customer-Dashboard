import { TaskItem, OwnerMap } from "@/lib/types";

interface Props {
  tasks: TaskItem[];
  owners: OwnerMap;
}

export function TasksTab({ tasks, owners }: Props) {
  if (tasks.length === 0) {
    return <p className="text-[var(--green-100)] text-sm py-4">No upcoming tasks</p>;
  }

  return (
    <div>
      {tasks.map((task, index) => (
        <div
          key={`${task.subject}-${task.dueDate}-${index}`}
          className="border-b border-[#F0EEE8] py-3.5 px-1 flex items-center justify-between"
          data-tab-item
        >
          <div>
            <h4 className="font-medium text-[var(--moss)] text-sm">{task.subject || "-"}</h4>
            <div className="text-xs text-[var(--green-100)] mt-1">
              {owners[task.owner] || task.owner || "-"} &middot; Due: {formatDate(task.dueDate)}
            </div>
          </div>
          <span className="inline-block bg-[var(--lichen)]/40 text-[var(--moss)] px-2 py-1 rounded-[8px] text-xs font-medium">
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
