import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MockPsaRepository } from '../../core/data/mock-psa.repository';
import { FaultTreePageComponent } from './fault-tree-page.component';
import { FaultTreeWorkspaceService } from './fault-tree-workspace.service';

@Component({
  selector: 'app-fault-tree-standalone',
  standalone: true,
  imports: [FaultTreePageComponent],
  template: '<app-fault-tree-page></app-fault-tree-page>',
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      background: var(--nps-app-bg);
    }
  `]
})
export class FaultTreeStandaloneComponent {
  constructor(
    route: ActivatedRoute,
    repository: MockPsaRepository,
    workspaceService: FaultTreeWorkspaceService
  ) {
    const faultTreeId = route.snapshot.paramMap.get('id');
    if (!faultTreeId) return;

    workspaceService.setActiveFaultTree(faultTreeId);
    repository.selectFaultTree(faultTreeId);
  }
}
