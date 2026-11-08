import { useState, useEffect, useRef } from 'react';
import { QueueState, QueueItem, ItemStatus, ProgressInfo } from '../../shared/types.js';

export function useSSE() {
  const [state, setState] = useState<QueueState>({
    items: [],
    isPaused: false,
    activeItemId: null,
  });
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Initial fetch of queue state via REST
    fetch('/api/queue')
      .then((res) => res.json())
      .then((data: QueueState) => {
        setState(data);
      })
      .catch((err) => {
        console.error('Failed to fetch initial queue:', err);
      });

    // Setup SSE connection
    function connect() {
      const es = new EventSource('/api/events');
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      es.addEventListener('QUEUE_STATE', (event: MessageEvent) => {
        try {
          const data: QueueState = JSON.parse(event.data);
          setState(data);
        } catch (err) {
          console.error('Failed to parse QUEUE_STATE event:', err);
        }
      });

      es.addEventListener('ITEM_PROGRESS', (event: MessageEvent) => {
        try {
          const { id, status, progress, error } = JSON.parse(event.data) as {
            id: string;
            status: ItemStatus;
            progress: ProgressInfo;
            error?: string;
          };

          setState((prev) => {
            const nextItems = prev.items.map((item) => {
              if (item.id === id) {
                return {
                  ...item,
                  status,
                  progress: {
                    ...item.progress,
                    ...progress,
                  },
                  error: error !== undefined ? error : item.error,
                };
              }
              return item;
            });
            return {
              ...prev,
              items: nextItems,
            };
          });
        } catch (err) {
          console.error('Failed to parse ITEM_PROGRESS event:', err);
        }
      });

      es.addEventListener('ITEM_UPDATED', (event: MessageEvent) => {
        try {
          const { item } = JSON.parse(event.data) as { item: QueueItem };
          setState((prev) => {
            const index = prev.items.findIndex((i) => i.id === item.id);
            let nextItems: QueueItem[];
            if (index >= 0) {
              nextItems = [...prev.items];
              nextItems[index] = item;
            } else {
              nextItems = [...prev.items, item];
            }
            return {
              ...prev,
              items: nextItems,
            };
          });
        } catch (err) {
          console.error('Failed to parse ITEM_UPDATED event:', err);
        }
      });
    }

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return { ...state, isConnected };
}

