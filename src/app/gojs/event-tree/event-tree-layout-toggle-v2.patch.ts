import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type EventTreeLayoutMode = 'STANDARD' | 'CENTERED';

const SAVED_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH', 'ANCHOR']);
const CENTER_MAIN_RESULT = '__etCenteredMainResult';
const CENTER_MAIN_ANCHOR = '__ET-CENTER-MAIN-RESULT-ANCHOR__';
const RESULT_GUTTER = 18;

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

    const anchor = model.findNodeDataForKey(CENTER_MAIN_ANCHOR);
    if (anchor) model.removeNodeData(anchor);
  };

  const applyStraightRouting = (diagram: go.Diagram): void => {
    diagram.links.each((link: go.Link) => {
      // Geometry is explicitly built from aligned nodes + bend anchors.
      // Normal routing therefore produces only the intended straight vertical
      // and horizontal segments, with no automatic detours or weaving.
      link.routing = go.Routing.Normal;
      link.curve = go.Curve.None;
      link.corner = 0;
      link.fromShortLength = 0;
      link.toShortLength = 0;
      link.invalidateRoute();
    });
  };

  const downstreamSequenceKey = (node: go.Node): string => {
    const data = node.data as any;
    if (data?.category === 'SEQUENCE') return String(data.key ?? '');
    if (data?.pathSequenceKey) return String(data.pathSequenceKey);

    const target = node.findLinksOutOf().first()?.toNode;
    const targetData = target?.data as any;
    if (targetData?.category === 'SEQUENCE') return String(targetData.key ?? '');
    return targetData?.pathSequenceKey ? String(targetData.pathSequenceKey) : '';
  };

  const applyCenteredGeometry = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const rows = sequenceRows(component);
    if (!rows.size) return;

    const rowYs = [...rows.values()].map((row) => row.centerY).sort((a, b) => a - b);
    const centerY = (rowYs[0] + rowYs[rowYs.length - 1]) / 2;
    const rootKey = mainSequenceKey(component, rows);
    const resultX = Number(component.__eventTreeViewportMetrics?.resultX ?? 0);
    const resultRailX = Math.max(0, resultX - RESULT_GUTTER);

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const category = data?.category;
      const key = String(data?.key ?? '');

      // Only the main ET spine is centered.
      if (category === 'START_POINT' || category === 'FE_POINT') {
        node.location = new go.Point(node.location.x, centerY);
        return;
      }

      // Stop the main spine just before the consequence table. The dedicated
      // result leg below then makes the final connection vertical + horizontal.
      if (key === '__BASELINE_END__') {
        node.location = new go.Point(resultRailX, centerY);
        return;
      }

      // Every branch path is locked to its own consequence/sequence row.
      // Thus all branch runs towards Consequence are horizontal and parallel.
      if (category === 'BRANCH') {
        const sequenceKey = data.pathSequenceKey ? String(data.pathSequenceKey) : '';
        const row = rows.get(sequenceKey);
        if (row) node.location = new go.Point(node.location.x, row.centerY);
        return;
      }

      // A branch-start bend is always positioned exactly below/above its source
      // X coordinate and on the target sequence row. With Normal routing this is
      // a vertical take-off followed by a horizontal branch, never a diagonal.
      if (category === 'ANCHOR' && key.startsWith('__BEND-')) {
        const sequenceKey = downstreamSequenceKey(node);
        const row = rows.get(sequenceKey);
        if (row) node.location = new go.Point(node.location.x, row.centerY);
      }
    });

    // Main sequence result: vertical on the dedicated right-side rail, then one
    // short horizontal segment into its consequence row. This prevents the main
    // path from cutting diagonally across the branch lanes.
    if (rootKey) {
      const rootRow = rows.get(rootKey);
      if (rootRow) {
        const model = diagram.model as go.GraphLinksModel;
        model.addNodeData({
          key: CENTER_MAIN_ANCHOR,
          category: 'ANCHOR',
          loc: `${resultRailX} ${rootRow.centerY}`
        });
        model.addLinkData({
          from: '__BASELINE_END__',
          to: CENTER_MAIN_ANCHOR,
          [CENTER_MAIN_RESULT]: true
        });
        model.addLinkData({
          from: CENTER_MAIN_ANCHOR,
          to: rootKey,
          [CENTER_MAIN_RESULT]: true
        });
      }
    }

    applyStraightRouting(diagram);
    component.lockViewport?.();
  };

  const rebuildForMode = (component: any): void => {
    const metrics = component.__eventTreeViewportMetrics;
    if (!metrics) return;

    // Always rebuild from the canonical ET geometry before changing layout.
    originalApplyModel.call(component, metrics);
    saveBaseGeometry(component);

    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;
    removeCenteredMainResult(diagram);

    if (getMode(component) === 'CENTERED') applyCenteredGeometry(component);
    else {
      restoreBaseGeometry(component);
      applyStraightRouting(diagram);
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
      // Same visual box as + Branch / Fit: the button itself receives no custom
      // border, radius, height or background, only an icon + text layout.
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

    // Standard icon inspired by the supplied reference: three parallel ET lanes
    // stepped progressively to the right, visually representing the standard
    // top-down branching arrangement.
    const standardIcon = `
      <svg viewBox="0 0 26 18" width="23" height="16" aria-hidden="true" style="display:block">
        <path d="M2 3H14 M6 3V7H18 M10 7V11H22 M14 11V15H25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"></path>
      </svg>`;

    // Centered icon: one central spine with one branch above and one below.
    const centeredIcon = `
      <svg viewBox="0 0 26 18" width="23" height="16" aria-hidden="true" style="display:block">
        <path d="M2 9H25 M8 9V4H21 M14 9V14H25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"></path>
      </svg>`;

    const standard = makeButton(
      'Standard',
      'Disposition ET standard',
      'Afficher l’Event Tree en disposition standard',
      standardIcon,
      'STANDARD'
    );
    const centered = makeButton(
      'Centré',
      'Disposition ET centrée',
      'Afficher l’Event Tree avec une ligne principale centrée et des branches parallèles',
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
      else applyStraightRouting(diagram);
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
