import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

type EventTreeLayoutMode = 'STANDARD' | 'CENTERED';

const SAVED_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH', 'ANCHOR']);
const CENTER_RESULT_MARKER = '__etCenteredResult';

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

  const removeCenteredResultLink = (diagram: go.Diagram): void => {
    const model = diagram.model as go.GraphLinksModel;
    const linkDataArray = [...(model.linkDataArray as any[])];
    linkDataArray
      .filter((data) => Boolean(data?.[CENTER_RESULT_MARKER]))
      .forEach((data) => model.removeLinkData(data));
  };

  const buildSequenceGeometry = (component: any): {
    rootKey: string | null;
    pathY: Map<string, number>;
  } => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return { rootKey: null, pathY: new Map() };

    const rowHeight = Number(component.__eventTreeViewportMetrics?.sequenceRowHeight ?? 34);
    const sequenceByKey = new Map<string, SequenceGeometry>();

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (data?.category !== 'SEQUENCE') return;
      sequenceByKey.set(String(data.key), {
        key: String(data.key),
        centerY: node.location.y + rowHeight / 2,
        parentSequenceKey: data.parentSequenceKey ? String(data.parentSequenceKey) : undefined,
        sequenceNo: Number(data.sequenceNo ?? 0)
      });
    });

    const children = new Map<string, string[]>();
    sequenceByKey.forEach((sequence) => {
      if (!sequence.parentSequenceKey || !sequenceByKey.has(sequence.parentSequenceKey)) return;
      const list = children.get(sequence.parentSequenceKey) ?? [];
      list.push(sequence.key);
      children.set(sequence.parentSequenceKey, list);
    });

    children.forEach((keys) => {
      keys.sort((a, b) => {
        const ay = sequenceByKey.get(a)?.centerY ?? 0;
        const by = sequenceByKey.get(b)?.centerY ?? 0;
        return ay - by;
      });
    });

    const roots = [...sequenceByKey.values()]
      .filter((sequence) => !sequence.parentSequenceKey || !sequenceByKey.has(sequence.parentSequenceKey))
      .sort((a, b) => {
        const noDiff = (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0);
        return noDiff || a.centerY - b.centerY;
      });

    const pathY = new Map<string, number>();
    const spanMemo = new Map<string, { min: number; max: number }>();

    const subtreeSpan = (key: string, stack = new Set<string>()): { min: number; max: number } => {
      const memo = spanMemo.get(key);
      if (memo) return memo;

      const own = sequenceByKey.get(key);
      if (!own) return { min: 0, max: 0 };
      if (stack.has(key)) return { min: own.centerY, max: own.centerY };

      const nextStack = new Set(stack);
      nextStack.add(key);

      let min = own.centerY;
      let max = own.centerY;
      (children.get(key) ?? []).forEach((childKey) => {
        const childSpan = subtreeSpan(childKey, nextStack);
        min = Math.min(min, childSpan.min);
        max = Math.max(max, childSpan.max);
      });

      const span = { min, max };
      spanMemo.set(key, span);
      pathY.set(key, (min + max) / 2);
      return span;
    };

    roots.forEach((root) => subtreeSpan(root.key));
    sequenceByKey.forEach((_sequence, key) => {
      if (!pathY.has(key)) subtreeSpan(key);
    });

    return { rootKey: roots[0]?.key ?? null, pathY };
  };

  const applyLinkRouting = (diagram: go.Diagram): void => {
    diagram.links.each((link: go.Link) => {
      const toCategory = (link.toNode?.data as any)?.category;
      link.routing = toCategory === 'SEQUENCE' ? go.Routing.Orthogonal : go.Routing.Normal;
      link.corner = 0;
      link.invalidateRoute();
    });
  };

  const applyLayout = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    restoreBaseGeometry(component);
    removeCenteredResultLink(diagram);

    if (getMode(component) !== 'CENTERED') {
      applyLinkRouting(diagram);
      component.lockViewport?.();
      return;
    }

    const { rootKey, pathY } = buildSequenceGeometry(component);
    if (!rootKey || !pathY.size) {
      applyLinkRouting(diagram);
      component.lockViewport?.();
      return;
    }

    const mainY = pathY.get(rootKey);
    if (!Number.isFinite(mainY)) return;

    // Same principle as the centered Fault Tree layout: each logical subtree is
    // centred on the vertical span of its descendants. Here the FT X-axis
    // centring is rotated into the Event Tree Y-axis while FE columns stay fixed.
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const category = data?.category;
      const key = String(data?.key ?? '');

      if (category === 'START_POINT' || category === 'FE_POINT' || key === '__BASELINE_END__') {
        node.location = new go.Point(node.location.x, mainY!);
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
      const sequenceKey = targetData?.category === 'SEQUENCE'
        ? String(targetData.key)
        : targetData?.pathSequenceKey
          ? String(targetData.pathSequenceKey)
          : '';
      const y = pathY.get(sequenceKey);
      if (Number.isFinite(y)) node.location = new go.Point(node.location.x, y!);
    });

    // The standard ET relies on coincident Y positions at the result boundary.
    // Once the root path is centred, add a runtime-only orthogonal result leg so
    // the main path still terminates cleanly on its original consequence row.
    const model = diagram.model as go.GraphLinksModel;
    const hasMainResultLink = (model.linkDataArray as any[]).some(
      (data) => data.from === '__BASELINE_END__' && data.to === rootKey
    );
    if (!hasMainResultLink) {
      model.addLinkData({
        from: '__BASELINE_END__',
        to: rootKey,
        [CENTER_RESULT_MARKER]: true
      });
    }

    applyLinkRouting(diagram);
    component.lockViewport?.();
  };

  const injectButtons = (component: any): void => {
    const shell = component.diagramDiv?.nativeElement?.closest?.('.et-shell') as HTMLElement | null;
    const toolbar = shell?.querySelector?.('.toolbar') as HTMLElement | null;
    if (!toolbar || component.__eventTreeLayoutControlsV2) return;

    const controls = document.createElement('span');
    controls.dataset['etLayoutV2'] = 'true';
    // display:contents makes both controls true toolbar children, so they inherit
    // exactly the same sizing, spacing, border and radius as Fit / + Branch.
    controls.style.display = 'contents';

    const makeButton = (
      title: string,
      aria: string,
      mode: EventTreeLayoutMode
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', aria);
      button.setAttribute('aria-pressed', 'false');
      // The supplied reference uses the same E-shaped layout glyph for both
      // states; the active button is distinguished by the blue selected state.
      button.innerHTML = '<svg viewBox="0 0 26 18" width="22" height="16" aria-hidden="true" style="display:block"><path d="M7 2v14M7 3h12M7 9h9M7 15h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      button.addEventListener('click', () => {
        component.__eventTreeLayoutModeV2 = mode;
        updateButtons(component);
        requestAnimationFrame(() => applyLayout(component));
      });
      return button;
    };

    const standard = makeButton(
      'Disposition ET actuelle',
      'Garder la disposition actuelle de l’Event Tree',
      'STANDARD'
    );
    const centered = makeButton(
      'Disposition ET centrée',
      'Centrer les sous-arbres de l’Event Tree',
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
        if (!SAVED_CATEGORIES.has(data?.category)) return;
        data.__etBaseLoc = go.Point.stringify(node.location);
      });
    }
    requestAnimationFrame(() => applyLayout(this));
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    requestAnimationFrame(() => {
      injectButtons(this);
      applyLayout(this);
    });
  };

  prototype.ngOnDestroy = function(): void {
    const diagram = this.diagram as go.Diagram | undefined;
    if (diagram) removeCenteredResultLink(diagram);
    (this.__eventTreeLayoutControlsV2 as HTMLElement | undefined)?.remove();
    this.__eventTreeLayoutControlsV2 = null;
    this.__eventTreeLayoutLeftButton = null;
    this.__eventTreeLayoutCenteredButtonV2 = null;
    originalDestroy.call(this);
  };
}
