import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  variant = 'danger',
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const confirmLabel = confirmText || t('common.confirm');
  const cancelLabel = cancelText || t('common.cancel');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-sm overflow-hidden rounded-[1.8rem] border border-white/40 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={`shrink-0 rounded-full p-3 ${
                variant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
              }`}
            >
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
              <h3 id="dialog-title" className="mb-2 text-lg font-semibold text-slate-900">
                {title}
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">{message}</p>
            </div>
            <button
              onClick={onCancel}
              className="text-slate-400 transition-colors hover:text-slate-600"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 bg-slate-50 px-6 py-4">
          <button
            onClick={onCancel}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:ring-offset-2"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`
              rounded-xl px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2
              ${
                variant === 'danger'
                  ? 'bg-gradient-to-r from-red-500 to-pink-600 shadow-red-500/30 hover:from-red-600 hover:to-pink-700 focus:ring-red-500'
                  : 'bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-500/30 hover:from-amber-600 hover:to-orange-700 focus:ring-amber-500'
              }
            `}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
