import { CommonModule } from '@angular/common';
import { Component, HostListener, ViewChild, computed, effect, signal } from '@angular/core';
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
        <div class="workspace-actions">
          <button type="button">Validate</button>
          <button type="button" class="primary">Save model</button>
        </div>
      </div>

      <div
        class="workspace-body"
        [style.grid-template-rows]="'minmax(0, 1fr) 8px ' + browserHeight() + 'px'">
        <main class="diagram-panel">
          <app-fault-tree-editor
            #faultTreeEditor
            [model]="repository.faultTree()"
            (selectedNodeChange)="onSelection($event)"
            (recordOpen)="openRecord($event)"
            (changeNodeEvent)="openChangeNode($event)"
            (tagColorChange)="onEditorTagColorChange($event)">
          </app-fault-tree-editor>
        </main>

        <div
          class="browser-resizer"
          [class.dragging]="isResizingBrowser"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize Fault Tree list"
          title="Drag to resize the Fault Tree list"
          (pointerdown)="startBrowserResize($event)">
          <span></span>
        </div>

        <section class="fault-tree-browser-panel">
          <div class="ft-table-wrap">
            <table
              class="ft-table"
              aria-label="Fault Trees in project"
              [style.min-width.px]="tableMinWidth()">
              <colgroup>
                <col [style.width.px]="columnWidths()[0]">
                <col [style.width.px]="columnWidths()[1]">
                <col [style.width.px]="columnWidths()[2]">
                <col [style.width.px]="columnWidths()[3]">
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">
                    ID Fault Tree
                    <span class="column-resizer" role="separator" aria-orientation="vertical"
                      title="Drag to resize column; double-click to reset"
                      (pointerdown)="startColumnResize($event, 0)"
                      (dblclick)="resetColumnWidth(0)"></span>
                  </th>
                  <th scope="col">
                    Description
                    <span class="column-resizer" role="separator" aria-orientation="vertical"
                      title="Drag to resize column; double-click to reset"
                      (pointerdown)="startColumnResize($event, 1)"
                      (dblclick)="resetColumnWidth(1)"></span>
                  </th>
                  <th scope="col">
                    Edited date
                    <span class="column-resizer" role="separator" aria-orientation="vertical"
                      title="Drag to resize column; double-click to reset"
                      (pointerdown)="startColumnResize($event, 2)"
                      (dblclick)="resetColumnWidth(2)"></span>
                  </th>
                  <th scope="col">
                    Edited by
                    <span class="column-resizer" role="separator" aria-orientation="vertical"
                      title="Drag to resize column; double-click to reset"
                      (pointerdown)="startColumnResize($event, 3)"
                      (dblclick)="resetColumnWidth(3)"></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let tree of projectFaultTrees()"
                  [class.selected]="isTableRowSelected(tree.id)"
                  [class.tagged]="!!tree.tagColor"
                  [style.background-color]="tree.tagColor || null"
                  [style.height.px]="rowHeight(tree.id)"
                  tabindex="0"
                  (click)="selectFaultTree(tree, $event)"
                  (keydown.enter)="selectFaultTree(tree)"
                  (keydown.space)="selectFaultTree(tree)">
                  <td class="ft-id">
                    {{ tree.id }}
                    <span class="row-resizer"
                      title="Drag to resize row; double-click to reset"
                      (pointerdown)="startRowResize($event, tree.id)"
                      (dblclick)="resetRowHeight(tree.id)"></span>
                  </td>
                  <td class="ft-description">
                    {{ tree.description }}
                    <span class="row-resizer"
                      (pointerdown)="startRowResize($event, tree.id)"
                      (dblclick)="resetRowHeight(tree.id)"></span>
                  </td>
                  <td class="ft-edited-date">
                    01/10/2026
                    <span class="row-resizer"
                      (pointerdown)="startRowResize($event, tree.id)"
                      (dblclick)="resetRowHeight(tree.id)"></span>
                  </td>
                  <td class="ft-edited-by">
                    AR
                    <span class="row-resizer"
                      (pointerdown)="startRowResize($event, tree.id)"
                      (dblclick)="resetRowHeight(tree.id)"></span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="browser-footer">
            <strong>
              Fault Trees in project ({{ projectFaultTrees().length }})
              <span class="tagged-count">No of tagged records = {{ taggedFaultTreeCount() }}</span>
            </strong>
          </div>
        </section>
      </div>

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
    .feature-page { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
    .workspace-tabs { min-height: 42px; display: flex; align-items: flex-end; gap: 4px; padding: 0 10px; background: #f3f7fb; border-bottom: 1px solid var(--nps-border); overflow-x: auto; }
    .workspace-tab { height: 36px; display: flex; align-items: stretch; border: 1px solid transparent; border-radius: 7px 7px 0 0; overflow: hidden; flex: 0 0 auto; }
    .workspace-tab.active { background: #fff; border-color: var(--nps-border); border-bottom-color: #fff; }
    .workspace-select, .workspace-close { border: 0; background: transparent; cursor: pointer; font: inherit; }
    .workspace-select { min-width: 150px; padding: 0 10px 0 12px; color: var(--nps-text-muted); font-size: 10px; text-align: left; }
    .workspace-tab.active .workspace-select { color: var(--nps-text); font-weight: 700; }
    .workspace-close { width: 28px; color: #7b8da1; font-size: 16px; }
    .workspace-close:hover:not(:disabled) { background: #fee2e2; color: #b91c1c; }
    .workspace-close:disabled { opacity: .25; cursor: default; }
    .workspace-actions { margin-left: auto; display: flex; align-items: center; gap: 7px; padding: 0 6px 4px 12px; }
    .workspace-actions button { height: 31px; border: 1px solid var(--nps-border); border-radius: 8px; background: #fff; color: var(--nps-text); padding: 0 12px; font-size: 10px; cursor: pointer; }
    .workspace-actions button.primary { background: var(--nps-blue); color: #fff; border-color: var(--nps-blue); }

    .workspace-body { min-height: 0; display: grid; background: var(--nps-app-bg); overflow: hidden; }
    .diagram-panel { min-width: 0; min-height: 0; overflow: hidden; }
    .browser-resizer { position: relative; z-index: 8; cursor: row-resize; background: #eef3f8; border-top: 1px solid #d5dee8; border-bottom: 1px solid #d5dee8; touch-action: none; }
    .browser-resizer:hover, .browser-resizer.dragging { background: #dbeafe; }
    .browser-resizer span { position: absolute; left: 50%; top: 50%; width: 42px; height: 3px; border-radius: 999px; background: #94a3b8; transform: translate(-50%, -50%); }
    .browser-resizer:hover span, .browser-resizer.dragging span { background: var(--nps-blue); }
    .fault-tree-browser-panel { min-width: 0; min-height: 0; overflow: hidden; background: #fff; display: grid; grid-template-rows: minmax(0, 1fr) 24px; }
    .ft-table-wrap { min-height: 0; overflow: auto; background: #fff; }
    .browser-footer { display: flex; align-items: center; gap: 8px; min-height: 24px; padding: 0 8px; border-top: 1px solid var(--nps-border); background: #f8fafc; overflow: hidden; }
    .browser-footer strong { font-size: 9px; line-height: 1; color: var(--nps-text); white-space: nowrap; }
    .tagged-count { margin-left: 8px; color: var(--nps-text-muted); font-weight: 600; }
    .ft-table { width: 100%; border-collapse: collapse; table-layout: fixed; background: #fff; color: #111827; }
    .ft-table th, .ft-table td { position: relative; min-height: 24px; padding: 0 14px; border-bottom: 1px solid #dfe6ee; border-right: 1px solid #dfe6ee; text-align: left; vertical-align: middle; font-size: 11px; color: #111827; background: transparent; opacity: 1; visibility: visible; }
    .ft-table th { height: 38px; }
    .ft-table th:last-child, .ft-table td:last-child { border-right: 0; }
    .ft-table thead th { position: sticky; top: 0; z-index: 3; background: #f3f6fa; color: #1f2937; font-weight: 800; }
    .column-resizer { position: absolute; top: 0; right: -4px; z-index: 6; width: 8px; height: 100%; cursor: col-resize; touch-action: none; }
    .column-resizer::after { content: ''; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: transparent; }
    .column-resizer:hover::after { background: var(--nps-blue); }
    .row-resizer { position: absolute; left: 0; right: 0; bottom: -4px; z-index: 5; height: 8px; cursor: row-resize; touch-action: none; }
    .row-resizer::after { content: ''; position: absolute; left: 0; right: 0; top: 3px; height: 1px; background: transparent; }
    .row-resizer:hover::after { background: var(--nps-blue); }
    .ft-table tbody tr { cursor: pointer; background: #fff; }
    .ft-table tbody tr:hover { background: #f6f9fd; }
    .ft-table tbody tr.selected { outline: 1px solid #93c5fd; outline-offset: -1px; box-shadow: inset 3px 0 0 var(--nps-blue); background-image: linear-gradient(rgba(219,234,254,.42), rgba(219,234,254,.42)); }
    .ft-table tbody tr.selected .ft-id { color: var(--nps-blue); font-weight: 800; }
    .ft-table tbody tr.tagged td { font-weight: 600; }
    .ft-id { font-weight: 700; }
    .ft-description { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    @media (max-width: 1150px) {
      .workspace-select { min-width: 132px; }
    }
  `]
})
export class FaultTreePageComponent {
  @ViewChild('faultTreeEditor') private faultTreeEditor?: FaultTreeEditorComponent;

  readonly browserHeight = signal(178);
  readonly columnWidths = signal([180, 720, 140, 100]);
  readonly rowHeights = signal<Record<string, number>>({});
  readonly tableMinWidth = computed(() =>
    this.columnWidths().reduce((total, width) => total + width, 0)
  );

  isResizingBrowser = false;
  private resizeStartY = 0;
  private resizeStartHeight = 178;

  private activeColumnResize: number | null = null;
  private columnResizeStartX = 0;
  private columnResizeStartWidth = 0;

  private activeRowResizeId: string | null = null;
  private activeRowResizeIds: string[] = [];
  private rowResizeStartY = 0;
  private rowResizeStartHeight = 38;

  readonly projectFaultTrees = computed(() => this.repository.faultTrees().slice(0, 3));
  readonly taggedFaultTreeCount = computed(() =>
    this.projectFaultTrees().filter((tree) => !!tree.tagColor).length
  );
  readonly selectedTableTreeId = signal<string | null>(null);
  readonly selectedTableTreeIds = signal<string[]>([]);
  readonly tableTagColor = signal('#fff200');
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

  isTableRowSelected(treeId: string): boolean {
    return this.selectedTableTreeIds().includes(treeId);
  }

  rowHeight(treeId: string): number {
    return this.rowHeights()[treeId] ?? 38;
  }

  startColumnResize(event: PointerEvent, columnIndex: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.activeColumnResize = columnIndex;
    this.columnResizeStartX = event.clientX;
    this.columnResizeStartWidth = this.columnWidths()[columnIndex];

    const target = event.currentTarget as HTMLElement | null;
    target?.setPointerCapture?.(event.pointerId);
  }

  resetColumnWidth(columnIndex: number): void {
    const defaults = [180, 720, 140, 100];
    this.columnWidths.update((widths) =>
      widths.map((width, index) => index === columnIndex ? defaults[index] : width)
    );
  }

  startRowResize(event: PointerEvent, treeId: string): void {
    event.preventDefault();
    event.stopPropagation();

    const selectedIds = this.selectedTableTreeIds();
    this.activeRowResizeIds = selectedIds.includes(treeId) && selectedIds.length > 1
      ? [...selectedIds]
      : [treeId];

    this.activeRowResizeId = treeId;
    this.rowResizeStartY = event.clientY;
    this.rowResizeStartHeight = this.rowHeight(treeId);

    const target = event.currentTarget as HTMLElement | null;
    target?.setPointerCapture?.(event.pointerId);
  }

  resetRowHeight(treeId: string): void {
    const selectedIds = this.selectedTableTreeIds();
    const targetIds = selectedIds.includes(treeId) && selectedIds.length > 1
      ? selectedIds
      : [treeId];

    this.rowHeights.update((heights) => {
      const next = { ...heights };
      targetIds.forEach((id) => delete next[id]);
      return next;
    });
  }

  startBrowserResize(event: PointerEvent): void {
    event.preventDefault();
    this.isResizingBrowser = true;
    this.resizeStartY = event.clientY;
    this.resizeStartHeight = this.browserHeight();

    const target = event.currentTarget as HTMLElement | null;
    target?.setPointerCapture?.(event.pointerId);
  }

  @HostListener('window:pointermove', ['$event'])
  onBrowserResizeMove(event: PointerEvent): void {
    if (this.activeColumnResize !== null) {
      const index = this.activeColumnResize;
      const delta = event.clientX - this.columnResizeStartX;
      const minWidths = [100, 180, 105, 80];
      const maxWidth = index === 1 ? 1200 : 420;
      const nextWidth = Math.max(minWidths[index], Math.min(maxWidth, this.columnResizeStartWidth + delta));

      this.columnWidths.update((widths) =>
        widths.map((width, columnIndex) =>
          columnIndex === index ? Math.round(nextWidth) : width
        )
      );
      return;
    }

    if (this.activeRowResizeId) {
      const delta = event.clientY - this.rowResizeStartY;
      // Default row height is 38 px. Allow compression down to 23 px,
      // i.e. about -40%, while keeping the text and resize handle usable.
      const nextHeight = Math.max(23, Math.min(120, this.rowResizeStartHeight + delta));

      this.rowHeights.update((heights) => {
        const next = { ...heights };
        this.activeRowResizeIds.forEach((id) => {
          next[id] = Math.round(nextHeight);
        });
        return next;
      });
      return;
    }

    if (!this.isResizingBrowser) return;

    const delta = this.resizeStartY - event.clientY;
    const maxHeight = Math.max(120, Math.min(420, window.innerHeight * 0.48));
    const nextHeight = Math.max(96, Math.min(maxHeight, this.resizeStartHeight + delta));

    this.browserHeight.set(Math.round(nextHeight));
    requestAnimationFrame(() => this.faultTreeEditor?.refreshViewport());
  }

  @HostListener('window:pointerup')
  stopBrowserResize(): void {
    const resizedTable = this.activeColumnResize !== null || this.activeRowResizeId !== null;
    this.activeColumnResize = null;
    this.activeRowResizeId = null;
    this.activeRowResizeIds = [];

    if (this.isResizingBrowser) {
      this.isResizingBrowser = false;
      requestAnimationFrame(() => this.faultTreeEditor?.refreshViewport());
      return;
    }

    if (resizedTable) {
      requestAnimationFrame(() => this.faultTreeEditor?.refreshViewport());
    }
  }

  @HostListener('window:keydown', ['$event'])
  onTableTagShortcut(event: KeyboardEvent): void {
    if (!event.altKey || event.key.toLowerCase() !== 't') return;
    if (this.selectedNode()) return;

    const selectedIds = this.selectedTableTreeIds();
    const fallbackId = this.selectedTableTreeId();
    const targetIds = selectedIds.length
      ? selectedIds
      : (fallbackId ? [fallbackId] : []);

    if (!targetIds.length) return;

    event.preventDefault();
    event.stopPropagation();

    targetIds.forEach((treeId) =>
      this.repository.setFaultTreeTagColor(treeId, this.tableTagColor())
    );
  }

  onEditorTagColorChange(color: string): void {
    this.tableTagColor.set(color);
  }

  activateWorkspace(id: number): void {
    this.workspaceService.activateWorkspace(id);
    const workspace = this.workspaceService.activeWorkspace();
    if (workspace) this.repository.selectFaultTree(workspace.faultTreeId);
    this.selectedNode.set(null);
    this.selectedTableTreeId.set(null);
    this.selectedTableTreeIds.set([]);
  }

  closeWorkspace(event: MouseEvent, id: number): void {
    event.stopPropagation();
    this.workspaceService.closeWorkspace(id);
    const workspace = this.workspaceService.activeWorkspace();
    if (workspace) this.repository.selectFaultTree(workspace.faultTreeId);
    this.selectedNode.set(null);
    this.selectedTableTreeId.set(null);
    this.selectedTableTreeIds.set([]);
  }

  selectFaultTree(tree: FaultTreeModel, event?: MouseEvent): void {
    const multiSelect = !!event?.ctrlKey;

    if (multiSelect) {
      event?.preventDefault();
      event?.stopPropagation();

      this.selectedTableTreeIds.update((ids) =>
        ids.includes(tree.id)
          ? ids.filter((id) => id !== tree.id)
          : [...ids, tree.id]
      );
      this.selectedTableTreeId.set(tree.id);
      this.selectedNode.set(null);
      return;
    }

    this.selectedTableTreeIds.set([tree.id]);
    this.selectedTableTreeId.set(tree.id);
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
