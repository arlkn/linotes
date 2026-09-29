import { errorMessage, getBackend } from '@/lib/backend';
import type { ImportReport } from '@/types/domain';
import { useEditorStore } from '@/features/editor/store';
import { refreshLibrary, setView } from '@/features/notes/actions';
import { folderLabel } from '@/features/notes/folder-tree';
import { dialogs } from '@/features/ui/dialogs';
import { toast } from '@/features/ui/toasts';

async function finishImport(report: ImportReport | null): Promise<void> {
  if (!report) return;
  await refreshLibrary();
  if (report.folder) setView({ kind: 'folder', path: report.folder });
  const problems = report.failed.length + report.skipped.length;
  if (problems > 0 || report.imported.length === 0) {
    await dialogs.importReport(report);
  } else {
    toast.success(
      `Imported ${report.imported.length} ${report.imported.length === 1 ? 'note' : 'notes'}`,
      report.folder ? `Into ${folderLabel(report.folder)}` : undefined,
    );
  }
}

export async function importFiles(targetFolder: string): Promise<void> {
  try {
    await finishImport(await getBackend().importFiles(targetFolder));
  } catch (error) {
    toast.error('Import failed', errorMessage(error));
  }
}

export async function importFolder(targetFolder: string): Promise<void> {
  try {
    await finishImport(await getBackend().importFolder(targetFolder));
  } catch (error) {
    toast.error('Import failed', errorMessage(error));
  }
}

export async function exportNote(id: string): Promise<void> {
  if (useEditorStore.getState().session?.id === id) await useEditorStore.getState().flush();
  try {
    const report = await getBackend().exportNote(id);
    if (report) toast.success('Note exported', report.destination);
  } catch (error) {
    toast.error('Export failed', errorMessage(error));
  }
}

export async function exportZip(folder: string | null): Promise<void> {
  await useEditorStore.getState().flush();
  try {
    const report = await getBackend().exportZip(folder);
    if (report) {
      toast.success(`Exported ${report.files} ${report.files === 1 ? 'file' : 'files'}`, report.destination);
    }
  } catch (error) {
    toast.error('Export failed', errorMessage(error));
  }
}
