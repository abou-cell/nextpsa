import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BasicEventRecord, ReliabilityModelType } from '../../core/models/psa.models';

type BasicEventTab = 'main' | 'reliability' | 'uncertainty' | 'ccf' | 'conditional' | 'mux' | 'attributes' | 'memo' | 'history';

@Component({
  selector: 'app-basic-event-record-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dialog-backdrop" *ngIf="event">
      <section
        class="record-dialog"
        [class.moved]="windowPosition !== null"
        [style.left.px]="windowPosition?.x"
        [style.top.px]="windowPosition?.y"
        role="dialog"
        aria-modal="false">
        <header class="dialog-header" (pointerdown)="startDrag($event)">
          <div>
            <div class="eyebrow">Basic Event Record</div>
            <h2>{{ draft?.id }} · {{ draft?.description }}</h2>
          </div>
          <button
            type="button"
            class="icon-button"
            (pointerdown)="$event.stopPropagation()"
            (click)="close.emit()">×</button>
        </header>

        <nav class="record-tabs">
          <button *ngFor="let item of tabs" type="button"
            [class.active]="tab === item.key" (click)="tab = item.key">
            {{ item.label }}
          </button>
        </nav>

        <div class="dialog-body" *ngIf="draft as current">
          <ng-container [ngSwitch]="tab">
            <div *ngSwitchCase="'main'" class="form-grid">
              <label>ID <input [(ngModel)]="current.id" disabled></label>
              <label>Description <input [(ngModel)]="current.description"></label>
              <label>Symbol
                <select [(ngModel)]="current.symbol">
                  <option value="CIRCLE">Circle</option>
                  <option value="DIAMOND">Diamond</option>
                </select>
              </label>
              <label>State
                <select [(ngModel)]="current.state">
                  <option value="NORMAL">Normal</option>
                  <option value="TRUE">True</option>
                  <option value="FALSE">False</option>
                </select>
              </label>
              <label>System <input [(ngModel)]="current.systemId"></label>
              <label>Component <input [(ngModel)]="current.componentId"></label>
            </div>

            <div *ngSwitchCase="'reliability'">
              <div class="form-grid">
                <label>Reliability model
                  <select [(ngModel)]="current.reliabilityModel">
                    <option *ngFor="let item of reliabilityModels" [ngValue]="item.value">{{ item.label }}</option>
                  </select>
                </label>
                <label>Sequence MTTR <input [(ngModel)]="current.sequenceMttrId" placeholder="e.g. MTTR-20"></label>
              </div>
              <h3>Parameter references</h3>
              <table>
                <thead><tr><th>Code</th><th>Parameter ID</th><th>Mean</th><th>Unit</th></tr></thead>
                <tbody>
                  <tr *ngFor="let parameter of current.parameterRefs">
                    <td>{{ parameter.code }}</td>
                    <td>{{ parameter.parameterId }}</td>
                    <td><input type="number" [(ngModel)]="parameter.mean" step="0.000001"></td>
                    <td>{{ parameter.unit ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div *ngSwitchCase="'uncertainty'" class="empty-state">
              Detailed Lognormal / Beta / Gamma / Normal / Uniform / Log-uniform / Discrete / Linear Interpolation editor is scheduled for the Data phase.
            </div>

            <div *ngSwitchCase="'ccf'">
              <div class="tag-list">
                <span *ngFor="let group of current.ccfGroupIds">{{ group }}</span>
                <span *ngIf="!current.ccfGroupIds.length">No CCF group</span>
              </div>
            </div>

            <div *ngSwitchCase="'conditional'" class="empty-state">No conditional probability configured.</div>
            <div *ngSwitchCase="'mux'" class="empty-state">No MUX set configured.</div>

            <div *ngSwitchCase="'attributes'" class="tag-list">
              <span *ngFor="let attribute of current.attributes">{{ attribute }}</span>
            </div>

            <div *ngSwitchCase="'memo'" class="empty-state">{{ current.memo || 'No memo.' }}</div>

            <div *ngSwitchCase="'history'" class="timeline">
              <strong>v{{ current.audit.version }}</strong>
              <span>Updated by {{ current.audit.updatedBy }} · {{ current.audit.updatedAt }}</span>
            </div>
          </ng-container>
        </div>

        <footer class="dialog-footer">
          <span class="version" *ngIf="draft">Record version v{{ draft.audit.version }}</span>
          <button type="button" (click)="close.emit()">Cancel</button>
          <button type="button" class="primary" (click)="saveCurrent()">Save Basic Event</button>
        </footer>
      </section>
    </div>
  `,
  styles: [`
    .dialog-backdrop { position: fixed; inset: 0; z-index: 120; pointer-events: none; }
    .record-dialog {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(940px, 84vw);
      height: min(640px, 80vh);
      min-width: 440px;
      min-height: 300px;
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 16px);
      resize: both;
      pointer-events: auto;
      background: #fff;
      border: 1px solid var(--nps-border);
      border-radius: 8px;
      box-shadow: 0 10px 28px rgba(15, 23, 42, .18);
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      overflow: hidden;
    }
    .record-dialog.moved { transform: none; }
    .dialog-header { padding: 10px 12px; background: #f8fafc; color: var(--nps-text); display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; touch-action: none; border-bottom: 1px solid var(--nps-border); }
    .dialog-header h2 { margin: 2px 0 0; font-size: 13px; font-weight: 700; }
    .eyebrow { font-size: 9px; text-transform: uppercase; letter-spacing: .07em; color: var(--nps-text-muted); }
    .icon-button { width: 28px; height: 26px; padding: 0; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #64748b; font-size: 18px; line-height: 1; cursor: pointer; }
    .icon-button:hover { background: #fee2e2; border-color: #fecaca; color: #b91c1c; }
    .record-tabs { display: flex; overflow-x: auto; padding: 0 10px; border-bottom: 1px solid var(--nps-border); background: #fff; }
    .record-tabs button { border: 0; background: transparent; padding: 9px 10px; color: var(--nps-text-muted); border-bottom: 2px solid transparent; font-size: 10px; white-space: nowrap; cursor: pointer; }
    .record-tabs button.active { color: var(--nps-blue); border-color: var(--nps-blue); font-weight: 700; }
    .dialog-body { overflow: auto; padding: 20px; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    label { display: grid; gap: 6px; color: var(--nps-text-muted); font-size: 10px; font-weight: 700; }
    input, select { width: 100%; height: 36px; border: 1px solid var(--nps-border); border-radius: 8px; padding: 0 10px; background: #fff; color: var(--nps-text); font: 500 11px Inter, sans-serif; }
    input:disabled { background: #f1f5f9; color: #64748b; }
    h3 { margin: 24px 0 10px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--nps-border); }
    th { background: #f8fbff; color: var(--nps-text-muted); }
    td input { height: 30px; }
    .empty-state { padding: 20px; border: 1px dashed #cbd5e1; border-radius: 10px; color: var(--nps-text-muted); font-size: 11px; }
    .tag-list { display: flex; gap: 8px; flex-wrap: wrap; }
    .tag-list span { padding: 7px 10px; border: 1px solid #bfdbfe; border-radius: 999px; color: #1d4ed8; background: #eff6ff; font-size: 11px; }
    .timeline { display: flex; gap: 10px; padding: 14px; border: 1px solid var(--nps-border); border-radius: 9px; font-size: 11px; }
    .dialog-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--nps-border); background: #f8fafc; }
    .version { margin-right: auto; color: var(--nps-text-muted); font-size: 10px; }
    .dialog-footer button { border: 1px solid var(--nps-border); background: #fff; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
    .dialog-footer button.primary { background: var(--nps-blue); border-color: var(--nps-blue); color: #fff; }
  `]
})
export class BasicEventRecordDialogComponent implements OnChanges {
  windowPosition: { x: number; y: number } | null = null;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  @Input() event: BasicEventRecord | null = null;
  @Output() readonly close = new EventEmitter<void>();
  @Output() readonly save = new EventEmitter<BasicEventRecord>();

  draft: BasicEventRecord | null = null;
  tab: BasicEventTab = 'main';

  readonly tabs: readonly { key: BasicEventTab; label: string }[] = [
    { key: 'main', label: 'Main' },
    { key: 'reliability', label: 'Reliability' },
    { key: 'uncertainty', label: 'Uncertainty' },
    { key: 'ccf', label: 'CCF' },
    { key: 'conditional', label: 'Conditional Probability' },
    { key: 'mux', label: 'MUX' },
    { key: 'attributes', label: 'Attributes' },
    { key: 'memo', label: 'Memo' },
    { key: 'history', label: 'History' }
  ];

  readonly reliabilityModels: readonly { value: ReliabilityModelType; label: string }[] = [
    { value: 0, label: '0 · Undefined / import placeholder' },
    { value: 1, label: '1 · Monitored, Repairable Component' },
    { value: 2, label: '2 · Periodically Tested Component' },
    { value: 3, label: '3 · Probability / Constant Unavailability' },
    { value: 4, label: '4 · Component with Fixed Mission Time' },
    { value: 5, label: '5 · Constant Frequency' },
    { value: 6, label: '6 · Non-Repairable Component' },
    { value: 7, label: '7 · Definition by Other Basic Events' }
  ];

  startDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    const header = event.currentTarget as HTMLElement | null;
    const dialog = header?.closest('.record-dialog') as HTMLElement | null;
    if (!dialog) return;

    event.preventDefault();
    const rect = dialog.getBoundingClientRect();
    this.windowPosition = { x: rect.left, y: rect.top };
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    this.dragging = true;
    header?.setPointerCapture?.(event.pointerId);
  }

  @HostListener('window:pointermove', ['$event'])
  onDrag(event: PointerEvent): void {
    if (!this.dragging) return;
    const dialog = document.querySelector('app-basic-event-record-dialog .record-dialog') as HTMLElement | null;
    if (!dialog) return;

    const width = dialog.offsetWidth;
    const height = dialog.offsetHeight;
    const x = Math.max(0, Math.min(window.innerWidth - width, event.clientX - this.dragOffsetX));
    const y = Math.max(0, Math.min(window.innerHeight - height, event.clientY - this.dragOffsetY));
    this.windowPosition = { x: Math.round(x), y: Math.round(y) };
  }

  @HostListener('window:pointerup')
  stopDrag(): void {
    this.dragging = false;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['event']) {
      this.draft = this.event
        ? {
            ...this.event,
            attributes: [...this.event.attributes],
            ccfGroupIds: [...this.event.ccfGroupIds],
            muxSetIds: [...this.event.muxSetIds],
            parameterRefs: this.event.parameterRefs.map((parameter) => ({ ...parameter })),
            audit: { ...this.event.audit }
          }
        : null;
      this.tab = 'main';
      this.windowPosition = null;
    }
  }

  saveCurrent(): void {
    if (this.draft) this.save.emit(this.draft);
  }
}
