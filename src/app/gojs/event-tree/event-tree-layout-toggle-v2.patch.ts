import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type EventTreeLayoutMode = 'STANDARD' | 'CENTERED';

const SAVED_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH', 'ANCHOR']);
const CENTER_MAIN_RESULT = '__etCenteredMainResult';

interface SequenceRow {
  key: string;
  centerY: number;
}

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
    const standard = component.__eventTreeLayoutLeftButton as HTMLButtonElement | undefined;
    const centered = component.__eventTreeLayoutCenteredButtonV2 as HTMLButtonElement | undefined;

    const setState = (button: HTMLButtonElement | undefined, active: boolean): void => {
      if (!button) return;
      button.style.background = active ? '#e8f1ff' : '';
      button.style.borderColor = active ? '#3b82f6' : '';
      button.style.color = active ? '#2563eb' : '';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    };

    setState(standard, mode === 'STANDARD');
    setState(centered, mode === 'CENTERED');
  };

  const saveBaseGeometry = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (!SAVED_CATEGORIES.has(data?.category)) return;
      data.__etBaseLoc = go.Point.stringify(node.location);
    });
  };

  const restoreBaseGeometry = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (!SAVED_CATEGORIES.has(data?.category)) return;
      const baseLoc = data?.__etBaseLoc as string | undefined;
      if (baseLoc) node.location = go.Point.parse(baseLoc);
    });
  };

  const sequenceRows = (component: any): Map<string, SequenceRow> => {
    const diagram = component.diagram as go.Diagram | undefined;
    const rows = new Map<string, SequenceRow>();
    if (!diagram) return rows;

    const rowHeight = Number(component.__eventTreeViewportMetrics?.sequenceRowHeight ?? 34);
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (data?.category !== 'SEQUENCE') return;
      rows.set(String(data.key), {
        key: String(data.key),
        centerY: node.location.y + rowHeight / 2
      });
    });
    return rows;
  };

  const mainSequenceKey = (component: any, rows: Map<string, SequenceRow>): string | null => {
    if (rows.has('S1')) return 'S1';
    const first = (component.model?.nodes ?? [])
      .filter((node: any) => node.category === 'SEQUENCE')
      .sort((a: any, b: any) => Number(a.sequenceNo ?? 0) - Number(b.sequenceNo ?? 0))[0];
    return first?.key ? String(first.key) : ([...rows.keys()][0] ?? null);
  };

  const removeCenteredMainResult = (diagram: go.Diagram): void => {
    const model = diagram.model as go.GraphLinksModel;
    [...(model.linkDataArray as any[])]
      .filter((data) => Boolean(data?.[CENTER_MAIN_RESULT]))
      .forEach((data) => model.removeLinkData(data));
  };

  const applyStandardRouting = (diagram: go.Diagram): void => {
    diagram.links.each((link: go.Link) => {
      link.routing = go.Routing.Normal;
      link.curve = go.Curve.None;
      link.corner = 0;
      link.invalidateRoute();
    });
  };

  const applyCenteredRouting = (diagram: go.Diagram): void => {
    diagram.links.each((link: go.Link) => {
      // A centered Event Tree is deliberately orthogonal: horizontal path rows
      // and vertical drops/raises only. This prevents diagonals and crossings
      // caused by automatic normal routing when path rows are repositioned.
      link.routing = go.Routing.Orthogonal;
      link.curve = go.Curve.None;
      link.corner = 0;
      link.fromEndSegmentLength = 0;
      link.toEndSegmentLength = 0;
      link.invalidateRoute();
    });
  };

  const applyCenteredGeometry = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const rows = sequenceRows(component);
    if (!rows.size) return;

    const rowYs = [...rows.values()].map((row) => row.centerY).sort((a, b) => a - b);
    const centerY = (rowYs[0] + rowYs[rowYs.length - 1]) / 2;
    const rootKey = mainSequenceKey(component, rows);

    // Main Event Tree spine: one straight horizontal line through the centre.
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const category = data?.category;
      const key = String(data?.key ?? '');

      if (category === 'START_POINT' || category === 'FE_POINT' || key === '__BASELINE_END__') {
        node.location = new go.Point(node.location.x, centerY);
        return;
      }

      // Every branch path remains on the SAME horizontal row as its sequence.
      // Therefore all branch/result lines are parallel and cannot weave across
      // each other between Function Event columns.
      if (category === 'BRANCH') {
        const sequenceKey = data.pathSequenceKey ? String(data.pathSequenceKey) : '';
        const row = rows.get(sequenceKey);
        if (row) node.location = new go.Point(node.location.x, row.centerY);
        return;
      }

      // Existing bend anchors are locked to the row of their downstream path.
      if (category === 'ANCHOR' && key.startsWith('__BEND-')) {
        const target = node.findLinksOutOf().first()?.toNode;
        const targetData = target?.data as any;
        const sequenceKey = targetData?.category === 'SEQUENCE'
          ? String(targetData.key)
          : targetData?.pathSequenceKey
            ? String(targetData.pathSequenceKey)
            : '';
        const row = rows.get(sequenceKey);
        if (row) node.location = new go.Point(node.location.x, row.centerY);
      }
    });

    // The standard model has no explicit visible result leg for the main path.
    // Add one runtime-only link. Orthogonal routing gives one clean vertical turn
    // at the result boundary and a final horizontal segment parallel to all rows.
    if (rootKey) {
      const model = diagram.model as go.GraphLinksModel;
      const alreadyLinked = (model.linkDataArray as any[]).some(
        (data) => data?.from === '__BASELINE_END__' && data?.to === rootKey
      );
      if (!alreadyLinked) {
        model.addLinkData({
          from: '__BASELINE_END__',
          to: rootKey,
          [CENTER_MAIN_RESULT]: true
        });
      }
    }

    applyCenteredRouting(diagram);
    component.lockViewport?.();
  };

  const rebuildForMode = (component: any): void => {
    const metrics = component.__eventTreeViewportMetrics;
    if (!metrics) return;

    // Rebuild from the canonical ET geometry every time the mode changes.
    // This avoids accumulating transformations from earlier centered layouts.
    originalApplyModel.call(component, metrics);
    saveBaseGeometry(component);

    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;
    removeCenteredMainResult(diagram);

    if (getMode(component) === 'CENTERED') applyCenteredGeometry(component);
    else {
      restoreBaseGeometry(component);
      applyStandardRouting(diagram);
      component.lockViewport?.();
    }
    component.updateDotVisuals?.();
  };

  const injectButtons = (component: any): void => {
    const shell = component.diagramDiv?.nativeElement?.closest?.('.et-shell') as HTMLElement | null;
    const toolbar = shell?.querySelector?.('.toolbar') as HTMLElement | null;
    if (!toolbar || component.__eventTreeLayoutControlsV2) return;

    const controls = document.createElement('span');
    controls.dataset['etLayoutV2'] = 'true';
    controls.style.display = 'inline-flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '7px';

    const makeButton = (
      label: string,
      title: string,
      aria: string,
      svg: string,
      mode: EventTreeLayoutMode
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', aria);
      button.setAttribute('aria-pressed', 'false');
      // Keep the exact toolbar button box used by Fit / + Branch. Only add an
      // icon+text arrangement inside so the purpose is immediately readable.
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.style.gap = '6px';
      button.innerHTML = `${svg}<span>${label}</span>`;
      button.addEventListener('click', () => {
        component.__eventTreeLayoutModeV2 = mode;
        updateButtons(component);
        requestAnimationFrame(() => rebuildForMode(component));
      });
      return button;
    };

    const standardIcon = `
      <svg viewBox="0 0 24 16" width="21" height="14" aria-hidden="true" style="display:block">
        <path d="M2 3H22 M7 3V8H22 M13 3V13H22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>`;

    const centeredIcon = `
      <svg viewBox="0 0 24 16" width="21" height="14" aria-hidden="true" style="display:block">
        <path d="M2 8H22 M7 8V3H22 M13 8V13H22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>`;

    const standard = makeButton(
      'Standard',
      'Disposition ET standard',
      'Afficher l’Event Tree avec la ligne principale en haut',
      standardIcon,
      'STANDARD'
    );
    const centered = makeButton(
      'Centré',
      'Disposition ET centrée',
      'Afficher l’Event Tree avec la ligne principale centrée',
      centeredIcon,
      'CENTERED'
    );

    controls.append(standard, centered);
    const hint = toolbar.querySelector('.hint');
    toolbar.insertBefore(controls, hint ?? null);

    component.__eventTreeLayoutControlsV2 = controls;
    component.__eventTreeLayoutLeftButton = standard;
    component.__eventTreeLayoutCenteredButtonV2 = centered;
    component.__eventTreeLayoutModeV2 ??= 'STANDARD';
    updateButtons(component);
  };

  prototype.applyModel = function(metrics: unknown): void {
    this.__eventTreeViewportMetrics = metrics;
    originalApplyModel.call(this, metrics);
    saveBaseGeometry(this);

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    requestAnimationFrame(() => {
      removeCenteredMainResult(diagram);
      if (getMode(this) === 'CENTERED') applyCenteredGeometry(this);
      else applyStandardRouting(diagram);
    });
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    requestAnimationFrame(() => {
      injectButtons(this);
      if (getMode(this) === 'CENTERED') rebuildForMode(this);
    });
  };

  prototype.ngOnDestroy = function(): void {
    const diagram = this.diagram as go.Diagram | undefined;
    if (diagram) removeCenteredMainResult(diagram);
    (this.__eventTreeLayoutControlsV2 as HTMLElement | undefined)?.remove();
    this.__eventTreeLayoutControlsV2 = null;
    this.__eventTreeLayoutLeftButton = null;
    this.__eventTreeLayoutCenteredButtonV2 = null;
    originalDestroy.call(this);
  };
}
