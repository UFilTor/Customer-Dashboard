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
      <div className="flex border-b-2 border-[#e5e7eb] mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 -mb-[2px] transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-[#022C12] text-[#022C12] font-semibold"
                : "text-[#9ca3af] hover:text-[#4D4D4D]"
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
