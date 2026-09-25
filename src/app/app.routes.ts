import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent)
  },
  {
    path: 'model/fault-tree/:id',
    loadComponent: () =>
      import('./features/fault-tree/fault-tree-page.component').then((m) => m.FaultTreePageComponent)
  },
  {
    path: 'model/event-tree/:id',
    loadComponent: () =>
      import('./features/placeholder/feature-placeholder.component').then((m) => m.FeaturePlaceholderComponent),
    data: {
      title: 'Event Tree Workspace',
      description: 'Phase 5 will implement the RiskSpectrum-style Initiating Event → Function Event → Branch Point → Sequence / Consequence editor with a dedicated GoJS layout.'
    }
  },
  {
    path: 'data/basic-events',
    loadComponent: () =>
      import('./features/placeholder/feature-placeholder.component').then((m) => m.FeaturePlaceholderComponent),
    data: {
      title: 'Reliability Data Workspace',
      description: 'Basic Event models 1–7, parameters q/r/f/TR/TI/TF/TM, uncertainty distributions, CCF, MUX, conditional probability, systems, components and attributes.'
    }
  },
  {
    path: 'analysis/cases',
    loadComponent: () =>
      import('./features/placeholder/feature-placeholder.component').then((m) => m.FeaturePlaceholderComponent),
    data: {
      title: 'Analysis Cases',
      description: 'Fault Tree, Sequence and Consequence analysis cases with specifications, settings, BC Sets and run history.'
    }
  },
  {
    path: 'analysis/mcs-bdd',
    loadComponent: () =>
      import('./features/placeholder/feature-placeholder.component').then((m) => m.FeaturePlaceholderComponent),
    data: {
      title: 'MCS BDD',
      description: 'MCS Limit, Pivot Q Limit, Pivot FV Limit, Maximal Number of Nodes and Run Using Generated MCS.'
    }
  },
  {
    path: 'analysis/iab',
    loadComponent: () =>
      import('./features/placeholder/feature-placeholder.component').then((m) => m.FeaturePlaceholderComponent),
    data: {
      title: 'I&AB Editor',
      description: 'Basic Event, Grace Delay Event, Deterministic Failure Event, Sequence MTTR, Grace Delay Time, Deterministic Failure Time and Assign References.'
    }
  },
  {
    path: 'results',
    loadComponent: () =>
      import('./features/placeholder/feature-placeholder.component').then((m) => m.FeaturePlaceholderComponent),
    data: {
      title: 'Analysis Results',
      description: 'Summary, MCS, Modified MCS, Basic Event, CCF Group, importance, uncertainty and time-dependent results.'
    }
  },
  {
    path: 'tools/integrity',
    loadComponent: () =>
      import('./features/placeholder/feature-placeholder.component').then((m) => m.FeaturePlaceholderComponent),
    data: {
      title: 'Model Integrity Check',
      description: 'Record-level validation with direct navigation back to the relevant GoJS node or data record.'
    }
  },
  {
    path: 'tools/rsa',
    loadComponent: () =>
      import('./features/placeholder/feature-placeholder.component').then((m) => m.FeaturePlaceholderComponent),
    data: {
      title: 'RSA Import / Export',
      description: 'Transactional import preview for SYS, FTR, GAT, BEV, HEV, PAR, ATT, CCG and MEM plus GIN/EXC relationships.'
    }
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' }
];
