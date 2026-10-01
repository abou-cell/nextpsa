import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FaultTreeWorkspaceService } from './features/fault-tree/fault-tree-workspace.service';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <ng-container *ngIf="!isStandaloneRoute(); else standaloneRoute">
    <div class="app-shell">
      <header class="global-topbar">
        <a class="brand" routerLink="/dashboard">
          <span class="brand-mark">N</span>
          <span>
            <strong>NextPSA</strong>
            <small>Cloud PRA Workbench</small>
          </span>
        </a>

        <button class="project-switcher" type="button">
          <span>Project</span>
          <strong>NPP Example Project</strong>
          <span>⌄</span>
        </button>

        <button class="global-search" type="button">
          <span>⌕</span>
          <span>Search records, cases, sequences…</span>
          <kbd>Ctrl K</kbd>
        </button>

        <div class="top-actions">
          <button type="button" class="ghost">Save</button>
          <button type="button" class="run">▶ Run Analysis</button>
          <div class="language-selector">
            <button
              type="button"
              class="language-button"
              [attr.aria-expanded]="languageMenuOpen()"
              aria-haspopup="menu"
              title="Choose language"
              (click)="languageMenuOpen.set(!languageMenuOpen())">
              {{ currentLanguage() }} <span>⌄</span>
            </button>
            <div *ngIf="languageMenuOpen()" class="language-menu" role="menu">
              <button type="button" role="menuitem" [class.active]="currentLanguage() === 'EN'" (click)="selectLanguage('EN')">
                <strong>EN</strong><span>English</span>
              </button>
              <button type="button" role="menuitem" [class.active]="currentLanguage() === 'FR'" (click)="selectLanguage('FR')">
                <strong>FR</strong><span>Français</span>
              </button>
              <button type="button" role="menuitem" [class.active]="currentLanguage() === 'CH'" (click)="selectLanguage('CH')">
                <strong>CH</strong><span>中文</span>
              </button>
              <button type="button" role="menuitem" [class.active]="currentLanguage() === 'AR'" (click)="selectLanguage('AR')">
                <strong>AR</strong><span>العربية</span>
              </button>
            </div>
          </div>
          <button type="button" class="avatar" title="PRA Engineer">AR</button>
        </div>
      </header>

      <aside class="sidebar">
        <nav>
          <section *ngFor="let group of navigation">
            <h2>{{ group.label }}</h2>
            <a *ngFor="let item of group.items"
              [routerLink]="item.route"
              routerLinkActive="active"
              (dblclick)="onNavDoubleClick($event, item)">
              <span class="nav-icon">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          </section>
        </nav>
        <footer>
          <div class="cloud-status"><span></span> Cloud workspace online</div>
          <div>Frontend V1 · Angular 22 + GoJS 4</div>
        </footer>
      </aside>

      <main class="content">
        <router-outlet></router-outlet>
      </main>
    </div>
    </ng-container>

    <ng-template #standaloneRoute>
      <main class="standalone-content">
        <router-outlet></router-outlet>
      </main>
    </ng-template>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .app-shell { height: 100%; display: grid; grid-template-columns: 216px minmax(0, 1fr); grid-template-rows: 58px minmax(0, 1fr); background: var(--nps-app-bg); }
    .global-topbar { grid-column: 1 / -1; background: var(--nps-topbar); color: #fff; display: flex; align-items: center; gap: 14px; padding: 0 14px; box-shadow: 0 1px 0 rgba(255,255,255,.06); z-index: 20; }
    .brand { width: 202px; display: flex; align-items: center; gap: 9px; color: #fff; text-decoration: none; }
    .brand-mark { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; background: linear-gradient(135deg, #38bdf8, #2563eb); font-weight: 900; }
    .brand strong, .brand small { display: block; }
    .brand strong { font-size: 14px; }
    .brand small { margin-top: 1px; color: #a9c3df; font-size: 8px; letter-spacing: .04em; }
    .project-switcher, .global-search, .top-actions button { height: 36px; border: 1px solid rgba(255,255,255,.1); border-radius: 9px; color: #e8f2ff; background: #173454; font: inherit; }
    .project-switcher { width: 240px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 7px; padding: 0 11px; text-align: left; cursor: pointer; }
    .project-switcher span { color: #9db7d2; font-size: 8px; }
    .project-switcher strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
    .global-search { flex: 1; max-width: 600px; display: flex; align-items: center; gap: 9px; padding: 0 11px; color: #a9c3df; font-size: 10px; }
    .global-search kbd { margin-left: auto; border: 1px solid #42627e; border-radius: 5px; padding: 2px 5px; background: #102945; color: #cfe0f2; font: 8px Inter, sans-serif; }
    .top-actions { margin-left: auto; display: flex; align-items: center; gap: 7px; }
    .top-actions button { padding: 0 11px; cursor: pointer; font-size: 10px; }
    .top-actions .ghost { background: transparent; }
    .top-actions .run { background: var(--nps-blue); border-color: var(--nps-blue); color: #fff; font-weight: 700; }
    .language-selector { position:relative; }
    .top-actions .language-button { min-width:58px; display:flex; align-items:center; justify-content:center; gap:6px; background:#173454; font-weight:700; }
    .language-button span { color:#9db7d2; font-size:9px; }
    .language-menu {
      position:absolute;
      top:42px;
      right:0;
      width:156px;
      padding:5px;
      border:1px solid #315170;
      border-radius:9px;
      background:#102945;
      box-shadow:0 12px 28px rgba(0,0,0,.28);
      z-index:100;
    }
    .language-menu button {
      width:100%;
      height:32px;
      display:grid;
      grid-template-columns:30px 1fr;
      align-items:center;
      gap:7px;
      padding:0 8px;
      border:0;
      border-radius:6px;
      background:transparent;
      color:#dceaff;
      text-align:left;
    }
    .language-menu button:hover, .language-menu button.active { background:#1b3c61; }
    .language-menu strong { font-size:10px; }
    .language-menu span { color:#a9c3df; font-size:9px; }
    .top-actions .avatar { width: 36px; padding: 0; border-radius: 50%; background: #e0ecff; color: #173454; font-weight: 800; }
    .sidebar { grid-column: 1; grid-row: 2; min-height: 0; display: flex; flex-direction: column; background: var(--nps-sidebar); color: #dceaff; border-right: 1px solid #173454; }
    .sidebar nav { flex: 1; overflow: auto; padding: 12px 9px; }
    .sidebar section { margin-bottom: 14px; }
    .sidebar h2 { margin: 0 9px 5px; font-size: 8px; letter-spacing: .1em; color: #809ab7; font-weight: 800; }
    .sidebar a { height: 31px; display: flex; align-items: center; gap: 9px; padding: 0 10px; border-radius: 7px; color: #c5d7eb; text-decoration: none; font-size: 10px; }
    .sidebar a:hover { background: #102945; }
    .sidebar a.active { background: #1d4ed8; color: #fff; font-weight: 700; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
    .nav-icon { width: 16px; text-align: center; font-size: 11px; }
    .sidebar footer { padding: 11px 13px; border-top: 1px solid #173454; color: #7892ae; font-size: 8px; line-height: 1.6; }
    .cloud-status { color: #b5cbe1; }
    .cloud-status span { display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: #22c55e; }
    .content { grid-column: 2; grid-row: 2; min-width: 0; min-height: 0; overflow: auto; }
    .standalone-content { width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--nps-app-bg); }
    @media (max-width: 1100px) {
      .app-shell { grid-template-columns: 184px minmax(0,1fr); }
      .brand { width: 170px; }
      .project-switcher { width: 190px; }
    }
  `]
})
export class AppComponent {
  readonly currentLanguage = signal<'EN' | 'FR' | 'CH' | 'AR'>('EN');
  readonly languageMenuOpen = signal(false);

  constructor(
    private readonly router: Router,
    private readonly faultTreeWorkspaces: FaultTreeWorkspaceService
  ) {}

  selectLanguage(language: 'EN' | 'FR' | 'CH' | 'AR'): void {
    this.currentLanguage.set(language);
    this.languageMenuOpen.set(false);
  }

  isStandaloneRoute(): boolean {
    return this.router.url.startsWith('/standalone/');
  }

  onNavDoubleClick(event: MouseEvent, item: NavItem): void {
    if (item.label !== 'Fault Tree') return;

    event.preventDefault();
    this.faultTreeWorkspaces.openWorkspace();
    void this.router.navigate(['/model/fault-tree/PTR-LOPC']);
  }

  readonly navigation: readonly NavGroup[] = [
    {
      label: 'MODEL',
      items: [
        { label: 'Fault Tree', route: '/model/fault-tree/PTR-LOPC', icon: '⌘' },
        { label: 'Event Tree', route: '/model/event-tree/SFP-LOOP', icon: '⎇' }
      ]
    },
    {
      label: 'DATA',
      items: [
        { label: 'Basic Events', route: '/data/basic-events', icon: '◫' }
      ]
    },
    {
      label: 'ANALYSIS',
      items: [
        { label: 'Analysis Cases', route: '/analysis/cases', icon: '▶' },
        { label: 'MCS BDD', route: '/analysis/mcs-bdd', icon: '⇢' },
        { label: 'I&AB', route: '/analysis/iab', icon: '∫' }
      ]
    },
    {
      label: 'RESULTS',
      items: [
        { label: 'Results', route: '/results', icon: '▥' }
      ]
    },
    {
      label: 'QA & TOOLS',
      items: [
        { label: 'Integrity Check', route: '/tools/integrity', icon: '✓' },
        { label: 'RSA Import / Export', route: '/tools/rsa', icon: '⇪' }
      ]
    }
  ];
}
