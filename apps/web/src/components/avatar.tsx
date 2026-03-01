"use client";

import { useState } from "react";
import Image from "next/image";

function getInitials(displayName: string | null | undefined): string {
  if (!displayName || typeof displayName !== "string") return "?";
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase() || "?";
}

function hashToColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
  const hue = Math.abs(h % 360);
  return `hsl(${hue}, 45%, 40%)`;
}

const SIZES = {
  xs: "h-6 w-6 text-xs",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
} as const;

export function Avatar({
  src,
  displayName,
  size = "md",
  className = "",
}: {
  src: string | null | undefined;
  displayName?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const sizeClass = SIZES[size];
  const initials = getInitials(displayName);
  const bgColor = displayName ? hashToColor(displayName) : "rgb(148 163 184)";

  const showImage = src && !errored;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-slate-300 dark:bg-slate-600 ${sizeClass} ${className}`}
      style={!showImage ? { backgroundColor: bgColor } : undefined}
    >
      {showImage ? (
        <Image
          src={src}
          alt=""
          fill
          className="object-cover"
          onError={() => setErrored(true)}
          sizes="(max-width: 56px) 56px, 56px"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-semibold text-white"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
