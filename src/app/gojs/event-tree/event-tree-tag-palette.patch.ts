import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

interface TaggableNodeData {
  key?: string;
  category?: string;
  initiating?: boolean;
  tagColor?: string | null;
}

const TAG_COLORS = [
  { name: 'Yellow', value: '#fff200' },
  { name: 'Salmon', value: '#ffb4a8' },
  { name: 'Sand', value: '#ffd6a3' },
  { name: 'Cyan', value: '#73e3ea' },
  { name: 'Blue cyan', value: '#48c4d4' }
] as const;

const DEFAULT_TAG_COLOR = TAG_COLORS[0].value;

function isTaggable(data: TaggableNodeData | undefined): boolean {
  return data?.category === 'HEADER' || data?.category === 'SEQUENCE';
}

function getDefaultFill(data: TaggableNodeData): string {
  if (data.category === 'HEADER' && data.initiating) return '#d8d8d8';
  return '#ffffff';
}

export function installEventTreeTagPalettePatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__tagPalettePatchInstalled) return;
  prototype.__tagPalettePatchInstalled = true;

  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;
  const originalInstallTemplates = prototype.installTemplates;
  const originalApplyModel = prototype.applyModel;

  const applyVisual = (component: any, node: go.Node): void => {
    const data = node.data as TaggableNodeData;
    if (!isTaggable(data)) return;

    const tagMap = component.__eventTreeTagColors as Map<string, string> | undefined;
    const color = data.key ? tagMap?.get(data.key) : undefined;
    const shape = node.elt(0) as go.Shape | null;
    if (!shape) return;

    if (data.category === 'SEQUENCE') {
      shape.fill = color ?? (node.isSelected ? '#e8f1ff' : '#ffffff');
      shape.stroke = node.isSelected ? '#2563eb' : '#cbd5e1';
      shape.strokeWidth = node.isSelected ? 1.5 : 1;
      return;
    }

    shape.fill = color ?? getDefaultFill(data);
  };

  const applyAllVisuals = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    diagram?.nodes.each((node: go.Node) => applyVisual(component, node));
  };

  const tagSelection = (component: any): boolean => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return false;

    const nodes: go.Node[] = [];
    diagram.selection.each((part: go.Part) => {
      if (!(part instanceof go.Node)) return;
      const data = part.data as TaggableNodeData | undefined;
      if (isTaggable(data)) nodes.push(part);
    });
    if (!nodes.length) return false;

    const tagMap = component.__eventTreeTagColors as Map<string, string>;
    const color = component.__eventTreeActiveTagColor as string;

    nodes.forEach((node) => {
      const data = node.data as TaggableNodeData;
      if (!data.key) return;
      tagMap.set(data.key, color);
      data.tagColor = color;
      applyVisual(component, node);
    });

    diagram.requestUpdate();
    return true;
  };

  const injectPalette = (component: any): void => {
    const host = component.diagramDiv?.nativeElement?.closest?.('.et-shell') as HTMLElement | null;
    const toolbar = host?.querySelector('.toolbar') as HTMLElement | null;
    if (!toolbar || toolbar.querySelector('[data-et-tag-palette]')) return;

    component.__eventTreeTagColors ??= new Map<string, string>();
    component.__eventTreeActiveTagColor ??= DEFAULT_TAG_COLOR;

    const control = document.createElement('div');
    control.dataset['etTagPalette'] = 'true';
    Object.assign(control.style, {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      flex: '0 0 auto'
    });

    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Tag colour — select IE, FE or sequence row, then press Alt+T';
    button.setAttribute('aria-label', 'Choose Event Tree tag colour');
    Object.assign(button.style, {
      width: '54px',
      minWidth: '54px',
      padding: '3px 5px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '5px'
    });

    const preview = document.createElement('span');
    Object.assign(preview.style, {
      width: '30px',
      height: '14px',
      border: '1px solid #111827',
      boxSizing: 'border-box',
      display: 'inline-block',
      background: component.__eventTreeActiveTagColor
    });

    const chevron = document.createElement('span');
    chevron.textContent = '▾';
    Object.assign(chevron.style, {
      fontSize: '10px',
      lineHeight: '1',
      color: '#475569'
    });

    button.append(preview, chevron);

    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Event Tree tag colour palette');
    Object.assign(menu.style, {
      position: 'absolute',
      top: '32px',
      left: '0',
      zIndex: '60',
      display: 'none',
      flexDirection: 'column',
      gap: '2px',
      minWidth: '54px',
      padding: '3px',
      border: '1px solid #94a3b8',
      background: '#ffffff',
      boxShadow: '0 6px 18px rgba(15, 23, 42, 0.18)'
    });

    TAG_COLORS.forEach(({ name, value }) => {
      const swatchButton = document.createElement('button');
      swatchButton.type = 'button';
      swatchButton.title = name;
      Object.assign(swatchButton.style, {
        width: '48px',
        minWidth: '48px',
        height: '20px',
        padding: '1px 3px',
        border: '1px solid transparent',
        borderRadius: '0',
        background: '#ffffff'
      });

      const swatch = document.createElement('span');
      Object.assign(swatch.style, {
        display: 'block',
        width: '38px',
        height: '14px',
        border: '1px solid #334155',
        boxSizing: 'border-box',
        background: value
      });
      swatchButton.appendChild(swatch);

      swatchButton.addEventListener('mouseenter', () => {
        swatchButton.style.borderColor = '#64748b';
        swatchButton.style.background = '#f8fafc';
      });
      swatchButton.addEventListener('mouseleave', () => {
        swatchButton.style.borderColor = 'transparent';
        swatchButton.style.background = '#ffffff';
      });
      swatchButton.addEventListener('click', (event) => {
        event.stopPropagation();
        component.__eventTreeActiveTagColor = value;
        preview.style.background = value;
        menu.style.display = 'none';
      });

      menu.appendChild(swatchButton);
    });

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
    });

    control.append(button, menu);

    const hint = toolbar.querySelector('.hint');
    if (hint) toolbar.insertBefore(control, hint);
    else toolbar.appendChild(control);

    component.__eventTreeTagPaletteElement = control;
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    injectPalette(this);

    const component = this;
    const handler = (event: KeyboardEvent): void => {
      if (!event.altKey || event.key.toLowerCase() !== 't') return;
      if (!tagSelection(component)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    component.__eventTreeTagKeyHandler = handler;
    window.addEventListener('keydown', handler, true);
  };

  prototype.ngOnDestroy = function(): void {
    const handler = this.__eventTreeTagKeyHandler as ((event: KeyboardEvent) => void) | undefined;
    if (handler) window.removeEventListener('keydown', handler, true);
    this.__eventTreeTagPaletteElement?.remove?.();
    originalOnDestroy.call(this);
  };

  prototype.installTemplates = function(metrics: unknown): void {
    originalInstallTemplates.call(this, metrics);

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const sequenceTemplate = diagram.nodeTemplateMap.get('SEQUENCE') as go.Node | null;
    if (sequenceTemplate) {
      sequenceTemplate.selectable = true;
      sequenceTemplate.selectionAdorned = false;
      sequenceTemplate.movable = false;
      sequenceTemplate.cursor = 'pointer';
      sequenceTemplate.selectionChanged = (part: go.Part): void => {
        applyVisual(this, part as go.Node);
      };
    }

    const headerTemplate = diagram.nodeTemplateMap.get('HEADER') as go.Node | null;
    if (headerTemplate) {
      headerTemplate.selectable = true;
      headerTemplate.cursor = 'pointer';
    }
  };

  prototype.applyModel = function(metrics: unknown): void {
    originalApplyModel.call(this, metrics);
    this.__eventTreeTagColors ??= new Map<string, string>();
    this.__eventTreeActiveTagColor ??= DEFAULT_TAG_COLOR;
    applyAllVisuals(this);
  };
}
