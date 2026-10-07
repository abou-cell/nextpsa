export function installEventTreeRecordDialogSizePatch(): void {
  if (document.getElementById('nextpsa-et-record-dialog-size-style')) return;

  const style = document.createElement('style');
  style.id = 'nextpsa-et-record-dialog-size-style';
  style.textContent = `
    /* Compact ET record dialogs while keeping the complete form usable. */
    .nps-et-record-dialog {
      width: min(820px, calc(100vw - 32px)) !important;
      height: min(520px, calc(100vh - 32px)) !important;
      min-width: min(700px, calc(100vw - 32px)) !important;
      min-height: min(430px, calc(100vh - 32px)) !important;
      max-width: calc(100vw - 32px) !important;
      max-height: calc(100vh - 32px) !important;
    }

    .nps-et-record-header {
      padding: 8px 12px !important;
    }

    .nps-et-record-tabs button {
      padding: 8px 10px !important;
    }

    .nps-et-record-body {
      min-height: 0;
      overflow: auto;
      padding: 14px 16px !important;
    }

    .nps-et-section {
      margin-bottom: 14px !important;
    }

    .nps-et-section h3 {
      margin-bottom: 8px !important;
    }

    .nps-et-form-grid {
      gap: 10px 12px !important;
    }

    .nps-et-field {
      gap: 4px !important;
    }

    .nps-et-field input,
    .nps-et-field select {
      height: 34px !important;
    }

    .nps-et-record-footer {
      padding: 8px 12px !important;
    }

    .nps-et-record-header,
    .nps-et-record-tabs,
    .nps-et-record-footer {
      flex-shrink: 0;
    }

    @media (max-width: 732px), (max-height: 462px) {
      .nps-et-record-dialog {
        width: calc(100vw - 12px) !important;
        height: calc(100vh - 12px) !important;
        min-width: 0 !important;
        min-height: 0 !important;
        max-width: calc(100vw - 12px) !important;
        max-height: calc(100vh - 12px) !important;
      }

      .nps-et-form-grid {
        grid-template-columns: 1fr !important;
      }
    }
  `;

  document.head.appendChild(style);
}
