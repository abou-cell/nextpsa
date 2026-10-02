import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  NgZone,
  SimpleChanges,
  signal,
  ViewChild
} from '@angular/core';
import * as go from 'gojs';
import { EventTreeModel, EventTreeNodeData } from '../../features/event-tree/event-tree.models';

interface EventTreeLayoutMetrics {
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

@Component({
  selector: 'app-event-tree-editor',
  standalone: true,
  template: `
    <section class="et-shell">
      <div class="toolbar">
        <button type="button" class="icon-button" title="Undo" aria-label="Undo" [disabled]="!canUndo" (click)="undo()">↶</button>
        <button type="button" class="icon-button" title="Redo" aria-label="Redo" [disabled]="!canRedo" (click)="redo()">↷</button>
        <span class="toolbar-separator" aria-hidden="true"></span>
        <button type="button" class="icon-button" title="Zoom out" aria-label="Zoom out" (click)="zoomOut()">−</button>
        <span class="zoom-value">{{ zoomPercent() }}%</span>
        <button type="button" class="icon-button" title="Zoom in" aria-label="Zoom in" (click)="zoomIn()">+</button>
        <button type="button" (click)="fit()">Fit</button>
        <button type="button" (click)="addFunctionEvent.emit()">+ Function Event</button>
        <button type="button" [disabled]="model?.functionEvents?.length === 0" (click)="removeFunctionEvent.emit()">− Function Event</button>
        <button
          type="button"
          [disabled]="!selectedBranchKey() || selectedBranchCount() >= 10"
          (click)="requestBranch()">+ Branch</button>
        <span class="hint">
          {{
            selectedBranchKey()
              ? ('Selected node: ' + selectedBranchKey() + ' · branches ' + selectedBranchCount() + '/10')
              : 'Select a Function Event node or branch node to add a branch'
          }}
        </span>
        <span class="status"><i></i> GoJS Event Tree</span>
      </div>
      <div
        #diagramDiv
        class="diagram"
        (wheel)="preventDiagramWheel($event)">
      </div>
    </section>
  `,
  styles: [`
    :host { display:block; width:100%; height:100%; min-height:0; }
    .et-shell { height:100%; min-height:0; display:grid; grid-template-rows:42px minmax(0,1fr); background:#fff; }
    .toolbar { display:flex; align-items:center; gap:7px; padding:0 8px; border-bottom:1px solid var(--nps-border); background:#fff; }
    .toolbar button { height:31px; padding:0 11px; border:1px solid var(--nps-border); border-radius:7px; background:#fff; color:var(--nps-text); font:inherit; font-size:10px; cursor:pointer; }
    .toolbar button:hover:not(:disabled) { background:#f3f7fb; border-color:#a9bfd7; }
    .toolbar button:disabled { opacity:.4; cursor:default; }
    .toolbar .icon-button { width:31px; min-width:31px; padding:0; font-size:14px; font-weight:700; }
    .toolbar-separator { width:1px; height:22px; background:#cbd5e1; margin:0 2px; }
    .zoom-value { min-width:42px; text-align:center; color:#64748b; font-size:10px; font-variant-numeric:tabular-nums; }
    .hint { color:var(--nps-text-muted); font-size:9px; }
    .status { margin-left:auto; color:var(--nps-text-muted); font-size:9px; display:flex; align-items:center; gap:6px; }
    .status i { width:7px; height:7px; border-radius:50%; background:#22c55e; }
    .diagram { width:100%; height:100%; min-height:0; overflow:hidden; background:#fff; }
  `]
})
export class EventTreeEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('diagramDiv', { static: true }) diagramDiv!: ElementRef<HTMLDivElement>;

  @Input() model!: EventTreeModel;
  @Input() canUndo = false;
  @Input() canRedo = false;
  @Output() readonly addFunctionEvent = new EventEmitter<void>();
  @Output() readonly removeFunctionEvent = new EventEmitter<void>();
  @Output() readonly addBranch = new EventEmitter<string>();
  @Output() readonly undoRequested = new EventEmitter<void>();
  @Output() readonly redoRequested = new EventEmitter<void>();

  private diagram?: go.Diagram;
  private resizeObserver?: ResizeObserver;
  private readonly lockedWheelHandler = (event: WheelEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.lockViewport();
  };
  readonly selectedBranchKey = signal<string | null>(null);
  readonly selectedBranchCount = signal(0);
  readonly zoomPercent = signal(100);

