import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Package, Calendar, Truck, Plus, X, Search, AlertTriangle,
  Check, ChevronLeft, ChevronRight, Edit3, Trash2, ClipboardList,
  BarChart3, Filter, RefreshCw, ChevronDown, ChevronUp, Printer,
  ExternalLink, MapPin, Flag, Layout, Building2
} from "lucide-react";

const CHAIN_COLORS={"Chain #1":"#38b6ff","Chain #2":"#f9232d","Chain #3":"#7ed957","Chain #4":"#ffde59","Chain #5":"#8c52ff","Chain #6":"#ff914d","Chain #7":"#ff66c4","Chain #8":"#5ce1e6","Will Call":"#000000","Unassigned":"#9ca3af"};
const cTxt=(c)=>c==="Will Call"?"#fff":"#000";
const cBg=(c)=>CHAIN_COLORS[c]||"#e2e8f0";
const CHAINS=["Unassigned","Chain #1","Chain #2","Chain #3","Chain #4","Chain #5","Chain #6","Chain #7","Chain #8","Will Call"];
const EVENT_TYPES=[{value:"coordinated",label:"Coordinated"},{value:"dropoff",label:"Drop-Off"},{value:"pickup",label:"Pickup"},{value:"willcall",label:"Will Call"}];
const SK="wf-inv-v3";
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const fmtDate=(s)=>{if(!s)return"";const[y,m,d]=s.split("-");const mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];return `${mo[parseInt(m)-1]} ${parseInt(d)}, ${y}`};
const dow=(s)=>{if(!s)return"";return["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(s+"T12:00:00").getDay()]};
const gid=()=>"bk_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const fid=()=>"fl_"+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const to12=(t)=>{if(!t)return"";const[h,m]=t.split(":").map(Number);const ap=h>=12?"pm":"am";return `${h%12||12}:${String(m||0).padStart(2,"0")}${ap}`};
const toMin=(t)=>{if(!t)return 0;const[h,m]=t.split(":").map(Number);return h*60+(m||0)};

const PLACEHOLDER_SUBS={
  foam_machine:["Water Hose","Foam Solution Jug","Extension Cord","Foam Nozzle","Tarp"],
  elite_laser_tag:["Laser Tag Vest","Laser Blaster","Charging Station","Headband Sensor","Battery Pack"],
  hamster_ball_track:["Track Panel","Inflatable Ball","Air Pump","Repair Kit","Ground Stakes"],
  warped_wall:["Safety Mat","Grip Tape Roll","Support Brace","Anchor Strap","Step Platform"],
  obstacles_only:["Inflatable Obstacle","Blower Motor","Ground Tarp","Tie-Down Strap","Repair Patch"],
  bubbleball:["Bubble Ball","Air Pump","Repair Kit","Pinnie Set","Cone Set"],
  dart_board:["Inflatable Board","Velcro Dart Set","Blower Motor","Ground Tarp","Scoreboard"],
  arrow_tag:["Bow","Foam Arrow","Face Mask","Arm Guard","Target Set"],
  geltag:["Gel Blaster","Gel Ammo Pack","Safety Goggles","Magazine Clip","Charging Cable"],
  hoverball:["Hoverball Unit","Goal Set","Boundary Tape","Air Pump","Battery Charger"],
  battleputt:["Putting Green","Putter","Golf Ball Set","Flag Pin","Obstacle Ring"],
  disc_golf:["Disc Set","Basket Target","Tee Pad","Scorecard Pack","Carrying Bag"],
  cornhole:["Cornhole Board","Bean Bag Set","Carrying Case","Score Tower","LED Light Set"],
  deluxe_cornhole:["Deluxe Board","Premium Bean Bag Set","Storage Bag","Speaker Mount","LED Strip"],
  yard_pong:["Bucket Set","Ball Set","Carrying Rack","Cup Pack","Ground Anchors"],
  mega_chess:["Chess Piece Set","Game Mat","Storage Dolly","Rule Card","Boundary Rope"],
  mega_checkers:["Checker Piece Set","Game Mat","Storage Bag","Rule Card","Boundary Markers"],
  mega_jenga:["Jenga Block Set","Storage Crate","Level Platform","Carrying Dolly","Rubber Pads"],
  bucket_golf:["Bucket Target Set","Chipping Mat","Golf Ball Set","Flag Set","Scorecard Pack"],
  connect_4:["Connect 4 Frame","Disc Set","Carrying Case","Base Stabilizer","Score Tracker"],
  jenga:["Jenga Block Set","Carrying Case","Level Platform","Storage Rack","Rubber Base"],
  horseshoes:["Horseshoe Set","Stake Set","Pit Frame","Sand Bag","Measuring Tape"],
};

const buildEq=()=>[
  {id:"foam_machine",name:"Foam Machine",totalQty:4},{id:"elite_laser_tag",name:"Elite Laser Tag",totalQty:30},
  {id:"hamster_ball_track",name:"Hamster Ball Track",totalQty:2},{id:"warped_wall",name:"Warped Wall",totalQty:1},
  {id:"obstacles_only",name:"Obstacles Only",totalQty:1},{id:"bubbleball",name:"Bubbleball",totalQty:40},
  {id:"dart_board",name:"Dart Board",totalQty:1},{id:"arrow_tag",name:"Arrow Tag",totalQty:30},
  {id:"geltag",name:"Geltag",totalQty:20},{id:"hoverball",name:"Hoverball",totalQty:2},
  {id:"battleputt",name:"Battleputt",totalQty:5},{id:"disc_golf",name:"Disc Golf",totalQty:5},
  {id:"cornhole",name:"Cornhole",totalQty:10},{id:"deluxe_cornhole",name:"Deluxe Cornhole",totalQty:5},
  {id:"yard_pong",name:"Yard Pong",totalQty:5},{id:"mega_chess",name:"Mega Chess",totalQty:1},
  {id:"mega_checkers",name:"Mega Checkers",totalQty:1},{id:"mega_jenga",name:"Mega Jenga",totalQty:3},
  {id:"bucket_golf",name:"Bucket Golf",totalQty:2},{id:"connect_4",name:"Connect 4",totalQty:10},
  {id:"jenga",name:"Jenga",totalQty:10},{id:"horseshoes",name:"Horseshoes",totalQty:3},
].map(it=>({...it,outOfService:0,issueFlag:0,isActive:true,issueFlagItems:[],outOfServiceItems:[],customSetupMin:null,customCleanupMin:null,
  subItems:(PLACEHOLDER_SUBS[it.id]||[]).map((n,i)=>({id:`${it.id}_sub_${i}`,name:n,totalQty:Math.ceil(Math.random()*5+1),outOfService:0,issueFlag:0,isActive:true,issueFlagItems:[],outOfServiceItems:[]}))}));

// ═══ MAIN ═══
export default function App(){
  const[eq,setEq]=useState([]);const[bk,setBk]=useState([]);const[tab,setTab]=useState("availability");
  const[selDate,setSelDate]=useState(today());const[selChain,setSelChain]=useState("all");
  const[loading,setLoading]=useState(true);const[search,setSearch]=useState("");
  const[modal,setModal]=useState(null);const[notif,setNotif]=useState(null);
  const[expRows,setExpRows]=useState({});const[bkFilters,setBkFilters]=useState({date:"",status:"all",type:"all"});
  const[expBk,setExpBk]=useState(null);const[chainPop,setChainPop]=useState(null);
  const[showTravel,setShowTravel]=useState(true);const[showSetup,setShowSetup]=useState(true);

  const load=useCallback(async()=>{
    try{const r=await window.storage.get(SK);const d=JSON.parse(r.value);setEq(d.eq||buildEq());setBk(d.bk||[])}
    catch{setEq(buildEq());setBk([])}setLoading(false);
  },[]);
  const save=useCallback(async(e,b)=>{try{await window.storage.set(SK,JSON.stringify({eq:e,bk:b}))}catch(er){console.error(er)}},[]);
  useEffect(()=>{load()},[load]);
  const ue=(e)=>{setEq(e);save(e,bk)};const ub=(b)=>{setBk(b);save(eq,b)};
  const notify=(m,t="success")=>{setNotif({m,t});setTimeout(()=>setNotif(null),3000)};
  const togRow=(id)=>setExpRows(p=>({...p,[id]:!p[id]}));

  const eqMap=useMemo(()=>{const m={};eq.forEach(e=>{m[e.id]=e;(e.subItems||[]).forEach(s=>{m[s.id]=s})});return m},[eq]);

  // Availability
  const getAvail=useCallback((date)=>{
    const act=bk.filter(b=>b.status==="confirmed"&&b.eventDate<=date&&(b.endDate||b.eventDate)>=date);
    return eq.filter(e=>e.isActive).map(e=>{
      const cq={};CHAINS.forEach(c=>{cq[c]=0});
      act.forEach(b=>{(b.items||[]).forEach(it=>{if(it.itemId===e.id)cq[b.chain||"Unassigned"]+=it.qty})});
      const tb=Object.values(cq).reduce((a,b)=>a+b,0);
      const av=e.totalQty-e.outOfService-e.issueFlag;
      const rem=av-tb;
      let st="available";if(rem<0)st="overbooked";else if(rem===0)st="sold_out";else if(rem/Math.max(av,1)<=0.25)st="critical";else if(rem/Math.max(av,1)<=0.5)st="low";
      return{...e,chainQty:cq,totalBooked:tb,remaining:rem,availableQty:av,status:st};
    });
  },[bk,eq]);
  const avail=useMemo(()=>getAvail(selDate),[selDate,getAvail]);

  const getChainTimes=useCallback((date)=>{
    const r={};CHAINS.forEach(c=>{
      const evts=bk.filter(b=>b.status==="confirmed"&&b.chain===c&&b.eventDate<=date&&(b.endDate||b.eventDate)>=date);
      if(evts.length>0){const ss=evts.map(b=>b.startTime||"23:59").sort();const es=evts.map(b=>b.endTime||"00:00").sort();r[c]={start:ss[0],end:es[es.length-1],count:evts.length}}
    });return r;
  },[bk]);
  const chainTimes=useMemo(()=>getChainTimes(selDate),[selDate,getChainTimes]);

  const getLoadout=useCallback((date,chain)=>bk.filter(b=>b.status==="confirmed"&&b.chain===chain&&b.eventDate<=date&&(b.endDate||b.eventDate)>=date).sort((a,b)=>(a.startTime||"").localeCompare(b.startTime||"")),[bk]);

  const calcPL=useCallback((loadout)=>{
    const pi={};const si={};
    const drops=loadout.filter(b=>b.eventType==="dropoff"||b.eventType==="willcall");
    const coord=loadout.filter(b=>b.eventType==="coordinated"||b.eventType==="pickup"||!b.eventType);
    drops.forEach(b=>{(b.items||[]).forEach(it=>{pi[it.itemId]=(pi[it.itemId]||0)+it.qty});(b.subItems||[]).forEach(it=>{si[it.itemId]=(si[it.itemId]||0)+it.qty})});
    const cm={};const sm={};
    coord.forEach(b=>{(b.items||[]).forEach(it=>{cm[it.itemId]=Math.max(cm[it.itemId]||0,it.qty)});(b.subItems||[]).forEach(it=>{sm[it.itemId]=Math.max(sm[it.itemId]||0,it.qty)})});
    Object.entries(cm).forEach(([id,q])=>{pi[id]=(pi[id]||0)+q});
    Object.entries(sm).forEach(([id,q])=>{si[id]=(si[id]||0)+q});
    return{parentItems:pi,subItems:si};
  },[]);

  const shiftDate=(d)=>{const dt=new Date(selDate+"T12:00:00");dt.setDate(dt.getDate()+d);setSelDate(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`)};

  const stats=useMemo(()=>{
    const db=bk.filter(b=>b.status==="confirmed"&&b.eventDate<=selDate&&(b.endDate||b.eventDate)>=selDate);
    const cs=new Set(db.map(b=>b.chain).filter(c=>c&&c!=="Unassigned"));
    return{events:db.length,chains:cs.size,soldOut:avail.filter(a=>a.status==="sold_out").length,overbooked:avail.filter(a=>a.status==="overbooked").length,low:avail.filter(a=>a.status==="critical"||a.status==="low").length};
  },[bk,selDate,avail]);

  const saveBk=(data)=>{
    if(data.id){ub(bk.map(b=>b.id===data.id?{...data,updatedAt:new Date().toISOString()}:b));notify("Booking updated")}
    else{ub([...bk,{...data,id:gid(),createdAt:new Date().toISOString()}]);notify("Booking added")}
    setModal(null);
  };

  const printPL=(chain,date)=>{
    const lo=getLoadout(date,chain);const pl=calcPL(lo);
    const html=`<html><head><title>${chain} - ${fmtDate(date)}</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:13px}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:6px 10px;border:1px solid #ddd;text-align:left}th{background:#f5f5f5;font-size:11px}.ck{width:20px;height:20px;border:2px solid #333;display:inline-block}.ev{padding:6px;border:1px solid #eee;margin:4px 0;border-radius:4px;font-size:12px}@media print{body{padding:10px}}</style></head><body><h1>${chain} Packing List</h1><p>${dow(date)}, ${fmtDate(date)}</p><table><tr><th style="width:30px">✓</th><th>Equipment</th><th>Qty</th></tr>${Object.entries(pl.parentItems).map(([id,q])=>`<tr><td><span class="ck"></span></td><td><strong>${eqMap[id]?.name||id}</strong></td><td><strong>${q}</strong></td></tr>`).join("")}</table>${Object.keys(pl.subItems).length>0?`<h3 style="font-size:13px;color:#666">Support Equipment</h3><table><tr><th style="width:30px">✓</th><th>Item</th><th>Qty</th></tr>${Object.entries(pl.subItems).map(([id,q])=>`<tr><td><span class="ck"></span></td><td>${eqMap[id]?.name||id}</td><td>${q}</td></tr>`).join("")}</table>`:""}<h3>Events (${lo.length})</h3>${lo.map(b=>`<div class="ev"><strong>${b.customerName||"Unnamed"}</strong> — ${to12(b.startTime)}–${to12(b.endTime)} (${b.eventType||"coordinated"})${b.address?`<br><small>${b.address}</small>`:""}</div>`).join("")}</body></html>`;
    const iframe=document.createElement("iframe");iframe.style.display="none";document.body.appendChild(iframe);
    iframe.contentDocument.write(html);iframe.contentDocument.close();
    setTimeout(()=>{iframe.contentWindow.print();setTimeout(()=>document.body.removeChild(iframe),1000)},250);
  };
  const printAll=(date)=>{
    const active=CHAINS.filter(c=>c!=="Unassigned"&&getLoadout(date,c).length>0);
    let html=`<html><head><title>All Packing Lists - ${fmtDate(date)}</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:13px}h1{font-size:18px}h2{border-bottom:2px solid #333;padding-bottom:4px;margin-top:20px}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{padding:5px 8px;border:1px solid #ddd;text-align:left}th{background:#f5f5f5;font-size:10px}.ck{width:18px;height:18px;border:2px solid #333;display:inline-block}.ev{padding:5px;border:1px solid #eee;margin:3px 0;font-size:11px}.pb{page-break-before:always}@media print{body{padding:10px}}</style></head><body><h1>All Packing Lists — ${dow(date)}, ${fmtDate(date)}</h1>`;
    active.forEach((ch,ci)=>{
      if(ci>0)html+=`<div class="pb"></div>`;
      const lo=getLoadout(date,ch);const pl=calcPL(lo);
      html+=`<h2>${ch} (${lo.length} events)</h2><table><tr><th style="width:28px">✓</th><th>Equipment</th><th>Qty</th></tr>${Object.entries(pl.parentItems).map(([id,q])=>`<tr><td><span class="ck"></span></td><td><strong>${eqMap[id]?.name||id}</strong></td><td><strong>${q}</strong></td></tr>`).join("")}</table>`;
      lo.forEach(b=>{html+=`<div class="ev"><strong>${b.customerName||"Unnamed"}</strong> ${to12(b.startTime)}–${to12(b.endTime)} (${b.eventType||"coordinated"})${b.address?` — ${b.address}`:""}</div>`});
    });
    html+=`</body></html>`;
    const iframe=document.createElement("iframe");iframe.style.display="none";document.body.appendChild(iframe);
    iframe.contentDocument.write(html);iframe.contentDocument.close();
    setTimeout(()=>{iframe.contentWindow.print();setTimeout(()=>document.body.removeChild(iframe),1000)},250);
  };

  if(loading) return (<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#e2e8f0",fontFamily:"'DM Sans',system-ui"}}><RefreshCw size={28} style={{animation:"spin 1s linear infinite",color:"#38bdf8"}}/></div>);

  const tabs=[{id:"availability",label:"Availability",icon:BarChart3},{id:"schedule",label:"Schedule Board",icon:Layout},{id:"bookings",label:"Bookings",icon:Calendar},{id:"chains",label:"Chain Loading",icon:Truck},{id:"equipment",label:"Equipment",icon:Package}];

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans',system-ui,sans-serif",background:"#f1f5f9",color:"#1e293b",fontSize:13,overflow:"hidden"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      @keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}*{box-sizing:border-box;margin:0;padding:0}input,select,textarea,button{font-family:inherit}
      ::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:#e2e8f0}::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:3px}`}</style>

      {/* SIDEBAR */}
      <div style={{width:190,background:"linear-gradient(180deg,#0f172a,#1e293b)",color:"#e2e8f0",display:"flex",flexDirection:"column",flexShrink:0,borderRight:"1px solid #334155"}}>
        <div style={{padding:"14px 12px",borderBottom:"1px solid #334155"}}><div style={{fontSize:14,fontWeight:700,color:"#38bdf8"}}>WONDERFLY</div><div style={{fontSize:10,color:"#64748b",letterSpacing:"1px"}}>INVENTORY SYSTEM</div></div>
        <nav style={{flex:1,padding:"8px 6px"}}>
          {tabs.map(t=>{const I=t.icon;const a=tab===t.id;return (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"8px 10px",marginBottom:2,background:a?"rgba(56,189,248,0.12)":"transparent",border:a?"1px solid rgba(56,189,248,0.25)":"1px solid transparent",borderRadius:6,color:a?"#38bdf8":"#94a3b8",cursor:"pointer",fontSize:12,fontWeight:a?600:400,textAlign:"left"}}><I size={15}/>{t.label}</button>
          )})}
        </nav>
      </div>

      {/* MAIN */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {notif&&<div style={{position:"fixed",top:12,right:12,zIndex:1000,padding:"8px 14px",borderRadius:7,background:notif.t==="success"?"#059669":notif.t==="error"?"#dc2626":"#d97706",color:"white",fontSize:12,fontWeight:500,animation:"slideIn 0.2s",boxShadow:"0 4px 12px rgba(0,0,0,0.15)",display:"flex",alignItems:"center",gap:6}}>{notif.t==="success"?<Check size={13}/>:<AlertTriangle size={13}/>}{notif.m}</div>}

        {/* TOP BAR */}
        <div style={{background:"white",borderBottom:"1px solid #e2e8f0",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <h1 style={{fontSize:16,fontWeight:700}}>{tabs.find(t=>t.id===tab)?.label}</h1>
            {["availability","chains","schedule"].includes(tab)&&(
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                <button onClick={()=>shiftDate(-1)} style={navBtn}><ChevronLeft size={13}/></button>
                <input type="date" value={selDate} onChange={e=>setSelDate(e.target.value)} style={{border:"1px solid #e2e8f0",borderRadius:5,padding:"3px 8px",fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}/>
                <button onClick={()=>shiftDate(1)} style={navBtn}><ChevronRight size={13}/></button>
                <button onClick={()=>setSelDate(today())} style={{...navBtn,padding:"3px 8px",fontSize:11}}>Today</button>
                <span style={{fontSize:12,color:"#64748b",fontWeight:500}}>{dow(selDate)}, {fmtDate(selDate)}</span>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {tab==="schedule"&&(<>
              <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#64748b",cursor:"pointer"}}><input type="checkbox" checked={showTravel} onChange={()=>setShowTravel(!showTravel)} style={{accentColor:"#3b82f6"}}/>Travel Time</label>
              <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#64748b",cursor:"pointer"}}><input type="checkbox" checked={showSetup} onChange={()=>setShowSetup(!showSetup)} style={{accentColor:"#3b82f6"}}/>Setup/Cleanup</label>
            </>)}
            {tab==="chains"&&<button onClick={()=>printAll(selDate)} style={topBtn}><Printer size={13}/> Print All</button>}
            {tab==="bookings"&&<button onClick={()=>setModal({type:"booking"})} style={{...topBtn,background:"#0f172a",color:"white",border:"none"}}><Plus size={13}/> New Booking</button>}
            {tab==="equipment"&&<button onClick={()=>setModal({type:"equipment"})} style={{...topBtn,background:"#0f172a",color:"white",border:"none"}}><Plus size={13}/> Add Equipment</button>}
          </div>
        </div>

        <div style={{flex:1,overflow:"auto",padding:16}}>
          {tab==="availability"&&<AvailTab av={avail} stats={stats} search={search} setSearch={setSearch} ct={chainTimes} bk={bk} selDate={selDate} eqMap={eqMap} chainPop={chainPop} setChainPop={setChainPop} getLoadout={getLoadout}/>}
          {tab==="bookings"&&<BkTab bk={bk} eqMap={eqMap} onEdit={b=>setModal({type:"booking",data:b})} onCancel={id=>{ub(bk.map(b=>b.id===id?{...b,status:"canceled"}:b));notify("Canceled","warning")}} onDelete={id=>{ub(bk.filter(b=>b.id!==id));notify("Deleted","warning")}} expBk={expBk} setExpBk={setExpBk} filters={bkFilters} setFilters={setBkFilters}/>}
          {tab==="chains"&&<ChainsTab selDate={selDate} getLoadout={getLoadout} calcPL={calcPL} eqMap={eqMap} eq={eq} selChain={selChain} setSelChain={setSelChain} printPL={printPL} setModal={setModal}/>}
          {tab==="schedule"&&<SchedTab selDate={selDate} bk={bk} eqMap={eqMap} showTravel={showTravel} showSetup={showSetup}/>}
          {tab==="equipment"&&<EqTab eq={eq} ue={ue} onEdit={e=>setModal({type:"equipment",data:e})} search={search} setSearch={setSearch} expRows={expRows} togRow={togRow} setModal={setModal}/>}
        </div>
      </div>

      {modal?.type==="booking"&&<BkModal data={modal.data} eq={eq.filter(e=>e.isActive)} onSave={saveBk} onClose={()=>setModal(null)} selDate={selDate}/>}
      {modal?.type==="equipment"&&<EqModal data={modal.data} onSave={(d)=>{if(d._isEdit){ue(eq.map(e=>e.id===d.id?{...d}:e));notify("Updated")}else{const nid=d.name.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");if(eq.find(e=>e.id===nid)){notify("Exists","error");return}ue([...eq,{...d,id:nid}]);notify("Added")}setModal(null)} } onClose={()=>setModal(null)}/>}
      {modal?.type==="issueFlags"&&<IFModal item={modal.data} eq={eq} ue={ue} onClose={()=>setModal(null)} notify={notify}/>}
      {modal?.type==="oosDetails"&&<OOSModal item={modal.data} eq={eq} ue={ue} onClose={()=>setModal(null)} notify={notify}/>}
    </div>
  );
}

// ═══ AVAILABILITY ═══
function AvailTab({av,stats,search,setSearch,ct,bk,selDate,eqMap,chainPop,setChainPop,getLoadout}){
  const fil=av.filter(a=>a.name.toLowerCase().includes(search.toLowerCase()));
  const sc=(s)=>({overbooked:{bg:"#991b1b",text:"#fff",border:"#991b1b",label:"⚠ OVERBOOKED"},sold_out:{bg:"#fef2f2",text:"#dc2626",border:"#fecaca",label:"SOLD OUT"},critical:{bg:"#fefce8",text:"#d97706",border:"#fde68a",label:"CRITICAL"},low:{bg:"#fffbeb",text:"#b45309",border:"#fde68a",label:"LOW"},available:{bg:"#f0fdf4",text:"#16a34a",border:"#bbf7d0",label:"AVAILABLE"}}[s]||{bg:"#f0fdf4",text:"#16a34a",border:"#bbf7d0",label:"AVAILABLE"});
  const cds=CHAINS.filter(c=>c!=="Unassigned"&&c!=="Will Call");
  return (<div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14}}>
      {[{l:"Events Today",v:stats.events,c:"#3b82f6"},{l:"Chains Active",v:stats.chains,c:"#8b5cf6"},{l:"Sold Out",v:stats.soldOut,c:"#dc2626"},{l:"Overbooked",v:stats.overbooked,c:"#991b1b"},{l:"Low Stock",v:stats.low,c:"#d97706"}].map((s,i)=>(
        <div key={i} style={{background:"white",borderRadius:8,padding:"10px 12px",border:"1px solid #e2e8f0"}}><div style={{fontSize:10,fontWeight:600,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px"}}>{s.l}</div><div style={{fontSize:22,fontWeight:700,color:s.c,marginTop:2,fontFamily:"'JetBrains Mono',monospace"}}>{s.v}</div></div>
      ))}
    </div>
    <div style={{position:"relative",maxWidth:280,marginBottom:10}}><Search size={13} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:"#94a3b8"}}/><input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",padding:"6px 8px 6px 28px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,outline:"none"}}/></div>
    <div style={{background:"white",borderRadius:8,border:"1px solid #e2e8f0",overflow:"hidden"}}><div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{background:"#f8fafc"}}>
        <th style={thS}>Equipment</th><th style={{...thS,textAlign:"center"}}>Total</th><th style={{...thS,textAlign:"center"}}>Avail.</th>
        {cds.map(c=>{const t=ct[c];return (<th key={c} style={{...thS,textAlign:"center",fontSize:10,cursor:t?"pointer":"default",position:"relative"}} onClick={()=>t&&setChainPop(chainPop===c?null:c)}>
          <span style={{display:"inline-block",padding:"2px 5px",borderRadius:3,background:cBg(c),color:cTxt(c),fontWeight:700,fontSize:9}}>{c.replace("Chain ","C")}</span>
          {t&&<div style={{fontSize:8,color:"#64748b",marginTop:1}}>{to12(t.start)}–{to12(t.end)}</div>}
          {chainPop===c&&<ChainPop chain={c} loadout={getLoadout(selDate,c)} eqMap={eqMap} onClose={()=>setChainPop(null)}/>}
        </th>)})}
        <th style={{...thS,textAlign:"center",fontSize:10,position:"relative",cursor:ct["Will Call"]?"pointer":"default"}} onClick={()=>ct["Will Call"]&&setChainPop(chainPop==="Will Call"?null:"Will Call")}>
          <span style={{display:"inline-block",padding:"2px 5px",borderRadius:3,background:"#000",color:"#fff",fontWeight:700,fontSize:9}}>WC</span>
          {ct["Will Call"]&&<div style={{fontSize:8,color:"#64748b",marginTop:1}}>{to12(ct["Will Call"].start)}–{to12(ct["Will Call"].end)}</div>}
          {chainPop==="Will Call"&&<ChainPop chain="Will Call" loadout={getLoadout(selDate,"Will Call")} eqMap={eqMap} onClose={()=>setChainPop(null)}/>}
        </th>
        <th style={{...thS,textAlign:"center",fontSize:10}}>Unasgn</th>
        <th style={{...thS,textAlign:"center",fontWeight:700}}>Booked</th><th style={{...thS,textAlign:"center",fontWeight:700}}>Remaining</th><th style={{...thS,textAlign:"center"}}>Status</th>
      </tr></thead><tbody>
        {fil.map((it,idx)=>{const s=sc(it.status);return (
          <tr key={it.id} style={{borderBottom:"1px solid #f1f5f9",background:idx%2===0?"white":"#fafbfc"}}>
            <td style={{padding:"7px 10px",fontWeight:500}}>{it.name}</td>
            <td style={tdC}>{it.totalQty}</td>
            <td style={{...tdC,color:it.outOfService>0||it.issueFlag>0?"#d97706":"#64748b"}}>{it.availableQty}</td>
            {cds.map(c=> (<td key={c} style={{...tdC,color:it.chainQty[c]>0?"#0f172a":"#ddd",fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{it.chainQty[c]||"—"}</td>) )}
            <td style={{...tdC,color:it.chainQty["Will Call"]>0?"#0f172a":"#ddd",fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{it.chainQty["Will Call"]||"—"}</td>
            <td style={{...tdC,color:it.chainQty["Unassigned"]>0?"#d97706":"#ddd",fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{it.chainQty["Unassigned"]||"—"}</td>
            <td style={{...tdC,fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>{it.totalBooked}</td>
            <td style={{...tdC,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:it.remaining<0?"#991b1b":it.remaining===0?"#dc2626":"#16a34a"}}>{it.remaining}</td>
            <td style={tdC}><span style={{display:"inline-block",padding:"2px 6px",borderRadius:it.status==="overbooked"?4:16,fontSize:9,fontWeight:700,background:s.bg,color:s.text,border:`1px solid ${s.border}`}}>{s.label}</span></td>
          </tr>
        )})}
      </tbody></table>
    </div></div>
  </div>);
}

function ChainPop({chain,loadout,eqMap,onClose}){
  return (
    <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",zIndex:50,background:"white",border:"1px solid #e2e8f0",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",padding:10,minWidth:200,textAlign:"left",animation:"fadeIn 0.12s"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontWeight:700,fontSize:11,padding:"2px 6px",borderRadius:4,background:cBg(chain),color:cTxt(chain)}}>{chain}</span>
        <button onClick={(e)=>{e.stopPropagation();onClose()}} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8"}}><X size={11}/></button>
      </div>
      {loadout.length===0?<p style={{fontSize:10,color:"#94a3b8"}}>No events</p>:
        loadout.map(b=> (
          <div key={b.id} style={{padding:"5px 0",borderBottom:"1px solid #f1f5f9",fontSize:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              {b.jobId ? (
                <a href={`https://zenbooker.com/app?view=jobs&view-job=${b.jobId}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontWeight:600,color:"#3b82f6",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:2}}>{b.customerName||"Unnamed"} <ExternalLink size={8}/></a>
              ) : (
                <span style={{fontWeight:600}}>{b.customerName||"Unnamed"}</span>
              )}
              <span style={{color:"#64748b"}}>{to12(b.startTime)}–{to12(b.endTime)}</span>
            </div>
            <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:"#f1f5f9",fontWeight:600,textTransform:"capitalize"}}>{b.eventType||"coordinated"}</span>
          </div>
        ))
      }
    </div>
  );
}

// ═══ BOOKINGS ═══
function BkTab({bk,eqMap,onEdit,onCancel,onDelete,expBk,setExpBk,filters,setFilters}){
  let list=[...bk].sort((a,b)=>(b.eventDate||"").localeCompare(a.eventDate||""));
  if(filters.date)list=list.filter(b=>b.eventDate===filters.date);
  if(filters.status!=="all")list=list.filter(b=>b.status===filters.status);
  if(filters.type!=="all")list=list.filter(b=>b.eventType===filters.type);
  const stB=(s)=>{const m={confirmed:{bg:"#f0fdf4",t:"#16a34a",b:"#bbf7d0"},canceled:{bg:"#fef2f2",t:"#dc2626",b:"#fecaca"},completed:{bg:"#f8fafc",t:"#64748b",b:"#e2e8f0"}};const c=m[s]||m.confirmed;return (<span style={{padding:"2px 6px",borderRadius:12,fontSize:10,fontWeight:600,background:c.bg,color:c.t,border:`1px solid ${c.b}`,textTransform:"capitalize"}}>{s}</span>)};
  const tB=(t)=>{const m={coordinated:"#3b82f6",dropoff:"#8b5cf6",pickup:"#d97706",willcall:"#0f172a"};return (<span style={{padding:"2px 6px",borderRadius:12,fontSize:10,fontWeight:600,background:m[t]||"#94a3b8",color:"white",textTransform:"capitalize"}}>{t||"coordinated"}</span>)};
  return (<div>
    <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
      <input type="date" value={filters.date} onChange={e=>setFilters({...filters,date:e.target.value})} style={fInp}/>
      {filters.date&&<button onClick={()=>setFilters({...filters,date:""})} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8"}}><X size={13}/></button>}
      <select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})} style={fInp}><option value="all">All Status</option><option value="confirmed">Confirmed</option><option value="canceled">Canceled</option><option value="completed">Completed</option></select>
      <select value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})} style={fInp}><option value="all">All Types</option>{EVENT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select>
      <span style={{fontSize:11,color:"#94a3b8",marginLeft:"auto"}}>{list.length} bookings</span>
    </div>
    {list.length===0?<div style={{textAlign:"center",padding:50,color:"#94a3b8"}}><Calendar size={32} style={{marginBottom:8,opacity:0.4}}/><p>No bookings found</p></div>:
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {list.map(b=>{const ex=expBk===b.id;return (
        <div key={b.id} style={{background:"white",borderRadius:8,border:"1px solid #e2e8f0",overflow:"hidden"}}>
          <div onClick={()=>setExpBk(ex?null:b.id)} style={{display:"grid",gridTemplateColumns:"1.5fr 1fr 100px 80px 80px 60px 30px",alignItems:"center",padding:"10px 14px",cursor:"pointer",gap:8}}>
            <div>
              <div style={{fontWeight:600,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                {b.customerName||"Unnamed"}
                {b.jobId&&(<a href={`https://zenbooker.com/app?view=jobs&view-job=${b.jobId}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{color:"#3b82f6",display:"inline-flex"}}><ExternalLink size={10}/></a>)}
              </div>
              <div style={{fontSize:10,color:"#64748b",fontFamily:"'JetBrains Mono',monospace"}}>{b.jobId||"—"}</div>
            </div>
            <div style={{fontSize:11}}><div style={{fontWeight:500}}>{fmtDate(b.eventDate)}</div><div style={{color:"#64748b",fontSize:10}}>{to12(b.startTime)}–{to12(b.endTime)}</div></div>
            <div><span style={{display:"inline-block",padding:"2px 6px",borderRadius:4,fontSize:10,fontWeight:700,background:cBg(b.chain||"Unassigned"),color:cTxt(b.chain||"Unassigned")}}>{b.chain||"Unassigned"}</span></div>
            <div>{tB(b.eventType)}</div><div>{stB(b.status)}</div>
            <div style={{fontSize:11,color:"#64748b"}}>{(b.items||[]).length}</div>
            <div style={{color:"#94a3b8"}}>{ex?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</div>
          </div>
          {ex&&(<div style={{borderTop:"1px solid #f1f5f9",padding:14,background:"#fafbfc",animation:"fadeIn 0.12s"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:10}}>
              <div><div style={secLbl}>Equipment</div>{(b.items||[]).map((it,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",fontSize:12}}><span>{eqMap[it.itemId]?.name||it.itemId}</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>×{it.qty}</span></div>)}</div>
              <div>{b.address&&<><div style={secLbl}>Address</div><p style={{fontSize:12,color:"#475569",marginBottom:8}}>{b.address}</p></>}{b.notes&&<><div style={secLbl}>Notes</div><p style={{fontSize:12,color:"#475569"}}>{b.notes}</p></>}</div>
            </div>
            <div style={{display:"flex",gap:6,borderTop:"1px solid #e2e8f0",paddingTop:10}}>
              <button onClick={e=>{e.stopPropagation();onEdit(b)}} style={actBtn}><Edit3 size={11}/> Edit</button>
              {b.status==="confirmed"&&<button onClick={e=>{e.stopPropagation();onCancel(b.id)}} style={{...actBtn,color:"#d97706",borderColor:"#fde68a"}}><X size={11}/> Cancel</button>}
              <button onClick={e=>{e.stopPropagation();onDelete(b.id)}} style={{...actBtn,color:"#dc2626",borderColor:"#fecaca"}}><Trash2 size={11}/> Delete</button>
            </div>
          </div>)}
        </div>
      )})}
    </div>}
  </div>);
}

// ═══ CHAINS ═══
function ChainsTab({selDate,getLoadout,calcPL,eqMap,eq,selChain,setSelChain,printPL,setModal}){
  const[subExp,setSubExp]=useState({});const[checked,setChecked]=useState({});
  const active=CHAINS.filter(c=>c!=="Unassigned");
  const show=selChain==="all"?active:[selChain];
  // Build parent->sub mapping
  const parentSubs=useMemo(()=>{const m={};eq.forEach(e=>{m[e.id]={name:e.name,subs:e.subItems||[]}});return m},[eq]);
  return (<div>
    <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
      <button onClick={()=>setSelChain("all")} style={{...cFBtn,background:selChain==="all"?"#0f172a":"white",color:selChain==="all"?"white":"#64748b",borderColor:selChain==="all"?"#0f172a":"#e2e8f0"}}>All</button>
      {active.map(c=>{const has=getLoadout(selDate,c).length>0;return (
        <button key={c} onClick={()=>setSelChain(c)} style={{...cFBtn,background:selChain===c?cBg(c):"white",color:selChain===c?cTxt(c):has?"#0f172a":"#cbd5e1",borderColor:selChain===c?cBg(c):has?"#e2e8f0":"#f1f5f9"}}>
          {c==="Will Call"?<Building2 size={11} style={{marginRight:3}}/>:<Truck size={11} style={{marginRight:3}}/>}{c}{has&&` (${getLoadout(selDate,c).length})`}
        </button>
      )})}
    </div>
    <div style={{display:"grid",gridTemplateColumns:selChain==="all"?"repeat(auto-fill,minmax(340px,1fr))":"1fr",gap:12}}>
      {show.map(chain=>{
        const lo=getLoadout(selDate,chain);const pl=calcPL(lo);
        return (
          <div key={chain} style={{background:"white",borderRadius:8,border:"1px solid #e2e8f0",overflow:"hidden"}}>
            <div style={{padding:"11px 14px",background:cBg(chain),color:cTxt(chain),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}>{chain==="Will Call"?<Building2 size={15}/>:<Truck size={15}/>}<span style={{fontWeight:700,fontSize:13}}>{chain}</span></div>
              <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:11,opacity:0.8}}>{lo.length} event{lo.length!==1?"s":""}</span>
              {lo.length>0&&<button onClick={()=>printPL(chain,selDate)} style={{background:"rgba(255,255,255,0.3)",border:"none",borderRadius:4,padding:"3px 6px",cursor:"pointer",display:"flex",color:"inherit"}}><Printer size={12}/></button>}</div>
            </div>
            {lo.length===0?<div style={{padding:20,textAlign:"center",color:"#cbd5e1",fontSize:12}}>No events</div>:
            <div style={{padding:12}}>
              <div style={{...secLbl,display:"flex",alignItems:"center",gap:4}}><ClipboardList size={11}/>Packing List</div>
              <div style={{background:"#f8fafc",borderRadius:6,padding:10,border:"1px solid #f1f5f9",marginBottom:12}}>
                {Object.entries(pl.parentItems).map(([id,qty])=>{
                  const pKey=chain+"_pl_"+id;const subs=parentSubs[id]?.subs||[];const subKey=chain+"_sub_"+id;
                  return (
                    <div key={id}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px solid #f1f5f9"}}>
                        <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",flex:1}}><input type="checkbox" checked={!!checked[pKey]} onChange={()=>setChecked(p=>({...p,[pKey]:!p[pKey]}))} style={{accentColor:"#16a34a"}}/>
                        <span style={{fontWeight:700,fontSize:12,opacity:checked[pKey]?0.4:1,textDecoration:checked[pKey]?"line-through":"none"}}>{eqMap[id]?.name||id}</span></label>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:12}}>×{qty}</span>
                      </div>
                      {subs.length>0&&(
                        <div style={{marginLeft:20}}>
                          <button onClick={()=>setSubExp(p=>({...p,[subKey]:!p[subKey]}))} style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"#64748b",display:"flex",alignItems:"center",gap:3,fontWeight:600,padding:"3px 0"}}>
                            {subExp[subKey]?<ChevronUp size={10}/>:<ChevronDown size={10}/>}{eqMap[id]?.name||id} Supplies
                          </button>
                          {subExp[subKey]&&subs.map(s=>{const sck=chain+"_s_"+s.id;return (
                            <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"2px 0",fontSize:10,borderBottom:"1px solid #eee"}}>
                              <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}><input type="checkbox" checked={!!checked[sck]} onChange={()=>setChecked(p=>({...p,[sck]:!p[sck]}))} style={{accentColor:"#16a34a",width:13,height:13}}/>
                              <span style={{opacity:checked[sck]?0.4:1}}>{s.name}</span></label>
                              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>×{s.totalQty}</span>
                            </div>
                          )})}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:5}}>Events</div>
              {lo.map(b=> (
                <div key={b.id} style={{padding:"5px 0",borderBottom:"1px solid #f1f5f9",fontSize:11}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      {b.jobId?(<a href={`https://zenbooker.com/app?view=jobs&view-job=${b.jobId}`} target="_blank" rel="noopener noreferrer" style={{fontWeight:600,color:"#3b82f6",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:2}}>{b.customerName||"Unnamed"}<ExternalLink size={8}/></a>):(<span style={{fontWeight:600}}>{b.customerName||"Unnamed"}</span>)}
                      <span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:"#f1f5f9",fontWeight:600,textTransform:"capitalize"}}>{b.eventType||"coordinated"}</span>
                    </div>
                    <span style={{color:"#64748b"}}>{to12(b.startTime)}–{to12(b.endTime)}</span>
                  </div>
                  {b.address&&<div style={{fontSize:9,color:"#94a3b8",marginTop:1}}><MapPin size={8}/> {b.address}</div>}
                </div>
              ))}
            </div>}
          </div>
        );
      })}
    </div>
  </div>);
}

// ═══ SCHEDULE BOARD ═══
function SchedTab({selDate,bk,eqMap,showTravel,showSetup}){
  const chains=CHAINS.filter(c=>c!=="Unassigned");
  const dayBk=bk.filter(b=>b.status==="confirmed"&&b.eventDate<=selDate&&(b.endDate||b.eventDate)>=selDate);
  const startH=6;const endH=23;const totalMin=(endH-startH)*60;
  const pxPerMin=1.2;const totalPx=totalMin*pxPerMin;
  const[popup,setPopup]=useState(null);
  const hours=[];for(let h=startH;h<=endH;h++)hours.push(h);
  const yPos=(min)=>(min-startH*60)*pxPerMin;

  const getSetup=(b)=>{
    const et=b.eventType;
    if(et==="willcall") return {before:0,after:0};
    if(et==="dropoff") return {before:15,after:0};
    if(et==="pickup") return {before:0,after:15};
    // coordinated or default: check custom times from equipment items
    let maxSetup=0;let maxCleanup=0;let hasCustomSetup=false;let hasCustomCleanup=false;
    (b.items||[]).forEach(it=>{
      const e=eqMap[it.itemId];
      if(e?.customSetupMin!=null){hasCustomSetup=true;maxSetup=Math.max(maxSetup,e.customSetupMin)}
      if(e?.customCleanupMin!=null){hasCustomCleanup=true;maxCleanup=Math.max(maxCleanup,e.customCleanupMin)}
    });
    return {before:hasCustomSetup?maxSetup:45,after:hasCustomCleanup?maxCleanup:45};
  };
  const TRAVEL_MIN=30;

  return (<div>
    <div style={{background:"white",borderRadius:8,border:"1px solid #e2e8f0",overflow:"auto"}}>
      <div style={{display:"grid",gridTemplateColumns:`50px repeat(${chains.length},1fr)`,minWidth:chains.length*110+50}}>
        <div style={{padding:6,background:"#f8fafc",borderBottom:"2px solid #e2e8f0",fontSize:10,fontWeight:700,color:"#64748b"}}>Time</div>
        {chains.map(c=> (<div key={c} style={{padding:6,background:"#f8fafc",borderBottom:"2px solid #e2e8f0",textAlign:"center",borderLeft:"1px solid #f1f5f9"}}><span style={{display:"inline-block",padding:"2px 6px",borderRadius:4,background:cBg(c),color:cTxt(c),fontWeight:700,fontSize:9}}>{c==="Will Call"?"Will Call":c}</span></div>) )}
        <div style={{position:"relative",height:totalPx}}>
          {hours.map(h=> (<div key={h} style={{position:"absolute",top:yPos(h*60),left:0,right:0,padding:"0 4px",fontSize:9,color:"#94a3b8",fontFamily:"'JetBrains Mono',monospace"}}>{h>12?h-12:h}{h>=12?"p":"a"}</div>) )}
          {hours.map(h=> (<div key={"l"+h} style={{position:"absolute",top:yPos(h*60),left:0,right:0,borderBottom:"1px solid #f1f5f9",height:0}}/>) )}
        </div>
        {chains.map(c=>{
          const evts=dayBk.filter(b=>b.chain===c).sort((a,b)=>(a.startTime||"").localeCompare(b.startTime||""));
          return (
            <div key={c} style={{position:"relative",height:totalPx,borderLeft:"1px solid #f1f5f9"}}>
              {hours.map(h=> (<div key={"g"+h} style={{position:"absolute",top:yPos(h*60),left:0,right:0,borderBottom:"1px solid #f1f5f9",height:0}}/>) )}
              {evts.map((b,bi)=>{
                const s=toMin(b.startTime);const e=toMin(b.endTime);
                const su=getSetup(b);
                return (
                  <div key={b.id}>
                    {/* Travel block */}
                    {showTravel&&bi===0&&(<div style={{position:"absolute",top:yPos(Math.max(s-su.before-TRAVEL_MIN,startH*60)),left:3,right:3,height:TRAVEL_MIN*pxPerMin,background:"#f1f5f9",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#64748b",border:"1px solid #e2e8f0",overflow:"hidden"}}><Truck size={9} style={{marginRight:2}}/>Travel</div>)}
                    {showTravel&&bi>0&&(<div style={{position:"absolute",top:yPos(toMin(evts[bi-1].endTime)+getSetup(evts[bi-1]).after),left:3,right:3,height:Math.min(TRAVEL_MIN,Math.max((s-su.before-toMin(evts[bi-1].endTime)-getSetup(evts[bi-1]).after),0))*pxPerMin||TRAVEL_MIN*pxPerMin,background:"#f1f5f9",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#64748b",border:"1px solid #e2e8f0",overflow:"hidden"}}><Truck size={9} style={{marginRight:2}}/>Travel</div>)}
                    {/* Setup */}
                    {showSetup&&su.before>0&&(<div style={{position:"absolute",top:yPos(s-su.before),left:3,right:3,height:su.before*pxPerMin,background:"transparent",borderRadius:3,border:`1px dashed ${cBg(c)}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#1e293b"}}>{su.before}m Setup</div>)}
                    {/* Event */}
                    <div onClick={()=>setPopup(popup===b.id?null:b.id)} style={{position:"absolute",top:yPos(s),left:3,right:3,height:Math.max((e-s)*pxPerMin,20),background:cBg(c)+"33",border:`2px solid ${cBg(c)}`,borderRadius:4,padding:"2px 4px",overflow:"hidden",cursor:"pointer",fontSize:9}}>
                      <div style={{fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.customerName||"Event"}</div>
                      <div style={{opacity:0.7,fontSize:8}}>{to12(b.startTime)}–{to12(b.endTime)}</div>
                      <div style={{fontSize:7,textTransform:"capitalize",opacity:0.6}}>{b.eventType||"coord."}</div>
                    </div>
                    {/* Event popup */}
                    {popup===b.id&&(<div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:yPos(s)+Math.max((e-s)*pxPerMin,20)+4,left:0,right:0,zIndex:50,background:"white",border:"1px solid #e2e8f0",borderRadius:6,boxShadow:"0 6px 20px rgba(0,0,0,0.12)",padding:10,fontSize:11}}>
                      <div style={{fontWeight:700,marginBottom:4}}>{b.customerName||"Unnamed"}</div>
                      {b.address&&<div style={{fontSize:10,color:"#64748b",marginBottom:4}}><MapPin size={9}/> {b.address}</div>}
                      <div style={secLbl}>Equipment</div>
                      {(b.items||[]).map((it,i)=> (<div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"2px 0"}}><span>{eqMap[it.itemId]?.name||it.itemId}</span><span style={{fontWeight:600}}>×{it.qty}</span></div>) )}
                      <button onClick={()=>setPopup(null)} style={{marginTop:6,fontSize:10,padding:"3px 8px",borderRadius:4,border:"1px solid #e2e8f0",background:"white",cursor:"pointer"}}>Close</button>
                    </div>)}
                    {/* Cleanup */}
                    {showSetup&&su.after>0&&(<div style={{position:"absolute",top:yPos(e),left:3,right:3,height:su.after*pxPerMin,background:"transparent",borderRadius:3,border:`1px dashed ${cBg(c)}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#1e293b"}}>{su.after}m Cleanup</div>)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  </div>);
}

// ═══ EQUIPMENT ═══
function EqTab({eq,ue,onEdit,search,setSearch,expRows,togRow,setModal}){
  const fil=eq.filter(e=>e.name.toLowerCase().includes(search.toLowerCase()));
  return (<div>
    <div style={{position:"relative",maxWidth:280,marginBottom:10}}><Search size={13} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:"#94a3b8"}}/><input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",padding:"6px 8px 6px 28px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,outline:"none"}}/></div>
    <div style={{background:"white",borderRadius:8,border:"1px solid #e2e8f0",overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{background:"#f8fafc"}}>
        <th style={{...thS,width:28}}></th><th style={thS}>Name</th><th style={{...thS,textAlign:"center"}}>Total</th><th style={{...thS,textAlign:"center"}}>Out of Service</th><th style={{...thS,textAlign:"center"}}>Issue Flag</th><th style={{...thS,textAlign:"center"}}>Available</th><th style={{...thS,textAlign:"center"}}>Status</th><th style={{...thS,textAlign:"center"}}>Actions</th>
      </tr></thead>
        {fil.map((item,idx)=>{
          const exp=expRows[item.id];const av=item.totalQty-item.outOfService-item.issueFlag;
          return (
            <tbody key={item.id}>
              <tr style={{borderBottom:"1px solid #f1f5f9",background:idx%2===0?"white":"#fafbfc",opacity:item.isActive?1:0.5}}>
                <td style={{padding:"5px 4px 5px 8px"}}><button onClick={()=>togRow(item.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",display:"flex"}}>{exp?<ChevronUp size={13}/>:<ChevronDown size={13}/>}</button></td>
                <td style={{padding:"7px 10px",fontWeight:600}}>{item.name}</td>
                <td style={{...tdC,fontFamily:"'JetBrains Mono',monospace"}}>{item.totalQty}</td>
                <td style={tdC}><button onClick={()=>setModal({type:"oosDetails",data:item})} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:item.outOfService>0?"#dc2626":"#cbd5e1",fontWeight:600}}>{item.outOfService}</button></td>
                <td style={tdC}><button onClick={()=>setModal({type:"issueFlags",data:item})} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:item.issueFlag>0?"#d97706":"#cbd5e1",fontWeight:600,display:"inline-flex",alignItems:"center",gap:2}}>{item.issueFlag>0&&<Flag size={10} color="#d97706"/>}{item.issueFlag}</button></td>
                <td style={{...tdC,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:av<=0?"#dc2626":"#16a34a"}}>{av}</td>
                <td style={tdC}><span style={{padding:"2px 6px",borderRadius:12,fontSize:10,fontWeight:600,background:item.isActive?"#f0fdf4":"#fef2f2",color:item.isActive?"#16a34a":"#dc2626",border:`1px solid ${item.isActive?"#bbf7d0":"#fecaca"}`}}>{item.isActive?"Active":"Off"}</span></td>
                <td style={tdC}><div style={{display:"flex",gap:3,justifyContent:"center"}}>
                  <button onClick={()=>onEdit(item)} style={smBtn}><Edit3 size={11}/></button>
                  <button onClick={()=>ue(eq.map(e=>e.id===item.id?{...e,isActive:!e.isActive}:e))} style={{...smBtn,color:item.isActive?"#d97706":"#16a34a"}}>{item.isActive?<X size={11}/>:<Check size={11}/>}</button>
                </div></td>
              </tr>
              {exp&&(item.subItems||[]).map(sub=>{const sa=sub.totalQty-sub.outOfService-sub.issueFlag;return (
                <tr key={sub.id} style={{background:"#f8fafc",borderBottom:"1px solid #f1f5f9",fontSize:11}}>
                  <td></td><td style={{padding:"5px 10px 5px 26px",color:"#475569"}}>↳ {sub.name}</td>
                  <td style={{...tdC,fontFamily:"'JetBrains Mono',monospace"}}>{sub.totalQty}</td>
                  <td style={tdC}><button onClick={()=>setModal({type:"oosDetails",data:sub,parentId:item.id})} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:4,padding:"1px 5px",cursor:"pointer",fontSize:11,color:sub.outOfService>0?"#dc2626":"#cbd5e1"}}>{sub.outOfService}</button></td>
                  <td style={tdC}><button onClick={()=>setModal({type:"issueFlags",data:sub,parentId:item.id})} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:4,padding:"1px 5px",cursor:"pointer",fontSize:11,color:sub.issueFlag>0?"#d97706":"#cbd5e1",display:"inline-flex",alignItems:"center",gap:2}}>{sub.issueFlag>0&&<Flag size={9} color="#d97706"/>}{sub.issueFlag}</button></td>
                  <td style={{...tdC,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:sa<=0?"#dc2626":"#16a34a"}}>{sa}</td>
                  <td style={tdC}><span style={{padding:"1px 4px",borderRadius:8,fontSize:9,fontWeight:600,background:sub.isActive?"#f0fdf4":"#fef2f2",color:sub.isActive?"#16a34a":"#dc2626"}}>{sub.isActive?"Active":"Off"}</span></td>
                  <td></td>
                </tr>
              )})}
            </tbody>
          );
        })}
      </table>
    </div>
  </div>);
}

// ═══ MODALS ═══
function BkModal({data,eq,onSave,onClose,selDate}){
  const[f,setF]=useState({id:data?.id||null,jobId:data?.jobId||"",customerName:data?.customerName||"",eventDate:data?.eventDate||selDate,endDate:data?.endDate||"",startTime:data?.startTime||"10:00",endTime:data?.endTime||"14:00",chain:data?.chain||"Unassigned",status:data?.status||"confirmed",eventType:data?.eventType||"coordinated",items:data?.items||[],subItems:data?.subItems||[],notes:data?.notes||"",address:data?.address||""});
  const[addId,setAddId]=useState("");const[addQty,setAddQty]=useState(1);
  const addItem=()=>{if(!addId)return;const ex=f.items.find(i=>i.itemId===addId);if(ex){setF({...f,items:f.items.map(i=>i.itemId===addId?{...i,qty:i.qty+addQty}:i)})}else{setF({...f,items:[...f.items,{itemId:addId,qty:addQty}]})}setAddId("");setAddQty(1)};
  return (
    <div style={ov} onClick={onClose}><div style={mBox} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h2 style={{fontSize:15,fontWeight:700}}>{data?.id?"Edit":"New"} Booking</h2><button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8"}}><X size={16}/></button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:10}}>
        <div><label style={lbl}>Zenbooker Job ID</label><input value={f.jobId} onChange={e=>setF({...f,jobId:e.target.value})} placeholder="ZB-XXXX" style={inp}/></div>
        <div><label style={lbl}>Customer Name</label><input value={f.customerName} onChange={e=>setF({...f,customerName:e.target.value})} style={inp}/></div>
        <div><label style={lbl}>Event Date *</label><input type="date" value={f.eventDate} onChange={e=>setF({...f,eventDate:e.target.value})} style={inp}/></div>
        <div><label style={lbl}>End Date (multi-day)</label><input type="date" value={f.endDate} onChange={e=>setF({...f,endDate:e.target.value})} style={inp}/></div>
        <div><label style={lbl}>Start Time</label><input type="time" value={f.startTime} onChange={e=>setF({...f,startTime:e.target.value})} style={inp}/></div>
        <div><label style={lbl}>End Time</label><input type="time" value={f.endTime} onChange={e=>setF({...f,endTime:e.target.value})} style={inp}/></div>
        <div><label style={lbl}>Event Type *</label><select value={f.eventType} onChange={e=>{const v=e.target.value;setF({...f,eventType:v,chain:v==="willcall"?"Will Call":f.chain==="Will Call"?"Unassigned":f.chain})}} style={inp}>{EVENT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
        <div><label style={lbl}>Chain</label><select value={f.chain} onChange={e=>setF({...f,chain:e.target.value})} style={inp} disabled={f.eventType==="willcall"}>{CHAINS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
        <div style={{gridColumn:"1/-1"}}><label style={lbl}>Address</label><input value={f.address} onChange={e=>setF({...f,address:e.target.value})} placeholder="Event address..." style={inp}/></div>
      </div>
      <div style={{marginBottom:10}}>
        <label style={lbl}>Equipment *</label>
        <div style={{display:"flex",gap:5,marginBottom:5}}>
          <select value={addId} onChange={e=>setAddId(e.target.value)} style={{...inp,flex:1}}><option value="">Select...</option>{eq.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <input type="number" min="1" value={addQty} onChange={e=>setAddQty(parseInt(e.target.value)||1)} style={{...inp,width:55,textAlign:"center"}}/>
          <button onClick={addItem} style={{background:"#0f172a",color:"white",border:"none",borderRadius:5,padding:"0 11px",cursor:"pointer"}}><Plus size={13}/></button>
        </div>
        {f.items.length>0&&<div style={{background:"#f8fafc",borderRadius:6,padding:8,border:"1px solid #f1f5f9"}}>
          {f.items.map(it=>{const e=eq.find(x=>x.id===it.itemId);return (
            <div key={it.itemId} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
              <span style={{fontWeight:500}}>{e?.name||it.itemId}</span>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <input type="number" min="1" value={it.qty} onChange={e=>setF({...f,items:f.items.map(i=>i.itemId===it.itemId?{...i,qty:parseInt(e.target.value)||1}:i)})} style={{width:42,textAlign:"center",border:"1px solid #e2e8f0",borderRadius:3,padding:"2px",fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}/>
                <button onClick={()=>setF({...f,items:f.items.filter(i=>i.itemId!==it.itemId)})} style={{background:"none",border:"none",cursor:"pointer",color:"#dc2626"}}><X size={12}/></button>
              </div>
            </div>
          )})}
        </div>}
      </div>
      <div style={{marginBottom:10}}><label style={lbl}>Notes</label><textarea value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} rows={2} style={{...inp,resize:"vertical"}}/></div>
      <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"7px 14px",borderRadius:6,border:"1px solid #e2e8f0",background:"white",cursor:"pointer",fontSize:12,color:"#64748b"}}>Cancel</button>
        <button onClick={()=>{if(f.eventDate&&f.items.length>0)onSave(f)}} disabled={!f.eventDate||f.items.length===0} style={{padding:"7px 14px",borderRadius:6,border:"none",background:f.eventDate&&f.items.length>0?"#0f172a":"#cbd5e1",color:"white",cursor:f.eventDate&&f.items.length>0?"pointer":"default",fontSize:12,fontWeight:600}}>{data?.id?"Update":"Create"}</button>
      </div>
    </div></div>
  );
}

function EqModal({data,onSave,onClose}){
  const[f,setF]=useState({name:data?.name||"",totalQty:data?.totalQty||1,outOfService:data?.outOfService||0,issueFlag:data?.issueFlag||0,isActive:data?.isActive!==undefined?data.isActive:true,subItems:data?.subItems||[],issueFlagItems:data?.issueFlagItems||[],outOfServiceItems:data?.outOfServiceItems||[],customSetupMin:data?.customSetupMin??null,customCleanupMin:data?.customCleanupMin??null,id:data?.id,_isEdit:!!data});
  const[newSub,setNewSub]=useState("");const[newSubQty,setNewSubQty]=useState(1);
  const addSub=()=>{if(!newSub.trim())return;const sid=(f.id||"new")+"_sub_"+Date.now();setF({...f,subItems:[...f.subItems,{id:sid,name:newSub.trim(),totalQty:newSubQty,outOfService:0,issueFlag:0,isActive:true,issueFlagItems:[],outOfServiceItems:[]}]});setNewSub("");setNewSubQty(1)};
  return (
    <div style={ov} onClick={onClose}><div style={{...mBox,maxWidth:480}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h2 style={{fontSize:15,fontWeight:700}}>{data?"Edit":"Add"} Equipment</h2><button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8"}}><X size={16}/></button></div>
      <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:14}}>
        <div><label style={lbl}>Name *</label><input value={f.name} onChange={e=>setF({...f,name:e.target.value})} style={inp} disabled={!!data}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <div><label style={lbl}>Total Qty</label><input type="number" min="0" value={f.totalQty} onChange={e=>setF({...f,totalQty:parseInt(e.target.value)||0})} style={inp}/></div>
          <div><label style={lbl}>Out of Service</label><input type="number" min="0" value={f.outOfService} onChange={e=>setF({...f,outOfService:parseInt(e.target.value)||0})} style={inp}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <div><label style={lbl}>Custom Setup Time (min)</label><input type="number" min="0" placeholder="Default: 45" value={f.customSetupMin??""} onChange={e=>{const v=e.target.value;setF({...f,customSetupMin:v===""?null:parseInt(v)||0})}} style={inp}/></div>
          <div><label style={lbl}>Custom Cleanup Time (min)</label><input type="number" min="0" placeholder="Default: 45" value={f.customCleanupMin??""} onChange={e=>{const v=e.target.value;setF({...f,customCleanupMin:v===""?null:parseInt(v)||0})}} style={inp}/></div>
        </div>
        <p style={{fontSize:9,color:"#94a3b8",marginTop:-4}}>Leave blank to use the 45-minute default. When multiple items are on one booking, the longest custom time applies.</p>
      </div>
      {/* Sub-items */}
      <div style={{marginBottom:14}}>
        <div style={lbl}>Sub-Items / Supplies ({f.subItems.length})</div>
        {f.subItems.length>0&&<div style={{background:"#f8fafc",borderRadius:6,padding:8,border:"1px solid #f1f5f9",marginBottom:6,maxHeight:160,overflowY:"auto"}}>
          {f.subItems.map((s,i)=> (
            <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:"1px solid #f1f5f9",fontSize:11}}>
              <span>{s.name}</span>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <input type="number" min="0" value={s.totalQty} onChange={e=>{const ns=[...f.subItems];ns[i]={...ns[i],totalQty:parseInt(e.target.value)||0};setF({...f,subItems:ns})}} style={{width:40,textAlign:"center",border:"1px solid #e2e8f0",borderRadius:3,padding:"1px",fontSize:11}}/>
                <button onClick={()=>setF({...f,subItems:f.subItems.filter((_,j)=>j!==i)})} style={{background:"none",border:"none",cursor:"pointer",color:"#dc2626"}}><X size={11}/></button>
              </div>
            </div>
          ))}
        </div>}
        <div style={{display:"flex",gap:5}}>
          <input value={newSub} onChange={e=>setNewSub(e.target.value)} placeholder="Sub-item name..." style={{...inp,flex:1}} onKeyDown={e=>e.key==="Enter"&&addSub()}/>
          <input type="number" min="1" value={newSubQty} onChange={e=>setNewSubQty(parseInt(e.target.value)||1)} style={{...inp,width:50,textAlign:"center"}}/>
          <button onClick={addSub} style={{background:"#475569",color:"white",border:"none",borderRadius:5,padding:"0 10px",cursor:"pointer",fontSize:11}}><Plus size={12}/></button>
        </div>
      </div>
      <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"7px 14px",borderRadius:6,border:"1px solid #e2e8f0",background:"white",cursor:"pointer",fontSize:12,color:"#64748b"}}>Cancel</button>
        <button onClick={()=>{if(f.name)onSave(f)}} style={{padding:"7px 14px",borderRadius:6,border:"none",background:f.name?"#0f172a":"#cbd5e1",color:"white",cursor:f.name?"pointer":"default",fontSize:12,fontWeight:600}}>{data?"Update":"Add"}</button>
      </div>
    </div></div>
  );
}

function IFModal({item,eq,ue,onClose,notify}){
  const[note,setNote]=useState("");const[flagQty,setFlagQty]=useState(1);const flags=item.issueFlagItems||[];
  const updateItem=(fn)=>{ue(eq.map(e=>{if(e.id===item.id)return fn(e);const si=(e.subItems||[]).findIndex(s=>s.id===item.id);if(si>=0){const ss=[...e.subItems];ss[si]=fn(ss[si]);return{...e,subItems:ss}}return e}))};
  const addFlag=()=>{if(!note.trim())return;const newFlags=[];for(let i=0;i<flagQty;i++){newFlags.push({id:fid(),note:note.trim(),reportedAt:new Date().toISOString()})}updateItem(it=>({...it,issueFlag:it.issueFlag+flagQty,issueFlagItems:[...it.issueFlagItems,...newFlags]}));setNote("");setFlagQty(1);notify(`${flagQty} issue(s) flagged`)};
  const resolve=(fId,action)=>{updateItem(it=>{const nf=it.issueFlagItems.filter(f=>f.id!==fId);const flagItem=it.issueFlagItems.find(f=>f.id===fId);if(action==="clear")return{...it,issueFlag:Math.max(0,it.issueFlag-1),issueFlagItems:nf};if(action==="oos"){const oosItem={id:fid(),note:flagItem?.note||"",returnDate:"",createdAt:new Date().toISOString()};return{...it,issueFlag:Math.max(0,it.issueFlag-1),outOfService:it.outOfService+1,issueFlagItems:nf,outOfServiceItems:[...(it.outOfServiceItems||[]),oosItem]}}return it});notify(action==="clear"?"Cleared":"Moved to OOS","warning")};
  return (
    <div style={ov} onClick={onClose}><div style={{...mBox,maxWidth:460}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h2 style={{fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:5}}><Flag size={15} color="#d97706"/>{item.name} — Issues ({item.issueFlag})</h2><button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8"}}><X size={16}/></button></div>
      <div style={{display:"flex",gap:5,marginBottom:12}}>
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Describe the issue..." style={{...inp,flex:1}} onKeyDown={e=>e.key==="Enter"&&addFlag()}/>
        <input type="number" min="1" value={flagQty} onChange={e=>setFlagQty(parseInt(e.target.value)||1)} style={{...inp,width:55,textAlign:"center"}} title="Quantity"/>
        <button onClick={addFlag} style={{background:"#d97706",color:"white",border:"none",borderRadius:5,padding:"0 12px",cursor:"pointer",fontSize:12,fontWeight:600}}><Plus size={12}/> Flag</button>
      </div>
      {flags.length===0?<p style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:16}}>No issues flagged</p>:
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {flags.map(f=> (
          <div key={f.id} style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:9}}>
            <p style={{fontSize:12,marginBottom:5}}>{f.note}</p>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:9,color:"#94a3b8"}}>{new Date(f.reportedAt).toLocaleDateString()}</span>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>resolve(f.id,"clear")} style={{fontSize:10,padding:"3px 7px",borderRadius:4,border:"1px solid #bbf7d0",background:"#f0fdf4",color:"#16a34a",cursor:"pointer",fontWeight:600}}>✓ Clear</button>
                <button onClick={()=>resolve(f.id,"oos")} style={{fontSize:10,padding:"3px 7px",borderRadius:4,border:"1px solid #fecaca",background:"#fef2f2",color:"#dc2626",cursor:"pointer",fontWeight:600}}>→ Out of Service</button>
              </div>
            </div>
          </div>
        ))}
      </div>}
    </div></div>
  );
}

function OOSModal({item,eq,ue,onClose,notify}){
  const[retDate,setRetDate]=useState("");const[note,setNote]=useState("");const[oosQty,setOosQty]=useState(1);
  const oosItems=item.outOfServiceItems||[];
  const updateItem=(fn)=>{ue(eq.map(e=>{if(e.id===item.id)return fn(e);const si=(e.subItems||[]).findIndex(s=>s.id===item.id);if(si>=0){const ss=[...e.subItems];ss[si]=fn(ss[si]);return{...e,subItems:ss}}return e}))};
  const addOOS=()=>{
    const items=[];for(let i=0;i<oosQty;i++){items.push({id:fid(),note:note.trim(),returnDate:retDate,createdAt:new Date().toISOString()})}
    updateItem(it=>({...it,outOfService:it.outOfService+oosQty,outOfServiceItems:[...(it.outOfServiceItems||[]),...items]}));
    setNote("");setRetDate("");setOosQty(1);notify(`${oosQty} added to OOS`);
  };
  const retToSvc=(oosId)=>{updateItem(it=>({...it,outOfService:Math.max(0,it.outOfService-1),outOfServiceItems:(it.outOfServiceItems||[]).filter(o=>o.id!==oosId)}));notify("Returned to service")};
  return (
    <div style={ov} onClick={onClose}><div style={{...mBox,maxWidth:460}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h2 style={{fontSize:14,fontWeight:700}}>{item.name} — Out of Service ({item.outOfService})</h2><button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8"}}><X size={16}/></button></div>
      <div style={{marginBottom:10}}>
        <label style={lbl}>Issue Description</label>
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Describe the issue..." style={inp}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:12}}>
        <div><label style={lbl}>Quantity</label><input type="number" min="1" value={oosQty} onChange={e=>setOosQty(parseInt(e.target.value)||1)} style={inp}/></div>
        <div><label style={lbl}>Expected Return Date</label><input type="date" value={retDate} onChange={e=>setRetDate(e.target.value)} style={inp}/></div>
      </div>
      <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
        <button onClick={addOOS} style={{background:"#dc2626",color:"white",border:"none",borderRadius:6,padding:"8px 20px",cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>Mark Out of Service <Plus size={13}/></button>
      </div>
      {oosItems.length===0?<p style={{color:"#94a3b8",fontSize:12,textAlign:"center",padding:14}}>No detailed OOS records</p>:
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {oosItems.map(o=> (
          <div key={o.id} style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:6,padding:9}}>
            <p style={{fontSize:12,marginBottom:4}}>{o.note||"No description"}</p>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10,color:o.returnDate?"#3b82f6":"#94a3b8",fontWeight:o.returnDate?600:400}}>{o.returnDate?`Returns: ${fmtDate(o.returnDate)}`:"No return date"}</span>
              <button onClick={()=>retToSvc(o.id)} style={{fontSize:10,padding:"3px 7px",borderRadius:4,border:"1px solid #bbf7d0",background:"#f0fdf4",color:"#16a34a",cursor:"pointer",fontWeight:600}}>✓ Return to Service</button>
            </div>
          </div>
        ))}
      </div>}
    </div></div>
  );
}

// ═══ STYLES ═══
const thS={padding:"7px 8px",textAlign:"left",fontSize:10,fontWeight:600,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.3px",borderBottom:"2px solid #e2e8f0"};
const tdC={padding:"7px 8px",textAlign:"center",fontSize:12};
const inp={width:"100%",padding:"6px 8px",border:"1px solid #e2e8f0",borderRadius:5,fontSize:12,outline:"none",background:"white"};
const lbl={display:"block",fontSize:10,fontWeight:600,color:"#64748b",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.3px"};
const navBtn={background:"none",border:"1px solid #e2e8f0",borderRadius:5,padding:"3px 5px",cursor:"pointer",display:"flex",color:"#64748b"};
const topBtn={display:"flex",alignItems:"center",gap:5,background:"white",border:"1px solid #e2e8f0",borderRadius:7,padding:"7px 12px",fontSize:12,fontWeight:500,cursor:"pointer",color:"#475569"};
const actBtn={display:"flex",alignItems:"center",gap:3,padding:"5px 9px",borderRadius:5,border:"1px solid #e2e8f0",background:"white",cursor:"pointer",fontSize:11,fontWeight:500,color:"#475569"};
const smBtn={display:"flex",alignItems:"center",justifyContent:"center",width:25,height:25,borderRadius:5,border:"1px solid #e2e8f0",background:"white",cursor:"pointer",color:"#64748b"};
const fInp={border:"1px solid #e2e8f0",borderRadius:5,padding:"5px 8px",fontSize:11};
const cFBtn={padding:"5px 10px",borderRadius:14,fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid #e2e8f0",display:"flex",alignItems:"center"};
const secLbl={fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:5};
const ov={position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,animation:"fadeIn 0.12s"};
const mBox={background:"white",borderRadius:10,padding:18,maxWidth:580,width:"92%",maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"};
