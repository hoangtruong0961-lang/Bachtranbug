import { Project } from '../types';
import { saveProjectToDB, deleteProjectFromDB } from './idbStorage';

const PROJECTS_STORAGE_KEY = 'subtranslate_capcut_projects_v1';

export const DEFAULT_PROJECTS: Project[] = [];

export function getSavedProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Clean out sample projects if any
    const userProjects = parsed.filter((p: Project) => p && !p.id.startsWith('proj-sample-'));
    return userProjects;
  } catch (e) {
    console.error('Error reading saved projects:', e);
    return [];
  }
}

export function saveProject(project: Project): void {
  try {
    const projects = getSavedProjects();
    const idx = projects.findIndex((p) => p.id === project.id);
    const updated = { ...project, updatedAt: Date.now() };
    if (idx >= 0) {
      projects[idx] = updated;
    } else {
      projects.unshift(updated);
    }
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    // Persist asynchronously to IndexedDB
    saveProjectToDB(updated);
  } catch (e) {
    console.error('Error saving project:', e);
  }
}

export function deleteProject(id: string): Project[] {
  try {
    const projects = getSavedProjects();
    const filtered = projects.filter((p) => p.id !== id);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(filtered));
    // Delete asynchronously from IndexedDB
    deleteProjectFromDB(id);
    return filtered;
  } catch (e) {
    console.error('Error deleting project:', e);
    return [];
  }
}