  constructor(private readonly ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.createDiagram();
    this.refreshLayout();

    this.resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => this.refreshLayout());
    });
    this.resizeObserver.observe(this.diagramDiv.nativeElement);
    this.diagramDiv.nativeElement.addEventListener('wheel', this.lockedWheelHandler, {
      passive: false,
      capture: true
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['model'] && this.diagram) this.refreshLayout();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.diagramDiv.nativeElement.removeEventListener('wheel', this.lockedWheelHandler, true);
    if (this.diagram) this.diagram.div = null;
  }

  requestBranch(): void {
    const key = this.selectedBranchKey();
    if (key && this.selectedBranchCount() < 10) this.addBranch.emit(key);
  }

  undo(): void {
    if (this.canUndo) this.undoRequested.emit();
  }

  redo(): void {
    if (this.canRedo) this.redoRequested.emit();
  }

  zoomOut(): void {
    this.setZoom((this.diagram?.scale ?? 1) - 0.1);
  }

  zoomIn(): void {
    this.setZoom((this.diagram?.scale ?? 1) + 0.1);
  }

  fit(): void {
    if (!this.diagram) return;
    this.diagram.commandHandler.zoomToFit();
    this.diagram.position = new go.Point(0, 0);
    this.updateZoomPercent();
  }

  preventDiagramWheel(event: WheelEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.lockViewport();
  }

  private lockViewport(): void {
    if (!this.diagram) return;
    this.diagram.position = new go.Point(0, 0);
  }

  private setZoom(scale: number): void {
    if (!this.diagram) return;
    const nextScale = Math.max(0.5, Math.min(2, Math.round(scale * 10) / 10));
    this.diagram.scale = nextScale;
    this.diagram.position = new go.Point(0, 0);
    this.updateZoomPercent();
  }

  private updateZoomPercent(): void {
    this.zoomPercent.set(Math.round((this.diagram?.scale ?? 1) * 100));
  }

  private selectBranchSource(key: string): void {
    this.ngZone.run(() => {
      this.selectedBranchKey.set(key);
      this.selectedBranchCount.set(this.countDirectBranches(key));
      this.updateDotVisuals();
    });
  }

  private resizeDot(node: go.GraphObject, size: number): void {
    const part = node.part as go.Node | null;
    const dot = part?.findObject('DOT') as go.Shape | null;
    if (!dot) return;
    dot.width = size;
    dot.height = size;
  }

  private updateDotVisuals(): void {
    if (!this.diagram) return;
    const selectedKey = this.selectedBranchKey();

    this.diagram.nodes.each((node) => {
      const data = node.data as { category?: string; key?: string } | undefined;
      if (data?.category !== 'FE_POINT' && data?.category !== 'BRANCH') return;

      const dot = node.findObject('DOT') as go.Shape | null;
      if (!dot) return;

      const size = data.key === selectedKey ? 8 : 5;
      dot.width = size;
      dot.height = size;
    });
  }

  refreshLayout(): void {
    if (!this.diagram || !this.model) return;

    const metrics = this.measureLayout();
    this.installTemplates(metrics);
    this.applyModel(metrics);
    this.updateDotVisuals();

    if (this.diagram.scale < 0.5 || this.diagram.scale > 2) this.diagram.scale = 1;
    this.lockViewport();
    this.updateZoomPercent();
    this.selectedBranchCount.set(this.countDirectBranches(this.selectedBranchKey()));
  }

  private measureLayout(): EventTreeLayoutMetrics {
    const width = Math.max(720, this.diagramDiv.nativeElement.clientWidth || 720);
    const headerHeight = 82;
    const resultWidth = Math.round(Math.max(330, Math.min(520, width * 0.38)));
    const resultX = width - resultWidth;
    const blockCount = Math.max(1, this.model.functionEvents.length + 1);
    const blockWidth = resultX / blockCount;
    const resultNoWidth = Math.round(resultWidth * 0.09);
    const resultFreqWidth = Math.round(resultWidth * 0.22);
    const resultConseqWidth = Math.round(resultWidth * 0.45);
    const resultCodeWidth = resultWidth - resultNoWidth - resultFreqWidth - resultConseqWidth;

    return {
      viewportWidth: width,
      headerHeight,
      resultWidth,
      resultX,
      blockWidth,
      resultNoWidth,
      resultFreqWidth,
      resultConseqWidth,
      resultCodeWidth,
      sequenceRowHeight: 34
    };
  }

  private createDiagram(): void {
    const $ = go.GraphObject.make;

    this.diagram = $(go.Diagram, this.diagramDiv.nativeElement, {
      'undoManager.isEnabled': false,
      'animationManager.isEnabled': false,
      allowMove: false,
      allowCopy: false,
      allowDelete: false,
      padding: 0,
      contentAlignment: go.Spot.TopLeft,
      initialContentAlignment: go.Spot.TopLeft,
      scrollMode: go.ScrollMode.Document,
      minScale: 0.25,
      maxScale: 2
    });

    this.diagram.toolManager.draggingTool.isEnabled = false;
    this.diagram.toolManager.panningTool.isEnabled = false;
    this.diagram.toolManager.mouseWheelBehavior = go.WheelMode.None;

    this.diagram.addDiagramListener('ViewportBoundsChanged', () => {
      if (!this.diagram) return;
      if (!this.diagram.position.equals(new go.Point(0, 0))) this.diagram.position = new go.Point(0, 0);
      this.ngZone.run(() => this.updateZoomPercent());
    });

    this.diagram.addDiagramListener('ChangedSelection', () => {
      const node = this.diagram?.selection.first() as go.Node | null;
      const data = node?.data as { category?: string; key?: string } | undefined;
      const key = data?.category === 'BRANCH' || data?.category === 'FE_POINT' ? (data.key ?? null) : null;

      if (key) {
        this.selectBranchSource(key);
      } else {
        this.ngZone.run(() => {
          this.selectedBranchKey.set(null);
          this.selectedBranchCount.set(0);
          this.updateDotVisuals();
        });
      }
    });
  }

  private countDirectBranches(sourceKey: string | null): number {
    if (!sourceKey || !this.model) return 0;
    return this.model.links.filter(
      (link) => link.from === sourceKey && /^Branch\s\d+/.test(link.label ?? '')
    ).length;
  }

  private installTemplates(metrics: EventTreeLayoutMetrics): void {
    if (!this.diagram) return;
    const $ = go.GraphObject.make;
    this.diagram.nodeTemplateMap.clear();

    this.diagram.nodeTemplateMap.add('HEADER',
      $(go.Node, 'Auto',
        { selectable: false, locationSpot: go.Spot.TopLeft, layerName: 'Background' },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', {
          fill: '#ffffff', stroke: '#4b5563', strokeWidth: 1,
          desiredSize: new go.Size(metrics.blockWidth, metrics.headerHeight)
        }, new go.Binding('fill', 'initiating', (v) => v ? '#d8d8d8' : '#ffffff')),
        $(go.Panel, 'Table',
          { width: metrics.blockWidth, height: metrics.headerHeight, defaultAlignment: go.Spot.Left },
          $(go.RowColumnDefinition, { row: 0, height: 60 }),
          $(go.RowColumnDefinition, { row: 1, height: 22 }),
          $(go.TextBlock, {
            row: 0, margin: new go.Margin(4, 5, 2, 5), width: Math.max(20, metrics.blockWidth - 10),
            verticalAlignment: go.Spot.Top, font: '10px Arial, sans-serif', wrap: go.Wrap.Fit,
            overflow: go.TextOverflow.Ellipsis, stroke: '#111827'
          }, new go.Binding('text', 'label')),
          $(go.Shape, 'LineH', {
            row: 1, alignment: go.Spot.Top, stretch: go.Stretch.Horizontal, stroke: '#6b7280', strokeWidth: 1
          }),
          $(go.TextBlock, {
            row: 1, margin: new go.Margin(2, 4, 2, 4), width: Math.max(20, metrics.blockWidth - 8),
            textAlign: 'center', alignment: go.Spot.Center, font: '10px Arial, sans-serif', stroke: '#1f2937'
          }, new go.Binding('text', 'code'))
        )
      )
    );

    this.diagram.nodeTemplateMap.add('RESULT_HEADER',
      $(go.Node, 'Auto',
        { selectable: false, locationSpot: go.Spot.TopLeft, layerName: 'Background' },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', {
          fill: '#ffffff', stroke: '#4b5563', strokeWidth: 1,
          desiredSize: new go.Size(metrics.resultWidth, metrics.headerHeight)
        }),
        $(go.Panel, 'Table',
          { width: metrics.resultWidth, height: metrics.headerHeight, defaultAlignment: go.Spot.Left },
          $(go.RowColumnDefinition, { column: 0, width: metrics.resultNoWidth }),
          $(go.RowColumnDefinition, { column: 1, width: metrics.resultFreqWidth }),
          $(go.RowColumnDefinition, { column: 2, width: metrics.resultConseqWidth }),
          $(go.RowColumnDefinition, { column: 3, width: metrics.resultCodeWidth }),
          $(go.TextBlock, 'No.', { column: 0, margin: 4, alignment: go.Spot.BottomLeft, font: '10px Arial, sans-serif', stroke: '#111827' }),
          $(go.TextBlock, 'Freq.', { column: 1, margin: 4, alignment: go.Spot.BottomLeft, font: '10px Arial, sans-serif', stroke: '#111827' }),
          $(go.TextBlock, 'Conseq.', { column: 2, margin: 4, alignment: go.Spot.BottomLeft, font: '10px Arial, sans-serif', stroke: '#111827' }),
          $(go.TextBlock, 'Code', { column: 3, margin: 4, alignment: go.Spot.BottomLeft, font: '10px Arial, sans-serif', stroke: '#111827' })
        )
      )
    );

    this.diagram.nodeTemplateMap.add('ANCHOR',
      $(go.Node, 'Spot',
        { selectable: false, locationSpot: go.Spot.Center, fromSpot: go.Spot.Center, toSpot: go.Spot.Center },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', { width: 1, height: 1, fill: null, stroke: null, portId: '' })
      )
    );

    const dotNodeProps = {
      selectionAdorned: false,
      cursor: 'pointer',
      locationSpot: go.Spot.Center,
      fromSpot: go.Spot.Center,
      toSpot: go.Spot.Center,
      mouseEnter: (_event: go.InputEvent, node: go.GraphObject) => this.resizeDot(node, 8),
      mouseLeave: (_event: go.InputEvent, node: go.GraphObject) => {
        const part = node.part as go.Node | null;
        const key = part?.data?.key as string | undefined;
        this.resizeDot(node, key && key === this.selectedBranchKey() ? 8 : 5);
      },
      click: (_event: go.InputEvent, node: go.GraphObject) => {
        const part = node.part as go.Node | null;
        const key = part?.data?.key as string | undefined;
        if (!key || !part) return;
        part.isSelected = true;
        this.selectBranchSource(key);
      }
    };

    const dotShape = () => $(go.Shape, 'Circle', {
      name: 'DOT', width: 5, height: 5, fill: '#111111', stroke: '#111111', strokeWidth: 0, portId: ''
    });

    this.diagram.nodeTemplateMap.add('FE_POINT',
      $(go.Node, 'Spot',
        dotNodeProps,
        new go.Binding('location', 'loc', go.Point.parse),
        dotShape()
      )
    );

    this.diagram.nodeTemplateMap.add('BRANCH',
      $(go.Node, 'Spot',
        dotNodeProps,
        new go.Binding('location', 'loc', go.Point.parse),
        dotShape()
      )
    );

    this.diagram.nodeTemplateMap.add('SEQUENCE',
      $(go.Node, 'Auto',
        { selectable: false, locationSpot: go.Spot.TopLeft, toSpot: go.Spot.Left },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', {
          fill: '#fff', stroke: '#cbd5e1', strokeWidth: 1,
          desiredSize: new go.Size(metrics.resultWidth, metrics.sequenceRowHeight)
        }),
        $(go.Panel, 'Table',
          { width: metrics.resultWidth, height: metrics.sequenceRowHeight, defaultAlignment: go.Spot.Left },
          $(go.RowColumnDefinition, { column: 0, width: metrics.resultNoWidth }),
          $(go.RowColumnDefinition, { column: 1, width: metrics.resultFreqWidth }),
          $(go.RowColumnDefinition, { column: 2, width: metrics.resultConseqWidth }),
          $(go.RowColumnDefinition, { column: 3, width: metrics.resultCodeWidth }),
          $(go.TextBlock, { column: 0, margin: 3, font: '10px Arial, sans-serif', stroke: '#111827' }, new go.Binding('text', 'sequenceNo')),
          $(go.TextBlock, { column: 1, margin: 3, font: '10px Arial, sans-serif', stroke: '#111827' }, new go.Binding('text', 'frequency')),
          $(go.TextBlock, { column: 2, margin: 3, font: '10px Arial, sans-serif', stroke: '#111827' }, new go.Binding('text', 'consequence')),
          $(go.TextBlock, { column: 3, margin: 3, font: '10px Arial, sans-serif', stroke: '#2563eb' }, new go.Binding('text', 'resultCode'))
        )
      )
    );

    this.diagram.linkTemplate =
      $(go.Link,
        {
          routing: go.Routing.Normal,
          curve: go.Curve.None,
          corner: 0,
          selectable: false,
          fromShortLength: 0,
          toShortLength: 0
        },
        $(go.Shape, { stroke: '#1f2937', strokeWidth: 1 })
      );
  }

  private applyModel(metrics: EventTreeLayoutMetrics): void {
    if (!this.diagram || !this.model) return;

    const nodes: any[] = [
      {
        key: 'HDR-IE', category: 'HEADER', label: this.model.initiatingEvent,
        code: this.model.initiatingCode, initiating: true, loc: '0 0'
      }
    ];

    this.model.functionEvents.forEach((event, index) => {
      nodes.push({
        key: `HDR-${event.id}`, category: 'HEADER', label: event.description,
        code: event.code, initiating: false, loc: `${(index + 1) * metrics.blockWidth} 0`
      });
    });

    nodes.push({ key: 'RESULT-HEADER', category: 'RESULT_HEADER', loc: `${metrics.resultX} 0` });

    const baselineY = metrics.headerHeight + metrics.sequenceRowHeight / 2;

    this.model.functionEvents.forEach((_event, index) => {
      const column = index + 1;
      const x = column * metrics.blockWidth + metrics.blockWidth / 2;
      nodes.push({ key: `FEPOINT-${column}`, category: 'FE_POINT', loc: `${x} ${baselineY}` });
    });

    const allSequences = this.model.nodes.filter((node) => node.category === 'SEQUENCE');
    const sequenceByKey = new Map(allSequences.map((sequence) => [sequence.key, sequence]));
    const children = new Map<string, EventTreeNodeData[]>();

    allSequences.forEach((sequence) => {
      if (!sequence.parentSequenceKey) return;
      const list = children.get(sequence.parentSequenceKey) ?? [];
      list.push(sequence);
      children.set(sequence.parentSequenceKey, list);
    });

    children.forEach((list) => {
      list.sort((a, b) => {
        const columnDiff = (b.branchColumnIndex ?? 0) - (a.branchColumnIndex ?? 0);
        if (columnDiff !== 0) return columnDiff;
        return (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0);
      });
    });

    const sequenceNodes: EventTreeNodeData[] = [];
    const visitSequence = (sequence: EventTreeNodeData): void => {
      sequenceNodes.push(sequence);
      (children.get(sequence.key) ?? []).forEach(visitSequence);
    };

    allSequences
      .filter((sequence) => !sequence.parentSequenceKey || !sequenceByKey.has(sequence.parentSequenceKey))
      .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0))
      .forEach(visitSequence);

    const visibleSequences = sequenceNodes.length
      ? sequenceNodes
      : [{
          key: '__NEW_SEQUENCE__', category: 'SEQUENCE' as const, label: 'Sequence 1',
          sequenceNo: 1, frequency: '', consequence: '', resultCode: ''
        }];

    const sequenceCenterY = new Map<string, number>();

    visibleSequences.forEach((node, index) => {
      const y = metrics.headerHeight + index * metrics.sequenceRowHeight;
      sequenceCenterY.set(node.key, y + metrics.sequenceRowHeight / 2);
      nodes.push({ ...node, loc: `${metrics.resultX} ${y}` });
    });

    const branchNodes = this.model.nodes.filter((node) => node.category === 'BRANCH');

    const baselineNodes = [
      { key: '__BASELINE_START__', category: 'ANCHOR', loc: `0 ${baselineY}` },
      { key: '__BASELINE_END__', category: 'ANCHOR', loc: `${metrics.resultX} ${baselineY}` }
    ];
    nodes.push(...baselineNodes);

    const baselineLinks: any[] = [];
    let previousKey = '__BASELINE_START__';

    this.model.functionEvents.forEach((_event, index) => {
      const pointKey = `FEPOINT-${index + 1}`;
      baselineLinks.push({ from: previousKey, to: pointKey });
      previousKey = pointKey;
    });
    baselineLinks.push({ from: previousKey, to: '__BASELINE_END__' });

    if (!branchNodes.length) {
      this.diagram.model = new go.GraphLinksModel(nodes, baselineLinks);
      return;
    }

    const outgoing = new Map<string, string[]>();
    this.model.links.forEach((link) => {
      const list = outgoing.get(link.from) ?? [];
      list.push(link.to);
      outgoing.set(link.from, list);
    });

    const yMemo = new Map<string, number>();
    const getTargetY = (key: string, depth = 0): number => {
      if (depth > 20) return metrics.headerHeight + 50;
      if (sequenceCenterY.has(key)) return sequenceCenterY.get(key)!;

      const branch = this.model.nodes.find((node) => node.key === key && node.category === 'BRANCH');
      if (branch?.pathSequenceKey && sequenceCenterY.has(branch.pathSequenceKey)) {
        return sequenceCenterY.get(branch.pathSequenceKey)!;
      }

      if (yMemo.has(key)) return yMemo.get(key)!;
      const targets = outgoing.get(key) ?? [];
      if (!targets.length) return metrics.headerHeight + 50;
      const ys = targets.map((target) => getTargetY(target, depth + 1));
      const y = ys.reduce((sum, value) => sum + value, 0) / ys.length;
      yMemo.set(key, y);
      return y;
    };

    branchNodes.forEach((node: EventTreeNodeData) => {
      const maxColumn = Math.max(1, this.model.functionEvents.length);
      const column = Math.max(1, Math.min(node.columnIndex ?? 1, maxColumn));
      const x = column * metrics.blockWidth + metrics.blockWidth / 2;
      const y = node.pathSequenceKey && sequenceCenterY.has(node.pathSequenceKey)
        ? sequenceCenterY.get(node.pathSequenceKey)!
        : getTargetY(node.key);
      nodes.push({ ...node, loc: `${x} ${y}` });
    });

    const renderedLinks: any[] = [...baselineLinks];
    const branchNodeKeys = new Set(
      this.model.nodes.filter((node) => node.category === 'BRANCH').map((node) => node.key)
    );
    const sequenceKeys = new Set(
      this.model.nodes.filter((node) => node.category === 'SEQUENCE').map((node) => node.key)
    );

    const getNodeX = (key: string): number | null => {
      const feMatch = /^FEPOINT-(\d+)$/.exec(key);
      if (feMatch) {
        const column = Number(feMatch[1]);
        return column * metrics.blockWidth + metrics.blockWidth / 2;
      }

      const node = this.model.nodes.find((item) => item.key === key);
      if (node?.category === 'BRANCH') {
        const column = Math.max(1, Math.min(node.columnIndex ?? 1, this.model.functionEvents.length));
        return column * metrics.blockWidth + metrics.blockWidth / 2;
      }
      return null;
    };

    this.model.links.forEach((link, index) => {
      const isBranchStart = /^Branch\s\d+/.test(link.label ?? '');

      if (!isBranchStart) {
        renderedLinks.push(link);
        return;
      }

      const sourceX = getNodeX(link.from);
      const targetY = branchNodeKeys.has(link.to)
        ? getTargetY(link.to)
        : sequenceKeys.has(link.to)
          ? (sequenceCenterY.get(link.to) ?? null)
          : null;

      if (sourceX === null || targetY === null) {
        renderedLinks.push(link);
        return;
      }

      const bendKey = `__BEND-${index}-${link.from}-${link.to}`;
      nodes.push({ key: bendKey, category: 'ANCHOR', loc: `${sourceX} ${targetY}` });
      renderedLinks.push(
        { from: link.from, to: bendKey },
        { from: bendKey, to: link.to }
      );
    });

    this.diagram.model = new go.GraphLinksModel(nodes, renderedLinks);
  }
}
