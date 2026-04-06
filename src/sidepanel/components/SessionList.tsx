import React, { useCallback, useMemo, useState } from 'react';
import { Check, Edit2, MessageSquare, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Session } from '../../utils/types';
import { useStore } from '../store';
import { useSettings } from '../hooks/useSettings';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ConfirmDialog } from './ConfirmDialog';
import { StorageService } from '../../services/storage';

export const SessionList = React.memo(() => {
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
    <div className="flex h-full w-72 flex-col border-r border-rose-100 bg-[linear-gradient(180deg,_rgba(255,248,252,0.96),_rgba(255,255,255,0.96))]">
      <div className="space-y-4 border-b border-rose-100 p-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fuchsia-600">
            {t('session.workspace', 'Workspace')}
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            {t('session.heading', 'Recent comparisons')}
          </h2>
          <p className="text-sm leading-6 text-slate-500">
            {t(
              'session.subtitle',
              'Keep every compare run, switch contexts fast, and reopen the tabs you already trust.'
            )}
          </p>
        </div>

        <button
          onClick={createNewSession}
          aria-label={t('session.new')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-rose-500 to-amber-400 px-4 py-3 font-semibold text-white shadow-lg shadow-rose-300/30 transition-all duration-200 hover:scale-[1.01] hover:shadow-xl"
        >
          <Plus size={18} />
          <span>{t('session.new')}</span>
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('session.search')}
            className="w-full rounded-xl border border-rose-100 bg-white/90 py-2 pl-9 pr-3 text-sm text-slate-700 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-2 top-2 rounded p-1 hover:bg-slate-100"
            >
              <X size={14} className="text-slate-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filteredSessions.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center px-4 text-center">
            <Search size={32} className="mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">
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
                  onClick={() => !isEditing && switchSession(session.id)}
                  onDoubleClick={() => {
                    if (!isEditing && settings.doubleClickToEdit) {
                      handleStartEdit(session);
                    }
                  }}
                  className={`
                    group relative cursor-pointer rounded-[1.4rem] p-3 transition-all duration-200
                    ${
                      isActive
                        ? 'border border-fuchsia-200 bg-white shadow-[0_14px_40px_rgba(236,72,153,0.12)]'
                        : 'border border-white/60 bg-white/75 hover:border-rose-100 hover:bg-white'
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
                        className="flex-1 rounded-lg border border-fuchsia-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveEdit}
                        className="rounded p-1 text-green-600 hover:bg-green-50"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <MessageSquare
                        size={16}
                        className={`mt-0.5 shrink-0 ${isActive ? 'text-fuchsia-600' : 'text-slate-400'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <h3
                          className={`truncate text-sm font-semibold ${isActive ? 'text-fuchsia-950' : 'text-slate-700'}`}
                        >
                          {session.title}
                        </h3>
                        {isPinned && (
                          <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                            {t('session.pinned', 'Pinned')}
                          </span>
                        )}

                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className={isActive ? 'text-fuchsia-700' : 'text-slate-500'}>
                            {session.messages.length} {t('session.messages')}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span
                            data-testid={`session-${session.id}-models`}
                            className={isActive ? 'text-fuchsia-700' : 'text-slate-500'}
                          >
                            {session.selectedModels.length} {t('session.models')}
                          </span>
                        </div>

                        {session.messages.length > 0 && (
                          <p className="mt-1 truncate text-xs text-slate-400">
                            {session.messages[session.messages.length - 1].text.substring(0, 30)}
                            {session.messages[session.messages.length - 1].text.length > 30
                              ? '...'
                              : ''}
                          </p>
                        )}

                        <span className="mt-1 block text-xs text-slate-400">
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
                        className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-amber-50 hover:text-amber-600"
                        title={t('session.pin', 'Pin')}
                      >
                        <Pin size={14} className={isPinned ? 'fill-current' : ''} />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStartEdit(session);
                        }}
                        className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-fuchsia-50 hover:text-fuchsia-600"
                        title={t('session.rename')}
                      >
                        <Edit2 size={14} />
                      </button>
                      {sessions.length > 1 && (
                        <button
                          onClick={(event) => handleDeleteClick(session.id, event)}
                          className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
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
