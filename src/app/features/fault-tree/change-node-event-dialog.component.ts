import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { ChangeNodeCandidate, FaultTreeNodeData } from '../../core/models/psa.models';

@Component({
  selector: 'app-change-node-event-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dialog-backdrop" *ngIf="node" (mousedown)="close.emit()">
      <section class="dialog" (mousedown)="$event.stopPropagation()" role="dialog" aria-modal="true">
        <header>
          <div>
            <div class="eyebrow">Fault Tree Editor</div>
            <h2>Change Node Event</h2>
          </div>
          <button type="button" class="close" (click)="close.emit()">×</button>
        </header>

        <div class="body">
          <p>
            Replace the record referenced by this fault-tree position with another
            record of the same type. The node position and its incoming link are preserved.
          </p>

          <div class="current">
            <span>Current</span>
            <strong>{{ node?.id }}</strong>
            <small>{{ node?.description }}</small>
          </div>

          <table *ngIf="candidates.length; else empty">
            <thead>
              <tr><th>ID</th><th>Description</th></tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let candidate of candidates"
                [class.selected]="selectedId() === candidate.id"
                (click)="selectedId.set(candidate.id)"
                (dblclick)="confirm(candidate.id)">
                <td><strong>{{ candidate.id }}</strong></td>
                <td>{{ candidate.description }}</td>
              </tr>
            </tbody>
          </table>

          <ng-template #empty>
            <div class="empty">No other record of the same type is available in the current mock project.</div>
          </ng-template>
        </div>

        <footer>
          <button type="button" (click)="close.emit()">Cancel</button>
          <button
            type="button"
            class="primary"
            [disabled]="!selectedId()"
            (click)="selectedId() && confirm(selectedId()!)">
            OK
          </button>
        </footer>
      </section>
    </div>
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed; inset: 0; z-index: 140;
      display: grid; place-items: center;
      background: rgba(7, 22, 40, .48);
      padding: 28px;
    }
    .dialog {
      width: min(650px, 92vw);
      max-height: min(620px, 84vh);
      display: grid;
      grid-template-rows: auto 1fr auto;
      overflow: hidden;
      background: #fff;
      border: 1px solid #94a3b8;
      border-radius: 8px;
      box-shadow: 0 24px 70px rgba(2, 12, 27, .28);
    }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 13px 16px;
      color: #fff; background: var(--nps-topbar);
    }
    h2 { margin: 2px 0 0; font-size: 16px; }
    .eyebrow { color: #b9d2ee; font-size: 9px; text-transform: uppercase; letter-spacing: .07em; }
    .close { border: 0; background: transparent; color: #fff; font-size: 22px; cursor: pointer; }
    .body { overflow: auto; padding: 16px; }
    p { margin: 0 0 14px; color: var(--nps-text-muted); font-size: 11px; line-height: 1.55; }
    .current {
      display: grid;
      grid-template-columns: 70px 1fr;
      gap: 3px 10px;
      padding: 10px 12px;
      margin-bottom: 12px;
      border: 1px solid var(--nps-border);
      background: #f8fbff;
    }
    .current span { color: var(--nps-text-muted); font-size: 10px; }
    .current strong { font-size: 11px; }
    .current small { grid-column: 2; color: var(--nps-text-muted); font-size: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 9px 10px; border-bottom: 1px solid var(--nps-border); text-align: left; }
    th { background: #f8fafc; color: var(--nps-text-muted); font-size: 9px; text-transform: uppercase; }
    tbody tr { cursor: pointer; }
    tbody tr:hover, tbody tr.selected { background: #eaf2ff; }
    .empty {
      padding: 18px; color: var(--nps-text-muted);
      border: 1px dashed #cbd5e1; border-radius: 7px; font-size: 11px;
    }
    footer {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 11px 14px; border-top: 1px solid var(--nps-border); background: #f8fafc;
    }
    footer button {
      min-width: 84px; height: 32px;
      border: 1px solid var(--nps-border); border-radius: 7px;
      background: #fff; cursor: pointer;
    }
    footer button.primary { background: var(--nps-blue); border-color: var(--nps-blue); color: #fff; }
    footer button:disabled { opacity: .45; cursor: default; }
  `]
})
export class ChangeNodeEventDialogComponent {
  @Input() node: FaultTreeNodeData | null = null;
  @Input() candidates: ChangeNodeCandidate[] = [];
  @Output() readonly close = new EventEmitter<void>();
  @Output() readonly apply = new EventEmitter<string>();

  readonly selectedId = signal<string | null>(null);

  confirm(id: string): void {
    this.apply.emit(id);
  }
}
