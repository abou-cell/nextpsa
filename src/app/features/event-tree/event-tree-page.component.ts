import { CommonModule } from '@angular/common';
import { Component, HostListener, ViewChild, signal } from '@angular/core';
import { Router } from '@angular/router';
import { EventTreeEditorComponent } from '../../gojs/event-tree/event-tree-editor.component';
import { EventTreeRepository } from './event-tree.repository';
import { EventTreeModel } from './event-tree.models';

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
            (addFunctionEvent)="addFunctionEvent()"
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

        <section class="event-tree-browser">
          <div class="et-table-wrap">
            <table class="et-table" aria-label="Event Trees in project">
              <thead>
                <tr>
                  <th>ID Event Tree</th>
                  <th>Description</th>
                  <th>Initiating Event</th>
                  <th>No. Function Events</th>
                  <th>Edited date</th>
                  <th>Edited by</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let tree of repository.eventTrees()"
                  [class.selected]="tree.id === repository.eventTree().id"
                  (click)="selectEventTree(tree)">
                  <td class="et-id">{{ tree.id }}</td>
                  <td>{{ tree.description }}</td>
                  <td>{{ tree.initiatingEvent }}</td>
                  <td>{{ tree.functionEvents.length }}</td>
                  <td>{{ tree.editedDate }}</td>
                  <td>{{ tree.editedBy }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="browser-footer">
            <strong>Event Trees in project ({{ repository.eventTrees().length }})</strong>
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

    .event-tree-browser { min-height:0; display:grid; grid-template-rows:minmax(0,1fr) 24px; background:#fff; overflow:hidden; }
    .et-table-wrap { min-height:0; overflow:auto; }
    .et-table { width:100%; border-collapse:collapse; table-layout:fixed; color:#111827; font-size:10px; }
    .et-table th, .et-table td { height:25px; padding:0 10px; border-right:1px solid #dfe6ee; border-bottom:1px solid #dfe6ee; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .et-table th { position:sticky; top:0; z-index:2; background:#f3f6fa; font-weight:800; }
    .et-table th:nth-child(1) { width:130px; }
    .et-table th:nth-child(4) { width:130px; }
    .et-table th:nth-child(5) { width:115px; }
    .et-table th:nth-child(6) { width:90px; }
    .et-table tbody tr { cursor:pointer; }
    .et-table tbody tr:hover { background:#f6f9fd; }
    .et-table tbody tr.selected { background:#edf4ff; box-shadow:inset 3px 0 0 var(--nps-blue); }
    .et-id { font-weight:700; color:#0f5bd8; }
    .browser-footer { display:flex; align-items:center; min-height:24px; padding:0 8px; border-top:1px solid var(--nps-border); background:#f8fafc; }
    .browser-footer strong { font-size:9px; }
  `]
})
export class EventTreePageComponent {
  @ViewChild('eventTreeEditor') private eventTreeEditor?: EventTreeEditorComponent;

  readonly browserHeight = signal(165);
  isResizingBrowser = false;
  private resizeStartY = 0;
  private resizeStartHeight = 165;

  constructor(
    readonly repository: EventTreeRepository,
    private readonly router: Router
  ) {}

  openFaultTreeWorkspace(): void {
    void this.router.navigate(['/model/fault-tree/PTR-LOPC']);
  }

  selectEventTree(tree: EventTreeModel): void {
    this.repository.selectEventTree(tree.id);
    requestAnimationFrame(() => this.eventTreeEditor?.fit());
  }

  addFunctionEvent(): void {
    this.repository.addFunctionEvent(this.repository.eventTree().id);
    requestAnimationFrame(() => this.eventTreeEditor?.fit());
  }

  addBranch(fromKey: string): void {
    this.repository.addBranch(this.repository.eventTree().id, fromKey);
    requestAnimationFrame(() => this.eventTreeEditor?.fit());
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
  onResize(event: PointerEvent): void {
    if (!this.isResizingBrowser) return;
    const delta = this.resizeStartY - event.clientY;
    const maxHeight = Math.max(120, Math.min(420, window.innerHeight * 0.48));
    this.browserHeight.set(Math.round(Math.max(100, Math.min(maxHeight, this.resizeStartHeight + delta))));
  }

  @HostListener('window:pointerup')
  stopResize(): void {
    if (!this.isResizingBrowser) return;
    this.isResizingBrowser = false;
    requestAnimationFrame(() => this.eventTreeEditor?.fit());
  }
}
