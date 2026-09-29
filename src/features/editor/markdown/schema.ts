import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { createExtensions } from '../extensions';

let cached: Schema | null = null;

/** The editor schema without an editor instance (for parsing, tests and analysis). */
export function editorSchema(): Schema {
  cached ??= getSchema(createExtensions());
  return cached;
}
