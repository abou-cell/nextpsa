import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type EventTreeLayoutMode = 'STANDARD' | 'CENTERED';

const SAVED_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH', 'ANCHOR', 'SEQUENCE']);
const CENTER_MAIN_RESULT = '__etCenteredMainResult';
const CENTER_ROUTE = '__etCenteredRoute';
const CENTER_ANCHOR_PREFIX = '__BEND-CENTER-';

interface SequenceInfo {
  key: string;
  parentKey?: string;
  branchColumnIndex: number;
  sequenceNo: number;
  children: SequenceInfo[];
}

interface CenteredBranchStart {
  from: string;
  to: string;
  targetSequenceKey: string;
  targetY: number;
  branchNo: number;
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

  const removeCenteredArtifacts = (diagram: go.Diagram): void => {
    const model = diagram.model as go.GraphLinksModel;

    [...(model.linkDataArray as any[])]
      .filter((data) => Boolean(data?.[CENTER_MAIN_RESULT]) || Boolean(data?.[CENTER_ROUTE]))
      .forEach((data) => model.removeLinkData(data));

    [...(model.nodeDataArray as any[])]
      .filter((data) => String(data?.key ?? '').startsWith(CENTER_ANCHOR_PREFIX))
      .forEach((data) => model.removeNodeData(data));
  };

