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

@Component({
  selector: 'app-event-tree-editor',
  standalone: true,
  template: `
    <section class="et-shell">
      <div class="toolbar">
        <button type="button" (click)="fit()">Fit</button>
        <button type="button" (click)="addFunctionEvent.emit()">+ Function Event</button>
        <button type="button" [disabled]="!selectedBranchKey" (click)="requestBranch()">+ Branch</button>
        <span class="hint">{{ selectedBranchKey ? ('Selected: ' + selectedBranchKey) : 'Select a branch node to add a branch' }}</span>
        <span class="status"><i></i> GoJS Event Tree</span>
      </div>
      <div #diagramDiv class="diagram"></div>
    </section>
  `,
  styles: [`
    :host { display:block; width:100%; height:100%; min-height:0; }
    .et-shell { height:100%; min-height:0; display:grid; grid-template-rows:42px minmax(0,1fr); background:#fff; }
    .toolbar { display:flex; align-items:center; gap:7px; padding:0 10px; border-bottom:1px solid var(--nps-border); background:#fff; }
    .toolbar button { height:31px; padding:0 11px; border:1px solid var(--nps-border); border-radius:7px; background:#fff; color:var(--nps-text); font:inherit; font-size:10px; cursor:pointer; }
    .toolbar button:hover:not(:disabled) { background:#f3f7fb; border-color:#a9bfd7; }
    .toolbar button:disabled { opacity:.4; cursor:default; }
    .hint { color:var(--nps-text-muted); font-size:9px; }
    .status { margin-left:auto; color:var(--nps-text-muted); font-size:9px; display:flex; align-items:center; gap:6px; }
    .status i { width:7px; height:7px; border-radius:50%; background:#22c55e; }
    .diagram { width:100%; height:100%; min-height:0; background:#fff; }
  `]
})
export class EventTreeEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('diagramDiv', { static: true }) diagramDiv!: ElementRef<HTMLDivElement>;

  @Input() model!: EventTreeModel;
  @Output() readonly addFunctionEvent = new EventEmitter<void>();
  @Output() readonly addBranch = new EventEmitter<string>();

  private diagram?: go.Diagram;
  selectedBranchKey: string | null = null;

  ngAfterViewInit(): void {
    this.createDiagram();
    this.applyModel();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['model'] && this.diagram) this.applyModel();
  }

  ngOnDestroy(): void {
    if (this.diagram) this.diagram.div = null;
  }

  requestBranch(): void {
    if (this.selectedBranchKey) this.addBranch.emit(this.selectedBranchKey);
  }

  fit(): void {
    this.diagram?.commandHandler.zoomToFit();
  }

  private createDiagram(): void {
    const $ = go.GraphObject.make;

    this.diagram = $(go.Diagram, this.diagramDiv.nativeElement, {
      'undoManager.isEnabled': true,
      'animationManager.isEnabled': false,
      allowMove: false,
      allowCopy: false,
      allowDelete: false,
      padding: new go.Margin(30, 50, 40, 30),
      initialAutoScale: go.AutoScale.Uniform
    });

    this.diagram.nodeTemplateMap.add('HEADER',
      $(go.Node, 'Auto',
        { selectable: false, layerName: 'Background' },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', {
          fill: '#f8fafc',
          stroke: '#64748b',
          strokeWidth: 1,
          minSize: new go.Size(180, 66)
        }),
        $(go.Panel, 'Table',
          { margin: 0, defaultAlignment: go.Spot.Left },
          $(go.TextBlock, {
            row: 0,
            margin: new go.Margin(8, 8, 4, 8),
            width: 164,
            font: '600 11px Inter, sans-serif',
            wrap: go.Wrap.Fit,
            stroke: '#172033'
          }, new go.Binding('text', 'label')),
          $(go.Shape, 'LineH', {
            row: 1,
            stretch: go.Stretch.Horizontal,
            stroke: '#94a3b8',
            strokeWidth: 1
          }),
          $(go.TextBlock, {
            row: 2,
            margin: new go.Margin(4, 8, 6, 8),
            width: 164,
            textAlign: 'center',
            font: '10px Inter, sans-serif',
            stroke: '#334155'
          }, new go.Binding('text', 'code'))
        )
      )
    );

    this.diagram.nodeTemplateMap.add('BRANCH',
      $(go.Node, 'Spot',
        {
          selectionAdorned: true,
          cursor: 'pointer',
          fromSpot: go.Spot.Right,
          toSpot: go.Spot.Left
        },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Circle', {
          width: 10,
          height: 10,
          fill: '#fff',
          stroke: '#334155',
          strokeWidth: 1.2,
          portId: ''
        }),
        $(go.TextBlock, {
          alignment: new go.Spot(0.5, 1, 0, 13),
          font: '8px Inter, sans-serif',
          stroke: '#64748b'
        }, new go.Binding('text', 'label'))
      )
    );

    this.diagram.nodeTemplateMap.add('SEQUENCE',
      $(go.Node, 'Auto',
        { selectable: false, toSpot: go.Spot.Left },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', { fill: '#fff', stroke: '#94a3b8', strokeWidth: 1 }),
        $(go.Panel, 'Table',
          { defaultAlignment: go.Spot.Left },
          $(go.TextBlock, 'No.', { row: 0, column: 0, margin: 4, font: '600 8px Inter, sans-serif', stroke: '#64748b' }),
          $(go.TextBlock, 'Freq.', { row: 0, column: 1, margin: 4, font: '600 8px Inter, sans-serif', stroke: '#64748b' }),
          $(go.TextBlock, 'Conseq.', { row: 0, column: 2, margin: 4, font: '600 8px Inter, sans-serif', stroke: '#64748b' }),
          $(go.TextBlock, 'Code', { row: 0, column: 3, margin: 4, font: '600 8px Inter, sans-serif', stroke: '#64748b' }),
          $(go.Shape, 'LineH', { row: 1, columnSpan: 4, stretch: go.Stretch.Horizontal, stroke: '#cbd5e1' }),
          $(go.TextBlock, { row: 2, column: 0, margin: 4, width: 28, font: '9px Inter, sans-serif' }, new go.Binding('text', 'sequenceNo')),
          $(go.TextBlock, { row: 2, column: 1, margin: 4, width: 74, font: '9px Inter, sans-serif' }, new go.Binding('text', 'frequency')),
          $(go.TextBlock, { row: 2, column: 2, margin: 4, width: 112, font: '9px Inter, sans-serif' }, new go.Binding('text', 'consequence')),
          $(go.TextBlock, { row: 2, column: 3, margin: 4, width: 48, font: '9px Inter, sans-serif', stroke: '#2563eb' }, new go.Binding('text', 'resultCode'))
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
        $(go.Shape, { stroke: '#334155', strokeWidth: 1.2 }),
        $(go.TextBlock, {
          segmentOffset: new go.Point(0, -10),
          background: '#fff',
          font: '8px Inter, sans-serif',
          stroke: '#475569'
        }, new go.Binding('text', 'label'))
      );

    this.diagram.addDiagramListener('ChangedSelection', () => {
      const node = this.diagram?.selection.first() as go.Node | null;
      const data = node?.data as { category?: string; key?: string } | undefined;
      this.selectedBranchKey = data?.category === 'BRANCH' ? (data.key ?? null) : null;
    });
  }

  private applyModel(): void {
    if (!this.diagram || !this.model) return;

    const headerY = 20;
    const branchBaseY = 165;
    const columnWidth = 215;
    const sequenceX = (this.model.functionEvents.length + 1) * columnWidth + 70;

    const nodes: any[] = [];

    nodes.push({
      key: 'HDR-IE',
      category: 'HEADER',
      label: this.model.initiatingEvent,
      code: this.model.initiatingCode,
      loc: `20 ${headerY}`
    });

    this.model.functionEvents.forEach((event, index) => {
      nodes.push({
        key: `HDR-${event.id}`,
        category: 'HEADER',
        label: event.description,
        code: event.code,
        loc: `${20 + (index + 1) * columnWidth} ${headerY}`
      });
    });

    const sequenceNodes = this.model.nodes.filter((node) => node.category === 'SEQUENCE');
    const sequenceIndex = new Map(sequenceNodes.map((node, index) => [node.key, index]));

    this.model.nodes.forEach((node: EventTreeNodeData) => {
      if (node.category === 'INITIATING' || node.category === 'FUNCTION') return;

      if (node.category === 'BRANCH') {
        const x = 105 + (node.columnIndex ?? 1) * columnWidth;
        const y = branchBaseY + (node.level ?? 0) * 62;
        nodes.push({ ...node, loc: `${x} ${y}` });
        return;
      }

      if (node.category === 'SEQUENCE') {
        const idx = sequenceIndex.get(node.key) ?? 0;
        nodes.push({ ...node, loc: `${sequenceX} ${120 + idx * 76}` });
      }
    });

    const firstBranch = this.model.nodes.find((node) => node.category === 'BRANCH');
    const links = [...this.model.links];

    if (firstBranch) {
      nodes.push({
        key: 'IE-ANCHOR',
        category: 'BRANCH',
        label: '',
        loc: `105 ${branchBaseY}`
      });
      links.unshift({ from: 'IE-ANCHOR', to: firstBranch.key, label: '' });
    }

    this.diagram.model = new go.GraphLinksModel(nodes, links);
    this.diagram.commandHandler.zoomToFit();
  }
}
