import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type EventTreeLayoutMode = 'STANDARD' | 'CENTERED';

const SAVED_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH', 'ANCHOR', 'SEQUENCE']);
const CENTER_MAIN_RESULT = '__etCenteredMainResult';

interface SequenceInfo {
  key: string;
  parentKey?: string;
  branchColumnIndex: number;
  sequenceNo: number;
  children: SequenceInfo[];
  subtreeSize: number;
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

  const removeCenteredMainResult = (diagram: go.Diagram): void => {
    const model = diagram.model as go.GraphLinksModel;
    [...(model.linkDataArray as any[])]
      .filter((data) => Boolean(data?.[CENTER_MAIN_RESULT]))
      .forEach((data) => model.removeLinkData(data));
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
        children: [],
        subtreeSize: 1
      }));

    const byKey: Map<string, SequenceInfo> = new Map<string, SequenceInfo>(
      sequences.map((sequence: SequenceInfo) => [sequence.key, sequence] as [string, SequenceInfo])
    );
    sequences.forEach((sequence: SequenceInfo) => {
      if (!sequence.parentKey) return;
      byKey.get(sequence.parentKey)?.children.push(sequence);
    });

    const childSort = (a: SequenceInfo, b: SequenceInfo): number => {
      const columnDiff = b.branchColumnIndex - a.branchColumnIndex;
      return columnDiff || a.sequenceNo - b.sequenceNo;
    };

    const calculateSize = (sequence: SequenceInfo): number => {
      sequence.children.sort(childSort);
      sequence.subtreeSize = 1 + sequence.children.reduce((sum, child) => sum + calculateSize(child), 0);
      return sequence.subtreeSize;
    };

    const roots = sequences
      .filter((sequence: SequenceInfo) => !sequence.parentKey || !byKey.has(sequence.parentKey))
      .sort((a: SequenceInfo, b: SequenceInfo) => a.sequenceNo - b.sequenceNo);
    roots.forEach(calculateSize);

    return { roots, byKey };
  };

  const centredSequenceOrder = (roots: SequenceInfo[]): SequenceInfo[] => {
    const layoutSubtree = (sequence: SequenceInfo): SequenceInfo[] => {
      const upper: SequenceInfo[] = [];
      const lower: SequenceInfo[] = [];
      let upperSize = 0;
      let lowerSize = 0;
      let tieToUpper = true;

      sequence.children.forEach((child) => {
        if (upperSize < lowerSize || (upperSize === lowerSize && tieToUpper)) {
          upper.push(child);
          upperSize += child.subtreeSize;
          tieToUpper = false;
        } else {
          lower.push(child);
          lowerSize += child.subtreeSize;
          tieToUpper = true;
        }
      });

      const ordered: SequenceInfo[] = [];
      [...upper].reverse().forEach((child) => ordered.push(...layoutSubtree(child)));
      ordered.push(sequence);
      lower.forEach((child) => ordered.push(...layoutSubtree(child)));
      return ordered;
    };

    const ordered: SequenceInfo[] = [];
    roots.forEach((root) => ordered.push(...layoutSubtree(root)));
    return ordered;
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

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const category = data?.category;
      const key = String(data?.key ?? '');

      if (category === 'SEQUENCE') {
        const laneY = yBySequence.get(key);
        if (Number.isFinite(laneY)) {
          node.location = new go.Point(node.location.x, laneY! - rowHeight / 2);
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
        return;
      }

      if (category === 'ANCHOR' && key.startsWith('__BEND-')) {
        const sequenceKey = downstreamSequenceKey(node);
        const laneY = yBySequence.get(sequenceKey);
        if (Number.isFinite(laneY)) node.location = new go.Point(node.location.x, laneY!);
      }
    });

    const model = diagram.model as go.GraphLinksModel;
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
        <path d="M2 9H29 M9 9V4H25 M16 9V14H29" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"></path>
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
      'Disposition ET centrée sans croisement',
      'Afficher un Event Tree centré avec sorties verticales et branches horizontales parallèles',
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
