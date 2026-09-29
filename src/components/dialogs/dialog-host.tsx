import { Check, Folder, House, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/controls';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { buildFolderTree, flattenTree } from '@/features/notes/folder-tree';
import { useLibrary } from '@/features/notes/store';
import { useDialogs, type DialogRequest } from '@/features/ui/dialogs';

type Of<K extends DialogRequest['kind']> = Extract<DialogRequest, { kind: K }>;

function ConfirmDialog({ request, done }: { request: Of<'confirm'>; done: () => void }) {
  const finish = (ok: boolean) => {
    request.resolve(ok);
    done();
  };
  return (
    <Modal
      open
      onOpenChange={(open) => !open && finish(false)}
      title={request.title}
      description={request.message}
    >
      <ModalFooter>
        <Button onClick={() => finish(false)}>{request.cancelLabel ?? 'Cancel'}</Button>
        <Button variant={request.destructive ? 'danger' : 'primary'} onClick={() => finish(true)} autoFocus>
          {request.confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function PromptDialog({ request, done }: { request: Of<'prompt'>; done: () => void }) {
  const [value, setValue] = useState(request.initialValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const finish = (result: string | null) => {
    request.resolve(result);
    done();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = request.validate?.(value) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    finish(value.trim());
  };
  return (
    <Modal open onOpenChange={(open) => !open && finish(null)} title={request.title}>
      <form onSubmit={submit}>
        <div className="px-5 pt-4">
          <label htmlFor="ln-prompt" className="mb-1.5 block text-sm font-medium">
            {request.label}
          </label>
          <TextInput
            id="ln-prompt"
            autoFocus
            value={value}
            placeholder={request.placeholder}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error)}
          />
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>
        <ModalFooter>
          <Button onClick={() => finish(null)}>Cancel</Button>
          <Button type="submit" variant="primary">
            {request.confirmLabel}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function FolderPickerDialog({ request, done }: { request: Of<'folderPicker'>; done: () => void }) {
  const folders = useLibrary((s) => s.folders);
  const [filter, setFilter] = useState('');
  const options = useMemo(() => {
    const rows = flattenTree(buildFolderTree(folders), new Set()).map((n) => ({
      path: n.folder.path,
      name: n.folder.name,
      depth: n.depth,
    }));
    const all = [{ path: '', name: 'Notes (top level)', depth: 0 }, ...rows];
    const q = filter.trim().toLowerCase();
    return q ? all.filter((o) => o.path.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)) : all;
  }, [folders, filter]);
  const [active, setActive] = useState(0);
  const finish = (path: string | null) => {
    request.resolve(path);
    done();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, Math.min(options.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[active];
      if (option) finish(option.path);
    }
  };
  return (
    <Modal open onOpenChange={(open) => !open && finish(null)} title={request.title}>
      <div className="px-5 pt-4" onKeyDown={onKeyDown}>
        <TextInput
          autoFocus
          value={filter}
          placeholder="Filter folders"
          aria-label="Filter folders"
          aria-controls="ln-folder-options"
          onChange={(e) => {
            setFilter(e.target.value);
            setActive(0);
          }}
        />
        <div
          id="ln-folder-options"
          role="listbox"
          aria-label="Folders"
          className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-line bg-app p-1"
        >
          {options.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted">No matching folders</p>
          )}
          {options.map((option, i) => (
            <div
              key={option.path || '(root)'}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => finish(option.path)}
              className={cn(
                'flex h-8 items-center gap-2 rounded-lg pr-2 text-sm',
                i === active && 'bg-hover',
              )}
              style={{ paddingLeft: `${0.625 + (filter ? 0 : option.depth) * 0.875}rem` }}
            >
              {option.path === '' ? (
                <House className="size-4 text-muted" strokeWidth={1.8} />
              ) : (
                <Folder className="size-4 text-muted" strokeWidth={1.8} />
              )}
              <span className="min-w-0 flex-1 truncate">
                {filter ? option.path || option.name : option.name}
              </span>
              {option.path === request.current && (
                <Check className="size-4 text-accent-text" strokeWidth={2.2} aria-label="Current folder" />
              )}
            </div>
          ))}
        </div>
      </div>
      <ModalFooter>
        <Button onClick={() => finish(null)}>Cancel</Button>
      </ModalFooter>
    </Modal>
  );
}

function ImportReportDialog({ request, done }: { request: Of<'importReport'>; done: () => void }) {
  const { report } = request;
  const finish = () => {
    request.resolve();
    done();
  };
  const imported = report.imported.length;
  return (
    <Modal
      open
      onOpenChange={(open) => !open && finish()}
      className="max-w-lg"
      title={
        imported > 0 ? `Imported ${imported} ${imported === 1 ? 'note' : 'notes'}` : 'Nothing was imported'
      }
      description={
        report.failed.length > 0
          ? `${report.failed.length} ${report.failed.length === 1 ? 'file' : 'files'} could not be imported.`
          : undefined
      }
    >
      <div className="max-h-80 overflow-y-auto px-5 pt-4 text-sm">
        {report.failed.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-1.5 flex items-center gap-1.5 font-medium text-danger">
              <TriangleAlert className="size-4" strokeWidth={2} /> Failed
            </h3>
            <ul className="space-y-1">
              {report.failed.map((item) => (
                <li key={item.source} className="rounded-lg bg-danger-soft px-2.5 py-1.5">
                  <p className="ln-selectable font-mono text-xs break-all">{item.source}</p>
                  <p className="text-xs text-muted">{item.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        {report.skipped.length > 0 && (
          <section>
            <h3 className="mb-1.5 font-medium">Skipped</h3>
            <ul className="space-y-1">
              {report.skipped.map((item) => (
                <li key={item.source} className="rounded-lg bg-hover px-2.5 py-1.5">
                  <p className="ln-selectable font-mono text-xs break-all">{item.source}</p>
                  <p className="text-xs text-muted">{item.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <ModalFooter>
        <Button variant="primary" onClick={finish} autoFocus>
          Done
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** Renders the dialog at the front of the queue. */
export function DialogHost() {
  const request = useDialogs((s) => s.queue[0]);
  const close = useDialogs((s) => s.close);
  if (!request) return null;
  switch (request.kind) {
    case 'confirm':
      return <ConfirmDialog request={request} done={close} />;
    case 'prompt':
      return <PromptDialog request={request} done={close} />;
    case 'folderPicker':
      return <FolderPickerDialog request={request} done={close} />;
    case 'importReport':
      return <ImportReportDialog request={request} done={close} />;
  }
}
