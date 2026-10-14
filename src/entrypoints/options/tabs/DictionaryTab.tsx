import { Book, X } from 'lucide-react';

interface DictionaryTabProps {
  dictionary: string[];
  onRemoveWord: (word: string) => void;
}

export function DictionaryTab({ dictionary, onRemoveWord }: DictionaryTabProps) {
  const sortedWords = [...dictionary].sort((a, b) => a.localeCompare(b));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Words in your personal dictionary won't be flagged as spelling errors.
        </p>
        {dictionary.length > 0 && (
          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 tabular-nums dark:bg-zinc-800 dark:text-zinc-300">
            {dictionary.length} {dictionary.length === 1 ? 'word' : 'words'}
          </span>
        )}
      </div>

      {dictionary.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <Book aria-hidden="true" className="h-5 w-5 text-zinc-400" />
          </div>
          <p className="text-sm font-medium">Your dictionary is empty</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Add words by clicking "Add to dictionary" on spelling suggestions.
          </p>
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Dictionary words">
          {sortedWords.map((word) => (
            <li
              key={word}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-100 py-1 pr-1 pl-2.5 text-sm text-zinc-700 ring-1 ring-zinc-200 ring-inset dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700"
            >
              {word}
              <button
                type="button"
                onClick={() => onRemoveWord(word)}
                aria-label={`Remove ${word}`}
                className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-red-600 dark:hover:bg-zinc-700 dark:hover:text-red-400"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
