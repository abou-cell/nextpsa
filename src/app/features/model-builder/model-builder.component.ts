import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import * as go from 'gojs';
import {
  createModelBuilderDiagram,
  HydraulicSystemId,
  ModelDomain
} from '../../gojs/model-builder/model-builder-diagram';
import { createHydraulicPalette } from '../../gojs/model-builder/hydraulic-palette';

interface PaletteItem { label: string; symbol: string; }
interface SystemTableRow { key:number; identifier:string; componentType:string; kbClass:string; train:string; inputs:number; outputs:number; support:string; status:string; }
interface EngineeringSystem { id:string; description:string; createdAt:string; creatorId:string; domain:ModelDomain; }
interface FailureModeRow { code:string; name:string; category:string; enabled:boolean; }
interface RuleRow { id:string; name:string; condition:string; result:string; }
type InspectorTab = 'properties' | 'failures' | 'rules';

const DOMAIN_TITLES: Record<ModelDomain,string> = {
  hydraulic:'Hydraulic Knowledge-Base Editor', electrical:'Electrical Architecture Editor', ic:'I&C / Control & Instrumentation Editor', hvac:'HVAC Knowledge-Base Editor'
};
const DOMAIN_PALETTES: Record<ModelDomain,readonly PaletteItem[]> = {
  hydraulic:[{label:'Pump',symbol:'◉'},{label:'Motorized Valve',symbol:'⋈'},{label:'Manual Valve',symbol:'◇'},{label:'Check Valve',symbol:'▷'},{label:'Heat Exchanger',symbol:'▥'},{label:'Tank / Pool',symbol:'▱'},{label:'Boundary',symbol:'⊣'}],
  electrical:[{label:'Busbar',symbol:'━'},{label:'Breaker',symbol:'□'},{label:'Transformer',symbol:'◎'},{label:'Motor',symbol:'M'},{label:'Diesel Generator',symbol:'G'},{label:'Battery',symbol:'▥'},{label:'Inverter',symbol:'⌁'},{label:'Power Supply',symbol:'ϟ'}],
  ic:[{label:'Sensor',symbol:'◈'},{label:'Transmitter',symbol:'T'},{label:'Logic',symbol:'ƒ'},{label:'2oo3 Vote',symbol:'⅔'},{label:'Actuation',symbol:'▶'},{label:'Relay',symbol:'R'},{label:'Signal',symbol:'→'},{label:'I&C Power',symbol:'ϟ'}],
  hvac:[{label:'Fan',symbol:'✣'},{label:'Damper',symbol:'⋈'},{label:'Filter',symbol:'▦'},{label:'Duct',symbol:'━'},{label:'Cooler',symbol:'❄'},{label:'Room',symbol:'▣'},{label:'Boundary',symbol:'⊣'},{label:'Sensor',symbol:'◈'}]
};
const SYSTEMS: EngineeringSystem[] = [
  {id:'PTR',description:'Spent Fuel Pool cooling and purification system',createdAt:'2026-10-07',creatorId:'AR-001',domain:'hydraulic'},
  {id:'RRI',description:'Component cooling water system',createdAt:'2026-10-07',creatorId:'AR-001',domain:'hydraulic'},
  {id:'SEC',description:'Essential service water / ultimate heat sink system',createdAt:'2026-10-07',creatorId:'AR-001',domain:'hydraulic'},
  {id:'ELEC-A',description:'Example electrical distribution architecture',createdAt:'2026-10-07',creatorId:'AR-001',domain:'electrical'},
  {id:'IC-A',description:'Example control and instrumentation architecture',createdAt:'2026-10-07',creatorId:'AR-001',domain:'ic'},
  {id:'HVAC-A',description:'Example ventilation architecture',createdAt:'2026-10-07',creatorId:'AR-001',domain:'hvac'}
];

