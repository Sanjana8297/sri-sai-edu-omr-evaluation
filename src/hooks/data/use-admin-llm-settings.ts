"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAdminLlmSettings } from "@/lib/data/fetchers";
import { dataKeys } from "./keys";

export function useAdminLlmSettingsQuery() {
  return useQuery({
    queryKey: dataKeys.adminLlmSettings,
    queryFn: fetchAdminLlmSettings,
    staleTime: 10 * 60_000,
  });
}
