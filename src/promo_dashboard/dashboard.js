(()=>{'use strict';
const DATA=JSON.parse(document.getElementById('report-data').textContent);
const app=document.getElementById('app');
const nav=document.getElementById('nav');
const modal=document.getElementById('modal-backdrop');
const modalBody=document.getElementById('modal-body');
const state={page:'diagnosis',datasetId:null,filters:{},groups:{},metrics:{},sort:{},pageFilters:{},tableModels:{},trendMetric:'spend'};
const PAGES=[
  ['diagnosis','推广诊断与行动'],['trend','核心趋势'],['growth','增长机会'],
  ['check','推广商品核查'],['new','新品与测款观察'],['allocation','投产与分配'],
  ['products','推广商品明细'],['audit','商品核查清单'],['budget','预算情景试算'],
  ['dimensions','多维拆解'],['quality','数据质量与口径']
];
const LABELS={
  impressions:'展现量',clicks:'点击量',spend:'花费',direct_amount:'直接成交金额',
  total_amount:'总成交金额',direct_orders:'直接成交笔数',total_orders:'总成交笔数',
  presale_direct_amount:'直接预售成交金额',presale_total_amount:'总预售成交金额',
  presale_direct_orders:'直接预售成交笔数',presale_total_orders:'总预售成交笔数',
  cart:'总购物车数',favorites:'收藏宝贝数',direct_roi:'直接 ROI',total_roi:'总 ROI',
  cpc:'平均点击花费',ctr:'点击率',direct_cvr:'直接成交转化率',direct_cpa:'直接成交 CPA'
};
const NUM=v=>typeof v==='number'&&Number.isFinite(v);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,kind='number')=>{
  if(!NUM(v))return '—';
  if(kind==='money')return '¥'+v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(kind==='ratio')return v.toFixed(2)+'x';
  if(kind==='percent')return (v*100).toFixed(2)+'%';
  return v.toLocaleString('zh-CN',{maximumFractionDigits:2});
};
const metricKind=k=>k==='spend'||k.includes('amount')||k==='direct_cpa'?'money':
  ['direct_roi','total_roi'].includes(k)?'ratio':['ctr','direct_cvr'].includes(k)?'percent':'number';
function validMetricOptions(d){
  const keys=new Set(d.available_metrics||[]),derived=[];
  if(keys.has('spend')&&keys.has('direct_amount'))derived.push('direct_roi');
  if(keys.has('spend')&&keys.has('total_amount'))derived.push('total_roi');
  if(keys.has('spend')&&keys.has('clicks'))derived.push('cpc');
  if(keys.has('clicks')&&keys.has('impressions'))derived.push('ctr');
  if(keys.has('direct_orders')&&keys.has('clicks'))derived.push('direct_cvr');
  if(keys.has('direct_orders')&&keys.has('spend'))derived.push('direct_cpa');
  return [...new Set([...(d.available_metrics||[]),...derived,...(d.available_custom_metrics||[]).map(k=>'custom:'+k)])];
}
const dimLabel=k=>DATA.dimension_labels[k]||k;
const datasetById=id=>DATA.datasets.find(d=>d.id===id);
const primaryDataset=()=>DATA.datasets.find(d=>d.type==='product')||DATA.datasets.find(d=>d.type==='plan')||DATA.datasets[0]||null;
const hasDim=(d,k)=>Boolean(d&&d.dimensions_available.includes(k));
const ratio=(a,b)=>NUM(a)&&NUM(b)&&b!==0?a/b:null;

function derive(m){
  m.direct_roi=ratio(m.direct_amount,m.spend);m.total_roi=ratio(m.total_amount,m.spend);
  m.cpc=ratio(m.spend,m.clicks);m.ctr=ratio(m.clicks,m.impressions);
  m.direct_cvr=ratio(m.direct_orders,m.clicks);m.direct_cpa=ratio(m.spend,m.direct_orders);
  return m;
}
function sumMetric(rows,key){const values=rows.map(r=>r.metrics?.[key]).filter(NUM);return values.length?values.reduce((a,b)=>a+b,0):null}
function totalsFor(ds,rows=ds.rows){
  const totals={};(ds.available_metrics||[]).forEach(k=>totals[k]=sumMetric(rows,k));return derive(totals);
}
function rangeText(ds){return ds?.date_start?`${ds.date_start} 至 ${ds.date_end||ds.date_start}`:'日期范围未识别'}
function card(label,value,kind='number',note=''){return `<div class="summary-card"><span class="label">${esc(label)}</span><strong class="mono">${typeof value==='string'?esc(value):fmt(value,kind)}</strong>${note?`<small>${esc(note)}</small>`:''}</div>`}
function cardsForTotals(t,metricKeys=Object.keys(t)){
  const defs=[['spend','花费','money'],['direct_amount','直接成交金额','money'],['direct_orders','直接成交笔数','number'],['direct_roi','直接 ROI','ratio'],['impressions','展现量','number'],['clicks','点击量','number'],['ctr','点击率','percent'],['cpc','平均点击花费','money'],['total_amount','总成交金额','money'],['total_orders','总成交笔数','number'],['cart','总购物车数','number'],['favorites','收藏宝贝数','number']];
  const available=new Set(metricKeys),needs={direct_roi:['spend','direct_amount'],ctr:['clicks','impressions'],cpc:['spend','clicks']};
  return `<div class="summary-grid">${defs.filter(([k])=>needs[k]?needs[k].every(x=>available.has(x)):available.has(k)).map(([k,l,f])=>card(l,t[k],f)).join('')}</div>`;
}
function panelTitle(title,desc,number=''){
  return `<div class="section-title"><div>${number?`<span class="badge">${number}</span> `:''}<h2 style="display:inline-block">${esc(title)}</h2><p class="sub">${esc(desc)}</p></div></div>`;
}
function note(text,kind=''){return `<div class="callout ${kind}">${esc(text)}</div>`}
function empty(text){return `<div class="empty-state">${esc(text)}</div>`}
function displayName(p){return p.name||`商品 ${p.id||'未识别'}`}
function productRows(ds, page=''){
  if(!ds||(!hasDim(ds,'product_id')&&!hasDim(ds,'product_name')))return [];
  const keys=hasDim(ds,'product_id')?['product_id']:['product_name'];
  const rows=filterRawRows(ds,page);
  const map=new Map();
  rows.forEach(r=>{
    const d=r.dimensions,key=keys.map(k=>d[k]||'').join('\u001f')||'__unknown__';
    if(!map.has(key))map.set(key,{id:d.product_id||'',name:d.product_name||'',metrics:{},_metricRows:[],firstDate:null,lastDate:null,sourceRows:0});
    const p=map.get(key);p.sourceRows++;p._metricRows.push(r);
    if(!p.name&&d.product_name)p.name=d.product_name;
    if(d.date){if(!p.firstDate||d.date<p.firstDate)p.firstDate=d.date;if(!p.lastDate||d.date>p.lastDate)p.lastDate=d.date;}
  });
  return [...map.values()].map(p=>{p.metrics=totalsFor(ds,p._metricRows);delete p._metricRows;return p});
}
function filterState(page,ds){
  if(!state.pageFilters[page])state.pageFilters[page]={start:hasDim(ds,'date')?(ds.date_start||''):'',end:hasDim(ds,'date')?(ds.date_end||''):'',query:'',minSpend:''};
  return state.pageFilters[page];
}
function filterRawRows(ds,page){
  const f=page?filterState(page,ds):{};
  const query=(f.query||'').trim().toLocaleLowerCase();
  return ds.rows.filter(r=>{
    const d=r.dimensions;
    if(f.start&&(!d.date||d.date<f.start))return false;
    if(f.end&&(!d.date||d.date>f.end))return false;
    if(query&&!Object.values(d).some(v=>String(v||'').toLocaleLowerCase().includes(query)))return false;
    return true;
  });
}
function pageFiltersHtml(page,ds,{minimumSpend=true}={}){
  const f=filterState(page,ds);
  return `<div class="filterbar toolbar">${hasDim(ds,'date')?`<label class="meta">日期</label><input class="field" type="date" data-page-filter="start" value="${esc(f.start)}"><span class="meta">至</span><input class="field" type="date" data-page-filter="end" value="${esc(f.end)}">`:''}<input class="field search" data-page-filter="query" placeholder="搜索商品名称或 ID" value="${esc(f.query)}">${minimumSpend?`<label class="meta">最低花费</label><input class="field" type="number" min="0" step="0.01" data-page-filter="minSpend" value="${esc(f.minSpend)}" style="width:130px">`:''}<button class="btn primary" data-page-apply="${esc(page)}">应用筛选</button><button class="btn" data-page-reset="${esc(page)}">重置</button></div>`;
}
function bindPageFilter(page,ds,rerender){
  app.querySelectorAll('[data-page-filter]').forEach(el=>el.addEventListener('input',()=>{filterState(page,ds)[el.dataset.pageFilter]=el.value}));
  const apply=app.querySelector(`[data-page-apply="${page}"]`);if(apply)apply.onclick=rerender;
  const reset=app.querySelector(`[data-page-reset="${page}"]`);if(reset)reset.onclick=()=>{state.pageFilters[page]={start:hasDim(ds,'date')?(ds.date_start||''):'',end:hasDim(ds,'date')?(ds.date_end||''):'',query:'',minSpend:''};rerender()};
}
function minimumSpendRows(rows,page){const n=Number(filterState(page,primaryDataset()).minSpend);return Number.isFinite(n)&&n>0?rows.filter(r=>NUM(r.metrics.spend)&&r.metrics.spend>=n):rows}
function sumByDate(ds,metric,page='trend'){
  const map=new Map();filterRawRows(ds,page).forEach(r=>{const day=r.dimensions.date,v=r.metrics[metric];if(day&&NUM(v))map.set(day,(map.get(day)||0)+v)});
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,value])=>({date,value}));
}
function productCrossPlan(ds){
  if(!ds||ds.type!=='product'||!hasDim(ds,'product_id')||!hasDim(ds,'plan_id'))return [];
  const useScene=hasDim(ds,'scene_id')||hasDim(ds,'scene_name');
  const sceneKey=hasDim(ds,'scene_id')?'scene_id':'scene_name';
  const map=new Map();
  ds.rows.forEach(r=>{
    const d=r.dimensions;if(!d.product_id||!d.plan_id)return;
    const scope=[d.product_id,useScene?(d[sceneKey]||'未标场景'):''].join('\u001f');
    if(!map.has(scope))map.set(scope,{productId:d.product_id,productName:d.product_name||'',scene:useScene?(d.scene_name||d.scene_id||'未标场景'):'未分场景',plans:new Map()});
    const g=map.get(scope);if(!g.productName&&d.product_name)g.productName=d.product_name;
    if(!g.plans.has(d.plan_id))g.plans.set(d.plan_id,{id:d.plan_id,name:d.plan_name||'',rows:[]});
    const p=g.plans.get(d.plan_id);if(!p.name&&d.plan_name)p.name=d.plan_name;p.rows.push(r);
  });
  const out=[];
  map.forEach(g=>{
    const plans=[...g.plans.values()].map(p=>({id:p.id,name:p.name,metrics:totalsFor(ds,p.rows)})).filter(p=>NUM(p.metrics.spend)&&p.metrics.spend>0&&NUM(p.metrics.direct_roi));
    if(plans.length<2)return;
    plans.sort((a,b)=>a.metrics.direct_roi-b.metrics.direct_roi);
    out.push({...g,plans,low:plans[0],high:plans.at(-1),spread:plans.at(-1).metrics.direct_roi-plans[0].metrics.direct_roi});
  });
  return out.sort((a,b)=>b.spread-a.spread);
}
function pageMetricColumns(ds){
  const keys=ds.available_metrics||[];
  const defs=[['impressions','展现量','number'],['clicks','点击量','number'],['ctr','点击率','percent'],['spend','花费','money'],['direct_amount','直接成交额','money'],['direct_orders','直接成交笔数','number'],['direct_roi','直接 ROI','ratio'],['total_amount','总成交额','money'],['total_orders','总成交笔数','number'],['cart','购物车','number'],['favorites','收藏','number']];
  return defs.filter(([k])=>keys.includes(k)||(['ctr','direct_roi'].includes(k)&&((k==='ctr'&&keys.includes('clicks')&&keys.includes('impressions'))||(k==='direct_roi'&&keys.includes('direct_amount')&&keys.includes('spend'))))).map(([key,label,format])=>({key,label,format,value:r=>r.metrics[key],tone:key==='direct_roi'?'roi':''}));
}
function sortRows(rows,cols,tableId){
  const s=state.sort[tableId]||{key:cols.find(c=>c.key==='spend')?.key||cols[0]?.key||'',dir:-1};
  return [...rows].sort((a,b)=>{
    const col=cols.find(c=>c.key===s.key);if(!col)return 0;
    const av=col.value(a),bv=col.value(b);
    if(!NUM(av)&&!NUM(bv))return String(av??'').localeCompare(String(bv??''),'zh-CN')*s.dir;
    if(!NUM(av))return 1;if(!NUM(bv))return -1;
    return (av-bv)*s.dir;
  });
}
function tableHtml(rows,cols,tableId,emptyText='没有符合条件的记录'){
  state.tableModels[tableId]={rows,cols,title:tableId};
  if(!rows.length)return empty(emptyText);
  const sorted=sortRows(rows,cols,tableId),s=state.sort[tableId]||{key:cols.find(c=>c.key==='spend')?.key||cols[0]?.key||'',dir:-1};
  return `<div class="table-wrap"><table class="data-table"><thead><tr>${cols.map(c=>`<th class="${c.align==='left'?'dim':'num'}" data-sort-table="${esc(tableId)}" data-sort-key="${esc(c.key)}">${esc(c.label)} ${s.key===c.key?(s.dir===1?'↑':'↓'):'↕'}</th>`).join('')}</tr></thead><tbody>${sorted.map(row=>`<tr>${cols.map(c=>{const v=c.value(row);let value=c.render?c.render(row,v):esc(v===null||v===undefined||v===''?'—':c.format?fmt(v,c.format):v);const cls=c.tone==='roi'&&NUM(v)?(v>=1?'metric-good':'metric-bad'):c.tone==='status'?(row.level==='alert'?'metric-bad':row.level==='watch'?'metric-watch':'metric-good'):'';return `<td class="${c.align==='left'?'dim':'num'} ${cls}">${value}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function tableToolbar(id){return `<div class="table-tools"><button class="btn" data-float-table="${esc(id)}">⛶ 悬浮查看</button></div>`}
function findingsHtml(items){
  if(!items.length)return empty('当前数据范围没有可展示的诊断信号。');
  return `<div class="signal-list">${items.map(f=>`<div class="signal"><span class="badge ${esc(f.level||'info')}">${f.level==='alert'?'异常':f.level==='watch'?'关注':f.level==='good'?'观察':'提示'}</span><div><strong>${esc(f.title)}</strong><p>${esc(f.detail)}</p></div></div>`).join('')}</div>`;
}
function productIdentityCols(){return [
  {key:'name',label:'商品名称 / ID',align:'left',value:p=>displayName(p),render:p=>`<strong>${esc(displayName(p))}</strong><small class="link-sub">${p.id?`商品 ID ${esc(p.id)}`:'无商品 ID'}</small>`}
];}
function productTableColumns(ds,extra=[]){return [...productIdentityCols(),...pageMetricColumns(ds).map(c=>({...c,value:p=>p.metrics[c.key]})),...extra]}
function chartBars(items,format){
  if(!items.length)return empty('当前周期没有带日期的记录。');
  const max=Math.max(...items.map(x=>x.value),0)||1;
  return `<div class="chart-scroll"><div class="chart-bars">${items.map(x=>{const height=Math.max(2,x.value/max*190);return `<div class="bar-item" title="${esc(x.date)} · ${esc(fmt(x.value,format))}"><span class="bar-value">${esc(fmt(x.value,format))}</span><div class="bar" style="height:${height}px"></div><span class="bar-label">${esc(x.date.slice(5))}</span></div>`}).join('')}</div></div>`;
}
function addPageFilterAction(page,ds,rerender){bindPageFilter(page,ds,rerender)}

function renderNav(){
  nav.innerHTML='';const section=document.createElement('div');section.className='nav-label';section.textContent='分析目录';nav.appendChild(section);
  PAGES.forEach(([key,label],i)=>{const b=document.createElement('button');b.className='nav'+(state.page===key?' active':'');b.innerHTML=`<span class="num">${String(i+1).padStart(2,'0')}</span><span>${esc(label)}</span>`;b.onclick=()=>{state.page=key;if(key!=='dimensions')state.datasetId=null;render()};nav.appendChild(b)});
}
function renderHeroMeta(){
  document.getElementById('hero-meta').textContent=`${DATA.datasets.length} 份来源报表 · 各表日期范围以对应报表为准 · 生成于 ${new Date(DATA.generated_at).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}`;
}
function renderDiagnosis(){
  const ds=primaryDataset();if(!ds){app.innerHTML=`<section class="panel">${empty('没有可展示的报表，请检查输入文件。')}</section>`;return;}
  const totals=totalsFor(ds),products=productRows(ds),zeroOrders=products.filter(p=>NUM(p.metrics.spend)&&p.metrics.spend>0&&NUM(p.metrics.direct_orders)&&p.metrics.direct_orders===0),cross=productCrossPlan(ds);
  const top5=products.filter(p=>NUM(p.metrics.spend)).sort((a,b)=>b.metrics.spend-a.metrics.spend).slice(0,5).reduce((s,p)=>s+p.metrics.spend,0);
  const concentration=NUM(totals.spend)&&totals.spend?top5/totals.spend:null;
  const findings=[...(DATA.diagnostics?.[ds.id]||[])];
  if(zeroOrders.length)findings.push({level:'watch',title:`${zeroOrders.length} 个商品有花费但无直接成交笔数`,detail:'按商品主表识别。建议先复核归因成熟度、商品承接和关联计划；该信号不足以直接决定停投。'});
  if(cross.length)findings.push({level:'info',title:`发现 ${cross.length} 组同商品跨计划可比记录`,detail:'仅使用商品报表中同时存在的商品 ID、计划 ID；有场景 ID 时按同场景比较，点击可钻取明细。'});
  app.innerHTML=`<section class="panel">${panelTitle('推广诊断与行动',`主视图使用${ds.label}报表 · ${rangeText(ds)} · ${ds.row_count.toLocaleString()} 条源记录`,'01')}${DATA.warnings.length?note(`导入提醒：${DATA.warnings.join('；')}`,'warning'):''}${cardsForTotals(totals,ds.available_metrics)}<div class="page-grid"><div class="panel">${panelTitle('本期关键发现','规则提示用于定位复核对象，不代替利润、库存或归因判断')}${findingsHtml(findings)}</div><div class="panel">${panelTitle('数据覆盖与口径','并列维度是观察切面，不跨报表叠加')}${DATA.datasets.map(d=>`<div class="dim-dataset"><div><strong>${esc(d.label)}报表</strong><small>${esc(d.source_file)} · ${d.row_count.toLocaleString()} 行 · ${esc(rangeText(d))}</small></div><button class="btn" data-open-dataset="${esc(d.id)}">查看</button></div>`).join('')}${note(`当前商品表花费 TOP5 占比 ${fmt(concentration,'percent')}。这是投入集中度描述，不代表预算过度集中。直接 ROI 为直接成交金额 ÷ 花费，不代表利润。`)}</div></div></section><section class="panel">${panelTitle('同一商品跨计划表现','只比较商品主表里真实出现的 ID；跨计划结果用于定位差异，不自动推导加预算。')}${renderCrossPlanTable(cross,'diagnosis-cross')}</section><div class="section-jump">${PAGES.slice(1,10).map(([key,label],i)=>`<button class="btn" data-open-page="${key}">${String(i+2).padStart(2,'0')} ${esc(label)}</button>`).join('')}</div>`;
}
function renderCrossPlanTable(rows,id){
  if(!rows.length)return empty('没有足够的同商品、同场景跨计划记录。需要同一份商品报表中存在商品 ID、计划 ID，且至少两个计划有可计算的直接 ROI。');
  const cols=[
    {key:'productName',label:'商品',align:'left',value:r=>r.productName,render:r=>`<strong>${esc(r.productName||'未命名商品')}</strong><small class="link-sub">商品 ID ${esc(r.productId)}</small>`},
    {key:'scene',label:'场景',align:'left',value:r=>r.scene},
    {key:'highPlan',label:'高 ROI 计划',align:'left',value:r=>r.high.name,render:r=>`${esc(r.high.name||'未命名计划')}<small class="link-sub">ID ${esc(r.high.id)} · ${fmt(r.high.metrics.direct_orders,'number')} 笔</small>`},
    {key:'highRoi',label:'高 ROI',value:r=>r.high.metrics.direct_roi,format:'ratio',tone:'roi'},
    {key:'lowPlan',label:'低 ROI 计划',align:'left',value:r=>r.low.name,render:r=>`${esc(r.low.name||'未命名计划')}<small class="link-sub">ID ${esc(r.low.id)} · ${fmt(r.low.metrics.direct_orders,'number')} 笔</small>`},
    {key:'lowRoi',label:'低 ROI',value:r=>r.low.metrics.direct_roi,format:'ratio',tone:'roi'},
    {key:'spread',label:'ROI 差值',value:r=>r.spread,format:'ratio'},
    {key:'detail',label:'明细',value:r=>r.productId,render:r=>`<button class="btn" data-open-plan="${esc(r.productId)}" data-plan-id="${esc(r.low.id)}">查看计划</button>`}
  ];
  return tableToolbar(id)+tableHtml(rows,cols,id);
}
function renderTrend(){
  const ds=primaryDataset();if(!ds){app.innerHTML=empty('没有可展示的趋势数据。');return;}
  const options=(ds.available_metrics||[]).filter(k=>['spend','direct_amount','total_amount','clicks','impressions','direct_orders','total_orders','cart','favorites'].includes(k));
  if(!options.length){app.innerHTML=`<section class="panel">${panelTitle('核心趋势','主表未提供可绘制的核心指标','02')}${empty('没有可用于趋势分析的指标。')}</section>`;return;}
  if(!options.includes(state.trendMetric))state.trendMetric=options[0];
  const raw=filterRawRows(ds,'trend'),daily=sumByDate(ds,state.trendMetric,'trend');
  const values=daily.map(x=>x.value),first=values[0],last=values.at(-1),change=NUM(first)&&first!==0?(last-first)/first:null;
  const rows=daily.map(x=>({date:x.date,value:x.value}));
  const cols=[{key:'date',label:'日期',align:'left',value:r=>r.date},{key:'value',label:LABELS[state.trendMetric]||state.trendMetric,format:metricKind(state.trendMetric),value:r=>r.value}];
  app.innerHTML=`<section class="panel">${panelTitle('核心趋势',`按${ds.label}报表的日期行汇总，不与其他报表叠加 · ${rangeText(ds)}`,'02')}${pageFiltersHtml('trend',ds,{minimumSpend:false})}<div class="filterbar"><label class="meta">趋势指标</label><select id="trend-metric">${options.map(k=>`<option value="${esc(k)}" ${state.trendMetric===k?'selected':''}>${esc(LABELS[k]||k)}</option>`).join('')}</select></div><div class="summary-grid">${card('有记录日期',daily.length+' 天','number')}${card('首日',first,metricKind(state.trendMetric))}${card('末日',last,metricKind(state.trendMetric))}${card('首末日变化',change,'percent','只比较当前筛选区间首末两个有记录日期')}</div><div class="panel"><h2>${esc(LABELS[state.trendMetric]||state.trendMetric)}日趋势</h2><p class="sub">柱高按所选指标缩放；缺失日期不补成 0。</p>${chartBars(daily,metricKind(state.trendMetric))}</div>${tableToolbar('trend-daily')}${tableHtml(rows,cols,'trend-daily')}</section>`;
  addPageFilterAction('trend',ds,render);app.querySelector('#trend-metric').onchange=e=>{state.trendMetric=e.target.value;renderTrend()};
}
function filteredProducts(page){const ds=primaryDataset();if(!ds)return {ds:null,rows:[]};return {ds,rows:minimumSpendRows(productRows(ds,page),page)};}
function renderProductDataUnavailable(title,number){
  const ds=primaryDataset();app.innerHTML=`<section class="panel">${panelTitle(title,'商品层分析只在来源表真实包含商品 ID 或商品名称时启用。',number)}${note(`当前主表为${ds?.label||'未知'}报表，未识别到商品 ID / 商品名称。上传商品报表后即可查看该分析。`,'warning')}${empty('此维度没有商品级数据，未用计划、地域或其他报表推断商品表现。')}</section>`;
}
function renderGrowth(){
  const {ds,rows}=filteredProducts('growth');if(!ds){app.innerHTML=empty('没有可分析的商品报表。');return;}
  if(!hasDim(ds,'product_id')&&!hasDim(ds,'product_name')){renderProductDataUnavailable('增长机会','03');return;}
  const eligible=rows.filter(p=>NUM(p.metrics.direct_roi)&&NUM(p.metrics.direct_orders)&&p.metrics.direct_orders>=3&&p.metrics.direct_roi>=1).sort((a,b)=>b.metrics.direct_roi-a.metrics.direct_roi);
  const small=rows.filter(p=>NUM(p.metrics.direct_roi)&&p.metrics.direct_orders>0&&p.metrics.direct_orders<3&&p.metrics.direct_roi>=1).sort((a,b)=>b.metrics.direct_roi-a.metrics.direct_roi);
  const cols=productTableColumns(ds,[{key:'signal',label:'观察信号',value:p=>p.metrics.direct_orders,render:p=>`<span class="badge ${p.metrics.direct_orders>=3?'good':'watch'}">${p.metrics.direct_orders>=3?'样本较多，列入复核':'样本偏少'}</span>`}]);
  app.innerHTML=`<section class="panel">${panelTitle('增长机会','用商品主表筛出值得优先复核的表现候选；不直接给出加预算结论。','03')}${pageFiltersHtml('growth',ds)}${note('候选规则：直接 ROI ≥ 1 且直接成交笔数 ≥ 3。ROI=1 仅表示报表归因成交金额与花费相等，不等于盈利；样本门槛是界面筛选条件，不是行业标准。')}${card('候选商品',eligible.length,'number','满足当前观察规则')}${eligible.length?tableToolbar('growth-candidates')+tableHtml(eligible,cols,'growth-candidates'):empty('当前筛选范围没有符合候选规则的商品。')}${small.length?`<div class="panel">${panelTitle('样本偏少的高 ROI 商品','成交笔数少于 3，只作为线索，避免被单笔成交放大。')}${tableToolbar('growth-small-sample')}${tableHtml(small,cols,'growth-small-sample')}</div>`:''}</section>`;
  addPageFilterAction('growth',ds,render);
}
function checkRows(rows){return rows.filter(p=>{
  const m=p.metrics;return NUM(m.spend)&&m.spend>0&&((NUM(m.direct_orders)&&m.direct_orders===0)||(NUM(m.direct_roi)&&m.direct_roi<1));
}).map(p=>({...p,level:(NUM(p.metrics.direct_orders)&&p.metrics.direct_orders===0)?'alert':'watch',signal:(NUM(p.metrics.direct_orders)&&p.metrics.direct_orders===0)?'有花费但无直接成交笔数':'直接 ROI 低于 1'}));}
function renderProductCheck(){
  const {ds,rows}=filteredProducts('check');if(!ds){app.innerHTML=empty('没有可分析的商品报表。');return;}
  if(!hasDim(ds,'product_id')&&!hasDim(ds,'product_name')){renderProductDataUnavailable('推广商品核查','04');return;}
  const issues=checkRows(rows),cols=productTableColumns(ds,[{key:'signal',label:'核查信号',value:p=>p.signal,render:p=>`<span class="badge ${p.level}">${esc(p.signal)}</span>`}]);
  app.innerHTML=`<section class="panel">${panelTitle('推广商品核查','定位有消耗但成交弱或 ROI 偏低的商品，作为排查队列。','04')}${pageFiltersHtml('check',ds)}${note('红色表示当前规则命中“有花费但无直接成交笔数”；黄色表示报表直接 ROI 低于 1。颜色提示只描述数值关系，不等于亏损判定，也不代表应立即停投。','warning')}${issues.length?tableToolbar('product-check')+tableHtml(issues,cols,'product-check'):empty('当前筛选范围没有命中核查规则的商品。')}</section>`;
  addPageFilterAction('check',ds,render);
}
function renderNew(){
  const {ds,rows}=filteredProducts('new');if(!ds){app.innerHTML=empty('没有可分析的商品报表。');return;}
  if(!hasDim(ds,'product_id')&&!hasDim(ds,'product_name')){renderProductDataUnavailable('新品与测款观察','05');return;}
  const observed=rows.filter(p=>p.firstDate).sort((a,b)=>a.firstDate.localeCompare(b.firstDate));
  const cols=[
    ...productIdentityCols(),{key:'firstDate',label:'区间首次出现',align:'left',value:p=>p.firstDate||'',render:p=>p.firstDate?`<span class="badge">${esc(p.firstDate)}</span>`:'—'},
    {key:'lastDate',label:'末次出现',value:p=>p.lastDate||''},
    ...pageMetricColumns(ds).map(c=>({...c,value:p=>p.metrics[c.key]})),
    {key:'sourceRows',label:'源记录行数',value:p=>p.sourceRows,format:'number'}
  ];
  app.innerHTML=`<section class="panel">${panelTitle('新品与测款观察','按当前日期筛选区间内商品首次出现在商品报表的日期排序。','05')}${pageFiltersHtml('new',ds)}${note('此处“首次出现”只表示商品第一次出现在本次上传报表的记录中，不代表真实上架日期、首次投放日期或新品身份。若要判断新品，请另提供上架日期或商品生命周期字段。')}${tableToolbar('new-products')}${tableHtml(observed,cols,'new-products','当前筛选区间没有可识别日期的商品记录。')}</section>`;
  addPageFilterAction('new',ds,render);
}
function renderAllocation(){
  const {ds,rows}=filteredProducts('allocation');if(!ds){app.innerHTML=empty('没有可分析的商品报表。');return;}
  if(!hasDim(ds,'product_id')&&!hasDim(ds,'product_name')){renderProductDataUnavailable('投产与分配','06');return;}
  const withSpend=rows.filter(p=>NUM(p.metrics.spend)&&p.metrics.spend>0).sort((a,b)=>b.metrics.spend-a.metrics.spend);
  const totals=totalsFor(ds,filterRawRows(ds,'allocation'));
  const top5Spend=withSpend.slice(0,5).reduce((s,p)=>s+p.metrics.spend,0),top5Share=ratio(top5Spend,totals.spend);
  const revenueRows=withSpend.filter(p=>NUM(p.metrics.direct_amount));
  const top5Revenue=revenueRows.slice().sort((a,b)=>b.metrics.direct_amount-a.metrics.direct_amount).slice(0,5).reduce((s,p)=>s+p.metrics.direct_amount,0);
  const revenueShare=ratio(top5Revenue,totals.direct_amount);
  const cols=[...productIdentityCols(),
    {key:'spend',label:'花费',value:p=>p.metrics.spend,format:'money'},
    {key:'spendShare',label:'花费占比',value:p=>ratio(p.metrics.spend,totals.spend),format:'percent'},
    {key:'direct_amount',label:'直接成交额',value:p=>p.metrics.direct_amount,format:'money'},
    {key:'revenueShare',label:'直接成交额占比',value:p=>ratio(p.metrics.direct_amount,totals.direct_amount),format:'percent'},
    {key:'direct_roi',label:'直接 ROI',value:p=>p.metrics.direct_roi,format:'ratio',tone:'roi'}
  ];
  app.innerHTML=`<section class="panel">${panelTitle('投产与分配','展示商品主表的花费集中度与直接成交贡献；不将其他维度报表叠加。','06')}${pageFiltersHtml('allocation',ds)}<div class="summary-grid">${card('有花费商品',withSpend.length,'number')}${card('花费 TOP5 占比',top5Share,'percent','观察投入集中程度')}${card('直接成交额 TOP5 占比',revenueShare,'percent','只在有直接成交额字段时计算')}</div>${note('集中度高低本身不表示分配合理或不合理；还需要结合预算上限、商品毛利、库存、目标 ROI 和经营策略。')}${tableToolbar('allocation-products')}${tableHtml(withSpend,cols,'allocation-products')}</section>`;
  addPageFilterAction('allocation',ds,render);
}
function renderProducts(){
  const {ds,rows}=filteredProducts('products');if(!ds){app.innerHTML=empty('没有可分析的商品报表。');return;}
  if(!hasDim(ds,'product_id')&&!hasDim(ds,'product_name')){renderProductDataUnavailable('推广商品明细','07');return;}
  const cols=productTableColumns(ds,[{key:'firstDate',label:'区间首次出现',align:'left',value:p=>p.firstDate||''}]);
  app.innerHTML=`<section class="panel">${panelTitle('推广商品明细','按商品 ID 汇总商品主表；日期区间、关键词和最低花费均可筛选，表头可排序。','07')}${pageFiltersHtml('products',ds)}${note(`数据来源为${ds.label}报表，日期 ${rangeText(ds)}。商品报表里的计划与场景若包含对应 ID，会在多维拆解中组合查看。`)}${tableToolbar('product-details')}${tableHtml(rows,cols,'product-details')}</section>`;
  addPageFilterAction('products',ds,render);
}
function renderAudit(){
  const {ds,rows}=filteredProducts('audit');if(!ds){app.innerHTML=empty('没有可分析的商品报表。');return;}
  if(!hasDim(ds,'product_id')&&!hasDim(ds,'product_name')){renderProductDataUnavailable('商品核查清单','08');return;}
  const issues=checkRows(rows).sort((a,b)=>(b.metrics.spend||0)-(a.metrics.spend||0));
  const cols=[
    ...productIdentityCols(),{key:'signal',label:'核查信号',value:p=>p.signal,render:p=>`<span class="badge ${p.level}">${esc(p.signal)}</span>`},
    {key:'clicks',label:'点击量',value:p=>p.metrics.clicks,format:'number'},
    {key:'spend',label:'花费',value:p=>p.metrics.spend,format:'money'},
    {key:'direct_amount',label:'直接成交额',value:p=>p.metrics.direct_amount,format:'money'},
    {key:'direct_orders',label:'直接成交笔数',value:p=>p.metrics.direct_orders,format:'number'},
    {key:'direct_roi',label:'直接 ROI',value:p=>p.metrics.direct_roi,format:'ratio',tone:'roi'},
    {key:'detail',label:'定位明细',value:p=>p.id,render:p=>p.id?`<button class="btn" data-open-product="${esc(p.id)}">查看多维</button>`:'—'}
  ];
  app.innerHTML=`<section class="panel">${panelTitle('商品核查清单','按花费由高到低列出需要优先复核的商品，方便定位后再看计划、关键词或其他维度。','08')}${pageFiltersHtml('audit',ds)}${note('这份清单是排查顺序，不是自动停投名单。确认前请核对数据归因周期、预算目标、商品毛利、退款、页面承接和库存。','warning')}${tableToolbar('product-audit')}${tableHtml(issues,cols,'product-audit','当前筛选范围没有命中商品核查规则的记录。')}</section>`;
  addPageFilterAction('audit',ds,render);
}
function renderBudget(){
  const ds=primaryDataset();if(!ds){app.innerHTML=empty('没有可用于试算的主报表。');return;}
  const rows=filterRawRows(ds,'budget'),totals=totalsFor(ds,rows),currentROI=totals.direct_roi;
  const deltaPct=state.budgetChange??20,targetROI=state.targetROI??3;
  const deltaSpend=NUM(totals.spend)?totals.spend*deltaPct/100:null;
  const currentBased=NUM(currentROI)&&NUM(deltaSpend)?deltaSpend*currentROI:null;
  const targetBased=NUM(deltaSpend)&&NUM(targetROI)?deltaSpend*targetROI:null;
  app.innerHTML=`<section class="panel">${panelTitle('预算情景试算','用当前主表投产比做简单敏感性试算，不构成销量预测或预算建议。','09')}${pageFiltersHtml('budget',ds,{minimumSpend:false})}<div class="filterbar toolbar"><label class="meta">预算变化假设（%）</label><input class="field" id="budget-change" type="number" min="-90" max="300" step="5" value="${esc(deltaPct)}"><label class="meta">目标直接 ROI</label><input class="field" id="target-roi" type="number" min="0" step="0.1" value="${esc(targetROI)}"></div><div class="formula"><span>当前主表花费</span><strong>${fmt(totals.spend,'money')}</strong><span>当前直接 ROI</span><strong>${fmt(currentROI,'ratio')}</strong></div><div class="scenario-result">${card('假设花费变化',deltaSpend,'money',`${deltaPct>=0?'+':''}${deltaPct}% · 基于当前筛选范围`) }${card('按当前 ROI 等比例换算成交额变化',currentBased,'money','纯线性假设，不是预测')}${card('达到目标 ROI 所需成交额变化',targetBased,'money',`目标 ROI ${targetROI}x · 计算为花费变化 × 目标 ROI`)}</div>${note('试算假设当前 ROI 在预算变化后保持不变，现实中流量质量、竞价、预算消耗速度和边际 ROI 都可能变化。没有毛利、退款、库存、预算上限和归因延迟数据时，不应用本页直接决定加投或减投。','warning')}</section>`;
  addPageFilterAction('budget',ds,render);
  app.querySelector('#budget-change').onchange=e=>{const v=Number(e.target.value);if(Number.isFinite(v)){state.budgetChange=v;renderBudget()}};
  app.querySelector('#target-roi').onchange=e=>{const v=Number(e.target.value);if(Number.isFinite(v)){state.targetROI=v;renderBudget()}};
}
function renderDimensionIndex(){
  const ds=primaryDataset(),cross=productCrossPlan(ds);
  app.innerHTML=`<section class="panel">${panelTitle('多维拆解','选择报表维度后，可按字段组合、筛选行、排序指标并查看自定义字段。只有来源表真实包含的 ID 才建立关联。','10')}<div class="pill-row">${DATA.datasets.map(d=>`<button class="pill ${state.datasetId===d.id?'active':''}" data-open-dataset="${esc(d.id)}">${esc(d.label)} · ${d.row_count.toLocaleString()} 行</button>`).join('')}</div>${DATA.datasets.map(d=>`<div class="dim-dataset"><div><strong>${esc(d.label)}报表</strong><small>${esc(d.source_file)} · ${d.row_count.toLocaleString()} 行 · ${esc(rangeText(d))} · ${d.dimensions_available.map(dimLabel).map(esc).join('、')||'无识别维度'}</small></div><button class="btn" data-open-dataset="${esc(d.id)}">筛选拆解</button></div>`).join('')}</section><section class="panel">${panelTitle('同一商品跨计划关联','仅按商品报表内的商品 ID、计划 ID（以及来源表具备时的场景 ID）对齐。')}${renderCrossPlanTable(cross,'dimensions-cross')}</section>`;
}
function rawDatasetFiltered(d){
  const f=state.filters[d.id]||{};
  return d.rows.filter(r=>{
    const dims=r.dimensions;
    for(const [key,val] of Object.entries(f)){if(!val)continue;
      if(key==='search'){if(!Object.values(dims).some(v=>String(v||'').toLocaleLowerCase().includes(val.toLocaleLowerCase())))return false}
      else if(key==='date_start'&&(!dims.date||dims.date<val))return false;
      else if(key==='date_end'&&(!dims.date||dims.date>val))return false;
      else if(key!=='date_start'&&key!=='date_end'&&!String(dims[key]||'').toLocaleLowerCase().includes(val.toLocaleLowerCase()))return false;
    }return true;
  });
}
function aggregateDataset(d,selected,groups){
  const map=new Map(),meta=d.custom_metric_meta||{};
  selected.forEach(r=>{
    const vals=groups.map(k=>r.dimensions[k]??'');const key=vals.join('\u001f')||'__all__';
    if(!map.has(key))map.set(key,{dimensions:Object.fromEntries(groups.map(k=>[k,r.dimensions[k]??null])),metrics:{},custom_metrics:{},custom_sums:{},custom_counts:{},source_rows:0});
    const t=map.get(key);t.source_rows++;
    Object.entries(r.metrics||{}).forEach(([k,v])=>{if(NUM(v))t.metrics[k]=(t.metrics[k]||0)+v});
    Object.entries(r.custom_metrics||{}).forEach(([k,v])=>{if(NUM(v)){t.custom_sums[k]=(t.custom_sums[k]||0)+v;t.custom_counts[k]=(t.custom_counts[k]||0)+1}});
  });
  const out=[...map.values()];out.forEach(r=>{derive(r.metrics);Object.entries(r.custom_sums).forEach(([k,v])=>{r.custom_metrics[k]=meta[k]?.aggregation==='mean'?v/r.custom_counts[k]:v})});
  const totals=totalsFor(d,selected),keys=[...groups];
  return {out,totals,groups:keys,selected};
}
function renderDataset(d){
  const f=state.filters[d.id]||(state.filters[d.id]={}),available=d.dimensions_available.filter(k=>k!=='date'),meta=d.custom_metric_meta||{};
  const fallback={product:['product_id','product_name','plan_name','scene_name'],keyword:['keyword_type','keyword_name','product_name','plan_name'],plan:['plan_id','plan_name','scene_name'],scene:['scene_id','scene_name'],audience:['audience_name','plan_name'],creative:['creative_name','plan_name'],region:['province','plan_name'],unit:['unit_id','unit_name']}[d.type]||[];
  const defaultGroups=fallback.filter(k=>available.includes(k));if(!state.groups[d.id])state.groups[d.id]=defaultGroups.length?defaultGroups:available.slice(0,1);
  if(!state.metrics[d.id])state.metrics[d.id]=validMetricOptions(d);
  const selected=rawDatasetFiltered(d),groups=state.groups[d.id],view=aggregateDataset(d,selected,groups),sort=state.sort[d.id]||{key:'spend',dir:-1};
  const sorted=[...view.out].sort((a,b)=>{const av=a.dimensions[sort.key]??a.metrics[sort.key]??a.custom_metrics[String(sort.key).replace(/^custom:/,'')],bv=b.dimensions[sort.key]??b.metrics[sort.key]??b.custom_metrics[String(sort.key).replace(/^custom:/,'')];if(NUM(av)&&NUM(bv))return(av-bv)*sort.dir;return String(av??'').localeCompare(String(bv??''),'zh-CN')*sort.dir});
  const metricKeys=state.metrics[d.id];
  const cols=[...groups.map(k=>({key:k,label:dimLabel(k),kind:'dim',format:'text'})),...metricKeys.map(k=>{
    if(k.startsWith('custom:')){const name=k.slice(7);return{key:k,label:name+(meta[name]?.aggregation==='mean'?'（均值）':'（合计）'),kind:'custom',format:meta[name]?.format||'number'}}
    return{key:k,label:LABELS[k]||k,kind:'metric',format:metricKind(k)};
  })];
  const columnDefs=cols.map(c=>({key:c.key,label:c.label,align:c.kind==='dim'?'left':'right',value:r=>c.kind==='dim'?r.dimensions[c.key]:c.kind==='custom'?r.custom_metrics[c.key.slice(7)]:r.metrics[c.key],format:c.format,tone:c.key==='direct_roi'?'roi':''}));
  const groupControls=available.map(k=>`<label><input type="checkbox" data-group="${esc(k)}" ${groups.includes(k)?'checked':''}> ${esc(dimLabel(k))}</label>`).join('');
  const metricOptions=validMetricOptions(d);
  const metricControls=metricOptions.map(k=>{const name=k.startsWith('custom:')?k.slice(7):k,label=k.startsWith('custom:')?name+(meta[name]?.aggregation==='mean'?'（均值）':'（合计）'):(LABELS[k]||k);return `<label><input type="checkbox" data-metric="${esc(k)}" ${metricKeys.includes(k)?'checked':''}> ${esc(label)}</label>`}).join('');
  const filterInputs=available.map(k=>`<input class="field" data-filter="${esc(k)}" placeholder="筛选${esc(dimLabel(k))}" value="${esc(f[k]||'')}" style="width:145px">`).join('');
  app.innerHTML=`<section class="panel"><div class="section-title"><div><button class="btn" data-open-page="dimensions">← 返回多维拆解</button>${panelTitle(`${d.label}报表筛选与拆解`,`来源：${d.source_file} · ${d.row_count.toLocaleString()} 行 · ${rangeText(d)}`,'10')}</div><button class="btn primary" data-float-table="dimension-${d.id}">⛶ 悬浮查看</button></div>${d.warnings.length?note(d.warnings.join('；'),'warning'):''}<div class="filterbar"><input class="field search" data-filter="search" placeholder="搜索名称、ID 或维度值" value="${esc(f.search||'')}"><input class="field" type="date" data-filter="date_start" value="${esc(f.date_start||'')}"><span class="meta">至</span><input class="field" type="date" data-filter="date_end" value="${esc(f.date_end||'')}">${filterInputs}<button class="btn primary" id="apply-dimension-filter">应用筛选</button><button class="btn" id="reset-dimension-filter">清除筛选</button></div><div class="meta">分组字段（可组合）</div><div class="filters-grid">${groupControls||'<span class="meta">本报表没有已识别的分组维度</span>'}</div><div class="meta">展示指标（可自定义）</div><div class="filters-grid">${metricControls}</div>${cardsForTotals(view.totals,d.available_metrics)}${note(`当前筛选 ${selected.length.toLocaleString()} 行，汇总为 ${view.out.length.toLocaleString()} 项。只对本份报表汇总，比率在汇总后重算；其他报表不会混入。`)}<div class="table-wrap">${tableHtml(sorted,columnDefs,`dimension-${d.id}`)}</div><p class="small-note">自定义字段的“均值/合计”由字段名称启发式识别，均值不是加权均值；使用前请核对原始口径。</p></section>`;
  app.querySelectorAll('[data-filter]').forEach(el=>el.addEventListener('input',()=>{f[el.dataset.filter]=el.value}));
  app.querySelector('#apply-dimension-filter').onclick=()=>renderDataset(d);
  app.querySelector('#reset-dimension-filter').onclick=()=>{state.filters[d.id]={};renderDataset(d)};
  app.querySelectorAll('[data-group]').forEach(el=>el.onchange=()=>{state.groups[d.id]=[...app.querySelectorAll('[data-group]:checked')].map(x=>x.dataset.group);renderDataset(d)});
  app.querySelectorAll('[data-metric]').forEach(el=>el.onchange=()=>{state.metrics[d.id]=[...app.querySelectorAll('[data-metric]:checked')].map(x=>x.dataset.metric);renderDataset(d)});
}
function renderQuality(){
  app.innerHTML=`<section class="panel">${panelTitle('数据质量与口径','每份来源报表独立检查字段、时间覆盖、关联键与指标定义。','11')}${DATA.warnings.length?note(`导入提示：${DATA.warnings.join('；')}`,'warning'):note('导入过程中没有跳过或报错的文件。')}${DATA.datasets.map(d=>`<div class="panel"><div class="section-title"><div><h2>${esc(d.label)}报表 · ${esc(d.source_file)}</h2><p class="sub">${d.row_count.toLocaleString()} 行 · ${esc(rangeText(d))} · 维度：${d.dimensions_available.map(dimLabel).map(esc).join('、')||'未识别'}</p></div><span class="badge">${d.available_metrics.length} 个指标字段</span></div>${d.warnings.length?findingsHtml(d.warnings.map(x=>({level:'watch',title:'字段提醒',detail:x}))):'<div class="finding good"><strong>基础字段已识别</strong><p>仍需结合平台口径核对归因和统计定义。</p></div>'}<div class="small-note">源字段：${d.source_headers.map(esc).join('、')}</div></div>`).join('')}${note('直接 ROI = 直接成交金额 ÷ 花费，仅观察报表归因产出，不代表利润。预售、直接成交与总成交保留各自字段。没有商品 ID 的维度报表不推断到具体商品。')}</section>`;
}
function render(){
  renderNav();
  const renderers={diagnosis:renderDiagnosis,trend:renderTrend,growth:renderGrowth,check:renderProductCheck,new:renderNew,allocation:renderAllocation,products:renderProducts,audit:renderAudit,budget:renderBudget,quality:renderQuality};
  if(state.page==='dimensions'){
    const d=state.datasetId?datasetById(state.datasetId):null;
    if(d)renderDataset(d);else renderDimensionIndex();
  }else (renderers[state.page]||renderDiagnosis)();
}
function modalFill(tableId){
  const m=state.tableModels[tableId];if(!m)return;
  document.getElementById('modal-title').textContent=`${m.title} · ${m.rows.length} 项`;
  modalBody.innerHTML=`<p class="meta">表头固定；表格区域可独立滚动。</p>${tableHtml(m.rows,m.cols,tableId)}`;
  modalBody.querySelectorAll('[data-sort-table]').forEach(th=>th.onclick=()=>{const id=th.dataset.sortTable,key=th.dataset.sortKey,s=state.sort[id]||{key,dir:-1};state.sort[id]={key,dir:s.key===key?-s.dir:-1};modalFill(id)});
}
function openFloat(tableId){modalFill(tableId);modal.classList.add('open')}
function openDataset(id){if(!datasetById(id))return;state.page='dimensions';state.datasetId=id;render()}
function openPlan(productId,planId){
  const ds=DATA.datasets.find(d=>d.type==='product'&&hasDim(d,'product_id')&&hasDim(d,'plan_id'));
  if(!ds){state.page='dimensions';state.datasetId=null;render();return;}
  state.page='dimensions';state.datasetId=ds.id;state.filters[ds.id]={...(state.filters[ds.id]||{}),product_id:productId,plan_id:planId};render();
}
app.addEventListener('click',e=>{
  const sort=e.target.closest('[data-sort-table]');
  if(sort){const id=sort.dataset.sortTable,key=sort.dataset.sortKey,s=state.sort[id]||{key,dir:-1};state.sort[id]={key,dir:s.key===key?-s.dir:-1};const y=window.scrollY;render();window.scrollTo(0,y);return;}
  const float=e.target.closest('[data-float-table]');if(float){openFloat(float.dataset.floatTable);return;}
  const dataset=e.target.closest('[data-open-dataset]');if(dataset){openDataset(dataset.dataset.openDataset);return;}
  const related=e.target.closest('[data-open-plan]');if(related){openPlan(related.dataset.openPlan,related.dataset.planId);return;}
  const product=e.target.closest('[data-open-product]');if(product){openPlan(product.dataset.openProduct,'');return;}
  const page=e.target.closest('[data-open-page]');if(page){state.page=page.dataset.openPage;if(state.page!=='dimensions')state.datasetId=null;render();return;}
});
document.getElementById('modal-close').onclick=()=>modal.classList.remove('open');
modal.onclick=e=>{if(e.target===modal)modal.classList.remove('open')};
document.addEventListener('keydown',e=>{if(e.key==='Escape')modal.classList.remove('open')});
renderHeroMeta();render();
})();
