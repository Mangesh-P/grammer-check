import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GraSelect } from '@/components/ui/GraSelect';
import { GraSpinner } from '@/components/ui/GraSpinner';
import { GraStatsGrid } from '@/components/ui/GraStatsGrid';
import { GraToggle } from '@/components/ui/GraToggle';

describe('GraToggle', () => {
  it('is an accessible switch that reports the next value', async () => {
    const onChange = vi.fn();
    render(<GraToggle checked={false} onChange={onChange} label="Enable" />);
    const toggle = screen.getByRole('switch', { name: 'Enable' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports false when checked, and does nothing when disabled', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<GraToggle checked onChange={onChange} label="Enable" />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);

    onChange.mockClear();
    rerender(<GraToggle checked onChange={onChange} label="Enable" disabled />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('GraSelect', () => {
  it.each(['default', 'compact'] as const)('renders a %s select and forwards props', async (variant) => {
    const onChange = vi.fn();
    render(
      <GraSelect variant={variant} aria-label="Pick" value="a" onChange={onChange} className="wrapper">
        <option value="a">A</option>
        <option value="b">B</option>
      </GraSelect>,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Pick' }), 'b');
    expect(onChange).toHaveBeenCalled();
  });

  it('defaults to the default variant', () => {
    render(<GraSelect aria-label="Pick" />);
    expect(screen.getByRole('combobox').className).toContain('ring-inset');
  });
});

describe('GraSpinner', () => {
  it('has a status role and label', () => {
    render(<GraSpinner />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
    render(<GraSpinner label="Saving" />);
    expect(screen.getByRole('status', { name: 'Saving' })).toBeTruthy();
  });
});

describe('GraStatsGrid', () => {
  const stats = { checksPerformed: 1234, errorsFound: 5, correctionsApplied: 2 };

  it('shows full labels as cards by default', () => {
    render(<GraStatsGrid stats={stats} />);
    expect(screen.getByText('Checks performed')).toBeTruthy();
    expect(screen.getByText((1234).toLocaleString())).toBeTruthy();
  });

  it('shows short labels in compact mode', () => {
    render(<GraStatsGrid stats={stats} variant="compact" />);
    expect(screen.getByText('Fixed')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });
});
