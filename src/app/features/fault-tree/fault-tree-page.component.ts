import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { BasicEventRecord, FaultTreeModel, FaultTreeNodeData, GateRecord } from '../../core/models/psa.models';
import { MockPsaRepository } from '../../core/data/mock-psa.repository';
import { FaultTreeEditorComponent } from '../../gojs/fault-tree/fault-tree-editor.component';
import { GateRecordDialogComponent } from './gate-record-dialog.component';
import { BasicEventRecordDialogComponent } from '../data/basic-event-record-dialog.component';
import { ChangeNodeEventDialogComponent } from './change-node-event-dialog.component';
import { FaultTreeWorkspaceService } from './fault-tree-workspace.service';

@Component({
  selector: 'app-fault-tree-page',
  standalone: true,
  imports: [
    CommonModule,
    FaultTreeEditorComponent,
    GateRecordDialogComponent,
    BasicEventRecordDialogComponent,
    ChangeNodeEventDialogComponent
  ],
  template: `
    <section class="feature-page">
      <header class="feature-header">
        <div>
          <div class="breadcrumb">Model / Fault Trees / {{ repository.faultTree().id }}</div>
          <h1>{{ repository.faultTree().id }} · {{ repository.faultTree().description }}</h1>
        </div>
        <div class="header-actions">
          <button type="button">Find usages</button>
          <button type="button">Validate</button>
          <button type="button" class="primary">Save model</button>
        </div>
      </header>

      <div class="workspace-tabs">
        <div
          *ngFor="let workspace of workspaceService.workspaces()"
          class="workspace-tab"
          [class.active]="workspace.id === workspaceService.activeWorkspaceId()">
          <button
            type="button"
            class="workspace-select"
            (click)="activateWorkspace(workspace.id)">
            {{ workspace.label }}
          </button>
          <button
            type="button"
            class="workspace-close"
            title="Close workspace"
            [disabled]="workspaceService.workspaces().length === 1"
            (click)="closeWorkspace($event, workspace.id)">×</button>
        </div>
      </div>

      <div class="editor-grid">
        <main class="diagram-panel">
          <app-fault-tree-editor
            [model]="repository.faultTree()"
            (selectedNodeChange)="onSelection($event)"
            (recordOpen)="openRecord($event)"
            (changeNodeEvent)="openChangeNode($event)">
          </app-fault-tree-editor>
        </main>

        <aside class="properties-panel">
          <div class="dock-title">
            <strong>Properties</strong>
            <span>{{ selectedNode()?.recordType ?? '—' }}</span>
          </div>

          <ng-container *ngIf="selectedNode() as node; else noSelection">
            <div class="property-section">
              <h3>General</h3>
              <div class="property-row"><span>ID</span><strong>{{ node.id }}</strong></div>
              <div class="property-row"><span>Description</span><strong>{{ node.description }}</strong></div>
              <div class="property-row"><span>Category</span><strong>{{ node.category }}</strong></div>
              <div class="property-row"><span>State</span><strong>{{ node.state }}</strong></div>
              <div class="property-row" *ngIf="node.gateType"><span>Gate type</span><strong>{{ node.gateType }}</strong></div>
              <div class="property-row" *ngIf="node.reliabilityModel !== undefined"><span>Reliability</span><strong>Type {{ node.reliabilityModel }}</strong></div>
            </div>
            <div class="property-section">
              <h3>Relations</h3>
              <div class="property-row"><span>Direct inputs</span><strong>{{ selectedDirectInputs().length }}</strong></div>
              <div class="property-row"><span>Underlying BE</span><strong>{{ selectedBasicEvents().length }}</strong></div>
            </div>
            <button type="button" class="open-record" (click)="openRecord(node)">Open record</button>
            <p class="interaction-help">Double-click any node to open its RiskSpectrum-style record dialog.</p>
          </ng-container>

          <ng-template #noSelection>
            <div class="empty">Select a gate, Basic Event, House Event or transfer in the diagram.</div>
          </ng-template>
        </aside>
      </div>

      <section class="fault-tree-browser">
        <div class="browser-title">
          <strong>Fault Trees in project (3)</strong>
          <span>Click a row to display that Fault Tree in the active workspace.</span>
        </div>
        <div class="ft-table-wrap">
          <table class="ft-table" aria-label="Fault Trees in project">
            <thead>
              <tr>
                <th scope="col">ID Fault Tree</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let tree of projectFaultTrees()"
                [class.selected]="tree.id === repository.faultTree().id"
                tabindex="0"
                (click)="selectFaultTree(tree)"
                (keydown.enter)="selectFaultTree(tree)"
                (keydown.space)="selectFaultTree(tree)">
                <td class="ft-id">{{ tree.id }}</td>
                <td class="ft-description">{{ tree.description }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>

    <app-gate-record-dialog
      [gate]="openGate()"
      [directInputs]="dialogDirectInputs()"
      [basicEvents]="dialogBasicEvents()"
      (close)="closeGate()"
      (openBasicEvent)="openBasicEventRecord($event)">
    </app-gate-record-dialog>

    <app-basic-event-record-dialog
      [event]="openBasicEvent()"
      (close)="openBasicEvent.set(null)"
      (save)="saveBasicEvent($event)">
    </app-basic-event-record-dialog>

    <app-change-node-event-dialog
      [node]="changeNodeTarget()"
      [candidates]="changeNodeCandidates()"
      (close)="closeChangeNode()"
      (apply)="applyChangeNode($event)">
    </app-change-node-event-dialog>
  `,
  styles: [`
    :host { display: block; height: 100%; min-height: 0; }
    .feature-page { height: 100%; display: grid; grid-template-rows: auto auto minmax(390px, 1fr) 190px; min-height: 0; }
    .feature-header { min-height: 74px; padding: 13px 18px; display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 1px solid var(--nps-border); background: #fff; }
    .breadcrumb { font-size: 10px; color: var(--nps-text-muted); margin-bottom: 5px; }
    h1 { margin: 0; font-size: 17px; letter-spacing: -.01em; }
    .header-actions { display: flex; gap: 7px; }
    .header-actions button, .open-record { height: 32px; border: 1px solid var(--nps-border); border-radius: 8px; background: #fff; color: var(--nps-text); padding: 0 11px; font-size: 10px; cursor: pointer; }
    .header-actions button.primary, .open-record { background: var(--nps-blue); color: #fff; border-color: var(--nps-blue); }

    .workspace-tabs { min-height: 42px; display: flex; align-items: flex-end; gap: 4px; padding: 0 10px; background: #f3f7fb; border-bottom: 1px solid var(--nps-border); overflow-x: auto; }
    .workspace-tab { height: 36px; display: flex; align-items: stretch; border: 1px solid transparent; border-radius: 7px 7px 0 0; overflow: hidden; flex: 0 0 auto; }
    .workspace-tab.active { background: #fff; border-color: var(--nps-border); border-bottom-color: #fff; }
    .workspace-select, .workspace-close { border: 0; background: transparent; cursor: pointer; font: inherit; }
    .workspace-select { min-width: 150px; padding: 0 10px 0 12px; color: var(--nps-text-muted); font-size: 10px; text-align: left; }
    .workspace-tab.active .workspace-select { color: var(--nps-text); font-weight: 700; }
    .workspace-close { width: 28px; color: #7b8da1; font-size: 16px; }
    .workspace-close:hover:not(:disabled) { background: #fee2e2; color: #b91c1c; }
    .workspace-close:disabled { opacity: .25; cursor: default; }

    .editor-grid { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 290px; background: var(--nps-app-bg); }
    .diagram-panel { min-width: 0; min-height: 0; border-right: 1px solid var(--nps-border); }
    .properties-panel { background: #fff; overflow: auto; min-width: 0; }
    .dock-title { height: 44px; display: flex; align-items: center; justify-content: space-between; padding: 0 13px; border-bottom: 1px solid var(--nps-border); font-size: 11px; }
    .dock-title span { color: var(--nps-text-muted); font-size: 9px; }
    .property-section { padding: 13px; border-bottom: 1px solid var(--nps-border); }
    .property-section h3 { margin: 0 0 9px; color: var(--nps-text-muted); font-size: 9px; letter-spacing: .07em; text-transform: uppercase; }
    .property-row { display: grid; grid-template-columns: 92px 1fr; gap: 8px; padding: 6px 0; font-size: 10px; }
    .property-row span { color: var(--nps-text-muted); }
    .property-row strong { overflow-wrap: anywhere; }
    .open-record { margin: 13px; }
    .interaction-help, .empty { margin: 0 13px 13px; color: var(--nps-text-muted); font-size: 10px; line-height: 1.5; }
    .empty { padding: 16px 0; }

    .fault-tree-browser { min-height: 0; background: #fff; border-top: 1px solid var(--nps-border); overflow: hidden; }
    .browser-title { height: 38px; display: flex; align-items: center; gap: 12px; padding: 0 12px; border-bottom: 1px solid var(--nps-border); }
    .browser-title strong { font-size: 10px; }
    .browser-title span { color: var(--nps-text-muted); font-size: 9px; }
    .ft-table-wrap { height: calc(100% - 38px); overflow: auto; background: #fff; }
    .ft-table { width: 100%; border-collapse: collapse; table-layout: fixed; background: #fff; color: #111827; }
    .ft-table th, .ft-table td { height: 38px; padding: 0 14px; border-bottom: 1px solid #dfe6ee; border-right: 1px solid #dfe6ee; text-align: left; vertical-align: middle; font-size: 11px; color: #111827; background: transparent; opacity: 1; visibility: visible; }
    .ft-table th:last-child, .ft-table td:last-child { border-right: 0; }
    .ft-table th:first-child, .ft-table td:first-child { width: 160px; }
    .ft-table thead th { position: sticky; top: 0; z-index: 3; background: #f3f6fa; color: #1f2937; font-weight: 800; }
    .ft-table tbody tr { cursor: pointer; background: #fff; }
    .ft-table tbody tr:hover { background: #f6f9fd; }
    .ft-table tbody tr.selected { background: #edf4ff; box-shadow: inset 3px 0 0 var(--nps-blue); }
    .ft-table tbody tr.selected .ft-id { color: var(--nps-blue); font-weight: 800; }
    .ft-id { font-weight: 700; }
    .ft-description { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    @media (max-width: 1150px) {
      .editor-grid { grid-template-columns: minmax(0, 1fr) 250px; }
      .workspace-select { min-width: 132px; }
    }
  `]
})
export class FaultTreePageComponent {
  readonly projectFaultTrees = computed(() => this.repository.faultTrees().slice(0, 3));
  readonly selectedNode = signal<FaultTreeNodeData | null>(null);
  readonly openGate = signal<GateRecord | null>(null);
  readonly openBasicEvent = signal<BasicEventRecord | null>(null);
  readonly changeNodeTarget = signal<FaultTreeNodeData | null>(null);

