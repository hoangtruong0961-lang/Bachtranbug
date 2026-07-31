import React, { useState, useEffect } from 'react';
import { CapCutHomeView } from './components/CapCutHomeView';
import { CapCutEditorView } from './components/CapCutEditorView';
import { HelpModal } from './components/HelpModal';
import { Project, GeminiModelOption, RegionROI, AppSettings } from './types';
import { getSavedProjects, saveProject, deleteProject } from './utils/projectStorage';
import { getAppSettings, saveAppSettings } from './utils/settingsStorage';
import { initStorageDB, getAllProjectsFromDB, storeMediaFileDB, getMediaFileUrlDB } from './utils/idbStorage';

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'editor'>('home');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => getAppSettings());
  const [selectedModel, setSelectedModel] = useState<GeminiModelOption>(appSettings.selectedModel);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  // Helper to restore video URLs from IndexedDB for projects where object URLs are expired or missing
  const restoreProjectVideoUrls = async (projList: Project[]): Promise<Project[]> => {
    return Promise.all(
      projList.map(async (p) => {
        if (!p.videoUrl || p.videoUrl.startsWith('blob:')) {
          const restoredUrl = await getMediaFileUrlDB(p.id);
          if (restoredUrl) {
            return { ...p, videoUrl: restoredUrl };
          }
        }
        return p;
      })
    );
  };

  // Initialize IndexedDB and load saved projects & settings on initial render
  useEffect(() => {
    initStorageDB().then(async ({ projects: dbProjects, settings: dbSettings }) => {
      const restored = await restoreProjectVideoUrls(dbProjects);
      setProjects(restored);
      if (dbSettings) {
        setAppSettings(dbSettings);
        setSelectedModel(dbSettings.selectedModel);
      }
    }).catch(async (err) => {
      console.warn('IndexedDB initialization warning, fallback to localStorage:', err);
      const saved = getSavedProjects();
      const restored = await restoreProjectVideoUrls(saved);
      setProjects(restored);
    });
  }, []);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setAppSettings(newSettings);
    saveAppSettings(newSettings);
    setSelectedModel(newSettings.selectedModel);
  };

  const handleSelectModel = (model: GeminiModelOption) => {
    setSelectedModel(model);
    const updated = { ...appSettings, selectedModel: model };
    setAppSettings(updated);
    saveAppSettings(updated);
  };

  // Open existing project
  const handleOpenProject = async (project: Project) => {
    let activeProj = project;
    if (!project.videoUrl || project.videoUrl.startsWith('blob:')) {
      const restoredUrl = await getMediaFileUrlDB(project.id);
      if (restoredUrl) {
        activeProj = { ...project, videoUrl: restoredUrl };
      }
    }
    setActiveProject(activeProj);
    setCurrentView('editor');
  };

  // Create new project
  const handleCreateNewProject = async (
    videoUrl: string,
    title?: string,
    roi?: RegionROI,
    videoFile?: File
  ) => {
    const projId = `proj-${Date.now()}`;
    let finalUrl = videoUrl;

    if (videoFile) {
      const storedUrl = await storeMediaFileDB(projId, videoFile);
      if (storedUrl) finalUrl = storedUrl;
    }

    const newProj: Project = {
      id: projId,
      title: title || 'Dự án video mới',
      videoUrl: finalUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      duration: 0,
      subtitles: [],
      roi: roi || { x: 10, y: 76, width: 80, height: 20 },
      targetLang: appSettings.targetLang || 'Tiếng Việt',
      styleConfig: {
        fontSize: 20,
        fontColor: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        padding: 6,
        position: 'bottom',
        bottomOffsetPercentage: 10,
        maskOriginalSubtitles: false,
        maskColor: 'rgba(0,0,0,0.35)',
        textOutline: true,
        outlineColor: '#000000',
        hasBackground: false,
      },
    };

    saveProject(newProj);
    const updatedList = await getAllProjectsFromDB();
    const listToRestore = updatedList && updatedList.length > 0 ? updatedList : getSavedProjects();
    const restored = await restoreProjectVideoUrls(listToRestore);
    setProjects(restored);

    setActiveProject(newProj);
    setCurrentView('editor');
  };

  // Save changes to project
  const handleSaveProject = (updatedProject: Project) => {
    saveProject(updatedProject);
    getAllProjectsFromDB().then((updatedList) => {
      if (updatedList && updatedList.length > 0) {
        setProjects(updatedList);
      } else {
        setProjects(getSavedProjects());
      }
    });
    setActiveProject(updatedProject);
  };

  // Delete project
  const handleDeleteProject = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa dự án này?')) {
      const remaining = deleteProject(id);
      setProjects(remaining);
      if (activeProject?.id === id) {
        setActiveProject(null);
        setCurrentView('home');
      }
    }
  };


  return (
    <>
      {currentView === 'home' || !activeProject ? (
        <CapCutHomeView
          projects={projects}
          onOpenProject={handleOpenProject}
          onCreateNewProject={handleCreateNewProject}
          onDeleteProject={handleDeleteProject}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          onOpenHelp={() => setIsHelpOpen(true)}
          appSettings={appSettings}
          onSaveSettings={handleSaveSettings}
        />
      ) : (
        <CapCutEditorView
          project={activeProject}
          onBackToHome={() => {
            setProjects(getSavedProjects());
            setCurrentView('home');
          }}
          onSaveProject={handleSaveProject}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          appSettings={appSettings}
          onSaveSettings={handleSaveSettings}
        />
      )}

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}
