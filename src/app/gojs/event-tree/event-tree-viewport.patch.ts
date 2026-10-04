import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

interface EventTreeViewportMetrics {
  viewportWidth: number;
  headerHeight: number;
  resultWidth: number;
  resultX: number;
  blockWidth: number;
  resultNoWidth: number;
  resultFreqWidth: number;
  resultConseqWidth: number;
  resultCodeWidth: number;
  sequenceRowHeight: number;
}

const TOOLBAR_HEIGHT = 42;
const DEFAULT_HEADER_HEIGHT = 82;
const MIN_HEADER_HEIGHT = 50;
const MAX_HEADER_HEIGHT = 118;
const SCROLL_STEP = 42;

export function installEventTreeViewportPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeViewportPatchInstalled) return;
  prototype.__eventTreeViewportPatchInstalled = true;

  const originalCreateDiagram = prototype.createDiagram;
  const originalMeasureLayout = prototype.measureLayout;
  const originalInstallTemplates = prototype.installTemplates;
  const originalApplyModel = prototype.applyModel;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const getHeaderHeight = (component: any): number =>
    Math.max(MIN_HEADER_HEIGHT, Math.min(MAX_HEADER_HEIGHT, component.__eventTreeHeaderHeight ?? DEFAULT_HEADER_HEIGHT));

  const sequenceCount = (component: any): number => {
    const nodes = component.model?.nodes ?? [];
    return Math.max(1, nodes.filter((node: { category?: string }) => node.category === 'SEQUENCE').length);
  };

  const bodyContentHeight = (component: any): number => {
    const metrics = component.__eventTreeViewportMetrics as EventTreeViewportMetrics | undefined;
    const rowHeight = metrics?.sequenceRowHeight ?? 34;
    return Math.max(rowHeight * sequenceCount(component), rowHeight);
  };

  const getMaxScroll = (component: any): number => {
    const diagram = component.diagram as go.Diagram | undefined;
    const div = component.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (!diagram || !div) return 0;

    const headerHeight = getHeaderHeight(component);
    const scale = Math.max(0.25, diagram.scale || 1);
    const viewportBodyDocumentHeight = Math.max(1, (div.clientHeight - headerHeight) / scale);
    return Math.max(0, bodyContentHeight(component) - viewportBodyDocumentHeight + 12);
  };

  const pinHeaders = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;
    const y = component.__eventTreeScrollY ?? 0;

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as { category?: string } | undefined;
      if (data?.category !== 'HEADER' && data?.category !== 'RESULT_HEADER') return;
      const x = node.location.x;
      if (node.location.y !== y) node.location = new go.Point(x, y);
      node.layerName = 'Foreground';
    });
  };

  const updateScrollUi = (component: any): void => {
    const track = component.__eventTreeScrollTrack as HTMLElement | undefined;
    const thumb = component.__eventTreeScrollThumb as HTMLElement | undefined;
    if (!track || !thumb) return;

    const headerHeight = getHeaderHeight(component);
    track.style.top = `${TOOLBAR_HEIGHT + headerHeight + 2}px`;

    const maxScroll = getMaxScroll(component);
    const current = Math.max(0, Math.min(maxScroll, component.__eventTreeScrollY ?? 0));
    component.__eventTreeScrollY = current;

    if (maxScroll <= 0.5) {
      track.style.display = 'none';
      return;
    }

    track.style.display = 'block';
    const trackHeight = Math.max(1, track.clientHeight);
    const total = bodyContentHeight(component);
    const visible = Math.max(1, total - maxScroll);
    const thumbHeight = Math.max(34, Math.min(trackHeight, Math.round(trackHeight * visible / total)));
    const travel = Math.max(1, trackHeight - thumbHeight);
    const top = Math.round(travel * (current / maxScroll));
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${top}px)`;
  };

  const setScrollY = (component: any, nextY: number): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;
    const maxScroll = getMaxScroll(component);
    const next = Math.max(0, Math.min(maxScroll, nextY));
    component.__eventTreeScrollY = next;

    const current = diagram.position;
    if (Math.abs(current.x) > 0.01 || Math.abs(current.y - next) > 0.01) {
      diagram.position = new go.Point(0, next);
    }
    pinHeaders(component);
    updateScrollUi(component);
  };

  // Suppress the original hard lock to (0, 0). The Event Tree now keeps X fixed,
  // while Y is controlled by the dedicated body scrollbar below the IE/FE header.
  prototype.createDiagram = function(): void {
    const diagramPrototype = go.Diagram.prototype as any;
    const addDiagramListener = diagramPrototype.addDiagramListener;

    diagramPrototype.addDiagramListener = function(name: string, listener: (...args: any[]) => void): void {
      if (name === 'ViewportBoundsChanged') return;
      addDiagramListener.call(this, name, listener);
    };

    try {
      originalCreateDiagram.call(this);
    } finally {
      diagramPrototype.addDiagramListener = addDiagramListener;
    }

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    this.__eventTreeScrollY ??= 0;

    diagram.addDiagramListener('ViewportBoundsChanged', () => {
      const expectedY = Math.max(0, Math.min(getMaxScroll(this), this.__eventTreeScrollY ?? 0));
      const current = diagram.position;
      if (Math.abs(current.x) > 0.01 || Math.abs(current.y - expectedY) > 0.01) {
        diagram.position = new go.Point(0, expectedY);
        return;
      }
      pinHeaders(this);
      updateScrollUi(this);
      this.ngZone?.run?.(() => this.updateZoomPercent?.());
    });
  };

  prototype.lockViewport = function(): void {
    setScrollY(this, this.__eventTreeScrollY ?? 0);
  };

  prototype.measureLayout = function(): EventTreeViewportMetrics {
    const metrics = originalMeasureLayout.call(this) as EventTreeViewportMetrics;
    metrics.headerHeight = getHeaderHeight(this);
    this.__eventTreeViewportMetrics = metrics;
    return metrics;
  };

  prototype.installTemplates = function(metrics: EventTreeViewportMetrics): void {
    originalInstallTemplates.call(this, metrics);

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;
    const $ = go.GraphObject.make;
    const titleRowHeight = Math.max(26, metrics.headerHeight - 22);

    // Rebuild only the IE/FE header so its content follows the user-adjustable
    // height. Drag/reorder and selection/tag behaviour are kept intact.
    diagram.nodeTemplateMap.add('HEADER',
      $(go.Node, 'Auto',
        {
          selectable: true,
          selectionAdorned: true,
          movable: true,
          cursor: 'pointer',
          locationSpot: go.Spot.TopLeft,
          layerName: 'Foreground',
          dragComputation: (part: go.Part, newLocation: go.Point): go.Point => {
            const data = part.data as { initiating?: boolean } | undefined;
            const scrollY = this.__eventTreeScrollY ?? 0;
            if (data?.initiating) return new go.Point(0, scrollY);
            const eventCount = Math.max(1, this.model?.functionEvents?.length ?? 1);
            const minX = metrics.blockWidth;
            const maxX = eventCount * metrics.blockWidth;
            return new go.Point(Math.max(minX, Math.min(maxX, newLocation.x)), scrollY);
          }
        },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', {
          fill: '#ffffff',
          stroke: '#4b5563',
          strokeWidth: 1,
          desiredSize: new go.Size(metrics.blockWidth, metrics.headerHeight)
        }, new go.Binding('fill', 'initiating', (value: boolean) => value ? '#d8d8d8' : '#ffffff')),
        $(go.Panel, 'Table',
          { width: metrics.blockWidth, height: metrics.headerHeight, defaultAlignment: go.Spot.Left },
          $(go.RowColumnDefinition, { row: 0, height: titleRowHeight }),
          $(go.RowColumnDefinition, { row: 1, height: 22 }),
          $(go.TextBlock, {
            row: 0,
            margin: new go.Margin(4, 5, 2, 5),
            width: Math.max(20, metrics.blockWidth - 10),
            verticalAlignment: go.Spot.Top,
            font: '10px Arial, sans-serif',
            wrap: go.Wrap.Fit,
            overflow: go.TextOverflow.Ellipsis,
            stroke: '#111827'
          }, new go.Binding('text', 'label')),
          $(go.Shape, 'LineH', {
            row: 1,
            alignment: go.Spot.Top,
            stretch: go.Stretch.Horizontal,
            stroke: '#6b7280',
            strokeWidth: 1
          }),
          $(go.TextBlock, {
            row: 1,
            margin: new go.Margin(2, 4, 2, 4),
            width: Math.max(20, metrics.blockWidth - 8),
            textAlign: 'center',
            alignment: go.Spot.Center,
            font: '10px Arial, sans-serif',
            stroke: '#1f2937'
          }, new go.Binding('text', 'code'))
        )
      )
    );

    const resultTemplate = diagram.nodeTemplateMap.get('RESULT_HEADER') as go.Node | null;
    if (resultTemplate) resultTemplate.layerName = 'Foreground';
  };

  prototype.applyModel = function(metrics: EventTreeViewportMetrics): void {
    originalApplyModel.call(this, metrics);
    this.__eventTreeViewportMetrics = metrics;
    requestAnimationFrame(() => {
      setScrollY(this, this.__eventTreeScrollY ?? 0);
      updateResizeHandle(this);
    });
  };

  const updateResizeHandle = (component: any): void => {
    const handle = component.__eventTreeHeaderResizeHandle as HTMLElement | undefined;
    if (!handle) return;
    handle.style.top = `${TOOLBAR_HEIGHT + getHeaderHeight(component) - 4}px`;
  };

  const injectViewportControls = (component: any): void => {
    const shell = component.diagramDiv?.nativeElement?.closest?.('.et-shell') as HTMLElement | null;
    const diagramDiv = component.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (!shell || !diagramDiv || shell.querySelector('[data-et-body-scroll]')) return;

    shell.style.position = 'relative';

    const resizeHandle = document.createElement('div');
    resizeHandle.dataset['etHeaderResize'] = 'true';
    resizeHandle.title = 'Drag up/down to resize IE / Function Event / Consequence header';
    Object.assign(resizeHandle.style, {
      position: 'absolute',
      left: '0',
      right: '14px',
      zIndex: '55',
      height: '9px',
      cursor: 'row-resize',
      touchAction: 'none',
      background: 'transparent'
    });

    const resizeLine = document.createElement('span');
    Object.assign(resizeLine.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: '4px',
      height: '1px',
      background: 'transparent'
    });
    resizeHandle.appendChild(resizeLine);
    resizeHandle.addEventListener('mouseenter', () => resizeLine.style.background = '#2563eb');
    resizeHandle.addEventListener('mouseleave', () => {
      if (!component.__eventTreeHeaderResizing) resizeLine.style.background = 'transparent';
    });

    resizeHandle.addEventListener('pointerdown', (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      component.__eventTreeHeaderResizing = true;
      component.__eventTreeHeaderResizeStartY = event.clientY;
      component.__eventTreeHeaderResizeStartHeight = getHeaderHeight(component);
      resizeLine.style.background = '#2563eb';
      resizeHandle.setPointerCapture?.(event.pointerId);
    });

    const track = document.createElement('div');
    track.dataset['etBodyScroll'] = 'true';
    Object.assign(track.style, {
      position: 'absolute',
      right: '2px',
      bottom: '3px',
      width: '10px',
      zIndex: '58',
      borderRadius: '999px',
      background: 'rgba(203, 213, 225, .72)',
      touchAction: 'none',
      display: 'none'
    });

    const thumb = document.createElement('div');
    Object.assign(thumb.style, {
      position: 'absolute',
      left: '2px',
      top: '0',
      width: '6px',
      minHeight: '34px',
      borderRadius: '999px',
      background: '#94a3b8',
      cursor: 'ns-resize'
    });
    track.appendChild(thumb);

    thumb.addEventListener('pointerdown', (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      component.__eventTreeThumbDragging = true;
      component.__eventTreeThumbStartY = event.clientY;
      component.__eventTreeThumbStartScroll = component.__eventTreeScrollY ?? 0;
      thumb.setPointerCapture?.(event.pointerId);
      thumb.style.background = '#64748b';
    });

    const onPointerMove = (event: PointerEvent): void => {
      if (component.__eventTreeHeaderResizing) {
        const delta = event.clientY - component.__eventTreeHeaderResizeStartY;
        const next = Math.round(Math.max(
          MIN_HEADER_HEIGHT,
          Math.min(MAX_HEADER_HEIGHT, component.__eventTreeHeaderResizeStartHeight + delta)
        ));
        if (next !== component.__eventTreeHeaderHeight) {
          component.__eventTreeHeaderHeight = next;
          component.__eventTreeScrollY = 0;
          updateResizeHandle(component);
          component.refreshLayout?.();
        }
        return;
      }

      if (!component.__eventTreeThumbDragging) return;
      const maxScroll = getMaxScroll(component);
      const trackHeight = Math.max(1, track.clientHeight);
      const thumbHeight = Math.max(1, thumb.clientHeight);
      const travel = Math.max(1, trackHeight - thumbHeight);
      const scrollPerPixel = maxScroll / travel;
      setScrollY(component, component.__eventTreeThumbStartScroll + (event.clientY - component.__eventTreeThumbStartY) * scrollPerPixel);
    };

    const onPointerUp = (): void => {
      component.__eventTreeHeaderResizing = false;
      component.__eventTreeThumbDragging = false;
      resizeLine.style.background = 'transparent';
      thumb.style.background = '#94a3b8';
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const wheelHandler = (event: WheelEvent): void => {
      const rect = diagramDiv.getBoundingClientRect();
      const localY = event.clientY - rect.top;
      if (localY < getHeaderHeight(component)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const maxScroll = getMaxScroll(component);
      if (maxScroll <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const delta = event.deltaY === 0 ? 0 : Math.sign(event.deltaY) * Math.max(18, Math.min(Math.abs(event.deltaY), SCROLL_STEP));
      setScrollY(component, (component.__eventTreeScrollY ?? 0) + delta / Math.max(0.25, (component.diagram as go.Diagram | undefined)?.scale ?? 1));
    };

    // Replace the editor's previous wheel hard-lock with body-only scrolling.
    if (component.lockedWheelHandler) {
      diagramDiv.removeEventListener('wheel', component.lockedWheelHandler, true);
    }
    diagramDiv.addEventListener('wheel', wheelHandler, { passive: false, capture: true });

    component.__eventTreeHeaderResizeHandle = resizeHandle;
    component.__eventTreeScrollTrack = track;
    component.__eventTreeScrollThumb = thumb;
    component.__eventTreeViewportPointerMove = onPointerMove;
    component.__eventTreeViewportPointerUp = onPointerUp;
    component.__eventTreeViewportWheel = wheelHandler;

    shell.append(resizeHandle, track);
    updateResizeHandle(component);
    updateScrollUi(component);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    injectViewportControls(this);
  };

  prototype.ngOnDestroy = function(): void {
    const diagramDiv = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (diagramDiv && this.__eventTreeViewportWheel) {
      diagramDiv.removeEventListener('wheel', this.__eventTreeViewportWheel, true);
    }
    if (this.__eventTreeViewportPointerMove) window.removeEventListener('pointermove', this.__eventTreeViewportPointerMove);
    if (this.__eventTreeViewportPointerUp) window.removeEventListener('pointerup', this.__eventTreeViewportPointerUp);
    this.__eventTreeHeaderResizeHandle?.remove?.();
    this.__eventTreeScrollTrack?.remove?.();
    originalOnDestroy.call(this);
  };
}
