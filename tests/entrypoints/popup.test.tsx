import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// The popup reads the manifest version at import time, and fakeBrowser doesn't implement it
vi.hoisted(async () => {
  const { fakeBrowser } = await import('wxt/testing/fake-browser');
  fakeBrowser.runtime.getManifest = () => ({ version: '9.9.9' }) as never;
});

import App from '@/entrypoints/popup/App';
import { apiKeysStorage, settingsStorage, statsStorage } from '@/lib/storage';
import { DEFAULT_SETTINGS } from '@/types';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('popup', () => {
  it('shows the version and opens the options page', async () => {
    const open = vi.fn();
    fakeBrowser.runtime.openOptionsPage = open;
    render(<App />);
    expect(screen.getByText('v9.9.9')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(open).toHaveBeenCalled();
  });

  describe('without an API key', () => {
    it('saves a key for the current provider on submit', async () => {
      render(<App />);
      const input = await screen.findByLabelText('Google Gemini API key');
      const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      await userEvent.type(input, '  AIza  ');
      await userEvent.click(save);

      // The stored-key watcher swaps the form for the main controls
      expect(await screen.findByRole('switch', { name: 'Grammar checking' })).toBeTruthy();
      expect(await apiKeysStorage.getValue()).toEqual({ google: 'AIza' });
      expect(await settingsStorage.getValue()).toEqual(DEFAULT_SETTINGS);
    });

    it('saves immediately on paste and switches to the chosen provider', async () => {
      render(<App />);
      await userEvent.selectOptions(await screen.findByLabelText('AI provider'), 'anthropic');
      const input = screen.getByLabelText('Anthropic Claude API key');
      expect((input as HTMLInputElement).placeholder).toBe('sk-ant-…');
      fireEvent.paste(input, { clipboardData: { getData: () => 'sk-ant-1' } });

      await screen.findByRole('switch', { name: 'Grammar checking' });
      expect(await apiKeysStorage.getValue()).toEqual({ anthropic: 'sk-ant-1' });
      expect(await settingsStorage.getValue()).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-5-5' });
      expect(screen.getByText(/via Anthropic Claude/)).toBeTruthy();
    });

    it('ignores an empty paste', async () => {
      render(<App />);
      const input = await screen.findByLabelText('Google Gemini API key');
      fireEvent.paste(input, { clipboardData: { getData: () => '   ' } });
      expect(await apiKeysStorage.getValue()).toEqual({});
    });

    it('shows an error when saving fails', async () => {
      render(<App />);
      const input = await screen.findByLabelText('Google Gemini API key');
      vi.spyOn(apiKeysStorage, 'setValue').mockRejectedValueOnce(new Error('quota'));
      await userEvent.type(input, 'k{Enter}');
      expect(await screen.findByText("Couldn't save the key. Please try again.")).toBeTruthy();
    });
  });

  describe('with an API key', () => {
    beforeEach(async () => {
      await apiKeysStorage.setValue({ google: 'k' });
      await statsStorage.setValue({ checksPerformed: 4, errorsFound: 2, correctionsApplied: 1 });
    });

    it('toggles checking and the check mode', async () => {
      render(<App />);
      const toggle = await screen.findByRole('switch', { name: 'Grammar checking' });
      expect(screen.getByText('Checking enabled')).toBeTruthy();
      expect(screen.getByText('Checks your text as you type.')).toBeTruthy();
      expect(screen.getByText('4')).toBeTruthy();

      await userEvent.click(toggle);
      expect(await screen.findByText('Checking paused')).toBeTruthy();
      expect((await settingsStorage.getValue()).enabled).toBe(false);

      // Clicking the active mode does nothing
      await userEvent.click(screen.getByRole('button', { name: 'Real-time' }));
      await userEvent.click(screen.getByRole('button', { name: 'On-demand' }));
      expect(screen.getByRole('button', { name: 'On-demand' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByText('Ctrl+Shift+G')).toBeTruthy();
      await waitFor(async () => expect((await settingsStorage.getValue()).checkMode).toBe('ondemand'));
    });

    it('reports a failed save and rolls back', async () => {
      render(<App />);
      const toggle = await screen.findByRole('switch', { name: 'Grammar checking' });
      vi.spyOn(settingsStorage, 'setValue').mockRejectedValueOnce(new Error('quota'));
      await userEvent.click(toggle);
      expect(await screen.findByText("Couldn't save your change. Please try again.")).toBeTruthy();
      expect(screen.getByText('Checking enabled')).toBeTruthy();
    });
  });

  it('never shows controls when loading fails, and retries', async () => {
    const getValue = vi.spyOn(statsStorage, 'getValue').mockRejectedValueOnce(new Error('broken'));
    render(<App />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByRole('switch')).toBeNull();
    await act(() => userEvent.click(retry));
    await screen.findByLabelText('Google Gemini API key');
    expect(getValue).toHaveBeenCalledTimes(2);
  });
});
