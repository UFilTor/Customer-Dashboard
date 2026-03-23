"use client";

import { isMac } from "@/hooks/useKeyboardShortcuts";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const modLabel = isMac ? "Cmd" : "Ctrl";

const shortcuts = [
  { label: "Focus search", keys: `${modLabel} + K` },
  { label: "Go back", keys: "Esc" },
  { label: "Navigate list / Switch tab", keys: "Arrow Up / Down" },
  { label: "Open company", keys: "Enter" },
  { label: "Jump to group", keys: "1 - 4" },
  { label: "Switch tab", keys: "Arrow Left / Right" },
  { label: "Show this help", keys: "?" },
];

export default function ShortcutCheatSheet({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative bg-white rounded-2xl shadow-lg p-6 w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-[var(--moss)] mb-4">
          Keyboard Shortcuts
        </h3>
        <div className="flex flex-col gap-3">
          {shortcuts.map((s) => (
            <div key={s.label} className="flex justify-between items-center">
              <span className="text-sm text-gray-600">{s.label}</span>
              <kbd className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
