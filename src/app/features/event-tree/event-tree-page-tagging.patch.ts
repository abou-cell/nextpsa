import { EventTreePageComponent } from './event-tree-page.component';

/**
 * Makes the Event Tree browser a separate, explicit selection domain.
 * The table no longer steals Alt+T merely because the current ET row is visible.
 */
export function installEventTreePageTaggingPatch(): void {
  const prototype = EventTreePageComponent.prototype as any;
  if (prototype.__eventTreePageTaggingPatchInstalled) return;
  prototype.__eventTreePageTaggingPatchInstalled = true;

  const originalSelectEventTree = prototype.selectEventTree;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const activeColor = (component: any): string =>
    String((component.eventTreeEditor as any)?.__eventTreeActiveTagColor ?? '#fff200');

  const refreshSelectionSignal = (component: any): void => {
    component.selectedTableRows?.set?.(new Set(component.selectedTableRows?.() ?? []));
  };

  const selectedTrees = (component: any): any[] => {
    const selected = component.selectedTableRows?.() as Set<string> | undefined;
    if (!selected?.size) return [];
    return (component.repository?.eventTrees?.() ?? []).filter((tree: any) => selected.has(String(tree.id)));
  };

  const toggleSelectedTreeTags = (component: any): boolean => {
    if (!component.__eventTreeBrowserSelectionActive) return false;
    const trees = selectedTrees(component);
    if (!trees.length) return false;
    const allTagged = trees.every((tree: any) => Boolean(tree.tagColor));
    if (allTagged) trees.forEach((tree: any) => { tree.tagColor = undefined; });
    else {
      const color = activeColor(component);
      trees.forEach((tree: any) => { tree.tagColor = color; });
    }
    refreshSelectionSignal(component);
    return true;
  };

  const clearSelectedTreeTags = (component: any): boolean => {
    if (!component.__eventTreeBrowserSelectionActive) return false;
    const trees = selectedTrees(component);
    if (!trees.length) return false;
    trees.forEach((tree: any) => { tree.tagColor = undefined; });
    refreshSelectionSignal(component);
    return true;
  };

  const makeMenu = (component: any, event: MouseEvent): void => {
    (component.__eventTreeBrowserTagMenu as HTMLElement | undefined)?.remove();
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    Object.assign(menu.style, {
      position: 'fixed', left: `${event.clientX}px`, top: `${event.clientY}px`, zIndex: '100020',
      minWidth: '220px', padding: '4px 0', background: '#fff', border: '1px solid #cbd5e1',
      borderRadius: '4px', boxShadow: '0 8px 24px rgba(15,23,42,.18)', font: '12px Arial, sans-serif'
    });
    const add = (label: string, action: () => void): void => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, {
        display: 'block', width: '100%', padding: '7px 12px', border: '0', background: 'transparent',
        textAlign: 'left', font: 'inherit', color: '#111827', cursor: 'pointer'
      });
      button.addEventListener('mouseenter', () => { button.style.background = '#eef4fb'; });
      button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
      button.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation(); menu.remove(); action();
      });
      menu.appendChild(button);
    };
    const count = selectedTrees(component).length;
    add(count > 1 ? `Tag / Untag (${count}) — Alt+T` : 'Tag / Untag — Alt+T', () => toggleSelectedTreeTags(component));
    add(count > 1 ? `Retirer le tag (${count})` : 'Retirer le tag', () => clearSelectedTreeTags(component));
    document.body.appendChild(menu);
    component.__eventTreeBrowserTagMenu = menu;
  };

  prototype.selectEventTree = function(tree: any, event?: Event): void {
    this.__eventTreeBrowserSelectionActive = true;
    (this.eventTreeEditor as any)?.__eventTreeClearUnifiedSelection?.();
    originalSelectEventTree.call(this, tree, event);
  };

  // Angular's generated HostListener calls this method by name, so replacing the
  // method gives the table deterministic toggle semantics without changing the template.
  prototype.onTableTagShortcut = function(event: KeyboardEvent): void {
    if (!event.altKey || event.key.toLowerCase() !== 't') return;
    if (!toggleSelectedTreeTags(this)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit?.call(this);
    this.__eventTreeBrowserSelectionActive = false;

    const editorSelection = (): void => {
      this.__eventTreeBrowserSelectionActive = false;
      this.selectedTableRows?.set?.(new Set<string>());
    };
    this.__eventTreeEditorSelectionListener = editorSelection;
    window.addEventListener('nextpsa-et-editor-selection', editorSelection as EventListener);

    const contextHandler = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      const row = target?.closest?.('.event-tree-browser-panel .et-table tbody tr') as HTMLTableRowElement | null;
      if (!row) return;

      const id = row.querySelector('.et-id')?.textContent?.trim();
      if (!id) return;
      const tree = (this.repository?.eventTrees?.() ?? []).find((item: any) => String(item.id) === id);
      if (!tree) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const selected = this.selectedTableRows?.() as Set<string> | undefined;
      if (!selected?.has(id)) this.selectEventTree(tree, event);
      this.__eventTreeBrowserSelectionActive = true;
      makeMenu(this, event);
    };
    this.__eventTreeBrowserContextHandler = contextHandler;
    document.addEventListener('contextmenu', contextHandler, true);

    const dismiss = (event: MouseEvent): void => {
      const menu = this.__eventTreeBrowserTagMenu as HTMLElement | undefined;
      if (menu && !menu.contains(event.target as Node)) {
        menu.remove();
        this.__eventTreeBrowserTagMenu = null;
      }
    };
    this.__eventTreeBrowserMenuDismiss = dismiss;
    document.addEventListener('mousedown', dismiss, true);
  };

  prototype.ngOnDestroy = function(): void {
    if (this.__eventTreeEditorSelectionListener) {
      window.removeEventListener('nextpsa-et-editor-selection', this.__eventTreeEditorSelectionListener as EventListener);
    }
    if (this.__eventTreeBrowserContextHandler) {
      document.removeEventListener('contextmenu', this.__eventTreeBrowserContextHandler, true);
    }
    if (this.__eventTreeBrowserMenuDismiss) {
      document.removeEventListener('mousedown', this.__eventTreeBrowserMenuDismiss, true);
    }
    (this.__eventTreeBrowserTagMenu as HTMLElement | undefined)?.remove();
    originalOnDestroy?.call(this);
  };
}
