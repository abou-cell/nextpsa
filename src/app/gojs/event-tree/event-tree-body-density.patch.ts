import { EventTreeEditorComponent } from './event-tree-editor.component';

interface EventTreeMetrics {
  viewportWidth: number;
  headerHeight: number;
  resultWidth: number;
  resultX: number;
  blockWidth: number;
  sequenceRowHeight: number;
}

const DEFAULT_ROW_HEIGHT = 34;
const MIN_ROW_HEIGHT = 18;
const MAX_ROW_HEIGHT = 58;
const MIN_TABLE_ZOOM = 0.6;
const MAX_TABLE_ZOOM = 1.4;
const TABLE_ZOOM_STEP = 0.1;
const MIN_RESULT_WIDTH = 260;
const MIN_TREE_WIDTH = 280;
const TOOLBAR_HEIGHT = 42;

export function installEventTreeBodyDensityPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeBodyDensityPatchInstalled) return;
  prototype.__eventTreeBodyDensityPatchInstalled = true;

  const originalMeasureLayout = prototype.measureLayout;
  const originalApplyModel = prototype.applyModel;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const getRowHeight = (component: any): number =>
    Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, component.__eventTreeSequenceRowHeight ?? DEFAULT_ROW_HEIGHT));

  const getTableZoom = (component: any): number =>
    Math.max(MIN_TABLE_ZOOM, Math.min(MAX_TABLE_ZOOM, component.__eventTreeResultTableZoom ?? 1));

  const defaultResultWidth = (viewportWidth: number): number =>
    Math.round(Math.max(330, Math.min(520, viewportWidth * 0.38)));

  const resultWidthForZoom = (component: any, viewportWidth: number): number => {
    const maxWidth = Math.max(MIN_RESULT_WIDTH, viewportWidth - MIN_TREE_WIDTH);
    const requested = Math.round(defaultResultWidth(viewportWidth) * getTableZoom(component));
    return Math.max(MIN_RESULT_WIDTH, Math.min(maxWidth, requested));
  };

  const refreshZoomLabel = (component: any): void => {
    component.zoomPercent?.set?.(Math.round(getTableZoom(component) * 100));
  };

  const updateRowHandle = (component: any): void => {
    const handle = component.__eventTreeSequenceRowResizeHandle as HTMLElement | undefined;
    const metrics = component.__eventTreeViewportMetrics as EventTreeMetrics | undefined;
    if (!handle || !metrics) return;

    const diagramDiv = component.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (!diagramDiv) return;

    const width = Math.max(1, diagramDiv.clientWidth);
    const left = Math.max(0, Math.min(width - 40, metrics.resultX));
    const scrollY = component.__eventTreeScrollY ?? 0;
    const top = TOOLBAR_HEIGHT + metrics.headerHeight + metrics.sequenceRowHeight - scrollY - 4;

    handle.style.left = `${left}px`;
    handle.style.right = '14px';
    handle.style.top = `${top}px`;
    handle.style.display = top >= TOOLBAR_HEIGHT + metrics.headerHeight - 2 ? 'block' : 'none';
  };

  prototype.measureLayout = function(): EventTreeMetrics {
    const firstPass = originalMeasureLayout.call(this) as EventTreeMetrics;

    // The toolbar zoom controls change only the horizontal width of the
    // No./Freq./Conseq./Code result table. They never scale IE, FE or branches.
    this.__resultTableWidth = resultWidthForZoom(this, firstPass.viewportWidth);

    const metrics = originalMeasureLayout.call(this) as EventTreeMetrics;
    metrics.sequenceRowHeight = getRowHeight(this);
    this.__eventTreeViewportMetrics = metrics;
    return metrics;
  };

  prototype.applyModel = function(metrics: EventTreeMetrics): void {
    originalApplyModel.call(this, metrics);
    this.__eventTreeViewportMetrics = metrics;
    requestAnimationFrame(() => updateRowHandle(this));
  };

  prototype.zoomOut = function(): void {
    const current = getTableZoom(this);
    const next = Math.max(MIN_TABLE_ZOOM, Math.round((current - TABLE_ZOOM_STEP) * 10) / 10);
    if (next === current) return;
    this.__eventTreeResultTableZoom = next;
    this.__eventTreeScrollY = 0;
    this.refreshLayout?.();
    refreshZoomLabel(this);
  };

  prototype.zoomIn = function(): void {
    const current = getTableZoom(this);
    const next = Math.min(MAX_TABLE_ZOOM, Math.round((current + TABLE_ZOOM_STEP) * 10) / 10);
    if (next === current) return;
    this.__eventTreeResultTableZoom = next;
    this.__eventTreeScrollY = 0;
    this.refreshLayout?.();
    refreshZoomLabel(this);
  };

  prototype.fit = function(): void {
    this.__eventTreeResultTableZoom = 1;
    this.__resultTableWidth = undefined;
    this.__eventTreeScrollY = 0;
    this.refreshLayout?.();
    refreshZoomLabel(this);
  };

  prototype.updateZoomPercent = function(): void {
    refreshZoomLabel(this);
  };

  const injectRowResizeHandle = (component: any): void => {
    const shell = component.diagramDiv?.nativeElement?.closest?.('.et-shell') as HTMLElement | null;
    if (!shell || shell.querySelector('[data-et-sequence-row-resize]')) return;

    shell.style.position = 'relative';

    const handle = document.createElement('div');
    handle.dataset['etSequenceRowResize'] = 'true';
    handle.title = 'Drag up/down to reduce or increase Event Tree sequence / consequence row height';
    Object.assign(handle.style, {
      position: 'absolute',
      height: '9px',
      zIndex: '61',
      cursor: 'row-resize',
      touchAction: 'none',
      background: 'transparent'
    });

    const line = document.createElement('span');
    Object.assign(line.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: '4px',
      height: '1px',
      background: 'transparent'
    });
    handle.appendChild(line);

    handle.addEventListener('mouseenter', () => line.style.background = '#2563eb');
    handle.addEventListener('mouseleave', () => {
      if (!component.__eventTreeSequenceRowResizing) line.style.background = 'transparent';
    });

    handle.addEventListener('pointerdown', (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      component.__eventTreeSequenceRowResizing = true;
      component.__eventTreeSequenceRowResizeStartY = event.clientY;
      component.__eventTreeSequenceRowResizeStartHeight = getRowHeight(component);
      line.style.background = '#2563eb';
      handle.setPointerCapture?.(event.pointerId);
    });

    const pointerMove = (event: PointerEvent): void => {
      if (!component.__eventTreeSequenceRowResizing) return;
      const delta = event.clientY - component.__eventTreeSequenceRowResizeStartY;
      const next = Math.round(Math.max(
        MIN_ROW_HEIGHT,
        Math.min(MAX_ROW_HEIGHT, component.__eventTreeSequenceRowResizeStartHeight + delta)
      ));
      if (next === component.__eventTreeSequenceRowHeight) return;
      component.__eventTreeSequenceRowHeight = next;
      component.__eventTreeScrollY = 0;
      component.refreshLayout?.();
      updateRowHandle(component);
    };

    const pointerUp = (): void => {
      component.__eventTreeSequenceRowResizing = false;
      line.style.background = 'transparent';
    };

    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);

    component.__eventTreeSequenceRowResizeHandle = handle;
    component.__eventTreeSequenceRowResizeMove = pointerMove;
    component.__eventTreeSequenceRowResizeUp = pointerUp;
    shell.appendChild(handle);

    updateRowHandle(component);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    this.__eventTreeResultTableZoom ??= 1;
    this.__eventTreeSequenceRowHeight ??= DEFAULT_ROW_HEIGHT;
    refreshZoomLabel(this);
    injectRowResizeHandle(this);
    requestAnimationFrame(() => updateRowHandle(this));
  };

  prototype.ngOnDestroy = function(): void {
    if (this.__eventTreeSequenceRowResizeMove) {
      window.removeEventListener('pointermove', this.__eventTreeSequenceRowResizeMove);
    }
    if (this.__eventTreeSequenceRowResizeUp) {
      window.removeEventListener('pointerup', this.__eventTreeSequenceRowResizeUp);
    }
    this.__eventTreeSequenceRowResizeHandle?.remove?.();
    originalOnDestroy.call(this);
  };
}
