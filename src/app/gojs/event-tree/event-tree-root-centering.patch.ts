import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

const BASELINE_START_KEY = '__BASELINE_START__';
const BASELINE_END_KEY = '__BASELINE_END__';
const CENTER_ROUTE = '__etCenteredRoute';
const CENTER_ANCHOR_PREFIX = '__ETC-';

interface RootChild {
  to: string;
  kind: 'CONTINUE' | 'BRANCH';
  branchNo: number;
}

export function installEventTreeRootCenteringPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeRootCenteringPatchInstalled) return;
  prototype.__eventTreeRootCenteringPatchInstalled = true;

  const originalApplyModel = prototype.applyModel;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const branchNumber = (label: string | undefined): number => {
    const match = /^Branch\s+(\d+)/.exec(label ?? '');
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };

  const centeredAnchorPrefix = (sourceKey: string): string =>
    `${CENTER_ANCHOR_PREFIX}${encodeURIComponent(sourceKey)}-`;

  const centeredAnchorKey = (sourceKey: string, index: number): string =>
    `${centeredAnchorPrefix(sourceKey)}${index}`;

  const applyStraightRouting = (diagram: go.Diagram): void => {
    diagram.links.each((link: go.Link) => {
      // Centered ET routes are explicitly orthogonal. This is a defensive
      // invariant on top of the manually built vertical spines + horizontal exits:
      // even if a future geometry pass moves an endpoint, GoJS cannot render a
      // diagonal branch segment.
      link.routing = (link.data as any)?.[CENTER_ROUTE]
        ? go.Routing.Orthogonal
        : go.Routing.Normal;
      link.curve = go.Curve.None;
      link.corner = 0;
      link.fromShortLength = 0;
      link.toShortLength = 0;
      link.invalidateRoute();
    });
  };

  const targetConnectionY = (component: any, target: go.Node): number => {
    const category = String((target.data as any)?.category ?? '');
    if (category === 'SEQUENCE') {
      // SEQUENCE nodes use TopLeft location while ET links connect to the middle
      // of the row (toSpot = Left). Using location.y directly therefore creates
      // a half-row vertical error and, with Normal routing, a diagonal exit.
      const rowHeight = Number(component.__eventTreeViewportMetrics?.sequenceRowHeight ?? 34);
      return target.location.y + rowHeight / 2;
    }
    return target.location.y;
  };

  const getFirstMainBranchColumn = (component: any): number | null => {
    const columns = (component.model?.links ?? [])
      .filter((link: any) => /^Branch\s+\d+/.test(link.label ?? ''))
      .map((link: any) => /^FEPOINT-(\d+)$/.exec(String(link.from ?? '')))
      .filter((match: RegExpExecArray | null): match is RegExpExecArray => !!match)
      .map((match: RegExpExecArray) => Number(match[1]))
      .filter((column: number) => Number.isFinite(column));

    return columns.length ? Math.min(...columns) : null;
  };

  const getRootChildren = (component: any, sourceKey: string, column: number): RootChild[] => {
    const children: RootChild[] = [];
    const feCount = Number(component.model?.functionEvents?.length ?? 0);
    const continuation = column < feCount ? `FEPOINT-${column + 1}` : BASELINE_END_KEY;
    children.push({ to: continuation, kind: 'CONTINUE', branchNo: 0 });

    (component.model?.links ?? [])
      .filter((link: any) => String(link.from ?? '') === sourceKey)
      .forEach((link: any) => {
        const to = String(link.to ?? '');
        if (!to) return;
        const isBranch = /^Branch\s+\d+/.test(link.label ?? '');
        children.push({
          to,
          kind: isBranch ? 'BRANCH' : 'CONTINUE',
          branchNo: isBranch ? branchNumber(link.label) : 0
        });
      });

    const seen = new Set<string>();
    return children.filter((child) => {
      const signature = `${child.to}\u0000${child.kind}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  };

  const rebuildRootSourceRoutes = (
    component: any,
    diagram: go.Diagram,
    sourceKey: string,
    sourceY: number,
    column: number
  ): void => {
    const graphModel = diagram.model as go.GraphLinksModel;
    const sourceNode = diagram.findNodeForKey(sourceKey);
    if (!sourceNode) return;

    const prefix = centeredAnchorPrefix(sourceKey);
    const anchorKeys = new Set<string>();
    (graphModel.nodeDataArray as any[]).forEach((data) => {
      const key = String(data?.key ?? '');
      if (key.startsWith(prefix)) anchorKeys.add(key);
    });

    [...(graphModel.linkDataArray as any[])]
      .filter((data) => data?.[CENTER_ROUTE]
        && (String(data?.from ?? '') === sourceKey
          || anchorKeys.has(String(data?.from ?? ''))
          || anchorKeys.has(String(data?.to ?? ''))))
      .forEach((data) => graphModel.removeLinkData(data));

    [...(graphModel.nodeDataArray as any[])]
      .filter((data) => anchorKeys.has(String(data?.key ?? '')))
      .forEach((data) => graphModel.removeNodeData(data));

    const children = getRootChildren(component, sourceKey, column)
      .map((child) => ({ child, target: diagram.findNodeForKey(child.to) }))
      .filter((item) => !!item.target)
      .map((item) => ({
        child: item.child,
        // Important: use the actual link connection lane, not the node's raw
        // location. Result rows are located by their top-left corner.
        y: targetConnectionY(component, item.target as go.Node)
      }));
    if (!children.length) return;

    const sourceX = sourceNode.location.x;
    const levels = Array.from(new Set([sourceY, ...children.map((item) => item.y)]))
      .sort((a, b) => a - b);
    const keyByY = new Map<number, string>();

    levels.forEach((y, index) => {
      if (Math.abs(y - sourceY) < 0.001) {
        keyByY.set(y, sourceKey);
        return;
      }
      const key = centeredAnchorKey(sourceKey, index + 1);
      graphModel.addNodeData({
        key,
        category: 'ANCHOR',
        loc: `${sourceX} ${y}`,
        [CENTER_ROUTE]: true
      });
      keyByY.set(y, key);
    });

    for (let index = 0; index < levels.length - 1; index += 1) {
      const from = keyByY.get(levels[index]);
      const to = keyByY.get(levels[index + 1]);
      if (!from || !to || from === to) continue;
      graphModel.addLinkData({ from, to, [CENTER_ROUTE]: true, centeredRole: 'SPINE' });
    }

    children.forEach(({ child, y }) => {
      const from = keyByY.get(y);
      if (!from) return;
      graphModel.addLinkData({
        from,
        to: child.to,
        [CENTER_ROUTE]: true,
        centeredRole: child.kind === 'BRANCH' ? 'BRANCH_EXIT' : 'CONTINUE_EXIT',
        branchNo: child.branchNo
      });
    });
  };

  const centerInitialPathFromConsequences = (component: any): void => {
    if (component.__eventTreeLayoutModeV2 !== 'CENTERED') return;
    const diagram = component.diagram as go.Diagram | undefined;
    const metrics = component.__eventTreeViewportMetrics;
    if (!diagram || !metrics) return;

    const firstBranchColumn = getFirstMainBranchColumn(component);
    if (!firstBranchColumn) return;

    const rowHeight = Number(metrics.sequenceRowHeight ?? 34);
    const sequenceCenters: number[] = [];
    diagram.nodes.each((node: go.Node) => {
      if ((node.data as any)?.category !== 'SEQUENCE') return;
      sequenceCenters.push(node.location.y + rowHeight / 2);
    });
    if (!sequenceCenters.length) return;

    // The terminal consequences are the reference geometry. The initial ET path is
    // centred on the full terminal envelope, not on the centres of intermediate
    // child subtrees. This is what keeps 3, 4, 5... consequence layouts balanced.
    const desiredY = (Math.min(...sequenceCenters) + Math.max(...sequenceCenters)) / 2;
    const graphModel = diagram.model as go.GraphLinksModel;

    diagram.startTransaction('center initial ET path from consequences');

    const initialKeys = [BASELINE_START_KEY];
    for (let column = 1; column <= firstBranchColumn; column += 1) {
      initialKeys.push(`FEPOINT-${column}`);
    }

    initialKeys.forEach((key) => {
      const node = diagram.findNodeForKey(key);
      if (!node) return;
      node.location = new go.Point(node.location.x, desiredY);
      const data = node.data as any;
      if (data) graphModel.setDataProperty(data, 'loc', go.Point.stringify(node.location));
    });

    // Rebuild the first real branching source after moving it. This avoids a
    // diagonal/offset continuation when one child previously shared the old source Y.
    const sourceKey = `FEPOINT-${firstBranchColumn}`;
    rebuildRootSourceRoutes(component, diagram, sourceKey, desiredY, firstBranchColumn);

    diagram.commitTransaction('center initial ET path from consequences');
    applyStraightRouting(diagram);
    component.lockViewport?.();
    component.updateDotVisuals?.();
  };

  const scheduleFinalCentering = (component: any): void => {
    const epoch = Number(component.__eventTreeRootCenteringEpoch ?? 0) + 1;
    component.__eventTreeRootCenteringEpoch = epoch;

    // Run strictly after the V2 layout and the existing stability pass. The last
    // pass therefore always uses the final consequence rows visible on screen.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (component.__eventTreeRootCenteringEpoch !== epoch) return;
          centerInitialPathFromConsequences(component);
        });
      });
    });
  };

  prototype.applyModel = function(metrics: unknown): void {
    originalApplyModel.call(this, metrics);
    if (this.__eventTreeLayoutModeV2 === 'CENTERED') scheduleFinalCentering(this);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const controls = this.__eventTreeLayoutControlsV2 as HTMLElement | undefined;
        if (controls && !this.__eventTreeRootCenteringClickListener) {
          const listener = (): void => scheduleFinalCentering(this);
          controls.addEventListener('click', listener);
          this.__eventTreeRootCenteringClickListener = listener;
        }
        if (this.__eventTreeLayoutModeV2 === 'CENTERED') scheduleFinalCentering(this);
      });
    });
  };

  prototype.ngOnDestroy = function(): void {
    const controls = this.__eventTreeLayoutControlsV2 as HTMLElement | undefined;
    const listener = this.__eventTreeRootCenteringClickListener as EventListener | undefined;
    if (controls && listener) controls.removeEventListener('click', listener);
    this.__eventTreeRootCenteringClickListener = null;
    originalOnDestroy.call(this);
  };
}