  readonly selectedDirectInputs = computed(() => this.directInputsFor(this.selectedNode()?.id));
  readonly selectedBasicEvents = computed(() => {
    const node = this.selectedNode();
    return node && (node.category === 'GATE' || node.category === 'TOP_EVENT')
      ? this.repository.childBasicEvents(node.id)
      : [];
  });

  readonly dialogDirectInputs = computed(() => this.directInputsFor(this.openGate()?.id));
  readonly dialogBasicEvents = computed(() => {
    const gate = this.openGate();
    return gate ? this.repository.childBasicEvents(gate.id) : [];
  });

  readonly changeNodeCandidates = computed(() =>
    this.repository.replacementCandidates(this.changeNodeTarget())
  );

  constructor(
    readonly repository: MockPsaRepository,
    readonly workspaceService: FaultTreeWorkspaceService
  ) {
    effect(() => {
      const workspace = this.workspaceService.activeWorkspace();
      if (!workspace) return;
      this.repository.selectFaultTree(workspace.faultTreeId);
      this.selectedNode.set(null);
    });
  }

  activateWorkspace(id: number): void {
    this.workspaceService.activateWorkspace(id);
    const workspace = this.workspaceService.activeWorkspace();
    if (workspace) this.repository.selectFaultTree(workspace.faultTreeId);
    this.selectedNode.set(null);
  }

