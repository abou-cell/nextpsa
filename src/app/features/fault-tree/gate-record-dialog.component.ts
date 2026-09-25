import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  BasicEventRecord,
  FaultTreeNodeData,
  GateRecord
} from '../../core/models/psa.models';

type GateTab = 'main' | 'inputs' | 'basics' | 'attributes' | 'exchange' | 'memo' | 'history';

@Component({
  selector: 'app-gate-record-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dialog-backdrop" *ngIf="gate" (mousedown)="close.emit()">
      <section class="record-dialog" (mousedown)="$event.stopPropagation()" role="dialog" aria-modal="true">
        <header class="dialog-header">
          <div>
            <div class="eyebrow">{{ gate?.isTopGate ? 'Top Event / Gate Record' : 'Gate Record' }}</div>
            <h2>{{ gate?.id }} · {{ gate?.description }}</h2>
          </div>
          <button type="button" class="icon-button" (click)="close.emit()">×</button>
        </header>

        <nav class="record-tabs">
          <button *ngFor="let item of tabs"
            type="button"
            [class.active]="tab === item.key"
            (click)="tab = item.key">
            {{ item.label }}
          </button>
        </nav>

        <div class="dialog-body">
          <ng-container [ngSwitch]="tab">
            <div *ngSwitchCase="'main'" class="property-grid">
              <div><span>ID</span><strong>{{ gate?.id }}</strong></div>
              <div><span>Description</span><strong>{{ gate?.description }}</strong></div>
              <div><span>Gate type</span><strong>{{ gate?.type }}</strong></div>
              <div><span>State</span><strong>{{ gate?.state }}</strong></div>
              <div><span>Fault Tree</span><strong>{{ gate?.faultTreeId }}</strong></div>
              <div><span>Page Top Gate</span><strong>{{ gate?.isTopGate ? 'Yes' : 'No' }}</strong></div>
              <div *ngIf="gate?.type === 'KOFN'"><span>K</span><strong>{{ gate?.k ?? 0 }}</strong></div>
              <div><span>Version</span><strong>v{{ gate?.audit?.version }}</strong></div>
            </div>

            <div *ngSwitchCase="'inputs'">
              <div class="section-head">
                <div>
                  <h3>Direct inputs</h3>
                  <p>RiskSpectrum-style GIN relationships for this gate.</p>
                </div>
                <button type="button" class="primary">+ Add input</button>
              </div>
              <table>
                <thead><tr><th>#</th><th>Type</th><th>ID</th><th>Description</th><th>State</th></tr></thead>
                <tbody>
                  <tr *ngFor="let node of directInputs; let index = index">
                    <td>{{ index + 1 }}</td>
                    <td><span class="pill">{{ node.recordType }}</span></td>
                    <td><strong>{{ node.id }}</strong></td>
                    <td>{{ node.description }}</td>
                    <td>{{ node.state }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div *ngSwitchCase="'basics'">
              <div class="section-head">
                <div>
                  <h3>Underlying Basic Events</h3>
                  <p>Recursive Basic Event view is a NextPSA web enhancement for rapid model review.</p>
                </div>
                <span class="count">{{ basicEvents.length }} events</span>
              </div>
              <table>
                <thead><tr><th>Basic Event</th><th>Description</th><th>Model</th><th>Mean</th><th>CCF</th><th>System</th></tr></thead>
                <tbody>
                  <tr *ngFor="let event of basicEvents" class="clickable" (dblclick)="openBasicEvent.emit(event)">
                    <td><strong>{{ event.id }}</strong></td>
                    <td>{{ event.description }}</td>
                    <td>Type {{ event.reliabilityModel }}</td>
                    <td>{{ event.parameterRefs[0]?.mean ?? '—' }}</td>
                    <td>{{ event.ccfGroupIds.join(', ') || '—' }}</td>
                    <td>{{ event.systemId ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="hint">Double-click a Basic Event row to open its record editor.</div>
            </div>

            <div *ngSwitchCase="'attributes'" class="tag-list">
              <span *ngFor="let attribute of gate?.attributes">{{ attribute }}</span>
            </div>

            <div *ngSwitchCase="'exchange'" class="empty-state">
              No exchange-event relationship is configured for this demo record.
            </div>

            <div *ngSwitchCase="'memo'" class="empty-state">
              {{ gate?.memo || 'No memo.' }}
            </div>

            <div *ngSwitchCase="'history'" class="timeline">
              <strong>v{{ gate?.audit?.version }}</strong>
              <span>Updated by {{ gate?.audit?.updatedBy }} · {{ gate?.audit?.updatedAt }}</span>
            </div>
          </ng-container>
        </div>

        <footer class="dialog-footer">
          <button type="button" (click)="close.emit()">Close</button>
          <button type="button" class="primary">Save record</button>
        </footer>
      </section>
    </div>
  `,
  styles: [`
    .dialog-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(7, 22, 40, .45); display: grid; place-items: center; padding: 28px; }
    .record-dialog { width: min(1040px, 94vw); height: min(720px, 88vh); background: #fff; border: 1px solid var(--nps-border); border-radius: 14px; box-shadow: 0 28px 80px rgba(2, 12, 27, .25); display: grid; grid-template-rows: auto auto 1fr auto; overflow: hidden; }
    .dialog-header { padding: 16px 20px; background: var(--nps-topbar); color: #fff; display: flex; align-items: center; justify-content: space-between; }
    .dialog-header h2 { font-size: 17px; margin: 3px 0 0; }
    .eyebrow { font-size: 10px; text-transform: uppercase; color: #b9d2ee; letter-spacing: .08em; }
    .icon-button { border: 0; background: transparent; color: #fff; font-size: 24px; cursor: pointer; }
    .record-tabs { display: flex; overflow-x: auto; padding: 0 14px; border-bottom: 1px solid var(--nps-border); }
    .record-tabs button { border: 0; background: transparent; padding: 12px 13px; color: var(--nps-text-muted); font-size: 11px; white-space: nowrap; border-bottom: 2px solid transparent; cursor: pointer; }
    .record-tabs button.active { color: var(--nps-blue); border-color: var(--nps-blue); font-weight: 700; }
    .dialog-body { min-height: 0; overflow: auto; padding: 20px; }
    .property-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .property-grid > div { display: grid; grid-template-columns: 130px 1fr; gap: 12px; padding: 12px; border: 1px solid var(--nps-border); border-radius: 9px; }
    .property-grid span { color: var(--nps-text-muted); font-size: 11px; }
    .property-grid strong { font-size: 12px; }
    .section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .section-head h3 { margin: 0 0 4px; font-size: 15px; }
    .section-head p { margin: 0; font-size: 11px; color: var(--nps-text-muted); }
    .count { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 999px; padding: 6px 10px; font-size: 10px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { text-align: left; border-bottom: 1px solid var(--nps-border); padding: 9px 10px; }
    th { background: #f8fbff; color: var(--nps-text-muted); font-size: 10px; position: sticky; top: 0; }
    tr.clickable:hover { background: #eff6ff; cursor: pointer; }
    .pill { padding: 3px 6px; border-radius: 999px; background: #eef2f7; font-size: 9px; font-weight: 700; }
    .hint, .empty-state { margin-top: 14px; color: var(--nps-text-muted); font-size: 11px; }
    .tag-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag-list span { padding: 7px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 11px; }
    .timeline { display: flex; gap: 12px; align-items: center; padding: 14px; border: 1px solid var(--nps-border); border-radius: 9px; font-size: 11px; }
    .dialog-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--nps-border); background: #f8fbff; }
    button { border: 1px solid var(--nps-border); background: #fff; color: var(--nps-text); border-radius: 8px; padding: 8px 12px; font: inherit; cursor: pointer; }
    button.primary { background: var(--nps-blue); color: #fff; border-color: var(--nps-blue); }
  `]
})
export class GateRecordDialogComponent {
  @Input() gate: GateRecord | null = null;
  @Input() directInputs: FaultTreeNodeData[] = [];
  @Input() basicEvents: BasicEventRecord[] = [];
  @Output() readonly close = new EventEmitter<void>();
  @Output() readonly openBasicEvent = new EventEmitter<BasicEventRecord>();

  tab: GateTab = 'main';

  readonly tabs: readonly { key: GateTab; label: string }[] = [
    { key: 'main', label: 'Main' },
    { key: 'inputs', label: 'Inputs' },
    { key: 'basics', label: 'Basic Events' },
    { key: 'attributes', label: 'Attributes' },
    { key: 'exchange', label: 'Exchange Events' },
    { key: 'memo', label: 'Memo' },
    { key: 'history', label: 'History' }
  ];
}
