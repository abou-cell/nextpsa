# GoJS Fault Tree implementation

## Goal

The diagram must be recognisable as a PSA fault tree, not a generic flowchart.

## Mapping

- `TOP_EVENT`: top gate record + title block
- `GATE`: OR / AND / K/N / NOR / NAND / XOR
- `BASIC_EVENT`: circle symbol
- `HOUSE_EVENT`: house/pentagon symbol
- `TRANSFER`: transfer triangle
- `EXCHANGE_EVENT`: exchange marker
- NOT is an input/link property, not a standalone node

## Angular boundary

`FaultTreeEditorComponent` owns the GoJS `Diagram` and `Palette`. It emits semantic events to Angular:

- selected record changed
- record double-clicked
- model changed

The Angular feature page owns record dialogs, data persistence and validation.

## Transactions

All editing operations must use GoJS transactions. Angular repositories are updated from committed diagram changes rather than rebuilding the diagram on every signal update.

## First vertical slice

1. Open `PTR-LOPC`
2. click `G-AC-FAIL`
3. properties update
4. double click gate
5. open Gate Record
6. list recursively related Basic Events
7. double click `DG1-FS`
8. open Basic Event record
9. edit and save
10. repository version increments
