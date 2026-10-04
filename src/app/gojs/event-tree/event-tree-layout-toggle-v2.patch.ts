import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type EventTreeLayoutMode = 'STANDARD' | 'CENTERED';

const BODY_CATEGORIES = new Set([
  'START_POINT',
  'FE_POINT',
  'BRANCH',
  'ANCHOR',
  'SEQUENCE',
  'RESULT_RESIZER'
]);

export function installEventTreeLayoutToggleV2Patch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeLayoutToggleV2Installed) return;
  prototype.__eventTreeLayoutToggleV2Installed = true;

  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalDestroy = prototype.ngOnDestroy;
  const originalApplyModel = prototype.applyModel;

  const getMode = (component: any): EventTreeLayoutMode =>
    component.__eventTreeLayoutModeV2 ?? 'STANDARD';

  const updateButtons = (component: any): void => {
    const mode = getMode(component);
    const left = component.__eventTreeLayoutLeftButton as HTMLButtonElement | undefined;
    const centered = component.__eventTreeLayoutCenteredButtonV2 as HTMLButtonElement | undefined;

    const setState = (button: HTMLButtonElement | undefined, active: boolean): void => {
      if (!button) return;
      button.style.background = active ? '#e8f1ff' : '#ffffff';
      button.style.borderColor = active ? '#3b82f6' : '#cbd5e1';
      button.style.color = active ? '#2563eb' : '#1f2937';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    };

    setState(left, mode === 'STANDARD');
    setState(centered, mode === 'CENTERED');
  };

  const restoreBaseLocations = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (!BODY_CATEGORIES.has(data?.category)) return;
      const baseLoc = data?.__etBaseLoc as string | undefined;
      if (!baseLoc) return;
      node.location = go.Point.parse(baseLoc);
    });
  };

  const applyBodyCentering = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    const div = component.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    const metrics = component.__eventTreeViewportMetrics as { headerHeight?: number } | undefined;
    if (!diagram || !div) return;

    restoreBaseLocations(component);

    if (getMode(component) !== 'CENTERED') {
      component.__eventTreeBodyCenterOffset = 0;
      component.lockViewport?.();
      return;
    }

    const headerHeight = metrics?.headerHeight ?? 82;
    const bodyNodes: go.Node[] = [];
    diagram.nodes.each((node: go.Node) => {
      const category = (node.data as any)?.category;
      if (BODY_CATEGORIES.has(category) && category !== 'RESULT_RESIZER') bodyNodes.push(node);
    });
    if (!bodyNodes.length) return;

    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    bodyNodes.forEach((node) => {
      top = Math.min(top, node.actualBounds.top);
      bottom = Math.max(bottom, node.actualBounds.bottom);
    });
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;

    const scale = Math.max(0.25, diagram.scale || 1);
    const availableBodyHeight = Math.max(0, (div.clientHeight - headerHeight) / scale);
    const bodyHeight = Math.max(0, bottom - top);

    // Only the body is centered. IE, FE and the consequence header remain fixed.
    // Large ETs stay top-aligned so the dedicated body scrollbar continues to
    // expose every branch and consequence row without hiding content above.
    const offset = bodyHeight + 8 < availableBodyHeight
      ? Math.max(0, (availableBodyHeight - bodyHeight) / 2 - Math.max(0, top - headerHeight))
      : 0;

    component.__eventTreeBodyCenterOffset = offset;
    if (offset > 0.01) {
      bodyNodes.forEach((node) => {
        node.location = new go.Point(node.location.x, node.location.y + offset);
      });
    }

    component.lockViewport?.();
  };

  const injectButtons = (component: any): void => {
    const shell = component.diagramDiv?.nativeElement?.closest?.('.et-shell') as HTMLElement | null;
    const toolbar = shell?.querySelector?.('.toolbar') as HTMLElement | null;
    if (!toolbar || component.__eventTreeLayoutControlsV2) return;

    // Replace the first implementation instead of rendering duplicate controls.
    (component.__eventTreeLayoutControls as HTMLElement | undefined)?.remove();
    component.__eventTreeLayoutControls = null;

    const controls = document.createElement('span');
    controls.dataset['etLayoutV2'] = 'true';
    Object.assign(controls.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      marginLeft: '2px'
    });

    const makeButton = (
      title: string,
      aria: string,
      path: string,
      mode: EventTreeLayoutMode
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', aria);
      Object.assign(button.style, {
        width: '34px',
        minWidth: '34px',
        height: '31px',
        padding: '0',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '7px'
      });
      // Exact same glyphs as the two Fault Tree layout buttons.
      button.innerHTML = `<svg viewBox="0 0 26 18" width="24" height="17" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
      button.addEventListener('click', () => {
        component.__eventTreeLayoutModeV2 = mode;
        updateButtons(component);
        requestAnimationFrame(() => applyBodyCentering(component));
      });
      return button;
    };

    const left = makeButton(
      'Disposition ET actuelle',
      'Garder la disposition actuelle de l’Event Tree',
      'M5 2v5h16M5 7v9M13 7v9M21 7v9',
      'STANDARD'
    );
    const centered = makeButton(
      'Centrer l’arbre ET',
      'Centrer uniquement l’arbre Event Tree',
      'M13 2v5M4 7h18M4 7v9M13 7v9M22 7v9',
      'CENTERED'
    );

    controls.append(left, centered);
    const hint = toolbar.querySelector('.hint');
    toolbar.insertBefore(controls, hint ?? null);

    component.__eventTreeLayoutControlsV2 = controls;
    component.__eventTreeLayoutLeftButton = left;
    component.__eventTreeLayoutCenteredButtonV2 = centered;
    component.__eventTreeLayoutModeV2 ??= 'STANDARD';
    updateButtons(component);
  };

  prototype.applyModel = function(metrics: unknown): void {
    originalApplyModel.call(this, metrics);
    const diagram = this.diagram as go.Diagram | undefined;
    if (diagram) {
      diagram.nodes.each((node: go.Node) => {
        const data = node.data as any;
        if (!BODY_CATEGORIES.has(data?.category)) return;
        data.__etBaseLoc = go.Point.stringify(node.location);
      });
    }
    requestAnimationFrame(() => applyBodyCentering(this));
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    requestAnimationFrame(() => {
      injectButtons(this);
      applyBodyCentering(this);
    });
  };

  prototype.ngOnDestroy = function(): void {
    (this.__eventTreeLayoutControlsV2 as HTMLElement | undefined)?.remove();
    this.__eventTreeLayoutControlsV2 = null;
    this.__eventTreeLayoutLeftButton = null;
    this.__eventTreeLayoutCenteredButtonV2 = null;
    originalDestroy.call(this);
  };
}
