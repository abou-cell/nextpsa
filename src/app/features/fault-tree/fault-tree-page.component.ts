import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { BasicEventRecord, FaultTreeNodeData, GateRecord } from '../../core/models/psa.models';
import { MockPsaRepository } from '../../core/data/mock-psa.repository';
import { FaultTreeEditorComponent } from '../../gojs/fault-tree/fault-tree-editor.component';
import { GateRecordDialogComponent } from './gate-record-dialog.component';
import { BasicEventRecordDialogComponent } from '../data/basic-event-record-dialog.component';
import { ChangeNodeEventDialogComponent } from './change-node-event-dialog.component';

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
        <button class="active">Fault Tree Workspace</button>
        <button>{{ repository.faultTree().id }} ×</button>
        <button>+</button>
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

      <section class="bottom-dock">
        <nav>
          <button class="active">Validation ({{ repository.validationIssues().length }})</button>
          <button>Messages</button>
          <button>Find Results</button>
          <button>Analysis Log</button>
        </nav>
        <div class="issues">
          <div *ngFor="let issue of repository.validationIssues()" class="issue" [attr.data-severity]="issue.severity">
            <span class="severity">{{ issue.severity }}</span>
            <strong>{{ issue.id }}</strong>
            <span>{{ issue.message }}</span>
            <span class="location">{{ issue.recordId }}</span>
          </div>
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
    .feature-page { height: 100%; display: grid; grid-template-rows: auto auto minmax(420px, 1fr) 142px; min-height: 0; }
    .feature-header { min-height: 74px; padding: 13px 18px; display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 1px solid var(--nps-border); background: #fff; }
    .breadcrumb { font-size: 10px; color: var(--nps-text-muted); margin-bottom: 5px; }
    h1 { margin: 0; font-size: 17px; letter-spacing: -.01em; }
    .header-actions { display: flex; gap: 7px; }
    .header-actions button, .open-record { height: 32px; border: 1px solid var(--nps-border); border-radius: 8px; background: #fff; color: var(--nps-text); padding: 0 11px; font-size: 10px; cursor: pointer; }
    .header-actions button.primary, .open-record { background: var(--nps-blue); color: #fff; border-color: var(--nps-blue); }
    .workspace-tabs { height: 38px; display: flex; align-items: flex-end; gap: 2px; padding: 0 10px; background: #f3f7fb; border-bottom: 1px solid var(--nps-border); }
    .workspace-tabs button { height: 33px; border: 0; border-radius: 7px 7px 0 0; background: transparent; color: var(--nps-text-muted); font-size: 10px; padding: 0 13px; }
    .workspace-tabs button.active { background: #fff; color: var(--nps-text); border: 1px solid var(--nps-border); border-bottom-color: #fff; font-weight: 700; }
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
    .bottom-dock { min-height: 0; background: #fff; border-top: 1px solid var(--nps-border); overflow: hidden; }
    .bottom-dock nav { height: 34px; display: flex; align-items: end; gap: 2px; padding: 0 10px; border-bottom: 1px solid var(--nps-border); }
    .bottom-dock nav button { height: 30px; border: 0; background: transparent; color: var(--nps-text-muted); font-size: 9px; padding: 0 10px; }
    .bottom-dock nav button.active { color: var(--nps-blue); border-bottom: 2px solid var(--nps-blue); font-weight: 700; }
    .issues { overflow: auto; height: calc(100% - 34px); }
    .issue { display: grid; grid-template-columns: 70px 62px 1fr 110px; gap: 8px; align-items: center; min-height: 32px; padding: 4px 12px; border-bottom: 1px solid #eef2f7; font-size: 9px; }
    .severity { font-weight: 800; }
    .issue[data-severity="ERROR"] .severity { color: #b91c1c; }
    .issue[data-severity="WARNING"] .severity { color: #a16207; }
    .issue[data-severity="INFO"] .severity { color: #1d4ed8; }
    .location { color: var(--nps-text-muted); }
    @media (max-width: 1150px) { .editor-grid { grid-template-columns: minmax(0, 1fr) 250px; } }
  `]
})
export class FaultTreePageComponent {
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

  constructor(readonly repository: MockPsaRepository) {}

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
    const childKeys = new Set(
      model.links.filter((link) => link.from === parentId).map((link) => link.to)
    );
    return model.nodes.filter((node) => childKeys.has(node.key));
  }
}
