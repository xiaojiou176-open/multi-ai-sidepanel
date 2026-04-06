import React, { useEffect, useRef } from 'react';
import { Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { useSettings } from '../hooks/useSettings';
import { getPromptPacks, getStarterPrompts } from '../utils/promptPacks';

export const InputArea: React.FC = () => {
  const { t } = useTranslation();
  const { input, setInput, sendMessage, isGenerating } = useStore();
  const setSelectedModelsForCurrentSession = useStore(
    (state) => state.setSelectedModelsForCurrentSession
  );
  const settings = useSettings();
  const recipes = settings.recipes ?? [];
  const visiblePacks = getPromptPacks((key, defaultValue) => t(key, defaultValue)).slice(0, 4);
  const starterPrompts = getStarterPrompts((key, defaultValue) => t(key, defaultValue));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const isEnter = event.key === 'Enter' && !event.shiftKey;
    const shouldSend = settings.enterToSend ? isEnter : isEnter && (event.metaKey || event.ctrlKey);

    if (shouldSend) {
      if (isGenerating) return;
      event.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  return (
    <div className="relative">
      <div className="relative rounded-[1.7rem] border border-rose-100 bg-white/95 shadow-[0_10px_40px_rgba(244,114,182,0.08)] transition-all duration-200 focus-within:border-fuchsia-200 focus-within:shadow-[0_14px_45px_rgba(236,72,153,0.14)]">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={t('input.ariaLabel', 'Compare prompt input')}
          placeholder={t('input.placeholder', 'Ask once, compare every answer...')}
          className="min-h-[72px] max-h-[200px] w-full resize-none border-none bg-transparent p-4 pb-14 pr-12 text-sm leading-relaxed text-slate-800 focus:ring-0 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
          rows={1}
        />

        <div className="pointer-events-none absolute left-4 right-16 top-3 flex items-center justify-between">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-700">
            {t('input.mode', 'Compare-first')}
          </span>
        </div>

        <div className="absolute bottom-2 right-2">
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isGenerating}
            aria-label={t('input.sendButton', 'Send compare prompt')}
            title={t('input.sendButton', 'Send compare prompt')}
            className={`
              flex items-center justify-center rounded-2xl p-2 transition-all duration-200
              ${
                input.trim() && !isGenerating
                  ? 'bg-gradient-to-r from-fuchsia-600 via-rose-500 to-amber-400 text-white shadow-lg shadow-rose-400/30 hover:scale-105 hover:shadow-rose-400/40 active:scale-95'
                  : 'cursor-not-allowed bg-slate-100 text-slate-400'
              }
            `}
          >
            {isGenerating ? (
              <Sparkles size={18} className="animate-spin" />
            ) : (
              <Send size={18} className={input.trim() ? 'ml-0.5' : ''} />
            )}
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
        {input.trim().length === 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                {t('input.packs', 'Prompt packs')}
              </span>
              {visiblePacks.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  title={pack.description}
                  className="rounded-full border border-amber-100 bg-amber-50/80 px-2.5 py-1 text-[11px] font-medium text-amber-800 transition-colors hover:bg-amber-100"
                  onClick={() => {
                    setSelectedModelsForCurrentSession(pack.recommendedModels);
                    setInput(pack.prompts[0]?.prompt ?? '');
                  }}
                >
                  {pack.name}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                {recipes.length > 0
                  ? t('input.recipes', 'Quick recipes')
                  : t('input.starters', 'Starter prompts')}
              </span>
              {recipes.length > 0
                ? recipes.slice(0, 3).map((recipe) => (
                    <button
                      key={recipe.id}
                      type="button"
                      className="rounded-full border border-fuchsia-100 bg-fuchsia-50/80 px-2.5 py-1 text-[11px] font-medium text-fuchsia-700 transition-colors hover:bg-fuchsia-100"
                      onClick={() => {
                        setInput(recipe.prompt);
                        setSelectedModelsForCurrentSession(recipe.models);
                      }}
                    >
                      {recipe.name}
                    </button>
                  ))
                : starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="rounded-full border border-fuchsia-100 bg-fuchsia-50/80 px-2.5 py-1 text-[11px] font-medium text-fuchsia-700 transition-colors hover:bg-fuchsia-100"
                      onClick={() => setInput(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate-500">
          {t('input.footer', 'Send one prompt, then compare the answers in one local workspace.')}
        </p>
        <p className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
          <ShieldCheck size={12} />
          {t('input.trust', 'Uses your existing browser sessions')}
        </p>
      </div>
    </div>
  );
};
