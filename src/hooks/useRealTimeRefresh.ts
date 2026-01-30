import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseRealTimeRefreshOptions {
  table: string;
  onRefresh: () => void;
  refreshInterval?: number; // fallback polling interval in ms
  enabled?: boolean;
}

export function useRealTimeRefresh({
  table,
  onRefresh,
  refreshInterval = 30000, // 30 seconds default
  enabled = true,
}: UseRealTimeRefreshOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = useCallback(() => {
    onRefresh();
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    // Set up real-time subscription
    const channel = supabase
      .channel(`${table}-changes`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: table,
        },
        () => {
          handleChange();
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Fallback polling (in case real-time fails or for edge cases)
    intervalRef.current = setInterval(() => {
      handleChange();
    }, refreshInterval);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [table, handleChange, refreshInterval, enabled]);

  return { refresh: handleChange };
}
