import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-feature-placeholder',
  standalone: true,
  template: `
    <section class="placeholder">
      <div class="badge">NextPSA roadmap</div>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
      <div class="callout">
        <strong>Frontend boundary is ready.</strong>
        <span>This route is intentionally scaffolded for the next implementation phase from the RiskSpectrum traceability plan.</span>
      </div>
    </section>
  `,
  styles: [`
    .placeholder { max-width: 860px; margin: 58px auto; padding: 32px; background: #fff; border: 1px solid var(--nps-border); border-radius: 16px; }
    .badge { display: inline-block; padding: 5px 8px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
    h1 { font-size: 24px; margin: 12px 0 8px; }
    p { color: var(--nps-text-muted); font-size: 12px; line-height: 1.6; }
    .callout { margin-top: 22px; padding: 14px; display: grid; gap: 5px; border: 1px solid #bfdbfe; background: #f8fbff; border-radius: 10px; font-size: 11px; }
    .callout span { color: var(--nps-text-muted); }
  `]
})
export class FeaturePlaceholderComponent {
  readonly title: string;
  readonly description: string;

  constructor(route: ActivatedRoute) {
    this.title = route.snapshot.data['title'] as string;
    this.description = route.snapshot.data['description'] as string;
  }
}
