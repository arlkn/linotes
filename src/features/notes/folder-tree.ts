import type { FolderInfo } from '@/types/domain';

export interface FolderNode {
  folder: FolderInfo;
  children: FolderNode[];
  depth: number;
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Build a sorted tree from the flat folder list returned by the backend. */
export function buildFolderTree(folders: FolderInfo[]): FolderNode[] {
  const byPath = new Map<string, FolderNode>();
  for (const folder of folders) byPath.set(folder.path, { folder, children: [], depth: 0 });
  const roots: FolderNode[] = [];
  for (const node of byPath.values()) {
    const parent = node.folder.parent ? byPath.get(node.folder.parent) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortAndDepth = (nodes: FolderNode[], depth: number) => {
    nodes.sort((a, b) => collator.compare(a.folder.name, b.folder.name));
    for (const node of nodes) {
      node.depth = depth;
      sortAndDepth(node.children, depth + 1);
    }
  };
  sortAndDepth(roots, 0);
  return roots;
}

/** Depth-first list of visible nodes given the set of collapsed folder paths. */
export function flattenTree(nodes: FolderNode[], collapsed: ReadonlySet<string>): FolderNode[] {
  const out: FolderNode[] = [];
  const walk = (list: FolderNode[]) => {
    for (const node of list) {
      out.push(node);
      if (!collapsed.has(node.folder.path)) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** Display label for a folder path: "Work › Projects". */
export function folderLabel(path: string): string {
  return path ? path.split('/').join(' › ') : 'Notes';
}
