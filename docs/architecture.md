# NextPSA frontend architecture

## Current slice

The repository starts with the first production-shaped vertical slice:

```
AppShell
  └── FaultTreePage
      ├── FaultTreeEditorComponent (GoJS boundary)
      ├── Properties panel
      ├── GateRecordDialog
      │   └── recursive Basic Event list
      ├── BasicEventRecordDialog
      └── Validation dock
```

## Layering

- `core/models`: framework-independent PSA record contracts
- `core/data`: repository abstraction / current mocks
- `gojs`: all diagram-specific concerns
- `features`: Angular route features and record editors
- `styles.scss`: NextPSA tokens and global application styling

The UI must not depend directly on a future database implementation. The mock repository will be replaced by HTTP repositories without changing feature components.

## Planned feature boundaries

- Event Tree GoJS
- reliability-data editors
- CCF / MUX / conditional probability
- Analysis Cases and Specifications
- MCS BDD
- I&AB
- cloud run monitor
- results workspaces
- integrity / compare
- transactional RSA import/export
