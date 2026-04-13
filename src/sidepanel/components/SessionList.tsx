import React, { useCallback, useMemo, useState } from 'react';
import { Check, Edit2, MessageSquare, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Session } from '../../utils/types';
import { useStore } from '../store';
import { useSettings } from '../hooks/useSettings';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ConfirmDialog } from './ConfirmDialog';
import { StorageService } from '../../services/storage';

interface SessionListProps {
  onClose?: () => void;
  onSessionSelected?: () => void;
}

export const SessionList = React.memo(({ onClose, onSessionSelected }: SessionListProps) => {
  const { t } = useTranslation();
  const sessions = useStore((state) => state.sessions);
  const currentSessionId = useStore((state) => state.currentSessionId);
  const switchSession = useStore((state) => state.switchSession);
  const createNewSession = useStore((state) => state.createNewSession);
  const deleteSession = useStore((state) => state.deleteSession);
  const updateSessionTitle = useStore((state) => state.updateSessionTitle);
  const settings = useSettings();
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 150);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const handleStartEdit = useCallback((session: Session) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingSessionId && editTitle.trim()) {
      updateSessionTitle(editingSessionId, editTitle.trim());
    }
    setEditingSessionId(null);
  }, [editingSessionId, editTitle, updateSessionTitle]);

  const handleCancelEdit = useCallback(() => {
    setEditingSessionId(null);
    setEditTitle('');
  }, []);

  const handleDeleteClick = useCallback((sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSessionToDelete(sessionId);
  }, []);

  const confirmDelete = useCallback(() => {
    if (sessionToDelete) {
      deleteSession(sessionToDelete);
      setSessionToDelete(null);
    }
  }, [sessionToDelete, deleteSession]);

  const formatTime = useCallback(
    (timestamp: number): string => {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return t('time.justNow');
      if (minutes < 60) return t('time.minutesAgo', { count: minutes });
      if (hours < 24) return t('time.hoursAgo', { count: hours });
      if (days === 1) return t('time.yesterday');
      if (days < 7) return t('time.daysAgo', { count: days });
      return new Date(timestamp).toLocaleDateString();
    },
    [t]
  );

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((left, right) => {
        const pinnedSessionIds = settings.pinnedSessionIds ?? [];
        const leftPinned = pinnedSessionIds.includes(left.id);
        const rightPinned = pinnedSessionIds.includes(right.id);
        if (leftPinned !== rightPinned) {
          return leftPinned ? -1 : 1;
        }
        return right.updatedAt - left.updatedAt;
      }),
    [sessions, settings.pinnedSessionIds]
  );

  const filteredSessions = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return sortedSessions;
    return sortedSessions.filter((session) => session.title.toLowerCase().includes(query));
  }, [sortedSessions, debouncedSearch]);

  return (
    <div
      id="session-workspace-drawer"
      className="flex h-full w-72 flex-col border-r border-[color:var(--ps-border)] bg-[linear-gradient(180deg,rgba(7,8,10,0.98),rgba(11,13,18,0.98))]"
    >
      <div className="space-y-4 border-b border-[color:var(--ps-border)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="ps-eyebrow">
              {t('session.workspace', 'Workspace')}
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ps-text)]">
              {t('session.heading', 'Recent comparisons')}
            </h2>
            <p className="text-sm leading-6 text-[color:var(--ps-text-muted)]">
              {t(
                'session.subtitle',
                'Keep every compare run, switch contexts fast, and reopen the tabs you already trust.'
              )}
            </p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="ps-action-secondary rounded-xl p-2 transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
              aria-label={t('common.closeSidebar', 'Close sidebar')}
              title={t('common.closeSidebar', 'Close sidebar')}
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        <button
          onClick={createNewSession}
          aria-label={t('session.new')}
          className="ps-action-primary flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold transition-all duration-200 hover:scale-[1.01]"
        >
          <Plus size={18} />
          <span>{t('session.new')}</span>
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 text-[color:var(--ps-text-muted)]" size={16} />
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('session.search')}
            className="w-full rounded-xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] py-2 pl-9 pr-3 text-sm text-[color:var(--ps-text)] transition-all placeholder:text-[color:var(--ps-text-muted)] focus:border-[rgba(138,155,255,0.35)] focus:outline-none focus:ring-2 focus:ring-[rgba(138,155,255,0.24)]"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-2 top-2 rounded p-1 hover:bg-[rgba(255,255,255,0.08)]"
            >
              <X size={14} className="text-[color:var(--ps-text-muted)]" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filteredSessions.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center px-4 text-center">
            <Search size={32} className="mb-2 text-[color:var(--ps-text-muted)]" />
            <p className="text-sm text-[color:var(--ps-text-muted)]">
              {debouncedSearch ? t('session.noResults') : t('session.empty')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSessions.map((session) => {
              const isActive = session.id === currentSessionId;
              const isEditing = editingSessionId === session.id;
              const pinnedSessionIds = settings.pinnedSessionIds ?? [];
              const isPinned = pinnedSessionIds.includes(session.id);

              return (
                <div
                  key={session.id}
                  onClick={() => {
                    if (isEditing) return;
                    switchSession(session.id);
                    onSessionSelected?.();
                  }}
                  onDoubleClick={() => {
                    if (!isEditing && settings.doubleClickToEdit) {
                      handleStartEdit(session);
                    }
                  }}
                  className={`
                    group relative cursor-pointer rounded-[1.4rem] p-3 transition-all duration-200
                    ${
                      isActive
                        ? 'border-[rgba(255,138,91,0.34)] bg-[linear-gradient(135deg,rgba(255,138,91,0.16),rgba(138,155,255,0.18))] shadow-[0_20px_48px_rgba(0,0,0,0.26)]'
                        : 'border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.14)] hover:bg-[rgba(255,255,255,0.06)]'
                    }
                  `}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="text"
                        aria-label={t('session.rename')}
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') handleSaveEdit();
                          if (event.key === 'Escape') handleCancelEdit();
                        }}
                        className="flex-1 rounded-lg border border-[rgba(138,155,255,0.35)] bg-[rgba(7,8,10,0.45)] px-2 py-1 text-sm text-[color:var(--ps-text)] focus:outline-none focus:ring-2 focus:ring-[rgba(138,155,255,0.24)]"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveEdit}
                        className="rounded p-1 text-[color:var(--ps-success)] hover:bg-[rgba(83,196,143,0.12)]"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="rounded p-1 text-[color:var(--ps-danger)] hover:bg-[rgba(255,123,134,0.12)]"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <MessageSquare
                        size={16}
                        className={`mt-0.5 shrink-0 ${isActive ? 'text-[color:var(--ps-accent)]' : 'text-[color:var(--ps-text-muted)]'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <h3
                          className={`truncate text-sm font-semibold ${isActive ? 'text-white' : 'text-[color:var(--ps-text)]'}`}
                        >
                          {session.title}
                        </h3>
                        {isPinned && (
                          <span className="mt-1 inline-flex rounded-full border border-[rgba(243,192,107,0.24)] bg-[rgba(243,192,107,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ps-warning)]">
                            {t('session.pinned', 'Pinned')}
                          </span>
                        )}

                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className={isActive ? 'text-white/80' : 'text-[color:var(--ps-text-muted)]'}>
                            {session.messages.length} {t('session.messages')}
                          </span>
                          <span className="text-[color:var(--ps-text-muted)]/50">·</span>
                          <span
                            data-testid={`session-${session.id}-models`}
                            className={isActive ? 'text-white/80' : 'text-[color:var(--ps-text-muted)]'}
                          >
                            {session.selectedModels.length} {t('session.models')}
                          </span>
                        </div>

                        {session.messages.length > 0 && (
                          <p className="mt-1 truncate text-xs text-[color:var(--ps-text-muted)]">
                            {session.messages[session.messages.length - 1].text.substring(0, 30)}
                            {session.messages[session.messages.length - 1].text.length > 30
                              ? '...'
                              : ''}
                          </p>
                        )}

                        <span className="mt-1 block text-xs text-[color:var(--ps-text-muted)]">
                          {formatTime(session.updatedAt)}
                        </span>
                      </div>
                    </div>
                  )}

                  {!isEditing && (
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={async (event) => {
                          event.stopPropagation();
                          const nextPinned = isPinned
                            ? pinnedSessionIds.filter((id) => id !== session.id)
                            : [...pinnedSessionIds, session.id];
                          await StorageService.saveSettings({
                            ...settings,
                            pinnedSessionIds: nextPinned,
                          });
                        }}
                        className="rounded-lg p-1.5 text-[color:var(--ps-text-muted)] transition-colors hover:bg-[rgba(243,192,107,0.12)] hover:text-[color:var(--ps-warning)]"
                        title={t('session.pin', 'Pin')}
                      >
                        <Pin size={14} className={isPinned ? 'fill-current' : ''} />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStartEdit(session);
                        }}
                        className="rounded-lg p-1.5 text-[color:var(--ps-text-muted)] transition-colors hover:bg-[rgba(138,155,255,0.14)] hover:text-[color:var(--ps-focus)]"
                        title={t('session.rename')}
                      >
                        <Edit2 size={14} />
                      </button>
                      {sessions.length > 1 && (
                        <button
                          onClick={(event) => handleDeleteClick(session.id, event)}
                          className="rounded-lg p-1.5 text-[color:var(--ps-text-muted)] transition-colors hover:bg-[rgba(255,123,134,0.12)] hover:text-[color:var(--ps-danger)]"
                          title={t('session.delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!sessionToDelete}
        title={t('session.delete')}
        message={t('session.deleteConfirm')}
        onConfirm={confirmDelete}
        onCancel={() => setSessionToDelete(null)}
        variant="danger"
      />
    </div>
  );
});

SessionList.displayName = 'SessionList';
