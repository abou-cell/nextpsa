import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type EventTreeLayoutMode = 'STANDARD' | 'CENTERED';

const MOVABLE_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH', 'ANCHOR']);
const MAIN_SEQUENCE_KEY = 'S1';

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
      button.style.background = active ? '#e8f1ff' : '#ffffff';
      button.style.borderColor = active ? '#3b82f6' : '#cbd5e1';
      button.style.color = active ? '#2563eb' : '#1f2937';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    };

    setState(standard, mode === 'STANDARD');
    setState(centered, mode === 'CENTERED');
  };

  const restoreBaseLocations = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (!MOVABLE_CATEGORIES.has(data?.category)) return;
      const baseLoc = data?.__etBaseLoc as string | undefined;
      if (baseLoc) node.location = go.Point.parse(baseLoc);
    });
  };

  const sequenceCenters = (component: any): Map<string, number> => {
    const diagram = component.diagram as go.Diagram | undefined;
    const result = new Map<string, number>();
    if (!diagram) return result;

    const rowHeight = Number(component.__eventTreeViewportMetrics?.sequenceRowHeight ?? 34);
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (data?.category !== 'SEQUENCE') return;
      result.set(String(data.key), node.location.y + rowHeight / 2);
    });
    return result;
  };

  const reachableSequences = (component: any, sourceKey: string, centers: Map<string, number>): string[] => {
    const links = component.model?.links ?? [];
    const outgoing = new Map<string, string[]>();
    links.forEach((link: any) => {
      const list = outgoing.get(String(link.from)) ?? [];
      list.push(String(link.to));
      outgoing.set(String(link.from), list);
    });

    const found = new Set<string>();
    const visited = new Set<string>();
    const visit = (key: string, depth: number): void => {
      if (depth > 100 || visited.has(key)) return;
      visited.add(key);
      if (centers.has(key)) {
        found.add(key);
        return;
      }
      (outgoing.get(key) ?? []).forEach((next) => visit(next, depth + 1));
    };
    visit(sourceKey, 0);

    if (!found.size) {
      const branch = (component.model?.nodes ?? []).find(
        (node: any) => node.category === 'BRANCH' && node.key === sourceKey
      );
      if (branch?.pathSequenceKey && centers.has(branch.pathSequenceKey)) {
        found.add(branch.pathSequenceKey);
      }
    }

    return [...found];
  };

  const averageY = (keys: string[], centers: Map<string, number>, fallback: number): number => {
    const ys = keys.map((key) => centers.get(key)).filter((value): value is number => Number.isFinite(value));
    if (!ys.length) return fallback;
    return ys.reduce((sum, value) => sum + value, 0) / ys.length;
  };

  const applyCenteredGeometry = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    restoreBaseLocations(component);
    if (getMode(component) !== 'CENTERED') {
      diagram.links.each((link: go.Link) => link.invalidateRoute());
      component.lockViewport?.();
      return;
    }

    const centers = sequenceCenters(component);
    if (!centers.size) return;

    const allSequenceKeys = [...centers.keys()];
    const mainKeys = centers.has(MAIN_SEQUENCE_KEY)
      ? [MAIN_SEQUENCE_KEY, ...((component.model?.nodes ?? [])
          .filter((node: any) => node.category === 'SEQUENCE' && node.key !== MAIN_SEQUENCE_KEY)
          .map((node: any) => String(node.key)))]
      : allSequenceKeys;
    const rootY = averageY(mainKeys, centers, [...centers.values()][0]);

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const category = data?.category;
      if (category === 'START_POINT' || category === 'FE_POINT') {
        node.location = new go.Point(node.location.x, rootY);
        return;
      }

      if (category === 'BRANCH') {
        const descendants = reachableSequences(component, String(data.key), centers);
        const y = averageY(descendants, centers, node.location.y);
        node.location = new go.Point(node.location.x, y);
      }
    });

    // Baseline end follows the centered main path. Synthetic branch bends stay at
    // the target Y so branch geometry remains orthogonal and readable.
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (data?.category !== 'ANCHOR') return;
      const key = String(data.key ?? '');
      if (key === '__BASELINE_END__') {
        node.location = new go.Point(node.location.x, rootY);
        return;
      }
      if (!key.startsWith('__BEND-')) return;

      const outgoing = node.findLinksOutOf().first();
      const target = outgoing?.toNode;
      if (!target) return;
      const targetData = target.data as any;
      const targetY = targetData?.category === 'SEQUENCE'
        ? (centers.get(String(targetData.key)) ?? target.actualBounds.center.y)
        : target.location.y;
      node.location = new go.Point(node.location.x, targetY);
    });

    diagram.links.each((link: go.Link) => link.invalidateRoute());
    component.lockViewport?.();
  };

  const injectButtons = (component: any): void => {
    const shell = component.diagramDiv?.nativeElement?.closest?.('.et-shell') as HTMLElement | null;
    const toolbar = shell?.querySelector?.('.toolbar') as HTMLElement | null;
    if (!toolbar || component.__eventTreeLayoutControlsV2) return;

    (component.__eventTreeLayoutControls as HTMLElement | undefined)?.remove();
    component.__eventTreeLayoutControls = null;

    const controls = document.createElement('span');
    controls.dataset['etLayoutV2'] = 'true';
    Object.assign(controls.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '7px',
      marginLeft: '0'
    });

    const makeButton = (title: string, aria: string, mode: EventTreeLayoutMode): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', aria);
      button.style.padding = '0 11px';
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      button.style.minWidth = '42px';
      button.innerHTML = '<svg viewBox="0 0 26 18" width="22" height="16" aria-hidden="true"><path d="M6 2v14M6 3h14M6 9h10M6 15h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      button.addEventListener('click', () => {
        component.__eventTreeLayoutModeV2 = mode;
        updateButtons(component);
        requestAnimationFrame(() => applyCenteredGeometry(component));
      });
      return button;
    };

    const standard = makeButton(
      'Disposition ET actuelle',
      'Garder la disposition actuelle de l’Event Tree',
      'STANDARD'
    );
    const centered = makeButton(
      'Centrer les branches ET',
      'Centrer la géométrie des branches Event Tree',
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
    originalApplyModel.call(this, metrics);
    const diagram = this.diagram as go.Diagram | undefined;
    if (diagram) {
      diagram.nodes.each((node: go.Node) => {
        const data = node.data as any;
        if (!MOVABLE_CATEGORIES.has(data?.category)) return;
        data.__etBaseLoc = go.Point.stringify(node.location);
      });
    }
    requestAnimationFrame(() => applyCenteredGeometry(this));
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    requestAnimationFrame(() => {
      injectButtons(this);
      applyCenteredGeometry(this);
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
