import { EventTreePageComponent } from './event-tree-page.component';

const DEFAULT_WIDTHS = [130, 310, 230, 140, 115, 90];

function percentages(widths: number[]): number[] {
  const safe = widths.length === 6 ? widths : DEFAULT_WIDTHS;
  const total = Math.max(1, safe.reduce((sum, width) => sum + Math.max(1, width), 0));
  return safe.map((width) => (Math.max(1, width) / total) * 100);
}

function applyColumnVariables(component: any): void {
  const widths = component.columnWidths?.() as number[] | undefined;
  const values = percentages(widths ?? DEFAULT_WIDTHS);
  const root = document.documentElement;

  values.forEach((value, index) => {
    root.style.setProperty(`--et-browser-col-${index + 1}`, `${value}%`);
  });
}

function installFixedWidthStyles(): void {
  if (document.getElementById('nextpsa-et-browser-fixed-width')) return;

  const style = document.createElement('style');
  style.id = 'nextpsa-et-browser-fixed-width';
  style.textContent = `
    .event-tree-browser-panel,
    .event-tree-browser-panel .et-table-wrap {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box;
    }

    .event-tree-browser-panel .et-table-wrap {
      overflow-x: hidden !important;
      overflow-y: auto !important;
    }

    .event-tree-browser-panel .et-table {
      width: 100% !important;
      min-width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      box-sizing: border-box;
    }

    .event-tree-browser-panel .et-table col:nth-child(1) { width: var(--et-browser-col-1, 12.81%) !important; }
    .event-tree-browser-panel .et-table col:nth-child(2) { width: var(--et-browser-col-2, 30.54%) !important; }
    .event-tree-browser-panel .et-table col:nth-child(3) { width: var(--et-browser-col-3, 22.66%) !important; }
    .event-tree-browser-panel .et-table col:nth-child(4) { width: var(--et-browser-col-4, 13.79%) !important; }
    .event-tree-browser-panel .et-table col:nth-child(5) { width: var(--et-browser-col-5, 11.33%) !important; }
    .event-tree-browser-panel .et-table col:nth-child(6) { width: var(--et-browser-col-6, 8.87%) !important; }

    .event-tree-browser-panel .et-table th:last-child,
    .event-tree-browser-panel .et-table td:last-child {
      border-right: 0 !important;
    }
  `;
  document.head.appendChild(style);
}

export function installEventTreeBrowserWidthPatch(): void {
  installFixedWidthStyles();

  const prototype = EventTreePageComponent.prototype as any;
  if (prototype.__browserWidthPatchInstalled) return;
  prototype.__browserWidthPatchInstalled = true;

  const originalStartColumnResize = prototype.startColumnResize;
  const originalOnResize = prototype.onResize;
  const originalResetColumnWidth = prototype.resetColumnWidth;

  prototype.startColumnResize = function(event: PointerEvent, index: number): void {
    applyColumnVariables(this);
    originalStartColumnResize.call(this, event, index);
  };

  prototype.onResize = function(event: PointerEvent): void {
    originalOnResize.call(this, event);
    if (this.resizingColumnIndex !== null) applyColumnVariables(this);
  };

  prototype.resetColumnWidth = function(index: number): void {
    originalResetColumnWidth.call(this, index);
    applyColumnVariables(this);
  };

  // Prime the CSS custom properties with the same proportions as the FT-style
  // fixed table before the Event Tree page is first rendered.
  const defaults = percentages(DEFAULT_WIDTHS);
  defaults.forEach((value, index) => {
    document.documentElement.style.setProperty(`--et-browser-col-${index + 1}`, `${value}%`);
  });
}
