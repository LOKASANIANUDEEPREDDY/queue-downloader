import React, { useState } from 'react';
import { Header } from './components/Header.js';
import { UrlInput } from './components/UrlInput.js';
import { QueueList } from './components/QueueList.js';
import { SystemBanner } from './components/SystemBanner.js';
import { Footer } from './components/Footer.js';
import { ToastContainer, toast } from './components/Toast.js';
import { useSSE } from './hooks/useSSE.js';
import { useTheme } from './hooks/useTheme.js';
import { safeFetchJson } from './utils/api.js';

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const queueState = useSSE();
  const [isSystemModalOpen, setIsSystemModalOpen] = useState(false);

  // Actions
  const handlePause = async () => {
    try {
      const res = await safeFetchJson('/api/queue/pause', { method: 'POST' });
      if (res.ok) {
        toast.info('Queue paused. Current item will finish, next items will wait.', 'Queue');
      } else {
        toast.error(res.error || 'Failed to pause queue');
      }
    } catch {
      toast.error('Failed to pause queue');
    }
  };

  const handleResume = async () => {
    try {
      const res = await safeFetchJson('/api/queue/resume', { method: 'POST' });
      if (res.ok) {
        toast.success('Queue resumed. Sequential downloading continues.', 'Queue');
      } else {
        toast.error(res.error || 'Failed to resume queue');
      }
    } catch {
      toast.error('Failed to resume queue');
    }
  };

  const handleClearCompleted = async () => {
    try {
      const res = await safeFetchJson('/api/queue/clear-completed', { method: 'POST' });
      if (res.ok) {
        toast.info('Cleared completed items from queue', 'Queue');
      } else {
        toast.error(res.error || 'Failed to clear completed items');
      }
    } catch {
      toast.error('Failed to clear completed items');
    }
  };

  const handleCancelItem = async (id: string) => {
    try {
      const res = await safeFetchJson(`/api/queue/${id}/cancel`, { method: 'POST' });
      if (res.ok && res.data?.success) {
        toast.info('Download cancelled', 'Queue Item');
      } else {
        toast.warning(res.error || 'Could not cancel this item');
      }
    } catch {
      toast.error('Failed to cancel item');
    }
  };

  const handleRetryItem = async (id: string) => {
    try {
      const res = await safeFetchJson(`/api/queue/${id}/retry`, { method: 'POST' });
      if (res.ok && res.data?.success) {
        toast.success('Item added back to queue for download', 'Retry');
      } else {
        toast.error(res.error || 'Failed to retry item');
      }
    } catch {
      toast.error('Failed to retry item');
    }
  };

  const handleRemoveItem = async (id: string) => {
    try {
      const res = await safeFetchJson(`/api/queue/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.info('Item removed from queue', 'Queue');
      } else {
        toast.error(res.error || 'Failed to remove item');
      }
    } catch {
      toast.error('Failed to remove item');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Header
        queueState={queueState}
        isConnected={queueState.isConnected}
        theme={theme}
        onToggleTheme={toggleTheme}
        onPause={handlePause}
        onResume={handleResume}
        onClearCompleted={handleClearCompleted}
        onOpenSystemModal={() => setIsSystemModalOpen(true)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <SystemBanner
          isOpenModal={isSystemModalOpen}
          onCloseModal={() => setIsSystemModalOpen(false)}
        />

        <UrlInput />

        <QueueList
          items={queueState.items}
          activeItemId={queueState.activeItemId}
          onCancel={handleCancelItem}
          onRetry={handleRetryItem}
          onRemove={handleRemoveItem}
        />
      </main>

      <Footer />
      <ToastContainer />
    </div>
  );
};
