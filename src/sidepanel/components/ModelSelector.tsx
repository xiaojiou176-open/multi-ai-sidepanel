import React from 'react';
import { Sparkles } from 'lucide-react';
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
              'flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-medium transition-all duration-200',
              isSelected
                ? 'border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 via-rose-50 to-amber-50 text-fuchsia-700 shadow-sm'
                : 'border-white/70 bg-white/80 text-slate-500 hover:border-rose-100 hover:bg-white hover:text-slate-700'
            )}
          >
            <span
              aria-hidden="true"
              className={clsx(
                'flex h-6 w-6 items-center justify-center rounded-xl border text-slate-700',
                isSelected ? 'border-fuchsia-200 bg-white' : 'border-slate-200 bg-slate-50'
              )}
            >
              {getModelIcon(model, 'h-3.5 w-3.5')}
            </span>
            <span>{model}</span>
            {isSelected && <Sparkles size={12} className="text-fuchsia-500" />}
          </button>
        );
      })}
    </div>
  );
};
