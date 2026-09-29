import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setBackend } from '@/lib/backend';
import { createMemoryBackend, type MemoryBackend } from '@/lib/backend/memory';
import { App } from './App';

let backend: MemoryBackend;

beforeAll(() => {
  backend = createMemoryBackend({ seed: true });
  setBackend(backend);
});

// Each test renders the app again; the stores (and the in-memory backend) carry
// state from one test to the next, like a user continuing a session.
beforeEach(async () => {
  render(<App />);
  await screen.findByRole('navigation', { name: 'Library' });
});

const list = () => screen.getByRole('listbox', { name: /all notes|search|trash|favorites/i });
const nav = () => screen.getByRole('navigation', { name: 'Library' });

describe('Linotes app', () => {
  it('opens the library and the most recent note', async () => {
    expect(await screen.findByRole('heading', { name: 'All Notes' })).toBeInTheDocument();
    const options = await within(list()).findAllByRole('option');
    expect(options.length).toBe(5);
    await waitFor(() => expect(screen.getByLabelText('Note title')).toHaveValue('Welcome to Linotes'));
    expect(within(nav()).getByRole('button', { name: 'Work (1)' })).toBeInTheDocument();
  });

  it('creates a note, names it and saves it', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New note' }));
    const title = await screen.findByLabelText('Note title');
    await waitFor(() => expect(title).toHaveValue(''));
    await user.type(title, 'Integration test note');
    await waitFor(
      async () => {
        const saved = (await backend.listNotes()).find((n) => n.title === 'Integration test note');
        expect(saved).toBeDefined();
      },
      { timeout: 4000 },
    );
    expect(within(list()).getByText('Integration test note')).toBeInTheDocument();
  });

  it('searches notes with highlighted results', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('searchbox', { name: 'Search notes' }));
    await user.keyboard('menemen');
    const results = await screen.findByRole('listbox', { name: 'Search' });
    await waitFor(() => expect(within(results).getAllByRole('option')).toHaveLength(1));
    expect(within(results).getByText('Menemen', { selector: 'mark' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await screen.findByRole('listbox', { name: 'All Notes' });
  });

  it('moves a note to the trash and restores it', async () => {
    const user = userEvent.setup();
    const target = within(list()).getByText('Reading list');
    await user.click(target);
    await waitFor(() => expect(screen.getByLabelText('Note title')).toHaveValue('Reading list'));
    list().focus();
    await user.keyboard('{Delete}');
    await waitFor(async () =>
      expect((await backend.listNotes()).find((n) => n.title === 'Reading list')?.trashed).toBe(true),
    );
    expect(within(list()).queryByText('Reading list')).not.toBeInTheDocument();

    await user.click(within(nav()).getByRole('button', { name: /Trash/ }));
    const trash = await screen.findByRole('listbox', { name: 'Trash' });
    await user.click(within(trash).getByText('Reading list'));
    const [restore] = await screen.findAllByRole('button', { name: 'Restore' });
    await user.click(restore!);
    await waitFor(async () =>
      expect((await backend.listNotes()).find((n) => n.title === 'Reading list')?.trashed).toBe(false),
    );
  });

  it('switches to Markdown mode and back', async () => {
    const user = userEvent.setup();
    await user.click(within(nav()).getByRole('button', { name: /All Notes/ }));
    await user.click(within(list()).getByText('Weekly planning'));
    await waitFor(() => expect(screen.getByLabelText('Note title')).toHaveValue('Weekly planning'));
    await user.click(screen.getByRole('radio', { name: 'Markdown' }));
    expect(await screen.findByLabelText('Markdown source')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Rich text' }));
    expect(await screen.findByRole('textbox', { name: 'Note content' })).toBeInTheDocument();
  });
});
