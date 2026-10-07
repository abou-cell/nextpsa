export function installEventTreeRecordDialogSizePatch(): void {
  if (document.getElementById('nextpsa-et-record-dialog-size-style')) return;

  const style = document.createElement('style');
  style.id = 'nextpsa-et-record-dialog-size-style';
  style.textContent = `
    /* Keep ET record dialogs large enough to display the complete record form. */
    .nps-et-record-dialog {
      width: min(960px, calc(100vw - 24px)) !important;
      height: min(620px, calc(100vh - 24px)) !important;
      min-width: min(880px, calc(100vw - 24px)) !important;
      min-height: min(520px, calc(100vh - 24px)) !important;
      max-width: calc(100vw - 24px) !important;
      max-height: calc(100vh - 24px) !important;
    }

    .nps-et-record-body {
      min-height: 0;
      overflow: auto;
    }

    .nps-et-record-header,
    .nps-et-record-tabs,
    .nps-et-record-footer {
      flex-shrink: 0;
    }

    @media (max-width: 904px), (max-height: 544px) {
      .nps-et-record-dialog {
        width: calc(100vw - 12px) !important;
        height: calc(100vh - 12px) !important;
        min-width: 0 !important;
        min-height: 0 !important;
        max-width: calc(100vw - 12px) !important;
        max-height: calc(100vh - 12px) !important;
      }
    }
  `;

  document.head.appendChild(style);
}
