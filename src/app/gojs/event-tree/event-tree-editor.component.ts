import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
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
        <button type="button" (click)="fit()">Fit</button>
        <button type="button" (click)="addFunctionEvent.emit()">+ Function Event</button>
        <button type="button" [disabled]="model?.functionEvents?.length === 0" (click)="removeFunctionEvent.emit()">− Function Event</button>
        <button type="button" [disabled]="!selectedBranchKey" (click)="requestBranch()">+ Branch</button>
        <span class="hint">{{ selectedBranchKey ? ('Selected branch: ' + selectedBranchKey) : 'Select a branch node to add a branch' }}</span>
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
    .hint { color:var(--nps-text-muted); font-size:9px; }
    .status { margin-left:auto; color:var(--nps-text-muted); font-size:9px; display:flex; align-items:center; gap:6px; }
    .status i { width:7px; height:7px; border-radius:50%; background:#22c55e; }
    .diagram { width:100%; height:100%; min-height:0; overflow:hidden; background:#fff; }
  `]
})
export class EventTreeEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('diagramDiv', { static: true }) diagramDiv!: ElementRef<HTMLDivElement>;

  @Input() model!: EventTreeModel;
  @Output() readonly addFunctionEvent = new EventEmitter<void>();
  @Output() readonly removeFunctionEvent = new EventEmitter<void>();
  @Output() readonly addBranch = new EventEmitter<string>();

  private diagram?: go.Diagram;
  private resizeObserver?: ResizeObserver;
  selectedBranchKey: string | null = null;

  ngAfterViewInit(): void {
    this.createDiagram();
    this.refreshLayout();

    this.resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => this.refreshLayout());
    });
    this.resizeObserver.observe(this.diagramDiv.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['model'] && this.diagram) this.refreshLayout();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.diagram) this.diagram.div = null;
  }

  requestBranch(): void {
    if (this.selectedBranchKey) this.addBranch.emit(this.selectedBranchKey);
  }

  fit(): void {
    this.diagram?.commandHandler.zoomToFit();
  }

  preventDiagramWheel(event: WheelEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.diagram) this.diagram.position = new go.Point(0, 0);
  }

  refreshLayout(): void {
    if (!this.diagram || !this.model) return;

    const metrics = this.measureLayout();
    this.installTemplates(metrics);
    this.applyModel(metrics);

    // RiskSpectrum-style fixed anchors: IE always starts at x=0 and the result
    // block always ends at the right edge. Resizing the browser only changes
    // the widths of IE/FE blocks between those two anchors.
    this.diagram.scale = 1;
    this.diagram.position = new go.Point(0, 0);
  }

  private measureLayout(): EventTreeLayoutMetrics {
    const width = Math.max(720, this.diagramDiv.nativeElement.clientWidth || 720);
    const headerHeight = 82;

    // Keep the result table anchored to the right. Its width follows the
    // viewport modestly, while the IE/FE family consumes all remaining space.
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
      'undoManager.isEnabled': true,
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

    this.diagram.addDiagramListener('ChangedSelection', () => {
      const node = this.diagram?.selection.first() as go.Node | null;
      const data = node?.data as { category?: string; key?: string } | undefined;
      this.selectedBranchKey =
        data?.category === 'BRANCH' || data?.category === 'FE_POINT'
          ? (data.key ?? null)
          : null;
    });
  }

  private installTemplates(metrics: EventTreeLayoutMetrics): void {
    if (!this.diagram) return;
    const $ = go.GraphObject.make;

    this.diagram.nodeTemplateMap.clear();

    this.diagram.nodeTemplateMap.add('HEADER',
      $(go.Node, 'Auto',
        {
          selectable: false,
          locationSpot: go.Spot.TopLeft,
          layerName: 'Background'
        },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', {
          fill: '#ffffff',
          stroke: '#4b5563',
          strokeWidth: 1,
          desiredSize: new go.Size(metrics.blockWidth, metrics.headerHeight)
        }, new go.Binding('fill', 'initiating', (v) => v ? '#d8d8d8' : '#ffffff')),
        $(go.Panel, 'Table',
          {
            width: metrics.blockWidth,
            height: metrics.headerHeight,
            defaultAlignment: go.Spot.Left
          },
          $(go.RowColumnDefinition, { row: 0, height: 60 }),
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

    this.diagram.nodeTemplateMap.add('RESULT_HEADER',
      $(go.Node, 'Auto',
        {
          selectable: false,
          locationSpot: go.Spot.TopLeft,
          layerName: 'Background'
        },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', {
          fill: '#ffffff',
          stroke: '#4b5563',
          strokeWidth: 1,
          desiredSize: new go.Size(metrics.resultWidth, metrics.headerHeight)
        }),
        $(go.Panel, 'Table',
          {
            width: metrics.resultWidth,
            height: metrics.headerHeight,
            defaultAlignment: go.Spot.Left
          },
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

    this.diagram.nodeTemplateMap.add('FE_POINT',
      $(go.Node, 'Spot',
        {
          selectionAdorned: true,
          cursor: 'pointer',
          locationSpot: go.Spot.Center,
          fromSpot: go.Spot.Right,
          toSpot: go.Spot.Left
        },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Circle', {
          width: 8,
          height: 8,
          fill: '#ffffff',
          stroke: '#334155',
          strokeWidth: 1.2,
          portId: ''
        })
      )
    );

    this.diagram.nodeTemplateMap.add('BRANCH',
      $(go.Node, 'Spot',
        {
          selectionAdorned: true,
          cursor: 'pointer',
          locationSpot: go.Spot.Center,
          fromSpot: go.Spot.Right,
          toSpot: go.Spot.Left
        },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', {
          width: 12,
          height: 12,
          fill: 'rgba(255,255,255,0.01)',
          stroke: null,
          portId: ''
        })
      )
    );

    this.diagram.nodeTemplateMap.add('SEQUENCE',
      $(go.Node, 'Auto',
        {
          selectable: false,
          locationSpot: go.Spot.TopLeft,
          toSpot: go.Spot.Left
        },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', {
          fill: '#fff',
          stroke: '#cbd5e1',
          strokeWidth: 1,
          desiredSize: new go.Size(metrics.resultWidth, metrics.sequenceRowHeight)
        }),
        $(go.Panel, 'Table',
          {
            width: metrics.resultWidth,
            height: metrics.sequenceRowHeight,
            defaultAlignment: go.Spot.Left
          },
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
          routing: go.Routing.Orthogonal,
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
        key: 'HDR-IE',
        category: 'HEADER',
        label: this.model.initiatingEvent,
        code: this.model.initiatingCode,
        initiating: true,
        loc: '0 0'
      }
    ];

    this.model.functionEvents.forEach((event, index) => {
      nodes.push({
        key: `HDR-${event.id}`,
        category: 'HEADER',
        label: event.description,
        code: event.code,
        initiating: false,
        loc: `${(index + 1) * metrics.blockWidth} 0`
      });
    });

    nodes.push({
      key: 'RESULT-HEADER',
      category: 'RESULT_HEADER',
      loc: `${metrics.resultX} 0`
    });

    const baselineY = metrics.headerHeight + metrics.sequenceRowHeight / 2;

    // One selectable branch point is always available under each Function Event.
    // These fixed points are the places where + Branch can be applied.
    this.model.functionEvents.forEach((_event, index) => {
      const column = index + 1;
      const x = column * metrics.blockWidth + metrics.blockWidth / 2;
      nodes.push({
        key: `FEPOINT-${column}`,
        category: 'FE_POINT',
        loc: `${x} ${baselineY}`
      });
    });

    const sequenceNodes = [...this.model.nodes]
      .filter((node) => node.category === 'SEQUENCE')
      .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));

    // A brand-new ET has no branches: RiskSpectrum still shows one result line.
    const visibleSequences = sequenceNodes.length
      ? sequenceNodes
      : [{
          key: '__NEW_SEQUENCE__',
          category: 'SEQUENCE' as const,
          label: 'Sequence 1',
          sequenceNo: 1,
          frequency: '',
          consequence: '',
          resultCode: ''
        }];

    const sequenceCenterY = new Map<string, number>();

    visibleSequences.forEach((node, index) => {
      const y = metrics.headerHeight + index * metrics.sequenceRowHeight;
      sequenceCenterY.set(node.key, y + metrics.sequenceRowHeight / 2);
      nodes.push({ ...node, loc: `${metrics.resultX} ${y}` });
    });

    const branchNodes = this.model.nodes.filter((node) => node.category === 'BRANCH');

    // Permanent RiskSpectrum-style base sequence: one straight line crossing
    // every FE point and ending at Sequence 1. FE points stay selectable even
    // when no additional branch exists.
    const baselineNodes = [
      { key: '__BASELINE_START__', category: 'BRANCH', loc: `0 ${baselineY}` },
      { key: '__BASELINE_END__', category: 'BRANCH', loc: `${metrics.resultX} ${baselineY}` }
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
      const y = getTargetY(node.key);
      nodes.push({ ...node, loc: `${x} ${y}` });
    });

    const firstBranch = branchNodes[0];
    const firstY = getTargetY(firstBranch.key);
    nodes.push({
      key: 'IE-ANCHOR',
      category: 'BRANCH',
      loc: `0 ${firstY}`
    });

    this.diagram.model = new go.GraphLinksModel(nodes, [
      ...baselineLinks,
      { from: 'IE-ANCHOR', to: firstBranch.key },
      ...this.model.links
    ]);
  }
}
