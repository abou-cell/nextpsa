import { EventTreeRepository } from './event-tree.repository';

interface RepositoryWithHistory extends EventTreeRepository {
  saveHistory?: () => void;
}

export function reorderFunctionEvent(
  repository: EventTreeRepository,
  treeId: string,
  fromIndex: number,
  toIndex: number
): void {
  const currentTree = repository.eventTrees().find((tree) => tree.id === treeId);
  if (!currentTree) return;

  const count = currentTree.functionEvents.length;
  if (
    fromIndex < 0 || fromIndex >= count ||
    toIndex < 0 || toIndex >= count ||
    fromIndex === toIndex
  ) return;

  const historyRepository = repository as RepositoryWithHistory;
  historyRepository.saveHistory?.();

  repository.eventTrees.update((trees) => trees.map((tree) => {
    if (tree.id !== treeId) return tree;

    const functionEvents = tree.functionEvents.map((event) => ({ ...event }));
    const [movedEvent] = functionEvents.splice(fromIndex, 1);
    functionEvents.splice(toIndex, 0, movedEvent);

    const fromColumn = fromIndex + 1;
    const toColumn = toIndex + 1;
    const remapFunctionColumn = (column: number): number => {
      if (column === fromColumn) return toColumn;
      if (fromColumn < toColumn && column > fromColumn && column <= toColumn) return column - 1;
      if (toColumn < fromColumn && column >= toColumn && column < fromColumn) return column + 1;
      return column;
    };

    return {
      ...tree,
      functionEvents,
      nodes: tree.nodes.map((node) => {
        if (node.category !== 'FUNCTION' || node.columnIndex === undefined) return node;
        return { ...node, columnIndex: remapFunctionColumn(node.columnIndex) };
      })
    };
  }));
}
