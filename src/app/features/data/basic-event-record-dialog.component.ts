import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BasicEventRecord, ReliabilityModelType } from '../../core/models/psa.models';

type BasicEventTab = 'main' | 'reliability' | 'uncertainty' | 'ccf' | 'conditional' | 'mux' | 'attributes' | 'memo' | 'history';

@Component({
  selector: 'app-basic-event-record-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dialog-backdrop" *ngIf="event" (mousedown)="close.emit()">
      <section class="record-dialog" (mousedown)="$event.stopPropagation()" role="dialog" aria-modal="true">
        <header class="dialog-header">
          <div>
            <div class="eyebrow">Basic Event Record</div>
            <h2>{{ draft?.id }} · {{ draft?.description }}</h2>
          </div>
          <button type="button" class="icon-button" (click)="close.emit()">×</button>
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
    .dialog-backdrop { position: fixed; inset: 0; z-index: 120; background: rgba(7, 22, 40, .5); display: grid; place-items: center; padding: 28px; }
    .record-dialog { width: min(1060px, 94vw); height: min(720px, 88vh); background: #fff; border-radius: 14px; box-shadow: 0 28px 80px rgba(2, 12, 27, .28); display: grid; grid-template-rows: auto auto 1fr auto; overflow: hidden; }
    .dialog-header { padding: 16px 20px; background: var(--nps-topbar); color: #fff; display: flex; justify-content: space-between; align-items: center; }
    .dialog-header h2 { margin: 3px 0 0; font-size: 17px; }
    .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #b9d2ee; }
    .icon-button { border: 0; background: transparent; color: #fff; font-size: 24px; cursor: pointer; }
    .record-tabs { display: flex; overflow-x: auto; padding: 0 14px; border-bottom: 1px solid var(--nps-border); }
    .record-tabs button { border: 0; background: transparent; padding: 12px 13px; color: var(--nps-text-muted); border-bottom: 2px solid transparent; font-size: 11px; white-space: nowrap; cursor: pointer; }
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
    .dialog-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--nps-border); background: #f8fbff; }
    .version { margin-right: auto; color: var(--nps-text-muted); font-size: 10px; }
    .dialog-footer button { border: 1px solid var(--nps-border); background: #fff; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
    .dialog-footer button.primary { background: var(--nps-blue); border-color: var(--nps-blue); color: #fff; }
  `]
})
export class BasicEventRecordDialogComponent implements OnChanges {
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
    }
  }

  saveCurrent(): void {
    if (this.draft) this.save.emit(this.draft);
  }
}
