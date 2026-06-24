"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { prefetchDashboardRoute } from "@/lib/dashboard-prefetch";

type Props = ComponentProps<typeof Link>;

export function PrefetchNavLink({ href, onMouseEnter, ...rest }: Props) {
  const queryClient = useQueryClient();
  const hrefStr = typeof href === "string" ? href : href.pathname ?? "";

  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={(e) => {
        prefetchDashboardRoute(queryClient, hrefStr);
        onMouseEnter?.(e);
      }}
      {...rest}
    />
  );
}