  const removeStandardBranchBends = (diagram: go.Diagram): void => {
    const model = diagram.model as go.GraphLinksModel;
    [...(model.nodeDataArray as any[])]
      .filter((data) => {
        const key = String(data?.key ?? '');
        return data?.category === 'ANCHOR'
          && key.startsWith('__BEND-')
          && !key.startsWith(CENTER_ANCHOR_PREFIX);
      })
      .forEach((data) => model.removeNodeData(data));
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

  const buildSequenceTree = (component: any): { roots: SequenceInfo[]; byKey: Map<string, SequenceInfo> } => {
    const sequences: SequenceInfo[] = (component.model?.nodes ?? [])
      .filter((node: any) => node.category === 'SEQUENCE')
      .map((node: any): SequenceInfo => ({
        key: String(node.key),
        parentKey: node.parentSequenceKey ? String(node.parentSequenceKey) : undefined,
        branchColumnIndex: Number(node.branchColumnIndex ?? 0),
        sequenceNo: Number(node.sequenceNo ?? 0),
        children: []
      }));

    const byKey: Map<string, SequenceInfo> = new Map<string, SequenceInfo>(
      sequences.map((sequence: SequenceInfo) => [sequence.key, sequence] as [string, SequenceInfo])
    );

    sequences.forEach((sequence: SequenceInfo) => {
      if (!sequence.parentKey) return;
      byKey.get(sequence.parentKey)?.children.push(sequence);
    });

    // A right-most Function Event is kept closest to the parent path. For branches
    // created from the same node/column, creation order is preserved by sequenceNo:
    // an added branch is therefore always placed below the existing branches.
    const childSort = (a: SequenceInfo, b: SequenceInfo): number => {
      const columnDiff = b.branchColumnIndex - a.branchColumnIndex;
      return columnDiff || a.sequenceNo - b.sequenceNo;
    };

    const sortSubtree = (sequence: SequenceInfo): void => {
      sequence.children.sort(childSort);
      sequence.children.forEach(sortSubtree);
    };

    const roots = sequences
      .filter((sequence: SequenceInfo) => !sequence.parentKey || !byKey.has(sequence.parentKey))
      .sort((a: SequenceInfo, b: SequenceInfo) => a.sequenceNo - b.sequenceNo);
    roots.forEach(sortSubtree);

    return { roots, byKey };
  };

  /**
   * Monotonic planar order.
   *
   * Each sequence is followed immediately by its complete subtree. This gives each
   * subtree one contiguous vertical band and guarantees that every child is below
   * its parent. A vertical branch spine can therefore never cut a horizontal path
   * from another subtree.
   */
  const centredSequenceOrder = (roots: SequenceInfo[]): SequenceInfo[] => {
    const ordered: SequenceInfo[] = [];
    const visit = (sequence: SequenceInfo): void => {
      ordered.push(sequence);
      sequence.children.forEach(visit);
    };
    roots.forEach(visit);
    return ordered;
  };

  const sequenceKeyForTarget = (component: any, targetKey: string): string => {
    const target = (component.model?.nodes ?? []).find((node: any) => String(node.key) === targetKey);
    if (!target) return '';
    if (target.category === 'SEQUENCE') return String(target.key);
    return target.pathSequenceKey ? String(target.pathSequenceKey) : '';
  };

  const branchNumber = (label: string | undefined): number => {
    const match = /^Branch\s+(\d+)/.exec(label ?? '');
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };

  const rebuildCenteredBranchRoutes = (
    component: any,
    diagram: go.Diagram,
    yBySequence: Map<string, number>
  ): void => {
    const model = diagram.model as go.GraphLinksModel;

    // Standard layout creates one bend for every Branch-N link. In centered mode
    // those independent vertical segments can overlap. Remove them and rebuild a
    // single shared vertical spine per branch source with one horizontal exit per
    // child lane.
    removeStandardBranchBends(diagram);

    const grouped = new Map<string, CenteredBranchStart[]>();
    (component.model?.links ?? [])
      .filter((link: any) => /^Branch\s+\d+/.test(link.label ?? ''))
      .forEach((link: any) => {
        const targetSequenceKey = sequenceKeyForTarget(component, String(link.to));
        const targetY = yBySequence.get(targetSequenceKey);
        if (!targetSequenceKey || !Number.isFinite(targetY)) return;

        const item: CenteredBranchStart = {
          from: String(link.from),
          to: String(link.to),
          targetSequenceKey,
          targetY: targetY!,
          branchNo: branchNumber(link.label)
        };
        const list = grouped.get(item.from) ?? [];
        list.push(item);
        grouped.set(item.from, list);
      });

    grouped.forEach((starts, sourceKey) => {
      const sourceNode = diagram.findNodeForKey(sourceKey);
      if (!sourceNode) return;

      // Geometric order is authoritative. Branch number is only a stable tie-break.
      starts.sort((a, b) => (a.targetY - b.targetY) || (a.branchNo - b.branchNo));

      const sourceX = sourceNode.location.x;
      let previousTrunkKey = sourceKey;

      starts.forEach((start, index) => {
        const anchorKey = `${CENTER_ANCHOR_PREFIX}${encodeURIComponent(sourceKey)}-${index + 1}`;
        const anchorData = {
          key: anchorKey,
          category: 'ANCHOR',
          loc: `${sourceX} ${start.targetY}`,
          pathSequenceKey: start.targetSequenceKey,
          [CENTER_ROUTE]: true
        };
        model.addNodeData(anchorData);

        // One vertical spine segment only. No duplicated/overlapping vertical links.
        model.addLinkData({
          from: previousTrunkKey,
          to: anchorKey,
          [CENTER_ROUTE]: true,
          centeredRole: 'SPINE'
        });

        // Each sequence then owns one strictly horizontal exit to its first node.
        model.addLinkData({
          from: anchorKey,
          to: start.to,
          [CENTER_ROUTE]: true,
          centeredRole: 'EXIT',
          pathSequenceKey: start.targetSequenceKey
        });

        previousTrunkKey = anchorKey;
      });
    });
  };

  const applyCenteredGeometry = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const { roots } = buildSequenceTree(component);
    if (!roots.length) return;

    const ordered = centredSequenceOrder(roots);
    if (!ordered.length) return;

    const rowHeight = Number(component.__eventTreeViewportMetrics?.sequenceRowHeight ?? 34);
    const headerHeight = Number(component.__eventTreeViewportMetrics?.headerHeight ?? 82);
    const firstRowCenter = headerHeight + rowHeight / 2;
    const yBySequence = new Map<string, number>();
    ordered.forEach((sequence, index) => {
      yBySequence.set(sequence.key, firstRowCenter + index * rowHeight);
    });

    const root = roots.find((sequence) => sequence.key === 'S1') ?? roots[0];
    const rootY = yBySequence.get(root.key) ?? firstRowCenter;
    const model = diagram.model as go.GraphLinksModel;

    diagram.startTransaction('center event tree');
    removeCenteredArtifacts(diagram);

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const category = data?.category;
      const key = String(data?.key ?? '');

      if (category === 'SEQUENCE') {
        const laneY = yBySequence.get(key);
        if (Number.isFinite(laneY)) {
          node.location = new go.Point(node.location.x, laneY! - rowHeight / 2);

          // The result table must always read 1, 2, 3... from top to bottom.
          // This is a display normalization only; sequence keys remain untouched.
          const displayNo = ordered.findIndex((sequence) => sequence.key === key) + 1;
          if (displayNo > 0) {
            model.setDataProperty(data, 'sequenceNo', displayNo);
            model.setDataProperty(data, 'label', `Sequence ${displayNo}`);
          }
        }
        return;
      }

      if (category === 'START_POINT' || category === 'FE_POINT' || key === '__BASELINE_END__') {
        node.location = new go.Point(node.location.x, rootY);
        return;
      }

      if (category === 'BRANCH') {
        const sequenceKey = data.pathSequenceKey ? String(data.pathSequenceKey) : '';
        const laneY = yBySequence.get(sequenceKey);
        if (Number.isFinite(laneY)) node.location = new go.Point(node.location.x, laneY!);
      }
    });

    rebuildCenteredBranchRoutes(component, diagram, yBySequence);

    const alreadyLinked = (model.linkDataArray as any[]).some(
      (data) => data?.from === '__BASELINE_END__' && data?.to === root.key
    );
    if (!alreadyLinked) {
      model.addLinkData({
        from: '__BASELINE_END__',
        to: root.key,
        [CENTER_MAIN_RESULT]: true
      });
    }

    diagram.commitTransaction('center event tree');

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
        <path d="M2 5H29 M9 5V9 M9 9H25 M9 9V13 M9 13H29" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"></path>
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
      'Disposition ET planaire sans croisement ni chevauchement',
      'Afficher un Event Tree planaire avec nouvelles branches sous les branches existantes',
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
    const diagram = this.diagram as go.Diagram | undefined;
    if (diagram) removeCenteredArtifacts(diagram);
    (this.__eventTreeLayoutControlsV2 as HTMLElement | undefined)?.remove();
    this.__eventTreeLayoutControlsV2 = null;
    this.__eventTreeLayoutLeftButton = null;
    this.__eventTreeLayoutCenteredButtonV2 = null;
    originalDestroy.call(this);
  };
}
