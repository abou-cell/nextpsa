import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type EventTreeLayoutMode = 'STANDARD' | 'CENTERED';
type LogicalEdgeKind = 'CONTINUE' | 'BRANCH';

const SAVED_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH', 'ANCHOR', 'SEQUENCE']);
const BASELINE_START_KEY = '__BASELINE_START__';
const BASELINE_END_KEY = '__BASELINE_END__';
const CENTER_ROUTE = '__etCenteredRoute';
const CENTER_ANCHOR_PREFIX = '__ETC-';

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

  const branchNumber = (label: string | undefined): number => {
    const match = /^Branch\s+(\d+)/.exec(label ?? '');
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };

  const getSequences = (component: any): SequenceInfo[] =>
    (component.model?.nodes ?? [])
      .filter((node: any) => node.category === 'SEQUENCE')
      .map((node: any): SequenceInfo => ({
        key: String(node.key),
        sequenceNo: Number(node.sequenceNo ?? 0)
      }));

  /**
   * Build the logical Event Tree, not the Standard-mode drawing.
   *
   * The main success path is reconstructed explicitly:
   * IE -> FE1 -> FE2 -> ... -> result S1.
   * Branch paths come from the domain model links.
   *
   * The centered layout uses this graph from right to left, starting at the
   * consequences. It therefore does not assume that the initiating point or the
   * main FE row has to stay at the Standard-mode Y coordinate.
   */
  const buildLogicalEdges = (component: any): { edges: LogicalEdge[]; mainSequenceKey: string } => {
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

    // Remove exact duplicates while preserving the first occurrence.
    const seen = new Set<string>();
    const deduplicated = edges.filter((edge) => {
      const key = `${edge.from}\u0000${edge.to}\u0000${edge.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { edges: deduplicated, mainSequenceKey };
  };

  const buildOutgoing = (edges: LogicalEdge[]): Map<string, LogicalEdge[]> => {
    const outgoing = new Map<string, LogicalEdge[]>();
    edges.forEach((edge) => {
      const list = outgoing.get(edge.from) ?? [];
      list.push(edge);
      outgoing.set(edge.from, list);
    });

    outgoing.forEach((list) => list.sort((a, b) => {
      // Continue/success path first. Existing numbered branches follow in creation
      // order. A new Branch N+1 is therefore always below the existing branches.
      if (a.kind !== b.kind) return a.kind === 'CONTINUE' ? -1 : 1;
      if (a.kind === 'BRANCH' && a.branchNo !== b.branchNo) return a.branchNo - b.branchNo;
      return a.order - b.order;
    }));

    return outgoing;
  };

  /**
   * Consequence-first sequence ordering.
   *
   * We traverse the logical ET from the initiating event to discover terminal
   * consequences, but the terminal rows are the fixed geometry. Every subtree is
   * contiguous in the result table. Because continuation comes first and Branch N
   * follows Branch N-1, adding a branch never inserts it above an existing sibling.
   */
  const buildConsequenceOrder = (
    component: any,
    outgoing: Map<string, LogicalEdge[]>
  ): string[] => {
    const sequenceKeys = new Set(getSequences(component).map((sequence) => sequence.key));
    const ordered: string[] = [];
    const seenSequences = new Set<string>();
    const activePath = new Set<string>();

    const visit = (key: string): void => {
      if (sequenceKeys.has(key)) {
        if (!seenSequences.has(key)) {
          seenSequences.add(key);
          ordered.push(key);
        }
        return;
      }
      if (activePath.has(key)) return;
      activePath.add(key);
      (outgoing.get(key) ?? []).forEach((edge) => visit(edge.to));
      activePath.delete(key);
    };

    visit(BASELINE_START_KEY);

    // Keep malformed/orphan result rows visible and deterministic.
    getSequences(component)
      .filter((sequence) => !seenSequences.has(sequence.key))
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .forEach((sequence) => ordered.push(sequence.key));

    return ordered;
  };

  /**
   * Starting from the consequence Y coordinates, calculate every upstream branch
   * point as the centre of the vertical band occupied by its direct child subtrees.
   * The initiating event is treated exactly like every other upstream node: it is
   * free to move to the geometric centre of the complete Event Tree.
   */
  const buildCenteredYResolver = (
    component: any,
    outgoing: Map<string, LogicalEdge[]>,
    yBySequence: Map<string, number>,
    fallbackY: number
  ): ((key: string) => number) => {
    const nodeByKey = new Map<string, any>(
      (component.model?.nodes ?? []).map((node: any) => [String(node.key), node])
    );
    const memo = new Map<string, number>();
    const visiting = new Set<string>();

    const resolve = (key: string): number => {
      const sequenceY = yBySequence.get(key);
      if (Number.isFinite(sequenceY)) return sequenceY!;
      const cached = memo.get(key);
      if (Number.isFinite(cached)) return cached!;
      if (visiting.has(key)) return fallbackY;

      visiting.add(key);
      const childYs = (outgoing.get(key) ?? [])
        .map((edge) => resolve(edge.to))
        .filter((value) => Number.isFinite(value));
      visiting.delete(key);

      let y: number;
      if (childYs.length) {
        // Mid-range, rather than arithmetic mean, centres the node on the complete
        // descendant band and does not bias wide subtrees containing many leaves.
        y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
      } else {
        const node = nodeByKey.get(key);
        const pathSequenceKey = node?.pathSequenceKey ? String(node.pathSequenceKey) : '';
        y = yBySequence.get(pathSequenceKey) ?? fallbackY;
      }

      memo.set(key, y);
      return y;
    };

    return resolve;
  };

  const anchorKey = (sourceKey: string, index: number): string =>
    `${CENTER_ANCHOR_PREFIX}${encodeURIComponent(sourceKey)}-${index}`;

  /**
   * Rebuild every ET connection using orthogonal geometry only.
   *
   * Each source owns one vertical spine. The spine is split into adjacent segments,
   * so two branches from the same node never draw duplicated vertical lines on top
   * of one another. Each child then leaves the spine horizontally on its own Y lane.
   */
  const rebuildCenteredRoutes = (
    diagram: go.Diagram,
    outgoing: Map<string, LogicalEdge[]>,
    resolveY: (key: string) => number
  ): void => {
    const model = diagram.model as go.GraphLinksModel;

    // Centered mode owns all ET routes. Remove Standard links and Standard bends.
    [...(model.linkDataArray as any[])].forEach((data) => model.removeLinkData(data));
    [...(model.nodeDataArray as any[])]
      .filter((data) => {
        const key = String(data?.key ?? '');
        return data?.category === 'ANCHOR' && key.startsWith('__BEND-');
      })
      .forEach((data) => model.removeNodeData(data));
    [...(model.nodeDataArray as any[])]
      .filter((data) => String(data?.key ?? '').startsWith(CENTER_ANCHOR_PREFIX))
      .forEach((data) => model.removeNodeData(data));

    outgoing.forEach((children, sourceKey) => {
      const sourceNode = diagram.findNodeForKey(sourceKey);
      if (!sourceNode || !children.length) return;

      const sourceX = sourceNode.location.x;
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
        model.addNodeData({
          key,
          category: 'ANCHOR',
          loc: `${sourceX} ${y}`,
          [CENTER_ROUTE]: true
        });
        keyByY.set(y, key);
      });

      // One non-overlapping vertical spine made from adjacent segments.
      for (let index = 0; index < levels.length - 1; index += 1) {
        const from = keyByY.get(levels[index]);
        const to = keyByY.get(levels[index + 1]);
        if (!from || !to || from === to) continue;
        model.addLinkData({
          from,
          to,
          [CENTER_ROUTE]: true,
          centeredRole: 'SPINE'
        });
      }

      // One horizontal exit per child. No diagonal segment is ever required.
      routedChildren.forEach(({ edge, y }) => {
        const from = keyByY.get(y);
        if (!from) return;
        model.addLinkData({
          from,
          to: edge.to,
          [CENTER_ROUTE]: true,
          centeredRole: edge.kind === 'BRANCH' ? 'BRANCH_EXIT' : 'CONTINUE_EXIT',
          branchNo: edge.branchNo
        });
      });
    });
  };

  const applyCenteredGeometry = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const { edges } = buildLogicalEdges(component);
    const outgoing = buildOutgoing(edges);
    const consequenceOrder = buildConsequenceOrder(component, outgoing);
    if (!consequenceOrder.length) return;

    const rowHeight = Number(component.__eventTreeViewportMetrics?.sequenceRowHeight ?? 34);
    const headerHeight = Number(component.__eventTreeViewportMetrics?.headerHeight ?? 82);
    const firstRowCenter = headerHeight + rowHeight / 2;
    const yBySequence = new Map<string, number>();
    consequenceOrder.forEach((sequenceKey, index) => {
      yBySequence.set(sequenceKey, firstRowCenter + index * rowHeight);
    });

    const treeCenterY = firstRowCenter + ((consequenceOrder.length - 1) * rowHeight) / 2;
    const resolveY = buildCenteredYResolver(component, outgoing, yBySequence, treeCenterY);
    const model = diagram.model as go.GraphLinksModel;

    diagram.startTransaction('center event tree from consequences');

    // 1) Consequences/result rows are the immutable starting geometry.
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const category = data?.category;
      const key = String(data?.key ?? '');

      if (category === 'SEQUENCE') {
        const laneY = yBySequence.get(key);
        if (!Number.isFinite(laneY)) return;
        node.location = new go.Point(node.location.x, laneY! - rowHeight / 2);

        // Display order is always strictly increasing from top to bottom.
        const displayNo = consequenceOrder.indexOf(key) + 1;
        if (displayNo > 0) {
          model.setDataProperty(data, 'sequenceNo', displayNo);
          model.setDataProperty(data, 'label', `Sequence ${displayNo}`);
        }
        return;
      }

      if (category === 'START_POINT'
        || category === 'FE_POINT'
        || category === 'BRANCH'
        || key === BASELINE_END_KEY) {
        node.location = new go.Point(node.location.x, resolveY(key));
      }
    });

    // 2) Rebuild from right to left conceptually: source Y values already came from
    // downstream consequence bands, then routes are generated from those positions.
    rebuildCenteredRoutes(diagram, outgoing, resolveY);

    diagram.commitTransaction('center event tree from consequences');

    applyStraightRouting(diagram);
    component.lockViewport?.();
  };

  const rebuildForMode = (component: any): void => {
    const metrics = component.__eventTreeViewportMetrics;
    if (!metrics) return;

    originalApplyModel.call(component, metrics);
    saveBaseGeometry(component);

    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

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
      <svg viewBox="0 0 30 18" width="27" height="16" aria-hidden="true" style="display:block">
        <path d="M2 3H17 M6 3V6H21 M10 6V9H25 M14 9V12H28 M18 12V15H29" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"></path>
      </svg>`;

    const centeredIcon = `
      <svg viewBox="0 0 30 18" width="27" height="16" aria-hidden="true" style="display:block">
        <path d="M29 3H20 M29 9H20 M29 15H20 M20 3V15 M20 9H12 M12 6V12 M12 9H2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"></path>
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
      'Disposition centrée calculée depuis les conséquences',
      'Construire l’Event Tree depuis les conséquences puis centrer chaque nœud sur ses descendants',
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
    (this.__eventTreeLayoutControlsV2 as HTMLElement | undefined)?.remove();
    this.__eventTreeLayoutControlsV2 = null;
    this.__eventTreeLayoutLeftButton = null;
    this.__eventTreeLayoutCenteredButtonV2 = null;
    originalDestroy.call(this);
  };
}
