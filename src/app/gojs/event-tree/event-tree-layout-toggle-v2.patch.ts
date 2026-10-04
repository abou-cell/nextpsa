import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type EventTreeLayoutMode = 'STANDARD' | 'CENTERED';

const SAVED_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH', 'ANCHOR']);
const SYNTHETIC_MARKER = '__etCenteredSynthetic';
const RESULT_RAIL_GUTTER = 26;

interface SequenceGeometry {
  key: string;
  centerY: number;
  parentSequenceKey?: string;
  sequenceNo?: number;
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

  const getSequenceData = (component: any): {
    rootKey: string | null;
    rows: Map<string, SequenceGeometry>;
    pathY: Map<string, number>;
  } => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return { rootKey: null, rows: new Map(), pathY: new Map() };

    const rowHeight = Number(component.__eventTreeViewportMetrics?.sequenceRowHeight ?? 34);
    const rows = new Map<string, SequenceGeometry>();

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (data?.category !== 'SEQUENCE') return;
      rows.set(String(data.key), {
        key: String(data.key),
        centerY: node.location.y + rowHeight / 2,
        parentSequenceKey: data.parentSequenceKey ? String(data.parentSequenceKey) : undefined,
        sequenceNo: Number(data.sequenceNo ?? 0)
      });
    });

    const children = new Map<string, string[]>();
    rows.forEach((sequence) => {
      const parent = sequence.parentSequenceKey;
      if (!parent || !rows.has(parent)) return;
      const list = children.get(parent) ?? [];
      list.push(sequence.key);
      children.set(parent, list);
    });

    children.forEach((keys) => {
      keys.sort((a, b) => (rows.get(a)?.centerY ?? 0) - (rows.get(b)?.centerY ?? 0));
    });

    const roots = [...rows.values()]
      .filter((sequence) => !sequence.parentSequenceKey || !rows.has(sequence.parentSequenceKey))
      .sort((a, b) => {
        const noDiff = (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0);
        return noDiff || a.centerY - b.centerY;
      });

    const pathY = new Map<string, number>();
    const spanMemo = new Map<string, { min: number; max: number }>();

    const buildSpan = (key: string, stack = new Set<string>()): { min: number; max: number } => {
      const memo = spanMemo.get(key);
      if (memo) return memo;
      const own = rows.get(key);
      if (!own) return { min: 0, max: 0 };
      if (stack.has(key)) return { min: own.centerY, max: own.centerY };

      const nextStack = new Set(stack);
      nextStack.add(key);

      let min = own.centerY;
      let max = own.centerY;
      (children.get(key) ?? []).forEach((childKey) => {
        const childSpan = buildSpan(childKey, nextStack);
        min = Math.min(min, childSpan.min);
        max = Math.max(max, childSpan.max);
      });

      const span = { min, max };
      spanMemo.set(key, span);
      pathY.set(key, (min + max) / 2);
      return span;
    };

    roots.forEach((root) => buildSpan(root.key));
    rows.forEach((_row, key) => {
      if (!pathY.has(key)) buildSpan(key);
    });

    return { rootKey: roots[0]?.key ?? null, rows, pathY };
  };

  const findResultX = (diagram: go.Diagram): number | null => {
    const resultHeader = diagram.findNodeForKey('RESULT-HEADER');
    if (resultHeader) return resultHeader.location.x;
    let resultX: number | null = null;
    diagram.nodes.each((node: go.Node) => {
      if ((node.data as any)?.category === 'SEQUENCE' && resultX === null) resultX = node.location.x;
    });
    return resultX;
  };

  const removeSyntheticResultGeometry = (diagram: go.Diagram): void => {
    const model = diagram.model as go.GraphLinksModel;
    const links = [...(model.linkDataArray as any[])];
    links.filter((data) => Boolean(data?.[SYNTHETIC_MARKER])).forEach((data) => model.removeLinkData(data));

    const nodes = [...(model.nodeDataArray as any[])];
    nodes.filter((data) => Boolean(data?.[SYNTHETIC_MARKER])).forEach((data) => model.removeNodeData(data));
  };

  const applyNormalRouting = (diagram: go.Diagram): void => {
    diagram.links.each((link: go.Link) => {
      link.routing = go.Routing.Normal;
      link.curve = go.Curve.None;
      link.corner = 0;
      link.invalidateRoute();
    });
  };

  const routeResultsThroughRail = (
    component: any,
    rootKey: string,
    rows: Map<string, SequenceGeometry>,
    pathY: Map<string, number>
  ): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;
    const model = diagram.model as go.GraphLinksModel;
    const resultX = findResultX(diagram);
    if (!Number.isFinite(resultX)) return;

    const railX = Math.max(0, Number(resultX) - RESULT_RAIL_GUTTER);
    const linkData = model.linkDataArray as any[];

    rows.forEach((row, sequenceKey) => {
      const pathCenter = pathY.get(sequenceKey) ?? row.centerY;
      let sourceKey: string | null = null;

      if (sequenceKey === rootKey) {
        sourceKey = '__BASELINE_END__';
      } else {
        const directResult = linkData.find((data) =>
          data?.to === sequenceKey && !data?.[SYNTHETIC_MARKER]
        );
        if (directResult) {
          sourceKey = String(directResult.from);
          model.removeLinkData(directResult);
        }
      }

      if (!sourceKey) return;

      const pathAnchorKey = `__CENTER-RAIL-PATH-${sequenceKey}`;
      const rowAnchorKey = `__CENTER-RAIL-ROW-${sequenceKey}`;
      model.addNodeData({
        key: pathAnchorKey,
        category: 'ANCHOR',
        loc: `${railX} ${pathCenter}`,
        [SYNTHETIC_MARKER]: true
      });
      model.addNodeData({
        key: rowAnchorKey,
        category: 'ANCHOR',
        loc: `${railX} ${row.centerY}`,
        [SYNTHETIC_MARKER]: true
      });
      model.addLinkData({ from: sourceKey, to: pathAnchorKey, [SYNTHETIC_MARKER]: true });
      if (Math.abs(pathCenter - row.centerY) > 0.1) {
        model.addLinkData({ from: pathAnchorKey, to: rowAnchorKey, [SYNTHETIC_MARKER]: true });
      }
      model.addLinkData({
        from: Math.abs(pathCenter - row.centerY) > 0.1 ? rowAnchorKey : pathAnchorKey,
        to: sequenceKey,
        [SYNTHETIC_MARKER]: true
      });
    });
  };

  const applyCenteredGeometry = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const { rootKey, rows, pathY } = getSequenceData(component);
    if (!rootKey || !rows.size || !pathY.size) return;
    const mainY = pathY.get(rootKey);
    if (!Number.isFinite(mainY)) return;

    const resultX = findResultX(diagram);
    const railX = Number.isFinite(resultX) ? Math.max(0, Number(resultX) - RESULT_RAIL_GUTTER) : null;

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const category = data?.category;
      const key = String(data?.key ?? '');

      if (category === 'START_POINT' || category === 'FE_POINT') {
        node.location = new go.Point(node.location.x, mainY!);
        return;
      }

      if (key === '__BASELINE_END__') {
        node.location = new go.Point(railX ?? node.location.x, mainY!);
        return;
      }

      if (category === 'BRANCH') {
        const sequenceKey = data.pathSequenceKey ? String(data.pathSequenceKey) : '';
        const y = pathY.get(sequenceKey);
        if (Number.isFinite(y)) node.location = new go.Point(node.location.x, y!);
        return;
      }

      if (category !== 'ANCHOR' || !key.startsWith('__BEND-')) return;
      const target = node.findLinksOutOf().first()?.toNode;
      if (!target) return;
      const targetData = target.data as any;
      const targetSequenceKey = targetData?.category === 'SEQUENCE'
        ? String(targetData.key)
        : targetData?.pathSequenceKey
          ? String(targetData.pathSequenceKey)
          : '';
      const targetPathY = pathY.get(targetSequenceKey);
      if (Number.isFinite(targetPathY)) node.location = new go.Point(node.location.x, targetPathY!);
    });

    routeResultsThroughRail(component, rootKey, rows, pathY);
    applyNormalRouting(diagram);
    component.lockViewport?.();
  };

  const rebuildForMode = (component: any): void => {
    const metrics = component.__eventTreeViewportMetrics;
    if (!metrics) return;

    originalApplyModel.call(component, metrics);
    saveBaseGeometry(component);
    removeSyntheticResultGeometry(component.diagram as go.Diagram);

    if (getMode(component) === 'CENTERED') applyCenteredGeometry(component);
    else {
      applyNormalRouting(component.diagram as go.Diagram);
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
      title: string,
      aria: string,
      svgPath: string,
      mode: EventTreeLayoutMode
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', aria);
      button.setAttribute('aria-pressed', 'false');
      button.style.minWidth = '44px';
      button.style.padding = '0 10px';
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      button.innerHTML = `<svg viewBox="0 0 28 18" width="24" height="16" aria-hidden="true" style="display:block"><path d="${svgPath}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
      button.addEventListener('click', () => {
        component.__eventTreeLayoutModeV2 = mode;
        updateButtons(component);
        requestAnimationFrame(() => rebuildForMode(component));
      });
      return button;
    };

    // Standard icon: main ET spine on top with branches descending.
    const standard = makeButton(
      'Disposition ET standard',
      'Afficher l’Event Tree avec la ligne principale en haut',
      'M2 4H26 M8 4V9H26 M14 4V14H26',
      'STANDARD'
    );

    // Centered icon: main ET spine in the middle with branches above and below.
    const centered = makeButton(
      'Disposition ET centrée',
      'Centrer la ligne principale et répartir les branches au-dessus et au-dessous',
      'M2 9H26 M9 9V3H26 M15 9V15H26',
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
      removeSyntheticResultGeometry(diagram);
      if (getMode(this) === 'CENTERED') applyCenteredGeometry(this);
      else applyNormalRouting(diagram);
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
    if (diagram) removeSyntheticResultGeometry(diagram);
    (this.__eventTreeLayoutControlsV2 as HTMLElement | undefined)?.remove();
    this.__eventTreeLayoutControlsV2 = null;
    this.__eventTreeLayoutLeftButton = null;
    this.__eventTreeLayoutCenteredButtonV2 = null;
    originalDestroy.call(this);
  };
}
