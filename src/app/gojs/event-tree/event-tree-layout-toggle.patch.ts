import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type EventTreeLayoutMode = 'STANDARD' | 'CENTERED';

export function installEventTreeLayoutTogglePatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeLayoutToggleInstalled) return;
  prototype.__eventTreeLayoutToggleInstalled = true;

  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalDestroy = prototype.ngOnDestroy;
  const originalRefreshLayout = prototype.refreshLayout;
  const originalLockViewport = prototype.lockViewport;

  const updateButtons = (component: any): void => {
    const mode: EventTreeLayoutMode = component.__eventTreeLayoutMode ?? 'STANDARD';
    const standard = component.__eventTreeStandardLayoutButton as HTMLButtonElement | undefined;
    const centered = component.__eventTreeCenteredLayoutButton as HTMLButtonElement | undefined;
    const setActive = (button: HTMLButtonElement | undefined, active: boolean): void => {
      if (!button) return;
      button.style.background = active ? '#e8f1ff' : '#ffffff';
      button.style.borderColor = active ? '#3b82f6' : '#cbd5e1';
      button.style.color = active ? '#2563eb' : '#1f2937';
    };
    setActive(standard, mode === 'STANDARD');
    setActive(centered, mode === 'CENTERED');
  };

  const applyLayout = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const mode: EventTreeLayoutMode = component.__eventTreeLayoutMode ?? 'STANDARD';
    if (mode === 'STANDARD') {
      diagram.contentAlignment = go.Spot.TopLeft;
      diagram.initialContentAlignment = go.Spot.TopLeft;
      diagram.position = new go.Point(0, 0);
      component.updateZoomPercent?.();
      return;
    }

    diagram.contentAlignment = go.Spot.Center;
    diagram.initialContentAlignment = go.Spot.Center;
    diagram.commandHandler.zoomToFit();
    if (diagram.scale > 1) diagram.scale = 1;
    diagram.centerRect(diagram.documentBounds);
    component.updateZoomPercent?.();
  };

  const injectButtons = (component: any): void => {
    if (component.__eventTreeLayoutControls) return;
    const host = component.diagramDiv?.nativeElement?.closest?.('.et-shell') as HTMLElement | null;
    const toolbar = host?.querySelector?.('.toolbar') as HTMLElement | null;
    if (!toolbar) return;

    component.__eventTreeLayoutMode = component.__eventTreeLayoutMode ?? 'STANDARD';

    const controls = document.createElement('span');
    controls.style.display = 'inline-flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '4px';
    controls.style.marginLeft = '2px';

    const makeButton = (title: string, aria: string, svgPath: string, mode: EventTreeLayoutMode): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', aria);
      button.style.width = '34px';
      button.style.minWidth = '34px';
      button.style.height = '31px';
      button.style.padding = '0';
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      button.style.borderRadius = '7px';
      button.innerHTML = `<svg viewBox="0 0 26 18" width="24" height="17" aria-hidden="true"><path d="${svgPath}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
      button.addEventListener('click', () => {
        component.__eventTreeLayoutMode = mode;
        updateButtons(component);
        applyLayout(component);
      });
      return button;
    };

    const standard = makeButton(
      'Disposition ET actuelle',
      'Garder la disposition actuelle de l’Event Tree',
      'M5 2v14M5 4h15M5 9h11M5 14h7',
      'STANDARD'
    );
    const centered = makeButton(
      'Centrer l’arbre ET',
      'Centrer l’Event Tree',
      'M13 2v14M5 4h16M8 9h10M10 14h6',
      'CENTERED'
    );

    controls.append(standard, centered);
    const hint = toolbar.querySelector('.hint');
    toolbar.insertBefore(controls, hint ?? null);

    component.__eventTreeLayoutControls = controls;
    component.__eventTreeStandardLayoutButton = standard;
    component.__eventTreeCenteredLayoutButton = centered;
    updateButtons(component);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    requestAnimationFrame(() => {
      injectButtons(this);
      applyLayout(this);
    });
  };

  prototype.refreshLayout = function(): void {
    originalRefreshLayout.call(this);
    requestAnimationFrame(() => applyLayout(this));
  };

  prototype.lockViewport = function(): void {
    if ((this.__eventTreeLayoutMode ?? 'STANDARD') === 'CENTERED') return;
    originalLockViewport.call(this);
  };

  prototype.ngOnDestroy = function(): void {
    const controls = this.__eventTreeLayoutControls as HTMLElement | undefined;
    controls?.remove();
    this.__eventTreeLayoutControls = null;
    this.__eventTreeStandardLayoutButton = null;
    this.__eventTreeCenteredLayoutButton = null;
    originalDestroy.call(this);
  };
}