  closeWorkspace(event: MouseEvent, id: number): void {
    event.stopPropagation();
    this.workspaceService.closeWorkspace(id);
    const workspace = this.workspaceService.activeWorkspace();
    if (workspace) this.repository.selectFaultTree(workspace.faultTreeId);
    this.selectedNode.set(null);
  }

  selectFaultTree(tree: FaultTreeModel): void {
    this.workspaceService.setActiveFaultTree(tree.id);
    this.repository.selectFaultTree(tree.id);
    this.selectedNode.set(null);
  }

  onSelection(node: FaultTreeNodeData | null): void {
    this.selectedNode.set(node);
  }

  openRecord(node: FaultTreeNodeData): void {
    if (node.recordType === 'GAT') {
      this.openGate.set(this.repository.gateRecord(node.id) ?? null);
      return;
    }
    if (node.recordType === 'BEV') {
      this.openBasicEvent.set(this.repository.basicEvent(node.id) ?? null);
    }
  }

  closeGate(): void {
    this.openGate.set(null);
  }

  openBasicEventRecord(event: BasicEventRecord): void {
    this.openBasicEvent.set(event);
  }

  saveBasicEvent(event: BasicEventRecord): void {
    this.repository.updateBasicEvent(event);
    this.openBasicEvent.set(this.repository.basicEvent(event.id) ?? null);
  }

  openChangeNode(node: FaultTreeNodeData): void {
    this.changeNodeTarget.set(node);
  }

  closeChangeNode(): void {
    this.changeNodeTarget.set(null);
  }

  applyChangeNode(replacementId: string): void {
    const target = this.changeNodeTarget();
    if (!target) return;
    this.repository.changeFaultTreeNodeReference(target.key, replacementId);
    this.changeNodeTarget.set(null);
  }

  private directInputsFor(parentId: string | undefined): FaultTreeNodeData[] {
    if (!parentId) return [];
    const model = this.repository.faultTree();
    const parentNode = model.nodes.find((node) => node.id === parentId);
    const parentKey = parentNode?.key ?? parentId;
    const childKeys = new Set(
      model.links.filter((link) => link.from === parentKey).map((link) => link.to)
    );
    return model.nodes.filter((node) => childKeys.has(node.key));
  }
}
