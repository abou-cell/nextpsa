import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="dashboard">
      <div class="intro">
        <div class="eyebrow">Frontend vertical slice · Phase 1/2</div>
        <h1>NextPSA Cloud PRA Workbench</h1>
        <p>RiskSpectrum-grounded model semantics with a modern Angular + GoJS web interface.</p>
        <a routerLink="/model/fault-tree/PTR-LOPC">Open Fault Tree Workspace →</a>
      </div>

      <div class="metrics">
        <article><span>Fault Trees</span><strong>4</strong><small>mock project</small></article>
        <article><span>Basic Events</span><strong>50</strong><small>frontend target fixture</small></article>
        <article><span>Analysis Cases</span><strong>5</strong><small>planned</small></article>
        <article><span>Validation</span><strong>3</strong><small>demo issues</small></article>
      </div>

      <div class="phase-grid">
        <article>
          <span class="status done">Implemented</span>
          <h2>Application Shell</h2>
          <p>Modern engineering navigation, workspace routing and dense desktop-first design tokens.</p>
        </article>
        <article>
          <span class="status done">Implemented</span>
          <h2>GoJS Fault Tree</h2>
          <p>PSA node categories, tree layout, palette, selection, double-click and record dialogs.</p>
        </article>
        <article>
          <span class="status next">Next</span>
          <h2>Event Tree GoJS</h2>
          <p>Initiating events, function-event columns, success/failure branches, BC Sets and sequences.</p>
        </article>
      </div>
    </section>
  `,
  styles: [`
    .dashboard { padding: 26px; max-width: 1300px; margin: 0 auto; }
    .intro { padding: 28px; background: linear-gradient(135deg, #ffffff, #edf5ff); border: 1px solid var(--nps-border); border-radius: 16px; }
    .eyebrow { color: var(--nps-blue); font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 8px 0 8px; font-size: 28px; }
    p { color: var(--nps-text-muted); font-size: 12px; line-height: 1.6; }
    a { display: inline-block; margin-top: 10px; color: var(--nps-blue); font-weight: 700; font-size: 12px; text-decoration: none; }
    .metrics { margin-top: 16px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .metrics article, .phase-grid article { background: #fff; border: 1px solid var(--nps-border); border-radius: 12px; padding: 16px; }
    .metrics span, .metrics small { display: block; color: var(--nps-text-muted); font-size: 10px; }
    .metrics strong { display: block; margin: 5px 0; font-size: 26px; }
    .phase-grid { margin-top: 16px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .phase-grid h2 { font-size: 14px; margin: 10px 0 3px; }
    .status { display: inline-block; padding: 4px 7px; border-radius: 999px; font-size: 9px; font-weight: 800; }
    .status.done { color: #15803d; background: #ecfdf3; }
    .status.next { color: #1d4ed8; background: #eff6ff; }
  `]
})
export class DashboardComponent {}
