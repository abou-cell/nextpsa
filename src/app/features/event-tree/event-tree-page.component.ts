import { CommonModule } from '@angular/common';
import { Component, HostListener, ViewChild, signal } from '@angular/core';
import { Router } from '@angular/router';
import { EventTreeEditorComponent } from '../../gojs/event-tree/event-tree-editor.component';
import { EventTreeRepository } from './event-tree.repository';
import { EventTreeModel } from './event-tree.models';
import { reorderFunctionEvent } from './event-tree-reorder';

interface FunctionEventReorderDetail {
  treeId: string;
  fromIndex: number;
  toIndex: number;
}

@Component({
  selector: 'app-event-tree-page',
  standalone: true,
  imports: [CommonModule, EventTreeEditorComponent],
  template: `
    <section class="feature-page">
      <div class="workspace-tabs">
        <button type="button" class="workspace-tab" (click)="openFaultTreeWorkspace()">
          Fault Tree Workspace
        </button>
        <button type="button" class="workspace-tab active">
          Event Tree Workspace
        </button>

        <div class="workspace-actions">
          <button type="button">Validate</button>
          <button type="button" class="primary">Save model</button>
        </div>
      </div>

      <div
        class="workspace-body"
        [style.grid-template-rows]="'minmax(0, 1fr) 8px ' + browserHeight() + 'px'">

        <main class="editor-panel">
          <app-event-tree-editor
            #eventTreeEditor
            [model]="repository.eventTree()"
            [canUndo]="repository.canUndo()"
            [canRedo]="repository.canRedo()"
            (undoRequested)="undo()"
            (redoRequested)="redo()"
            (addFunctionEvent)="addFunctionEvent()"
            (removeFunctionEvent)="removeFunctionEvent()"
            (addBranch)="addBranch($event)">
          </app-event-tree-editor>
        </main>

        <div
          class="browser-resizer"
          [class.dragging]="isResizingBrowser"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize Event Tree list"
          title="Drag to resize Event Tree list"
          (pointerdown)="startBrowserResize($event)">
          <span></span>
        </div>

        <section class="event-tree-browser-panel">
          <div class="et-table-wrap">
            <table
              class="et-table"
              aria-label="Event Trees in project"
              [style.min-width.px]="tableMinWidth()">
              <colgroup>
                <col *ngFor="let width of columnWidths(); let i = index" [style.width.px]="width">
              </colgroup>
              <thead>
                <tr>
                  <th *ngFor="let title of columnTitles; let i = index" scope="col">
                    {{ title }}
                    <span
                      class="column-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      title="Drag to resize column; double-click to reset"
                      (pointerdown)="startColumnResize($event, i)"
                      (dblclick)="resetColumnWidth(i)"></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let tree of repository.eventTrees()"
                  [class.selected]="isTableRowSelected(tree.id)"
                  [class.tagged]="!!tree.tagColor"
                  [style.background-color]="tree.tagColor || null"
                  [style.height.px]="rowHeight(tree.id)"
                  tabindex="0"
                  (click)="selectEventTree(tree, $event)"
                  (keydown.enter)="selectEventTree(tree)"
                  (keydown.space)="selectEventTree(tree)">
                  <td class="et-id">
                    {{ tree.id }}
                    <span class="row-resizer" title="Drag to resize row; double-click to reset"
                      (pointerdown)="startRowResize($event, tree.id)"
                      (dblclick)="resetRowHeight(tree.id)"></span>
                  </td>
                  <td>
                    {{ tree.description }}
                    <span class="row-resizer"
                      (pointerdown)="startRowResize($event, tree.id)"
                      (dblclick)="resetRowHeight(tree.id)"></span>
                  </td>
                  <td>
                    {{ tree.initiatingEvent }}
                    <span class="row-resizer"
                      (pointerdown)="startRowResize($event, tree.id)"
                      (dblclick)="resetRowHeight(tree.id)"></span>
                  </td>
                  <td>
                    {{ tree.functionEvents.length }}
                    <span class="row-resizer"
                      (pointerdown)="startRowResize($event, tree.id)"
                      (dblclick)="resetRowHeight(tree.id)"></span>
                  </td>
                  <td>
                    {{ tree.editedDate }}
                    <span class="row-resizer"
                      (pointerdown)="startRowResize($event, tree.id)"
                      (dblclick)="resetRowHeight(tree.id)"></span>
                  </td>
                  <td>
                    {{ tree.editedBy }}
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
              Event Trees in project ({{ repository.eventTrees().length }})
              <span class="tagged-count">No of tagged records = {{ taggedEventTreeCount() }}</span>
            </strong>
            <span class="browser-hint">Select row(s) · Alt+T = tag · drag borders to resize cells</span>
          </div>
        </section>
      </div>
    </section>
  `,
  styles: [`
    :host { display:block; height:100%; min-height:0; }
    .feature-page { height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr); background:#fff; }
    .workspace-tabs { min-height:42px; display:flex; align-items:flex-end; gap:4px; padding:0 10px; background:#f3f7fb; border-bottom:1px solid var(--nps-border); overflow-x:auto; }
    .workspace-tab { height:36px; min-width:150px; padding:0 12px; border:1px solid transparent; border-radius:7px 7px 0 0; background:transparent; color:var(--nps-text-muted); font:inherit; font-size:10px; text-align:left; cursor:pointer; }
    .workspace-tab.active { background:#fff; color:var(--nps-text); border-color:var(--nps-border); border-bottom-color:#fff; font-weight:700; }
    .workspace-actions { margin-left:auto; display:flex; align-items:center; gap:7px; padding:0 6px 4px 12px; }
    .workspace-actions button { height:31px; border:1px solid var(--nps-border); border-radius:8px; background:#fff; color:var(--nps-text); padding:0 12px; font-size:10px; cursor:pointer; }
    .workspace-actions button.primary { background:var(--nps-blue); color:#fff; border-color:var(--nps-blue); }

    .workspace-body { min-height:0; display:grid; overflow:hidden; background:var(--nps-app-bg); }
    .editor-panel { min-width:0; min-height:0; overflow:hidden; background:#fff; }
    .browser-resizer { position:relative; z-index:8; cursor:row-resize; background:#eef3f8; border-top:1px solid #d5dee8; border-bottom:1px solid #d5dee8; touch-action:none; }
    .browser-resizer:hover, .browser-resizer.dragging { background:#dbeafe; }
    .browser-resizer span { position:absolute; left:50%; top:50%; width:42px; height:3px; border-radius:999px; background:#94a3b8; transform:translate(-50%,-50%); }
    .browser-resizer:hover span, .browser-resizer.dragging span { background:var(--nps-blue); }

    .event-tree-browser-panel { min-width:0; min-height:0; overflow:hidden; background:#fff; display:grid; grid-template-rows:minmax(0,1fr) 24px; }
    .et-table-wrap { min-height:0; overflow:auto; background:#fff; }
    .et-table { width:max-content; min-width:100%; border-collapse:collapse; table-layout:fixed; color:#111827; font-size:10px; }
    .et-table th, .et-table td { position:relative; height:25px; min-height:18px; padding:0 10px; border-right:1px solid #dfe6ee; border-bottom:1px solid #dfe6ee; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; box-sizing:border-box; }
    .et-table th { position:sticky; top:0; z-index:3; background:#f3f6fa; font-weight:800; user-select:none; }
    .et-table tbody tr { cursor:pointer; outline:none; }
    .et-table tbody tr:hover td { background-color:rgba(246,249,253,.72); }
    .et-table tbody tr.selected { box-shadow:inset 3px 0 0 var(--nps-blue); }
    .et-table tbody tr.selected td { outline:1px solid rgba(37,99,235,.32); outline-offset:-1px; }
    .et-table tbody tr:focus-visible td { outline:2px solid #2563eb; outline-offset:-2px; }
    .et-id { font-weight:700; color:#0f5bd8; }

    .column-resizer { position:absolute; top:0; right:-3px; width:7px; height:100%; z-index:5; cursor:col-resize; touch-action:none; }
    .column-resizer:hover { background:rgba(37,99,235,.22); }
    .row-resizer { position:absolute; left:0; bottom:-3px; width:100%; height:7px; z-index:4; cursor:row-resize; touch-action:none; }
    .row-resizer:hover { background:rgba(37,99,235,.18); }

    .browser-footer { display:flex; align-items:center; gap:10px; min-height:24px; padding:0 8px; border-top:1px solid var(--nps-border); background:#f8fafc; }
    .browser-footer strong { font-size:9px; }
    .tagged-count { margin-left:14px; color:#64748b; font-weight:600; }
    .browser-hint { margin-left:auto; color:#64748b; font-size:9px; white-space:nowrap; }
  `]
})
export class EventTreePageComponent {
  @ViewChild('eventTreeEditor') private eventTreeEditor?: EventTreeEditorComponent;

