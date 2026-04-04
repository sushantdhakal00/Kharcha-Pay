"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface TreasuryStreamEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

type EventHandler = (event: TreasuryStreamEvent) => void;

export function useTreasuryStream(orgId: string, onEvent?: EventHandler) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<TreasuryStreamEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `/api/orgs/${orgId}/treasury/stream`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener("open", () => {
      setConnected(true);
    });

    es.addEventListener("treasury", (evt) => {
      try {
        const data = JSON.parse(evt.data) as TreasuryStreamEvent;
        setLastEvent(data);
        onEventRef.current?.(data);
      } catch {
        // malformed data
      }
    });

    es.addEventListener("error", () => {
      setConnected(false);
      es.close();
      eventSourceRef.current = null;

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connect, 5000);
    });
  }, [orgId]);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setConnected(false);
  }, []);

  return { connected, lastEvent, disconnect, reconnect: connect };
}
