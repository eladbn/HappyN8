import type { QueryClient } from '@tanstack/react-query';
import { getAll, n8n } from './client';
import type { Tag, Workflow } from './types';
import { CATEGORY_PREFIX, isCategoryTag } from '../lib/organize';

/** Finds a tag by name (case-insensitive) or creates it. */
export async function ensureTag(name: string, known?: Tag[]): Promise<Tag> {
  const find = (list: Tag[]) => list.find((t) => t.name.toLowerCase() === name.toLowerCase());
  const hit = find(known ?? await getAll<Tag>('/tags'));
  if (hit) return hit;
  try {
    return await n8n.post<Tag>('/tags', { name });
  } catch (e) {
    // Created meanwhile (409): look it up again instead of failing.
    const again = find(await getAll<Tag>('/tags'));
    if (again) return again;
    throw e;
  }
}

export async function setWorkflowTags(workflowId: string, tags: Tag[]): Promise<void> {
  const ids = [...new Set(tags.map((t) => t.id))];
  await n8n.put(`/workflows/${workflowId}/tags`, ids.map((id) => ({ id })));
}

/** Replaces the workflow's category tag (null removes it), keeping its other tags. */
export async function setCategory(wf: Pick<Workflow, 'id' | 'tags'>, category: string | Tag | null, known?: Tag[]): Promise<void> {
  const keep = (wf.tags ?? []).filter((t) => !isCategoryTag(t));
  if (!category) return setWorkflowTags(wf.id, keep);
  const tag = typeof category === 'string' ? await ensureTag(`${CATEGORY_PREFIX}${category.trim()}`, known) : category;
  return setWorkflowTags(wf.id, [...keep, tag]);
}

export async function addTag(wf: Pick<Workflow, 'id' | 'tags'>, tag: Tag): Promise<void> {
  if ((wf.tags ?? []).some((t) => t.id === tag.id)) return;
  return setWorkflowTags(wf.id, [...(wf.tags ?? []), tag]);
}

export async function removeTag(wf: Pick<Workflow, 'id' | 'tags'>, tagId: string): Promise<void> {
  return setWorkflowTags(wf.id, (wf.tags ?? []).filter((t) => t.id !== tagId));
}

export function refreshCatalog(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['workflows'] }),
    qc.invalidateQueries({ queryKey: ['tags'] }),
    qc.invalidateQueries({ queryKey: ['workflow'] }),
    qc.invalidateQueries({ queryKey: ['ownership'] }),
    qc.invalidateQueries({ queryKey: ['audit'] }),
  ]);
}