@Component({selector:'app-model-builder',standalone:true,imports:[CommonModule],templateUrl:'./model-builder.component.html',styleUrl:'./model-builder.component.scss'})
export class ModelBuilderComponent implements AfterViewInit,OnDestroy {
  @ViewChild('diagramDiv',{static:true}) diagramDiv!:ElementRef<HTMLDivElement>;
  @ViewChild('paletteDiv') paletteDiv?:ElementRef<HTMLDivElement>;
  domain:ModelDomain='hydraulic'; workspace='editor'; systemRows:SystemTableRow[]=[]; selectedTableKey?:number; selectedSystemId='PTR'; inspectorTab:InspectorTab='properties'; inspectorVisible=false; zoomPercent=100; selectionCount=0; paletteWidth=300;
  private diagram?:go.Diagram; private hydraulicPalette?:go.Palette; private readonly subscriptions=new Subscription(); private viewReady=false; private paletteResizeStartX=0; private paletteResizeStartWidth=300;
  private readonly onPaletteResizeMove=(event:MouseEvent):void=>{ const maxWidth=Math.min(520,Math.max(320,window.innerWidth*.45)); const delta=event.clientX-this.paletteResizeStartX; this.paletteWidth=Math.max(240,Math.min(maxWidth,this.paletteResizeStartWidth+delta)); this.hydraulicPalette?.requestUpdate(); this.diagram?.requestUpdate(); };
  private readonly onPaletteResizeEnd=():void=>{ document.removeEventListener('mousemove',this.onPaletteResizeMove); document.removeEventListener('mouseup',this.onPaletteResizeEnd); document.body.classList.remove('palette-resizing'); this.hydraulicPalette?.requestUpdate(); this.diagram?.requestUpdate(); };
  constructor(private readonly route:ActivatedRoute){
    this.subscriptions.add(this.route.params.subscribe(params=>{ const candidate=params['domain'] as ModelDomain|undefined; if(candidate&&['hydraulic','electrical','ic','hvac'].includes(candidate)){ this.domain=candidate; this.workspace='editor'; this.selectedSystemId=this.systems[0]?.id??'PTR'; this.inspectorTab='properties'; this.rebuildDiagram(); setTimeout(()=>this.rebuildPalette()); }}));
    this.subscriptions.add(this.route.data.subscribe(data=>{ if(data['workspace']) this.workspace=data['workspace']; }));
  }
  get title():string{ if(this.workspace==='generation')return'Fault Tree Generation'; if(this.workspace==='generated-ft')return'Generated Fault Tree Viewer'; if(this.workspace==='knowledge-base')return'Knowledge Base — Component Classes'; if(this.workspace==='rules')return'Knowledge Base — Rules & Failure Modes'; return DOMAIN_TITLES[this.domain]; }
  get palette():readonly PaletteItem[]{return DOMAIN_PALETTES[this.domain];}
  get domainLabel():string{return this.domain==='ic'?'I&C':this.domain.charAt(0).toUpperCase()+this.domain.slice(1);}
  get workspaceLabel():string{ if(this.workspace==='generation')return'FT Generation Workspace'; if(this.workspace==='generated-ft')return'Generated FT Workspace'; if(this.workspace==='knowledge-base')return'Knowledge Base Workspace'; if(this.workspace==='rules')return'Rules Workspace'; return `${this.domainLabel} Workspace`; }
  get systems():EngineeringSystem[]{return SYSTEMS.filter(s=>s.domain===this.domain);}
  get selectedComponent():SystemTableRow|undefined{return this.systemRows.find(r=>r.key===this.selectedTableKey)??this.systemRows[0];}
  get failureModes():FailureModeRow[]{ const c=this.selectedComponent;if(!c)return[];const t=c.componentType.toUpperCase(); if(/PUMP|FAN|MOTOR|DIESEL/.test(t))return[{code:'FTS',name:'Fail to start',category:'Demand',enabled:true},{code:'FTR',name:'Fail to run',category:'Mission',enabled:true},{code:'SS',name:'Spurious stop',category:'Spurious',enabled:true}]; if(/VALVE|DAMPER|BREAKER/.test(t))return[{code:'FTC',name:'Fail to change state',category:'Demand',enabled:true},{code:'FO',name:'Fail open',category:'Position',enabled:true},{code:'FC',name:'Fail closed',category:'Position',enabled:true}]; if(/HEAT EXCHANGER|FILTER|TRANSFORMER/.test(t))return[{code:'DEG',name:'Degraded function',category:'Performance',enabled:true},{code:'LOF',name:'Loss of function',category:'Mission',enabled:true}]; return[{code:'LOF',name:'Loss of function',category:'Mission',enabled:true},{code:'UNAV',name:'Unavailable',category:'State',enabled:true}]; }
  get rules():RuleRow[]{ const c=this.selectedComponent;if(!c)return[];const rows:RuleRow[]=[{id:'R-01',name:'Component availability',condition:`${c.identifier} required`,result:`Include ${c.identifier} failure modes`}]; if(c.inputs>0)rows.push({id:'R-02',name:'Upstream dependency',condition:'Required upstream path unavailable',result:'Propagate loss of function'}); if(c.support!=='—')rows.push({id:'R-03',name:'Support dependency',condition:`${c.support} unavailable`,result:`Set ${c.identifier} unavailable`}); if(/VALVE|BREAKER|DAMPER/i.test(c.componentType))rows.push({id:'R-04',name:'Command dependency',condition:'Required command not received',result:'Generate actuation failure branch'}); return rows; }
  ngAfterViewInit():void{this.viewReady=true;this.rebuildDiagram();setTimeout(()=>this.rebuildPalette());}
  startPaletteResize(event:MouseEvent):void{event.preventDefault();this.paletteResizeStartX=event.clientX;this.paletteResizeStartWidth=this.paletteWidth;document.addEventListener('mousemove',this.onPaletteResizeMove);document.addEventListener('mouseup',this.onPaletteResizeEnd);document.body.classList.add('palette-resizing');}
  undo():void{this.diagram?.commandHandler.undo();} redo():void{this.diagram?.commandHandler.redo();} zoomIn():void{this.changeZoom(1.2);} zoomOut():void{this.changeZoom(1/1.2);}
  fit():void{if(!this.diagram)return;this.diagram.zoomToFit();this.syncZoomPercent();}
  selectAllComponents():void{if(!this.diagram)return;const nodes:go.Node[]=[];this.diagram.nodes.each(n=>nodes.push(n));this.diagram.selectCollection(nodes);this.selectionCount=this.diagram.selection.count;}
  clearSelection():void{this.diagram?.clearSelection();this.selectionCount=0;}
  setInspectorTab(tab:InspectorTab):void{if(this.inspectorVisible&&this.inspectorTab===tab)this.inspectorVisible=false;else{this.inspectorTab=tab;this.inspectorVisible=true;}setTimeout(()=>this.diagram?.requestUpdate());}
  toggleInspector():void{this.inspectorVisible=!this.inspectorVisible;setTimeout(()=>this.diagram?.requestUpdate());}
  selectSystem(system:EngineeringSystem):void{if(this.selectedSystemId===system.id)return;this.selectedSystemId=system.id;this.selectedTableKey=undefined;this.inspectorTab='properties';this.rebuildDiagram();}
  selectSystemRow(row:SystemTableRow):void{this.selectedTableKey=row.key;const node=this.diagram?.findNodeForKey(row.key);if(!node||!this.diagram)return;this.diagram.select(node);this.diagram.centerRect(node.actualBounds);}
  private changeZoom(factor:number):void{if(!this.diagram)return;const center=this.diagram.viewportBounds.center;const nextScale=Math.min(this.diagram.maxScale,Math.max(this.diagram.minScale,this.diagram.scale*factor));this.diagram.scale=nextScale;const viewport=this.diagram.viewportBounds;this.diagram.position=new go.Point(center.x-viewport.width/2,center.y-viewport.height/2);this.syncZoomPercent();}
  private syncZoomPercent():void{this.zoomPercent=this.diagram?Math.round(this.diagram.scale*100):100;}
  private rebuildPalette():void{if(this.hydraulicPalette){this.hydraulicPalette.div=null;this.hydraulicPalette=undefined;}if(!this.viewReady||this.domain!=='hydraulic')return;const host=this.paletteDiv?.nativeElement;if(!host)return;this.hydraulicPalette=createHydraulicPalette(host);}
  private rebuildDiagram():void{if(!this.viewReady||!this.diagramDiv)return;if(this.diagram)this.diagram.div=null;const hs=(this.domain==='hydraulic'?this.selectedSystemId:'PTR') as HydraulicSystemId;this.diagram=createModelBuilderDiagram(this.diagramDiv.nativeElement,this.domain,hs);this.syncSystemTable();this.selectedTableKey=this.systemRows[0]?.key;this.syncZoomPercent();this.selectionCount=0;this.diagram.addModelChangedListener(e=>{if(e.isTransactionFinished)this.syncSystemTable();});this.diagram.addDiagramListener('ChangedSelection',()=>{this.selectionCount=this.diagram?.selection.count??0;const selected=this.diagram?.selection.first();if(selected instanceof go.Node)this.selectedTableKey=Number(selected.data?.key);});this.diagram.addDiagramListener('ViewportBoundsChanged',()=>this.syncZoomPercent());}
  private syncSystemTable():void{if(!this.diagram)return;const model=this.diagram.model as go.GraphLinksModel;const nodes=model.nodeDataArray as Array<{key:number;name:string;type:string}>;const links=model.linkDataArray as Array<{from:number;to:number}>;this.systemRows=nodes.map(n=>({key:n.key,identifier:n.name,componentType:n.type,kbClass:this.resolveKbClass(n.type),train:this.resolveTrain(n.name),inputs:links.filter(l=>l.to===n.key).length,outputs:links.filter(l=>l.from===n.key).length,support:this.resolveSupport(n.name,n.type),status:'Valid'}));if(this.selectedTableKey!==undefined&&!this.systemRows.some(r=>r.key===this.selectedTableKey))this.selectedTableKey=this.systemRows[0]?.key;}
  private resolveKbClass(type:string):string{const normalized=type.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');const prefixes:Record<ModelDomain,string>={hydraulic:'HYDRAULIC',electrical:'ELECTRICAL',ic:'IC',hvac:'HVAC'};return`${prefixes[this.domain]}.${normalized}`;}
  private resolveTrain(identifier:string):string{if(/(-B|002|B$)/i.test(identifier))return'Train B';if(/ROOM|SFP|SOURCE|ULTIMATE|HX$/i.test(identifier))return'Common';return'Train A';}
  private resolveSupport(identifier:string,type:string):string{if(this.domain==='hydraulic'){if(/PUMP/i.test(type))return'Electrical supply';if(/VALVE/i.test(type))return'I&C / power';if(/EXCHANGER/i.test(type))return this.selectedSystemId==='SEC'?'Ultimate heat sink':'Cooling support';return'—';}if(this.domain==='electrical'){if(/MOTOR/i.test(type))return'LLI205JA';if(/BREAKER/i.test(type))return'Protection / I&C';if(/DIESEL/i.test(type))return'Fuel / auxiliaries';return'Upstream supply';}if(this.domain==='ic'){if(/POWER/i.test(type))return'DC / AC supply';if(/SENSOR/i.test(type))return'Process input';if(/LOGIC/i.test(type))return'I&C power';return'Logic channel';}if(/FAN/i.test(type))return'Electrical supply';if(/DAMPER/i.test(type))return'Actuation / I&C';if(/ROOM/i.test(identifier))return'Boundary condition';return'Air path';}
  ngOnDestroy():void{this.subscriptions.unsubscribe();document.removeEventListener('mousemove',this.onPaletteResizeMove);document.removeEventListener('mouseup',this.onPaletteResizeEnd);document.body.classList.remove('palette-resizing');if(this.diagram)this.diagram.div=null;if(this.hydraulicPalette)this.hydraulicPalette.div=null;}
}
