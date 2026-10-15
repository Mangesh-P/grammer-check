import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/entrypoints/options/App';
import { CommitInput, Field } from '@/entrypoints/options/fields';
import { ApiKeysTab } from '@/entrypoints/options/tabs/ApiKeysTab';
import { DictionaryTab } from '@/entrypoints/options/tabs/DictionaryTab';
import { SettingsTab } from '@/entrypoints/options/tabs/SettingsTab';
import { apiKeysStorage, dictionaryStorage, settingsStorage, statsStorage } from '@/lib/storage';
import { DEFAULT_SETTINGS } from '@/types';
import type { Settings } from '@/types';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Field', () => {
  it('links the label and shows a hint and aside', () => {
    render(
      <Field id="f" label="Name" hint="Help" aside={<span>500ms</span>}>
        <input id="f" />
      </Field>,
    );
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(document.getElementById('f-hint')?.textContent).toBe('Help');
    expect(screen.getByText('500ms')).toBeTruthy();
  });
});

describe('CommitInput', () => {
  function setup(props: Partial<Parameters<typeof CommitInput>[0]> = {}) {
    const onCommit = vi.fn();
    render(<CommitInput aria-label="field" value="old" onCommit={onCommit} {...props} />);
    return { onCommit, input: screen.getByLabelText('field') as HTMLInputElement };
  }

  it('commits the trimmed draft on Enter, not on every keystroke', async () => {
    const { onCommit, input } = setup();
    await userEvent.clear(input);
    await userEvent.type(input, '  new  ');
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('new');
  });

  it('commits on blur and skips unchanged values', async () => {
    const onBlur = vi.fn();
    const { onCommit, input } = setup({ onBlur });
    await userEvent.type(input, 'x');
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('oldx');
    expect(onBlur).toHaveBeenCalled();

    onCommit.mockClear();
    fireEvent.blur(input);
    await userEvent.type(input, ' ');
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('discards the draft on Escape', async () => {
    const onKeyDown = vi.fn();
    const { onCommit, input } = setup({ onKeyDown });
    await userEvent.type(input, 'zzz{Escape}');
    expect(input.value).toBe('old');
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onKeyDown).toHaveBeenCalled();
  });

  it('blocks invalid values with an accessible error', async () => {
    const { onCommit, input } = setup({ validate: (v) => (v.startsWith('ok') ? null : 'Bad value') });
    await userEvent.clear(input);
    await userEvent.type(input, 'nope{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Bad value');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();

    await userEvent.clear(input);
    await userEvent.type(input, 'ok{Enter}');
    expect(onCommit).toHaveBeenCalledWith('ok');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('allows clearing without validating', async () => {
    const validate = vi.fn(() => 'never valid');
    const { onCommit, input } = setup({ validate });
    await userEvent.clear(input);
    await userEvent.keyboard('{Enter}');
    expect(validate).not.toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledWith('');
  });
});

describe('ApiKeysTab', () => {
  it('shows each provider, marks configured ones and saves keys', async () => {
    const onSaveKey = vi.fn();
    render(<ApiKeysTab apiKeys={{ google: 'AIza' }} onSaveKey={onSaveKey} />);
    expect(screen.getAllByText('Configured')).toHaveLength(1);

    const input = screen.getByPlaceholderText('Enter your OpenAI API key') as HTMLInputElement;
    expect(input.type).toBe('password');
    await userEvent.type(input, 'sk-1{Enter}');
    expect(onSaveKey).toHaveBeenCalledWith('openai', 'sk-1');
  });

  it('reveals and hides a key', async () => {
    render(<ApiKeysTab apiKeys={{}} onSaveKey={vi.fn()} />);
    const input = screen.getByPlaceholderText('Enter your Google Gemini API key') as HTMLInputElement;
    const [reveal] = screen.getAllByRole('button', { name: 'Show API key' });
    await userEvent.click(reveal);
    expect(input.type).toBe('text');
    await userEvent.click(screen.getByRole('button', { name: 'Hide API key' }));
    expect(input.type).toBe('password');
  });
});

describe('DictionaryTab', () => {
  it('shows an empty state', () => {
    render(<DictionaryTab dictionary={[]} onRemoveWord={vi.fn()} />);
    expect(screen.getByText('Your dictionary is empty')).toBeTruthy();
  });

  it('lists words sorted with a count and removes them', async () => {
    const onRemoveWord = vi.fn();
    const { rerender } = render(<DictionaryTab dictionary={['zeta', 'alpha']} onRemoveWord={onRemoveWord} />);
    const items = within(screen.getByRole('list', { name: 'Dictionary words' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['alpha', 'zeta']);
    expect(screen.getByText('2 words')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove zeta' }));
    expect(onRemoveWord).toHaveBeenCalledWith('zeta');

    rerender(<DictionaryTab dictionary={['one']} onRemoveWord={onRemoveWord} />);
    expect(screen.getByText('1 word')).toBeTruthy();
  });
});

describe('SettingsTab', () => {
  function setup(settings: Partial<Settings> = {}, apiKeys = { google: 'g', openai: 'o' }) {
    const onChange = vi.fn();
    const utils = render(<SettingsTab settings={{ ...DEFAULT_SETTINGS, ...settings }} apiKeys={apiKeys} onChange={onChange} />);
    return { onChange, ...utils };
  }

  it('warns when no API key is configured and disables providers without keys', () => {
    setup({}, {} as never);
    expect(screen.getByText(/add at least one API key/)).toBeTruthy();
    const option = screen.getByRole('option', { name: /Anthropic Claude \(no API key\)/ }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
  });

  it('toggles enabled', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('switch', { name: 'Enable Grammar Check' }));
    expect(onChange).toHaveBeenCalledWith({ enabled: false });
  });

  it('switching provider picks its first model and clears the custom model', async () => {
    const { onChange } = setup();
    await userEvent.selectOptions(screen.getByLabelText('AI Provider'), 'openai');
    expect(onChange).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-6-luna', customModel: undefined });
  });

  it('hides the base URL for other providers', () => {
    setup();
    expect(screen.queryByLabelText('OpenAI-compatible Base URL')).toBeNull();
  });

  it('validates the base URL for OpenAI', async () => {
    const { onChange } = setup({ provider: 'openai', model: 'gpt-6-luna' });
    const input = screen.getByLabelText('OpenAI-compatible Base URL');
    await userEvent.type(input, 'http://example.com{Enter}');
    expect(screen.getByRole('alert').textContent).toMatch(/https:\/\//);
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, 'http://localhost:11434/v1{Enter}');
    expect(onChange).toHaveBeenCalledWith({ openAIBaseURL: 'http://localhost:11434/v1' });
  });

  it('chooses models and custom models', async () => {
    const { onChange, rerender } = setup();
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'gemini-3.6-flash');
    expect(onChange).toHaveBeenCalledWith({ model: 'gemini-3.6-flash', customModel: undefined });
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'custom');
    expect(onChange).toHaveBeenCalledWith({ model: 'custom' });

    rerender(
      <SettingsTab settings={{ ...DEFAULT_SETTINGS, model: 'custom' }} apiKeys={{ google: 'g' }} onChange={onChange} />,
    );
    await userEvent.type(screen.getByLabelText('Custom Model ID'), 'gemma{Enter}');
    expect(onChange).toHaveBeenCalledWith({ customModel: 'gemma' });
  });

  it('changes check mode, and only shows the delay slider for real-time', async () => {
    const { onChange, rerender } = setup();
    expect(screen.getByLabelText('Delay before checking')).toBeTruthy();
    await userEvent.click(screen.getByLabelText(/On-demand/));
    expect(onChange).toHaveBeenCalledWith({ checkMode: 'ondemand' });

    rerender(<SettingsTab settings={{ ...DEFAULT_SETTINGS, checkMode: 'ondemand' }} apiKeys={{}} onChange={onChange} />);
    expect(screen.queryByLabelText('Delay before checking')).toBeNull();
  });

  it('commits the delay once the drag ends, not on every step', () => {
    const { onChange } = setup();
    const slider = screen.getByLabelText('Delay before checking');
    fireEvent.change(slider, { target: { value: '800' } });
    fireEvent.change(slider, { target: { value: '900' } });
    expect(screen.getByText('900ms')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ realtimeDelay: 900 });

    // Nothing to commit, or back to the stored value
    fireEvent.keyUp(slider);
    fireEvent.change(slider, { target: { value: '500' } });
    fireEvent.blur(slider);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('changes language, rewrite menu and translate target', async () => {
    const { onChange, rerender } = setup();
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'de');
    expect(onChange).toHaveBeenCalledWith({ language: 'de' });
    await userEvent.selectOptions(screen.getByLabelText('Translate to'), 'mr');
    expect(onChange).toHaveBeenCalledWith({ translateTo: 'mr' });
    await userEvent.click(screen.getByRole('switch', { name: 'Rewrite menu' }));
    expect(onChange).toHaveBeenCalledWith({ rewriteMenu: false });

    rerender(<SettingsTab settings={{ ...DEFAULT_SETTINGS, rewriteMenu: false }} apiKeys={{}} onChange={onChange} />);
    expect(screen.queryByLabelText('Translate to')).toBeNull();
  });
});

describe('options App', () => {
  it('loads, switches tabs with the keyboard and mouse, and saves through the toast', async () => {
    await statsStorage.setValue({ checksPerformed: 3, errorsFound: 0, correctionsApplied: 0 });
    await dictionaryStorage.setValue(['foo']);
    render(<App />);
    const keyInput = await screen.findByPlaceholderText('Enter your Google Gemini API key');

    await userEvent.type(keyInput, 'AIza{Enter}');
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(await apiKeysStorage.getValue()).toEqual({ google: 'AIza' });

    const apiTab = screen.getByRole('tab', { name: 'API Keys' });
    act(() => apiTab.focus());
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Settings' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Enable Grammar Check' }));
    await waitFor(async () => expect((await settingsStorage.getValue()).enabled).toBe(false));

    act(() => screen.getByRole('tab', { name: 'Settings' }).focus());
    await userEvent.keyboard('{End}');
    expect(screen.getByText('Checks performed')).toBeTruthy();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'API Keys' }).getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Statistics' }).getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'API Keys' }).getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('a');

    await userEvent.click(screen.getByRole('tab', { name: 'Dictionary' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove foo' }));
    await waitFor(async () => expect(await dictionaryStorage.getValue()).toEqual([]));
  });

  it('shows a save error toast', async () => {
    render(<App />);
    const keyInput = await screen.findByPlaceholderText('Enter your OpenAI API key');
    vi.spyOn(apiKeysStorage, 'setValue').mockRejectedValueOnce(new Error('quota'));
    await userEvent.type(keyInput, 'sk{Enter}');
    expect(await screen.findByText("Couldn't save. Please try again.")).toBeTruthy();
  });

  it('shows a load error and retries', async () => {
    const getValue = vi.spyOn(settingsStorage, 'getValue').mockRejectedValueOnce(new Error('broken'));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByPlaceholderText('Enter your OpenAI API key');
    expect(getValue).toHaveBeenCalledTimes(2);
  });
});
