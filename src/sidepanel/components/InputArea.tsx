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
      <div className="relative rounded-[1.7rem] border border-[color:var(--ps-border)] bg-[rgba(10,12,18,0.96)] shadow-[0_26px_60px_rgba(0,0,0,0.38)] transition-all duration-200 focus-within:border-[rgba(138,155,255,0.35)] focus-within:shadow-[0_26px_72px_rgba(0,0,0,0.44)]">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={t('input.ariaLabel', 'Compare prompt input')}
          placeholder={t('input.placeholder', 'Ask once, compare every answer...')}
          className="ps-scrollbar min-h-[88px] max-h-[220px] w-full resize-none border-none bg-transparent px-4 pb-16 pt-12 pr-14 text-sm leading-7 text-[color:var(--ps-text)] placeholder:text-[color:var(--ps-text-muted)] focus:ring-0"
          rows={1}
        />

        <div className="pointer-events-none absolute left-4 right-16 top-3 flex items-center justify-between">
          <span className="rounded-full border border-[rgba(255,138,91,0.24)] bg-[rgba(255,138,91,0.12)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--ps-accent)]">
            {t('input.mode', 'Compare-first')}
          </span>
        </div>

        <div className="absolute bottom-3 right-3">
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isGenerating}
            aria-label={t('input.sendButton', 'Send compare prompt')}
            title={t('input.sendButton', 'Send compare prompt')}
            className={`
              flex size-11 items-center justify-center rounded-[1.1rem] border p-2 transition-all duration-200
              ${
                input.trim() && !isGenerating
                  ? 'border-[rgba(255,138,91,0.3)] bg-[linear-gradient(135deg,var(--ps-accent),var(--ps-accent-strong))] text-white shadow-[0_18px_30px_rgba(201,100,66,0.3)] hover:scale-105 active:scale-95'
                  : 'cursor-not-allowed border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] text-[color:var(--ps-text-muted)]'
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
        {input.trim().length === 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--ps-text-muted)]">
                {t('input.packs', 'Prompt packs')}
              </span>
              {visiblePacks.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  title={pack.description}
                  className="rounded-full border border-[rgba(255,138,91,0.2)] bg-[rgba(255,138,91,0.12)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ps-text-soft)] transition-colors hover:bg-[rgba(255,138,91,0.2)]"
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
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--ps-text-muted)]">
                {recipes.length > 0
                  ? t('input.recipes', 'Quick recipes')
                  : t('input.starters', 'Starter prompts')}
              </span>
              {recipes.length > 0
                ? recipes.slice(0, 3).map((recipe) => (
                    <button
                      key={recipe.id}
                      type="button"
                      className="rounded-full border border-[rgba(138,155,255,0.2)] bg-[rgba(138,155,255,0.14)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ps-text-soft)] transition-colors hover:bg-[rgba(138,155,255,0.24)]"
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
                      className="rounded-full border border-[rgba(138,155,255,0.2)] bg-[rgba(138,155,255,0.14)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ps-text-soft)] transition-colors hover:bg-[rgba(138,155,255,0.24)]"
                      onClick={() => setInput(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
            </div>
          </div>
        )}
        <p className="text-[11px] text-[color:var(--ps-text-muted)]">
          {t('input.footer', 'Send one prompt, then compare the answers in one local workspace.')}
        </p>
        <p className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ps-success)]">
          <ShieldCheck size={12} />
          {t('input.trust', 'Uses your existing browser sessions')}
        </p>
      </div>
    </div>
  );
};