  readonly browserHeight = signal(165);
  readonly selectedTableRows = signal<Set<string>>(new Set());
  readonly columnWidths = signal<number[]>([130, 310, 230, 140, 115, 90]);
  readonly columnTitles = ['ID Event Tree', 'Description', 'Initiating Event', 'No. Function Events', 'Edited date', 'Edited by'];

  isResizingBrowser = false;
  private resizeStartY = 0;
  private resizeStartHeight = 165;

  private resizingColumnIndex: number | null = null;
  private columnResizeStartX = 0;
  private columnResizeStartWidth = 0;

  private resizingRowId: string | null = null;
  private rowResizeStartY = 0;
  private rowResizeStartHeight = 25;
  private readonly rowHeights = new Map<string, number>();

  constructor(
    readonly repository: EventTreeRepository,
    private readonly router: Router
  ) {
    this.selectedTableRows.set(new Set([this.repository.eventTree().id]));
  }

  openFaultTreeWorkspace(): void {
    void this.router.navigate(['/model/fault-tree/PTR-LOPC']);
  }

  selectEventTree(tree: EventTreeModel, event?: Event): void {
    event?.preventDefault();
    const mouseEvent = event as MouseEvent | undefined;
    const multi = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey);
    const next = new Set(this.selectedTableRows());

