import { Injectable, computed, signal } from '@angular/core';

export interface FaultTreeWorkspace {
  id: number;
  label: string;
  faultTreeId: string;
}

@Injectable({ providedIn: 'root' })
export class FaultTreeWorkspaceService {
  private nextWorkspaceId = 1;

  readonly workspaces = signal<FaultTreeWorkspace[]>([
    { id: 1, label: 'Fault Tree Workspace', faultTreeId: 'PTR-LOPC' }
  ]);

  readonly activeWorkspaceId = signal(1);

  readonly activeWorkspace = computed(() =>
    this.workspaces().find((workspace) => workspace.id === this.activeWorkspaceId())
      ?? this.workspaces()[0]
  );

  openWorkspace(defaultFaultTreeId = 'PTR-LOPC'): FaultTreeWorkspace {
    const id = ++this.nextWorkspaceId;
    const workspace: FaultTreeWorkspace = {
      id,
      label: 'Fault Tree Workspace',
      faultTreeId: defaultFaultTreeId
    };

    this.workspaces.update((items) => [...items, workspace]);
    this.activeWorkspaceId.set(id);
    return workspace;
  }

  activateWorkspace(id: number): void {
    if (this.workspaces().some((workspace) => workspace.id === id)) {
      this.activeWorkspaceId.set(id);
    }
  }

  closeWorkspace(id: number): void {
    const current = this.workspaces();
    if (current.length <= 1) return;

    const index = current.findIndex((workspace) => workspace.id === id);
    if (index < 0) return;

    const next = current.filter((workspace) => workspace.id !== id);
    this.workspaces.set(next);

    if (this.activeWorkspaceId() === id) {
      const fallback = next[Math.min(index, next.length - 1)] ?? next[0];
      this.activeWorkspaceId.set(fallback.id);
    }
  }

  setActiveFaultTree(faultTreeId: string): void {
    const activeId = this.activeWorkspaceId();
    this.workspaces.update((items) =>
      items.map((workspace) =>
        workspace.id === activeId
          ? { ...workspace, faultTreeId }
          : workspace
      )
    );
  }
}
