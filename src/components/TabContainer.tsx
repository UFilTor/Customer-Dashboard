"use client";

import { useState } from "react";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface Props {
  tabs: Tab[];
}

export function TabContainer({ tabs }: Props) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || "");

  return (
    <div>
      <div className="flex border-b border-[var(--beige-gray)] mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 -mb-px transition-all duration-200 ${
              activeTab === tab.id
                ? "border-b-2 border-[var(--moss)] text-[var(--moss)] font-semibold"
                : "text-[var(--green-100)] hover:text-[var(--moss)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {tabs.find((t) => t.id === activeTab)?.content}
      </div>
    </div>
  );
}
