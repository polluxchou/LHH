export interface ScriptSection {
  id: string;
  label: string;
  /** display time range, e.g. "0:00–0:35" */
  duration: string;
  body: string;
}

export interface ProductionScript {
  targetDuration: string;
  wordCount: number;
  sections: ScriptSection[];
}

export interface StoryboardShot {
  n: number;
  time: string;
  shot: string;
  voiceOver: string;
  visual: string;
  notes: string;
}

export interface ProductionChecklistItem {
  id: string;
  label: string;
  done: boolean;
  who: string;
}

export interface ProductionTask {
  title: string;
  format: string;
  channel: string;
  owner: string;
  deadline: string;
  budget: string;
  checklist: ProductionChecklistItem[];
}

export interface ProductionPackage {
  script: ProductionScript;
  storyboard: StoryboardShot[];
  task: ProductionTask;
}
