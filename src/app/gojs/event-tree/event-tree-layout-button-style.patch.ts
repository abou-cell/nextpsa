import { EventTreeEditorComponent } from './event-tree-editor.component';

const STYLE_ID = 'nextpsa-et-layout-ft-style';

export function installEventTreeLayoutButtonStylePatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeLayoutButtonStylePatchInstalled) return;
  prototype.__eventTreeLayoutButtonStylePatchInstalled = true;

  const originalAfterViewInit = prototype.ngAfterViewInit;

  const ensureStyles = (): void => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [data-et-layout-v2='true'] {
        gap: 6px !important;
        margin-left: 2px !important;
      }

      [data-et-layout-v2='true'] > button.et-layout-ft-button {
        width: 42px !important;
        min-width: 42px !important;
        height: 36px !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 0 !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 8px !important;
        background: #ffffff !important;
        color: #111827 !important;
        box-shadow: none !important;
        line-height: 1 !important;
      }

      [data-et-layout-v2='true'] > button.et-layout-ft-button:hover {
        background: #f8fafc !important;
        border-color: #94a3b8 !important;
      }

      [data-et-layout-v2='true'] > button.et-layout-ft-button[aria-pressed='true'] {
        background: #e8f1ff !important;
        border-color: #3b82f6 !important;
        color: #2563eb !important;
      }

      [data-et-layout-v2='true'] > button.et-layout-ft-button[aria-pressed='true']:hover {
        background: #dbeafe !important;
        border-color: #2563eb !important;
      }

      [data-et-layout-v2='true'] > button.et-layout-ft-button svg {
        display: block;
        width: 28px;
        height: 20px;
        pointer-events: none;
      }
    `;

    document.head.appendChild(style);
  };

  const applyCompactButtons = (component: any): void => {
    const controls = component.__eventTreeLayoutControlsV2 as HTMLElement | undefined;
    const standard = component.__eventTreeLayoutLeftButton as HTMLButtonElement | undefined;
    const centered = component.__eventTreeLayoutCenteredButtonV2 as HTMLButtonElement | undefined;
    if (!controls || !standard || !centered) return;

    ensureStyles();

    controls.dataset['etLayoutV2'] = 'true';

    standard.classList.add('et-layout-ft-button');
    centered.classList.add('et-layout-ft-button');

    // Keep the toolbar as compact as the Fault Tree workspace: icon only.
    // The Standard icon intentionally uses only three visible branch levels.
    standard.innerHTML = `
      <svg viewBox="0 0 30 20" aria-hidden="true">
        <path d="M4 4H24 M8 4V9H24 M12 9V14H24"
          fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="square" stroke-linejoin="miter"></path>
      </svg>`;

    // Centered view: one compact three-branch tree, visually aligned with FT controls.
    centered.innerHTML = `
      <svg viewBox="0 0 30 20" aria-hidden="true">
        <path d="M15 3V17 M6 5H24 M8 10H22 M10 15H20"
          fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="square" stroke-linejoin="miter"></path>
      </svg>`;

    standard.title = 'Disposition ET standard';
    centered.title = 'Disposition ET centrée';
    standard.setAttribute('aria-label', 'Afficher l’Event Tree en disposition standard');
    centered.setAttribute('aria-label', 'Afficher l’Event Tree en disposition centrée');
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);

    // Layout V2 injects its buttons in requestAnimationFrame. Run after it and
    // once more on the following frame to cover slow first renders on GitHub Pages.
    requestAnimationFrame(() => {
      applyCompactButtons(this);
      requestAnimationFrame(() => applyCompactButtons(this));
    });
  };
}