    if (multi) {
      if (next.has(tree.id)) next.delete(tree.id);
      else next.add(tree.id);
    } else {
      next.clear();
      next.add(tree.id);
    }

    this.selectedTableRows.set(next);

    // A table selection is an independent record selection. Clear any diagram
    // selection so Alt+T is routed to the selected Event Tree record(s).
    (this.eventTreeEditor as any)?.diagram?.clearSelection?.();

    this.repository.selectEventTree(tree.id);
    requestAnimationFrame(() => this.eventTreeEditor?.refreshLayout());
  }

  isTableRowSelected(id: string): boolean {
    return this.selectedTableRows().has(id);
  }

  taggedEventTreeCount(): number {
    return this.repository.eventTrees().filter((tree) => !!tree.tagColor).length;
  }

  tableMinWidth(): number {
    return this.columnWidths().reduce((sum, width) => sum + width, 0);
  }

  rowHeight(id: string): number {
    return this.rowHeights.get(id) ?? 25;
  }

  startColumnResize(event: PointerEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizingColumnIndex = index;
    this.columnResizeStartX = event.clientX;
    this.columnResizeStartWidth = this.columnWidths()[index] ?? 120;
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  resetColumnWidth(index: number): void {
    const defaults = [130, 310, 230, 140, 115, 90];
    const next = [...this.columnWidths()];
    next[index] = defaults[index];
    this.columnWidths.set(next);
  }

  startRowResize(event: PointerEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizingRowId = id;
    this.rowResizeStartY = event.clientY;
    this.rowResizeStartHeight = this.rowHeight(id);
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  resetRowHeight(id: string): void {
    this.rowHeights.delete(id);
  }

  undo(): void {
    this.repository.undo();
    requestAnimationFrame(() => this.eventTreeEditor?.refreshLayout());
  }

  redo(): void {
    this.repository.redo();
    requestAnimationFrame(() => this.eventTreeEditor?.refreshLayout());
  }

  addFunctionEvent(): void {
    this.repository.addFunctionEvent(this.repository.eventTree().id);
    requestAnimationFrame(() => this.eventTreeEditor?.refreshLayout());
  }

  removeFunctionEvent(): void {
    this.repository.removeFunctionEvent(this.repository.eventTree().id);
    requestAnimationFrame(() => this.eventTreeEditor?.refreshLayout());
  }

  addBranch(fromKey: string): void {
    this.repository.addBranch(this.repository.eventTree().id, fromKey);
    requestAnimationFrame(() => this.eventTreeEditor?.refreshLayout());
  }

  @HostListener('window:keydown', ['$event'])
  onTableTagShortcut(event: KeyboardEvent): void {
    if (!event.altKey || event.key.toLowerCase() !== 't') return;
    const selected = this.selectedTableRows();
    if (!selected.size) return;

    const color = ((this.eventTreeEditor as any)?.__eventTreeActiveTagColor as string | undefined) ?? '#fff200';
    this.repository.eventTrees().forEach((tree) => {
      if (selected.has(tree.id)) tree.tagColor = color;
    });

    // Force an Angular signal notification while keeping the same selection.
    this.selectedTableRows.set(new Set(selected));
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('window:nextpsa-et-reorder-function-event', ['$event'])
  onFunctionEventReorder(event: Event): void {
    const detail = (event as CustomEvent<FunctionEventReorderDetail>).detail;
    if (!detail || detail.treeId !== this.repository.eventTree().id) return;

    reorderFunctionEvent(this.repository, detail.treeId, detail.fromIndex, detail.toIndex);
    requestAnimationFrame(() => this.eventTreeEditor?.refreshLayout());
  }

  startBrowserResize(event: PointerEvent): void {
    event.preventDefault();
    this.isResizingBrowser = true;
    this.resizeStartY = event.clientY;
    this.resizeStartHeight = this.browserHeight();
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  @HostListener('window:pointermove', ['$event'])
  onResize(event: PointerEvent): void {
    if (this.resizingColumnIndex !== null) {
      const delta = event.clientX - this.columnResizeStartX;
      const next = [...this.columnWidths()];
      next[this.resizingColumnIndex] = Math.round(Math.max(55, Math.min(720, this.columnResizeStartWidth + delta)));
      this.columnWidths.set(next);
      return;
    }

    if (this.resizingRowId) {
      const delta = event.clientY - this.rowResizeStartY;
      const height = Math.round(Math.max(18, Math.min(180, this.rowResizeStartHeight + delta)));
      this.rowHeights.set(this.resizingRowId, height);
      // Signal update to refresh the table row height immediately.
      this.selectedTableRows.set(new Set(this.selectedTableRows()));
      return;
    }

    if (!this.isResizingBrowser) return;
    const delta = this.resizeStartY - event.clientY;
    const maxHeight = Math.max(120, Math.min(420, window.innerHeight * 0.48));
    this.browserHeight.set(Math.round(Math.max(100, Math.min(maxHeight, this.resizeStartHeight + delta))));
  }

  @HostListener('window:pointerup')
  stopResize(): void {
    const browserWasResizing = this.isResizingBrowser;
    this.isResizingBrowser = false;
    this.resizingColumnIndex = null;
    this.resizingRowId = null;
    if (browserWasResizing) requestAnimationFrame(() => this.eventTreeEditor?.refreshLayout());
  }
}
