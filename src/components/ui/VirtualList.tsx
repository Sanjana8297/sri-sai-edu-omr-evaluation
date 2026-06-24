"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type VirtualListProps<T> = {
  items: T[];
  estimateSize: number;
  threshold?: number;
  className?: string;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
};

export function VirtualList<T>({
  items,
  estimateSize,
  threshold = 30,
  className = "",
  renderItem,
  getKey,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  if (items.length <= threshold) {
    return (
      <div className={`space-y-3 ${className}`}>
        {items.map((item, index) => (
          <div key={getKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 6,
  });

  return (
    <div ref={parentRef} className={`max-h-[70vh] overflow-y-auto ${className}`}>
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={getKey(item, virtualRow.index)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="pb-3"
            >
              {renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
