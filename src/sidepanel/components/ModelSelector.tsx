import React from 'react';
import { clsx } from 'clsx';
import { getModelIcon } from '../../assets/icons/getModelIcon';
import { ModelName } from '../../utils/types';
import { MODEL_ORDER } from '../../utils/modelConfig';
import { useStore } from '../store';

const MODELS: ModelName[] = MODEL_ORDER;

export const ModelSelector: React.FC = () => {
  const { selectedModels, toggleModel } = useStore();

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
      {MODELS.map((model) => {
        const isSelected = selectedModels.includes(model);
        return (
          <button
            key={model}
            onClick={() => toggleModel(model)}
            aria-pressed={isSelected}
            className={clsx(
              'group flex min-w-fit items-center gap-3 rounded-[1.15rem] border px-3.5 py-2.5 text-xs font-medium transition-all duration-200',
              isSelected
                ? 'border-[rgba(255,138,91,0.4)] bg-[linear-gradient(135deg,rgba(255,138,91,0.18),rgba(138,155,255,0.22))] text-white shadow-[0_18px_32px_rgba(0,0,0,0.25)]'
                : 'border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] text-[color:var(--ps-text-muted)] hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[color:var(--ps-text)]'
            )}
          >
            <span
              aria-hidden="true"
              className={clsx(
                'flex size-7 items-center justify-center rounded-[0.95rem] border',
                isSelected
                  ? 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.12)] text-white'
                  : 'border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] text-[color:var(--ps-text-soft)]'
              )}
            >
              {getModelIcon(model, 'h-3.5 w-3.5')}
            </span>
            <span className="tracking-[0.02em]">{model}</span>
            <span
              aria-hidden="true"
              className={clsx(
                'size-2 rounded-full transition-all',
                isSelected
                  ? 'bg-[color:var(--ps-accent)] shadow-[0_0_0_4px_rgba(255,138,91,0.16)]'
                  : 'bg-[rgba(255,255,255,0.16)] group-hover:bg-[rgba(255,255,255,0.28)]'
              )}
            />
          </button>
        );
      })}
    </div>
  );
};
