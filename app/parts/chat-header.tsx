import React from "react";
import { cn } from "@/lib/utils";

export function ChatHeaderBlock({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("gap-2 flex flex-1", className)}>{children}</div>;
}

export function ChatHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full flex items-center gap-2 px-5 py-3">
      {children}
    </div>
  );
}
