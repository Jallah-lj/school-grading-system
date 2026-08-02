export type GradeDraft = {
  key: string;
  savedAt: string;
  payload: {
    classId: string;
    subjectId: string;
    semesterId: string;
    entries: { studentId: string; scores: Record<string, number | null> }[];
  };
};

const STORAGE_KEY = 'sgs.offlineGradeDrafts';

function read(): Record<string, GradeDraft> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, GradeDraft>;
  } catch {
    return {};
  }
}

function write(drafts: Record<string, GradeDraft>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export const gradeDraftKey = (classId: string, subjectId: string, semesterId: string) =>
  `${classId}:${subjectId}:${semesterId}`;

export function getOfflineDraft(key: string): GradeDraft | undefined {
  return read()[key];
}

export function saveOfflineDraft(draft: GradeDraft) {
  const drafts = read();
  drafts[draft.key] = draft;
  write(drafts);
}

export function removeOfflineDraft(key: string) {
  const drafts = read();
  delete drafts[key];
  write(drafts);
}

export function pendingOfflineDrafts(): GradeDraft[] {
  return Object.values(read());
}
