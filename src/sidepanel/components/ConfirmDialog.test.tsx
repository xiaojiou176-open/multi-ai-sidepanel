import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={false}
        title="Title"
        message="Message"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('calls confirm and cancel handlers', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByText, getByRole } = render(
      <ConfirmDialog
        isOpen={true}
        title="Delete"
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('common.confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders custom labels for warning dialogs', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByText, getByRole } = render(
      <ConfirmDialog
        isOpen={true}
        title="Heads up"
        message="Proceed carefully"
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmText="Continue"
        cancelText="Back"
        variant="warning"
      />
    );

    expect(getByText('Continue')).toBeInTheDocument();
    expect(getByText('Back')).toBeInTheDocument();

    fireEvent.click(getByText('Back'));
    fireEvent.click(getByRole('button', { name: 'Continue' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
