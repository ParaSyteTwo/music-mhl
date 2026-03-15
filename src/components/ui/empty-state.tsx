import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-6">
      <div className="w-24 h-24 rounded-full bg-[rgba(200,240,75,0.05)] flex items-center justify-center text-5xl opacity-50 group-hover:opacity-75 transition-opacity">
        {icon}
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="font-syne text-2xl font-bold text-[#F5F5F0]">
          {title}
        </h3>
        <p className="text-sm text-[#666660]">{description}</p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-6 py-3 bg-[#C8F04B] text-black font-syne font-semibold rounded-xl hover:scale-105 transition-transform"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// SVG Icon Components
export function VinylIcon() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="50" cy="50" r="45" />
      <circle cx="50" cy="50" r="30" fill="currentColor" opacity="0.2" />
      <circle cx="50" cy="50" r="15" />
      <circle cx="50" cy="50" r="8" fill="currentColor" />
      <circle cx="42" cy="42" r="2" fill="currentColor" />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="20" y1="20" x2="80" y2="20" strokeLinecap="round" />
      <line x1="20" y1="40" x2="80" y2="40" strokeLinecap="round" />
      <line x1="20" y1="60" x2="80" y2="60" strokeLinecap="round" />
      <line x1="20" y1="80" x2="80" y2="80" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M50 20 L50 70" strokeLinecap="round" />
      <path d="M50 70 L35 55" strokeLinecap="round" />
      <path d="M50 70 L65 55" strokeLinecap="round" />
      <path d="M20 80 L80 80" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
