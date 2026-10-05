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
        gap: 5px !important;
        margin-left: 2px !important;
      }

      [data-et-layout-v2='true'] > button.et-layout-ft-button {
        width: 40px !important;
        min-width: 40px !important;
        height: 32px !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 0 !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 6px !important;
        background: #ffffff !important;
        color: #111827 !important;
        box-shadow: none !important;
        line-height: 1 !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
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
        width: 22px !important;
        height: 14px !important;
        flex: 0 0 auto;
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

    // Reference icon: Standard layout = one top line with two downward branch levels.
    standard.innerHTML = `
      <svg viewBox="0 0 30 18" aria-hidden="true">
        <path d="M2 3H28 M9 3V9H28 M17 3V15H28"
          fill="none" stroke="currentColor" stroke-width="1.7"
          stroke-linecap="square" stroke-linejoin="miter"></path>
      </svg>`;

    // Reference icon: Centred layout = middle trunk with one branch above and one below.
    centered.innerHTML = `
      <svg viewBox="0 0 30 18" aria-hidden="true">
        <path d="M2 9H28 M10 9V3H28 M18 9V15H28"
          fill="none" stroke="currentColor" stroke-width="1.7"
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
