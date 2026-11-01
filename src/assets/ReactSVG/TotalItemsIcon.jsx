import React from "react";

export const TotalItemsIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <rect width="64" height="64" rx="18" fill="#1877F2" />
    <path
      d="M32 18L43 24V40L32 46L21 40V24L32 18Z"
      stroke="white"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path d="M21 24L32 30L43 24" stroke="white" strokeWidth="2.5" />
    <path d="M32 30V46" stroke="white" strokeWidth="2.5" />
  </svg>
);
