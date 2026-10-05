import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type LogicalEdgeKind = 'CONTINUE' | 'BRANCH';

interface LogicalEdge {
  from: string;
  to: string;
  kind: LogicalEdgeKind;
  branchNo: number;
  order: number;
}

interface SequenceInfo {
  key: string;
  sequenceNo: number;
}

interface DescendantSpan {
  minY: number;
  maxY: number;
  centerY: number;
}

const BASELINE_START_KEY = '__BASELINE_START__';
const BASELINE_END_KEY = '__BASELINE_END__';
const CENTER_ANCHOR_PREFIX = '__ETC-';
const CENTER_ROUTE = '__etCenteredRoute';

export function installEventTreeCenteredStabilityPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeCenteredStabilityPatchInstalled) return;
  prototype.__eventTreeCenteredStabilityPatchInstalled = true;

  const originalApplyModel = prototype.applyModel;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const getSequences = (component: any): SequenceInfo[] =>
    (component.model?.nodes ?? [])
      .filter((node: any) => node.category === 'SEQUENCE')
      .map((node: any): SequenceInfo => ({
        key: String(node.key),
        sequenceNo: Number(node.sequenceNo ?? 0)
      }));

  const branchNumber = (label: string | undefined): number => {
    const match = /^Branch\s+(\d+)/.exec(label ?? '');
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };

  const buildLogicalEdges = (component: any): LogicalEdge[] => {
    const edges: LogicalEdge[] = [];
    let order = 0;
    const sequences = getSequences(component);
    const mainSequenceKey = sequences.some((sequence) => sequence.key === 'S1')
      ? 'S1'
      : [...sequences].sort((a, b) => a.sequenceNo - b.sequenceNo)[0]?.key ?? '';
    const feCount = Number(component.model?.functionEvents?.length ?? 0);

    const addContinue = (from: string, to: string): void => {
      if (!from || !to) return;
      edges.push({ from, to, kind: 'CONTINUE', branchNo: 0, order: order++ });
    };

    if (feCount > 0) {
      addContinue(BASELINE_START_KEY, 'FEPOINT-1');
      for (let column = 1; column < feCount; column += 1) {
        addContinue(`FEPOINT-${column}`, `FEPOINT-${column + 1}`);
      }
      addContinue(`FEPOINT-${feCount}`, BASELINE_END_KEY);
    } else {
      addContinue(BASELINE_START_KEY, BASELINE_END_KEY);
    }
    if (mainSequenceKey) addContinue(BASELINE_END_KEY, mainSequenceKey);

    (component.model?.links ?? []).forEach((link: any) => {
      const from = String(link.from ?? '');
      const to = String(link.to ?? '');
      if (!from || !to) return;
      const isBranch = /^Branch\s+\d+/.test(link.label ?? '');
      edges.push({
        from,
        to,
        kind: isBranch ? 'BRANCH' : 'CONTINUE',
        branchNo: isBranch ? branchNumber(link.label) : 0,
        order: order++
      });
    });

    const seen = new Set<string>();
    return edges.filter((edge) => {
      const signature = `${edge.from}\u0000${edge.to}\u0000${edge.kind}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  };

  const buildOutgoing = (edges: LogicalEdge[]): Map<string, LogicalEdge[]> => {
    const outgoing = new Map<string, LogicalEdge[]>();
    edges.forEach((edge) => {
      const list = outgoing.get(edge.from) ?? [];
      list.push(edge);
      outgoing.set(edge.from, list);
    });

    outgoing.forEach((list) => list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'CONTINUE' ? -1 : 1;
      if (a.kind === 'BRANCH' && a.branchNo !== b.branchNo) return a.branchNo - b.branchNo;
      return a.order - b.order;
    }));
    return outgoing;
  };

  const buildConsequenceOrder = (
    component: any,
    outgoing: Map<string, LogicalEdge[]>
  ): string[] => {
    const sequenceKeys = new Set(getSequences(component).map((sequence) => sequence.key));
    const ordered: string[] = [];
    const seen = new Set<string>();
    const active = new Set<string>();

    const visit = (key: string): void => {
      if (sequenceKeys.has(key)) {
        if (!seen.has(key)) {
          seen.add(key);
          ordered.push(key);
        }
        return;
      }
      if (active.has(key)) return;
      active.add(key);
      (outgoing.get(key) ?? []).forEach((edge) => visit(edge.to));
      active.delete(key);
    };

    visit(BASELINE_START_KEY);

    getSequences(component)
      .filter((sequence) => !seen.has(sequence.key))
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .forEach((sequence) => ordered.push(sequence.key));

    return ordered;
  };

  /**
   * Resolve the COMPLETE descendant span of each node, not only the centres of
   * its direct children. This prevents a parent from drifting when one child owns
   * a much larger subtree than another.
   */
  const buildSpanResolver = (
    component: any,
    outgoing: Map<string, LogicalEdge[]>,
    yBySequence: Map<string, number>,
    fallbackY: number
  ): ((key: string) => DescendantSpan) => {
    const nodeByKey = new Map<string, any>(
      (component.model?.nodes ?? []).map((node: any) => [String(node.key), node])
    );
    const memo = new Map<string, DescendantSpan>();
    const visiting = new Set<string>();

    const at = (y: number): DescendantSpan => ({ minY: y, maxY: y, centerY: y });

    const resolveSpan = (key: string): DescendantSpan => {
      const sequenceY = yBySequence.get(key);
      if (Number.isFinite(sequenceY)) return at(sequenceY!);

      const cached = memo.get(key);
      if (cached) return cached;
      if (visiting.has(key)) return at(fallbackY);

      visiting.add(key);
      const childSpans = (outgoing.get(key) ?? []).map((edge) => resolveSpan(edge.to));
      visiting.delete(key);

      let span: DescendantSpan;
      if (childSpans.length) {
        const minY = Math.min(...childSpans.map((child) => child.minY));
        const maxY = Math.max(...childSpans.map((child) => child.maxY));
        span = { minY, maxY, centerY: (minY + maxY) / 2 };
      } else {
        const node = nodeByKey.get(key);
        const pathSequenceKey = node?.pathSequenceKey ? String(node.pathSequenceKey) : '';
        span = at(yBySequence.get(pathSequenceKey) ?? fallbackY);
      }

      memo.set(key, span);
      return span;
    };

    return resolveSpan;
  };

  const canonicalX = (component: any, key: string, currentX: number): number => {
    const metrics = component.__eventTreeViewportMetrics;
    if (!metrics) return currentX;

    if (key === BASELINE_START_KEY) return 3;
    if (key === BASELINE_END_KEY) return Number(metrics.resultX ?? currentX);

    const feMatch = /^FEPOINT-(\d+)$/.exec(key);
    if (feMatch) {
      const column = Number(feMatch[1]);
      return column * Number(metrics.blockWidth) + Number(metrics.blockWidth) / 2;
    }

    const source = (component.model?.nodes ?? []).find((node: any) => String(node.key) === key);
    if (source?.category === 'BRANCH') {
      const maxColumn = Math.max(1, Number(component.model?.functionEvents?.length ?? 1));
      const column = Math.max(1, Math.min(Number(source.columnIndex ?? 1), maxColumn));
      return column * Number(metrics.blockWidth) + Number(metrics.blockWidth) / 2;
    }

    if (source?.category === 'SEQUENCE') return Number(metrics.resultX ?? currentX);
    return currentX;
  };

  const anchorKey = (sourceKey: string, index: number): string =>
    `${CENTER_ANCHOR_PREFIX}${encodeURIComponent(sourceKey)}-${index}`;

  const applyStraightRouting = (diagram: go.Diagram): void => {
    diagram.links.each((link: go.Link) => {
      link.routing = go.Routing.Normal;
      link.curve = go.Curve.None;
      link.corner = 0;
      link.fromShortLength = 0;
      link.toShortLength = 0;
      link.invalidateRoute();
    });
  };

  const stabilizeCenteredLayout = (component: any): void => {
    if (component.__eventTreeLayoutModeV2 !== 'CENTERED') return;
    const diagram = component.diagram as go.Diagram | undefined;
    const metrics = component.__eventTreeViewportMetrics;
    if (!diagram || !metrics) return;

    const edges = buildLogicalEdges(component);
    const outgoing = buildOutgoing(edges);
    const consequenceOrder = buildConsequenceOrder(component, outgoing);
    if (!consequenceOrder.length) return;

    const rowHeight = Number(metrics.sequenceRowHeight ?? 34);
    const headerHeight = Number(metrics.headerHeight ?? 82);
    const firstRowCenter = headerHeight + rowHeight / 2;
    const yBySequence = new Map<string, number>();
    consequenceOrder.forEach((sequenceKey, index) => {
      yBySequence.set(sequenceKey, firstRowCenter + index * rowHeight);
    });

    const fallbackY = firstRowCenter + ((consequenceOrder.length - 1) * rowHeight) / 2;
    const resolveSpan = buildSpanResolver(component, outgoing, yBySequence, fallbackY);
    const resolveY = (key: string): number => resolveSpan(key).centerY;
    const graphModel = diagram.model as go.GraphLinksModel;

    diagram.startTransaction('stabilize centered event tree');

    [...(graphModel.linkDataArray as any[])].forEach((data) => graphModel.removeLinkData(data));
    [...(graphModel.nodeDataArray as any[])]
      .filter((data) => {
        const key = String(data?.key ?? '');
        return (data?.category === 'ANCHOR' && key.startsWith('__BEND-'))
          || key.startsWith(CENTER_ANCHOR_PREFIX);
      })
      .forEach((data) => graphModel.removeNodeData(data));

    // Snap both axes from canonical model geometry on every pass. The centered
    // representation therefore remains idempotent after any number of toggles.
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const category = data?.category;
      const key = String(data?.key ?? '');
      if (!key) return;

      const x = canonicalX(component, key, node.location.x);

      if (category === 'SEQUENCE') {
        const laneY = yBySequence.get(key);
        if (!Number.isFinite(laneY)) return;
        node.location = new go.Point(Number(metrics.resultX ?? x), laneY! - rowHeight / 2);
        const displayNo = consequenceOrder.indexOf(key) + 1;
        if (displayNo > 0) {
          graphModel.setDataProperty(data, 'sequenceNo', displayNo);
          graphModel.setDataProperty(data, 'label', `Sequence ${displayNo}`);
        }
        return;
      }

      if (category === 'START_POINT'
        || category === 'FE_POINT'
        || category === 'BRANCH'
        || key === BASELINE_END_KEY) {
        node.location = new go.Point(x, resolveY(key));
      }
    });

    outgoing.forEach((children, sourceKey) => {
      const sourceNode = diagram.findNodeForKey(sourceKey);
      if (!sourceNode || !children.length) return;

      const sourceX = canonicalX(component, sourceKey, sourceNode.location.x);
      const sourceY = resolveY(sourceKey);
      const routedChildren = children
        .map((edge) => ({ edge, targetNode: diagram.findNodeForKey(edge.to), y: resolveY(edge.to) }))
        .filter((item) => item.targetNode && Number.isFinite(item.y));
      if (!routedChildren.length) return;

      const levels = Array.from(new Set([sourceY, ...routedChildren.map((item) => item.y)]))
        .sort((a, b) => a - b);
      const keyByY = new Map<number, string>();

      levels.forEach((y, index) => {
        if (Math.abs(y - sourceY) < 0.001) {
          keyByY.set(y, sourceKey);
          return;
        }
        const key = anchorKey(sourceKey, index + 1);
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

      routedChildren.forEach(({ edge, y }) => {
        const from = keyByY.get(y);
        if (!from) return;
        graphModel.addLinkData({
          from,
          to: edge.to,
          [CENTER_ROUTE]: true,
          centeredRole: edge.kind === 'BRANCH' ? 'BRANCH_EXIT' : 'CONTINUE_EXIT',
          branchNo: edge.branchNo
        });
      });
    });

    diagram.commitTransaction('stabilize centered event tree');
    applyStraightRouting(diagram);
    component.lockViewport?.();
    component.updateDotVisuals?.();
  };

  const scheduleStabilization = (component: any): void => {
    const epoch = Number(component.__eventTreeCenteredStabilityEpoch ?? 0) + 1;
    component.__eventTreeCenteredStabilityEpoch = epoch;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (component.__eventTreeCenteredStabilityEpoch !== epoch) return;
        stabilizeCenteredLayout(component);
      });
    });
  };

  prototype.applyModel = function(metrics: unknown): void {
    originalApplyModel.call(this, metrics);
    if (this.__eventTreeLayoutModeV2 === 'CENTERED') scheduleStabilization(this);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const controls = this.__eventTreeLayoutControlsV2 as HTMLElement | undefined;
        if (controls && !this.__eventTreeCenteredStabilityClickListener) {
          const listener = (): void => scheduleStabilization(this);
          controls.addEventListener('click', listener);
          this.__eventTreeCenteredStabilityClickListener = listener;
        }
        if (this.__eventTreeLayoutModeV2 === 'CENTERED') scheduleStabilization(this);
      });
    });
  };

  prototype.ngOnDestroy = function(): void {
    const controls = this.__eventTreeLayoutControlsV2 as HTMLElement | undefined;
    const listener = this.__eventTreeCenteredStabilityClickListener as EventListener | undefined;
    if (controls && listener) controls.removeEventListener('click', listener);
    this.__eventTreeCenteredStabilityClickListener = null;
    originalOnDestroy.call(this);
  };
}
