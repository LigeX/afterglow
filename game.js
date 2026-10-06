'use strict';
const W=97,H=97,CENTER=48.5,PLAYER_SPEED=10.5,ENEMY_SPEED=PLAYER_SPEED*.8,HEAD_START=0,BODY_RADIUS=.48,ARENA_RADIUS=44,VISION=8.5,VIEW_SPAN=30;
const canvas=document.querySelector('#maze'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
let grid,nav,owners,known,visible,player,enemy,target,exit,obstacles,mode='ready',elapsed=0,last=0,aiPath=[],pathTimer=0,openCount=0,scaleX=1,scaleY=1,effectTime=0,cameraSpan=VIEW_SPAN;
const minimap=document.querySelector('#minimap'),miniCtx=minimap.getContext('2d'),camera={x:0,y:0};let playerHistory=[],pointer=null;
const wisps=[{trail:[],particles:[],previous:null,emit:0},{trail:[],particles:[],previous:null,emit:0}];

const PALETTE=['#67f4d1','#050508','#ae8aff','#ff9854','#72b6ff','#b9f56c','#fa82dc','#ff4e64','#e751ff','#8065ff','#448aff','#34e7ff','#ffe45e','#ffbd45','#6de76a','#32d59e','#25b9ad','#ff7865'];
const PLAYER_COLOR_INDICES=PALETTE.map((_,i)=>i).filter(i=>i!==1);
let pickups=[],areaColors;
function updateColorLabels(){document.querySelector('#player-color').style.color=PALETTE[player.colorIndex];document.querySelector('#enemy-color').style.color='#9a91af';$('#paint').style.color=PALETTE[player.colorIndex];}
function collectColors(p,who){if(who!==1){p.colorIndex=1;return;}for(const pickup of pickups){if(pickup.active&&Math.hypot(p.x-pickup.x,p.y-pickup.y)<2.2&&free((p.x+pickup.x)/2,(p.y+pickup.y)/2)){pickup.active=false;pickupBonus+=PICKUP_SCORE;p.colorIndex=pickup.colorIndex;updateColorLabels();}}}
function spawnColors(){pickups=[];const colors=[...PLAYER_COLOR_INDICES];for(let i=colors.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[colors[i],colors[j]]=[colors[j],colors[i]];}const floor=[];for(let i=0;i<nav.length;i++)if(nav[i])floor.push(i);for(let attempt=0;attempt<5000&&pickups.length<56;attempt++){const i=floor[Math.floor(Math.random()*floor.length)],p={x:i%W+.5,y:Math.floor(i/W)+.5};if([player,enemy,exit].some(a=>Math.hypot(a.x-p.x,a.y-p.y)<4)||pickups.some(a=>Math.hypot(a.x-p.x,a.y-p.y)<3.8))continue;pickups.push({...p,colorIndex:colors[pickups.length%colors.length],active:true});}}
function drawColorOrbs(){const unit=Math.min(scaleX,scaleY);ctx.save();ctx.globalCompositeOperation='lighter';for(const pickup of pickups){if(!pickup.active)continue;const color=PALETTE[pickup.colorIndex],x=pickup.x*scaleX,y=pickup.y*scaleY,pulse=1+Math.sin(effectTime*2.5+pickup.x)*.12;const glow=ctx.createRadialGradient(x,y,0,x,y,unit*2.4*pulse);glow.addColorStop(0,color+'bb');glow.addColorStop(.35,color+'55');glow.addColorStop(1,color+'00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,unit*2.4*pulse,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=unit*1.1;ctx.beginPath();ctx.arc(x,y,unit*.85*pulse,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(x,y,unit*.2,0,Math.PI*2);ctx.fill();}ctx.restore();}


const TRAIL_SCALE=8,trailInk=document.createElement('canvas'),trailMask=document.createElement('canvas'),trailSurface=document.createElement('canvas');
for(const layer of [trailInk,trailMask,trailSurface]){layer.width=W*TRAIL_SCALE;layer.height=H*TRAIL_SCALE;}
const inkCtx=trailInk.getContext('2d'),maskCtx=trailMask.getContext('2d'),surfaceCtx=trailSurface.getContext('2d');
let trailPrevious=[null,null],trailDirty=true;
function resetPaintTrails(){trailPrevious=[null,null];trailDirty=true;inkCtx.clearRect(0,0,trailInk.width,trailInk.height);surfaceCtx.clearRect(0,0,trailSurface.width,trailSurface.height);maskCtx.clearRect(0,0,trailMask.width,trailMask.height);maskCtx.fillStyle='#ffffff';for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(!grid[index(x,y)])maskCtx.fillRect(x*TRAIL_SCALE,y*TRAIL_SCALE,TRAIL_SCALE,TRAIL_SCALE);}
function addPaintTrail(p,who){const old=trailPrevious[who-1],distance=old?Math.hypot(old.x-p.x,old.y-p.y):Infinity;if(old&&distance<.12&&old.colorIndex===p.colorIndex)return;const previous=old&&distance<1?old:p;inkCtx.save();inkCtx.globalCompositeOperation='source-over';inkCtx.lineCap='round';inkCtx.lineJoin='round';inkCtx.strokeStyle=PALETTE[p.colorIndex];inkCtx.lineWidth=4.6*TRAIL_SCALE;inkCtx.beginPath();inkCtx.moveTo(previous.x*TRAIL_SCALE,previous.y*TRAIL_SCALE);inkCtx.lineTo(p.x*TRAIL_SCALE+.001,p.y*TRAIL_SCALE);inkCtx.stroke();inkCtx.restore();trailPrevious[who-1]={x:p.x,y:p.y,colorIndex:p.colorIndex};trailDirty=true;}
function drawPaintTrails(){if(trailDirty){surfaceCtx.clearRect(0,0,trailSurface.width,trailSurface.height);surfaceCtx.globalCompositeOperation='source-over';surfaceCtx.drawImage(trailInk,0,0);surfaceCtx.globalCompositeOperation='destination-in';surfaceCtx.drawImage(trailMask,0,0);surfaceCtx.globalCompositeOperation='source-over';trailDirty=false;}ctx.save();ctx.imageSmoothingEnabled=true;const unit=Math.min(scaleX,scaleY);ctx.globalAlpha=.22;ctx.filter='blur('+Math.max(.7,unit*.32)+'px)';ctx.drawImage(trailSurface,0,0,W*scaleX,H*scaleY);ctx.filter='none';ctx.globalAlpha=.43;ctx.drawImage(trailSurface,0,0,W*scaleX,H*scaleY);ctx.restore();}



const SCORE_GLYPHS={
 '0':['01110','10001','10011','10101','11001','10001','01110'],
 '1':['00100','01100','00100','00100','00100','00100','01110'],
 '2':['01110','10001','00001','00010','00100','01000','11111'],
 '3':['11110','00001','00001','01110','00001','00001','11110'],
 '4':['00010','00110','01010','10010','11111','00010','00010'],
 '5':['11111','10000','10000','11110','00001','00001','11110'],
 '6':['01110','10000','10000','11110','10001','10001','01110'],
 '7':['11111','00001','00010','00100','01000','01000','01000'],
 '8':['01110','10001','10001','01110','10001','10001','01110'],
 '9':['01110','10001','10001','01111','00001','00001','01110'],
 'S':['01111','10000','10000','01110','00001','00001','11110'],
 'C':['01110','10001','10000','10000','10000','10001','01110'],
 'O':['01110','10001','10001','10001','10001','10001','01110'],
 'R':['11110','10001','10001','11110','10100','10010','10001'],
 'E':['11111','10000','10000','11110','10000','10000','11111']
};
function drawScoreHud(){const display=document.querySelector('#score-pixels'),hud=display.getContext('2d');display.width=68;display.height=27;hud.imageSmoothingEnabled=false;hud.clearRect(0,0,68,27);const write=(text,x,y,size,color)=>{hud.fillStyle=color;for(let n=0;n<text.length;n++){const glyph=SCORE_GLYPHS[text[n]];for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(glyph[row][col]==='1')hud.fillRect(x+(n*6+col)*size,y+row*size,size,size);}};write('SCORE',4,2,1,'#93afbc');write(String(score).padStart(5,'0'),4,11,2,'#67f4d1');}

const PICKUP_SCORE=100;
let score=0,finalScore=null,pickupBonus=0;
function calculateScore(){return (openCount?Math.round(owners.reduce((n,v)=>n+(v===1),0)/openCount*10000):0)+pickupBonus;}
function updateScore(){score=finalScore===null?calculateScore():finalScore;$('#score').textContent=score.toLocaleString('en-US');drawScoreHud();}

const index=(x,y)=>y*W+x,cell=p=>index(Math.floor(p.x),Math.floor(p.y));
function free(x,y){if(x<BODY_RADIUS||y<BODY_RADIUS||x>=W-BODY_RADIUS||y>=H-BODY_RADIUS)return false;for(let i=0;i<8;i++){const a=i*Math.PI/4;if(grid[index(Math.floor(x+Math.cos(a)*BODY_RADIUS),Math.floor(y+Math.sin(a)*BODY_RADIUS))])return false;}return grid[index(Math.floor(x),Math.floor(y))]===0;}
function neighbors(i){const x=i%W,y=Math.floor(i/W);return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].filter(([a,b])=>a>=0&&b>=0&&a<W&&b<H&&nav[index(a,b)]).map(([a,b])=>index(a,b));}
function nearest(p){const current=cell(p);if(nav[current])return current;let best=current,distance=Infinity;for(let y=Math.max(0,Math.floor(p.y)-4);y<=Math.min(H-1,Math.floor(p.y)+4);y++)for(let x=Math.max(0,Math.floor(p.x)-4);x<=Math.min(W-1,Math.floor(p.x)+4);x++)if(nav[index(x,y)]){const d=Math.hypot(x+.5-p.x,y+.5-p.y);if(d<distance){distance=d;best=index(x,y);}}return best;}
function route(start,end){const prev=new Int32Array(W*H).fill(-1),q=[start];prev[start]=start;for(let n=0;n<q.length;n++){const i=q[n];if(i===end)break;for(const j of neighbors(i))if(prev[j]===-1){prev[j]=i;q.push(j);}}if(prev[end]===-1)return [];const p=[];for(let i=end;i!==start;i=prev[i])p.push(i);return p.reverse();}
function paint(p,who){if(who!==1)return;collectColors(p,who);addPaintTrail(p,who);const radius=2.65;for(let y=Math.max(0,Math.floor(p.y-radius));y<=Math.min(H-1,Math.ceil(p.y+radius));y++)for(let x=Math.max(0,Math.floor(p.x-radius));x<=Math.min(W-1,Math.ceil(p.x+radius));x++){const i=index(x,y);if(!grid[i]&&Math.hypot(x+.5-p.x,y+.5-p.y)<=radius){owners[i]=who;areaColors[i]=p.colorIndex; }}}
function reveal(){visible.fill(0);const see=(x,y,d)=>{if(x<0||y<0||x>=W||y>=H)return;const i=index(x,y),strength=Math.min(1,Math.max(0,(VISION-d)/2));visible[i]=Math.max(visible[i],strength);known[i]=Math.max(known[i],strength);};
  // Nearby obstacles occlude unexplored terrain.
  for(let ray=0;ray<180;ray++){const angle=ray*Math.PI*2/180;for(let d=0;d<=VISION;d+=.28){const x=Math.floor(player.x+Math.cos(angle)*d),y=Math.floor(player.y+Math.sin(angle)*d);see(x,y,d);if(x<0||y<0||x>=W||y>=H||grid[index(x,y)])break;}}
}
function insidePolygon(x,y,vertices){let inside=false;for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){const a=vertices[i],b=vertices[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}

const MAP_TYPES=[{id:'atom',name:'Atomic Orbits'},{id:'knot',name:'Trefoil Knot'},{id:'star',name:'Interwoven Star'}];
let stage;
function carveDisk(p,r){for(let y=Math.max(1,Math.floor(p.y-r));y<=Math.min(H-2,Math.ceil(p.y+r));y++)for(let x=Math.max(1,Math.floor(p.x-r));x<=Math.min(W-2,Math.ceil(p.x+r));x++)if(Math.hypot(x+.5-p.x,y+.5-p.y)<=r)grid[index(x,y)]=0;}
function addMapPath(points,width=3.5){stage.paths.push({points,width});for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/.25));for(let s=0;s<=steps;s++)carveDisk({x:a.x+(b.x-a.x)*s/steps,y:a.y+(b.y-a.y)*s/steps},width);}}
function curve(fn,count=900){const points=[];for(let i=0;i<=count;i++)points.push(fn(i/count*Math.PI*2));return points;}
function rotatePoint(x,y,a){return{x:CENTER+x*Math.cos(a)-y*Math.sin(a),y:CENTER+x*Math.sin(a)+y*Math.cos(a)};}
function buildGeometry(type){stage={...MAP_TYPES[type],paths:[],rooms:[{x:CENTER,y:CENTER,r:6.5}]};const rotation=0;let main;
 if(type===0){for(let n=0;n<3;n++){const a=rotation+n*Math.PI/3,path=curve(t=>rotatePoint(36*Math.cos(t),15*Math.sin(t),a));addMapPath(path);if(n===0)main=path;addMapPath([{x:CENTER,y:CENTER},rotatePoint(0,15,a)]);}}
 else if(type===1){main=curve(t=>rotatePoint(12.5*(Math.sin(t)+2*Math.sin(2*t)),12.5*(Math.cos(t)-2*Math.cos(2*t)),rotation));addMapPath(main,3.5);for(let n=0;n<3;n++){const t=n*Math.PI*2/3;addMapPath([{x:CENTER,y:CENTER},main[Math.round(t/(Math.PI*2)*900)]]);}}
 else{const vertices=[];for(let n=0;n<=10;n++){const a=n*Math.PI/5,r=n%2?19:39;vertices.push(rotatePoint(Math.cos(a)*r,Math.sin(a)*r,rotation));}main=[];for(let i=1;i<vertices.length;i++){const a=vertices[i-1],b=vertices[i],steps=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/.25);for(let s=0;s<steps;s++)main.push({x:a.x+(b.x-a.x)*s/steps,y:a.y+(b.y-a.y)*s/steps});}main.push({...main[0]});addMapPath(main);addMapPath(curve(t=>rotatePoint(19*Math.cos(t),19*Math.sin(t),rotation)),3.5);for(let n=0;n<5;n++)addMapPath([{x:CENTER,y:CENTER},vertices[n*2+1]],3.5);}
 for(const room of stage.rooms)carveDisk(room,room.r);
 const candidates=[];for(let i=0;i<main.length-1;i++)if(Math.hypot(main[i].x-CENTER,main[i].y-CENTER)>30)candidates.push(i);const start=candidates[0];enemy={...main[start]};let ahead=start,distance=0;while(distance<7){const next=(ahead+1)%(main.length-1);distance+=Math.hypot(main[next].x-main[ahead].x,main[next].y-main[ahead].y);ahead=next;}player={...main[ahead]};exit={x:CENTER,y:CENTER};
}
function obstacleFits(x,y,r){for(let by=Math.floor(y-r);by<=Math.ceil(y+r);by++)for(let bx=Math.floor(x-r);bx<=Math.ceil(x+r);bx++){if(Math.hypot(bx+.5-x,by+.5-y)<=r&&(bx<1||by<1||bx>=W-1||by>=H-1||grid[index(bx,by)]))return false;}return true;}
function drawMapGeometry(unit){ctx.save();ctx.lineCap='round';ctx.lineJoin='round';for(const outline of [true,false]){ctx.strokeStyle=outline?'#344154':'#18222d';for(const path of stage.paths){ctx.lineWidth=unit*(path.width*2+(outline?.5:0));ctx.beginPath();ctx.moveTo(path.points[0].x*scaleX,path.points[0].y*scaleY);for(let i=1;i<path.points.length;i++)ctx.lineTo(path.points[i].x*scaleX,path.points[i].y*scaleY);ctx.stroke();}}for(const room of stage.rooms){ctx.fillStyle='#18222d';ctx.beginPath();ctx.arc(room.x*scaleX,room.y*scaleY,room.r*unit,0,Math.PI*2);ctx.fill();}ctx.restore();}




function wallComponents(){const labels=new Int32Array(W*H).fill(-1),components=[];for(let i=0;i<grid.length;i++){if(!grid[i]||labels[i]>=0)continue;const id=components.length,q=[i];labels[i]=id;for(let n=0;n<q.length;n++){const x=q[n]%W,y=Math.floor(q[n]/W);for(const [a,b] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]])if(a>=0&&b>=0&&a<W&&b<H){const j=index(a,b);if(grid[j]&&labels[j]<0){labels[j]=id;q.push(j);}}}components.push(q);}return{labels,components};}
function buildTreeMaze(){stage.geometryMask=grid.slice();stage.gates=[];stage.wallRadius=3.5;let randomState={atom:11399,knot:21026,star:28788}[stage.id];const rand=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};const opening={atom:Math.PI/2,knot:-Math.PI/2,star:Math.PI/5}[stage.id];for(let y=38;y<60;y++)for(let x=38;x<60;x++){const dx=x+.5-CENTER,dy=y+.5-CENTER,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx),difference=Math.abs(Math.atan2(Math.sin(a-opening),Math.cos(a-opening)));if(r>6.8&&r<9.2&&difference>.43)grid[index(x,y)]=1;}
 // Open every geometric ring with a short wall gate. Connected wall regions
 // leave a corridor network without a loop around an enclosed wall island.
 for(let round=0;round<80;round++){const {labels,components}=wallComponents();if(components.length===1)break;const exterior=labels[0];const islands=components.map((_,id)=>id).filter(id=>id!==exterior);const selected=islands[Math.floor(rand()*islands.length)];
 const previous=new Int32Array(W*H).fill(-1),q=[];for(const i of components[selected]){const x=i%W,y=Math.floor(i/W);if([[x+1,y],[x-1,y],[x,y+1],[x,y-1]].some(([a,b])=>a>=0&&b>=0&&a<W&&b<H&&!grid[index(a,b)])){previous[i]=i;q.push(i);}}
 for(let i=q.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[q[i],q[j]]=[q[j],q[i]];}let end=-1;for(let n=0;n<q.length&&end<0;n++){const i=q[n],x=i%W,y=Math.floor(i/W);for(const [a,b] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){if(a<0||b<0||a>=W||b>=H)continue;const j=index(a,b);if(grid[j]){if(labels[j]!==selected){previous[j]=i;end=j;break;}continue;}if(previous[j]>=0||Math.hypot(a+.5-CENTER,b+.5-CENTER)<10)continue;previous[j]=i;q.push(j);}}
 if(end<0)throw Error('Unable to open geometric loop');const gate=[];let cursor=end;while(true){gate.push({x:cursor%W+.5,y:Math.floor(cursor/W)+.5});grid[cursor]=1;if(previous[cursor]===cursor)break;cursor=previous[cursor];}stage.gates.push(gate.reverse());}
 if(wallComponents().components.length!==1)throw Error('Geometric maze still has a loop');stage.mazeNodes=[];stage.mazeEdges=[];
}

function placeLongRouteSpawns(){const origin=nearest(exit),distance=new Int32Array(W*H).fill(-1),queue=[origin];distance[origin]=0;for(let n=0;n<queue.length;n++)for(const j of neighbors(queue[n]))if(distance[j]<0){distance[j]=distance[queue[n]]+1;queue.push(j);}const lead=7,candidates=queue.filter(i=>Math.hypot(i%W+.5-CENTER,Math.floor(i/W)+.5-CENTER)>=34).sort((a,b)=>distance[b]-distance[a]);let farthest=-1,path;for(const candidate of candidates){const p=route(candidate,origin);if(p.length<=lead)continue;const i=p[lead-1];if(Math.hypot(i%W+.5-CENTER,Math.floor(i/W)+.5-CENTER)>=34){farthest=candidate;path=p;break;}}if(farthest<0)throw Error('No outer-edge starting route');enemy={x:farthest%W+.5,y:Math.floor(farthest/W)+.5};const start=path[lead-1];player={x:start%W+.5,y:Math.floor(start/W)+.5};stage.longestDistance=distance[farthest];stage.startDistance=distance[start];stage.spawnLead=lead;stage.startRadius=Math.hypot(player.x-CENTER,player.y-CENTER);stage.reachableCount=queue.length;stage.distances=distance;for(let i=0;i<nav.length;i++)if(distance[i]<0)nav[i]=0;}

function generate(mapType=Math.floor(Math.random()*MAP_TYPES.length)){score=0;finalScore=null;pickupBonus=0;$('#final-score').hidden=true;$('#overlay').classList.remove('result');document.querySelector('.board').classList.remove('completed');grid=new Uint8Array(W*H).fill(1);nav=new Uint8Array(W*H);owners=new Uint8Array(W*H);areaColors=new Uint8Array(W*H);known=new Float32Array(W*H);visible=new Float32Array(W*H);obstacles=[];
  buildGeometry(mapType);$('#map-name').textContent=stage.name;
  buildTreeMaze();
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(free(x+.5,y+.5))nav[index(x,y)]=1;
  placeLongRouteSpawns();player.colorIndex=0;enemy.colorIndex=1;spawnColors();target={...player};pointer=null;playerHistory=[{...player}];updateCamera();elapsed=0;aiPath=[];pathTimer=0;effectTime=0;mode='ready';
  for(const w of wisps){w.trail=[];w.particles=[];w.previous=null;w.emit=0;}
  openCount=grid.reduce((n,v)=>n+(v===0),0);resetPaintTrails();paint(player,1);paint(enemy,2);reveal();$('#time').textContent='00:00.0';$('#paint').textContent='0%';updateScore();$('#state').textContent='READY';updateColorLabels();
  show('Through the fog,<br>find the way out.','You are the last photon in a dying universe. Do everything you can to escape the black hole.','Escape the Black Hole!');
}
function show(title,message,button){if(mode==='ready')$('#overlay').classList.add('intro');else $('#overlay').classList.remove('intro');$('#title').innerHTML=title;$('#message').innerHTML=message;$('#start').textContent=button;$('#overlay').classList.remove('hidden');}
function start(){if(mode==='won'||mode==='lost')generate();mode='playing';target={...player};pointer=null;$('#overlay').classList.add('hidden');}
function finish(win,reason){finalScore=calculateScore();updateScore();mode=win?'won':'lost';if(win){$('#final-score').textContent='FINAL SCORE: '+finalScore.toLocaleString('en-US');$('#final-score').hidden=false;known.fill(1);visible.fill(1);updateCamera();$('#overlay').classList.add('result');document.querySelector('.board').classList.add('completed');show('You escaped as the last photon of your universe.','','PLAY AGAIN');}else{show('Escape failed. The black hole captured you!','','PLAY AGAIN');}}
function slide(p,dx,dy){if(free(p.x+dx,p.y+dy)){p.x+=dx;p.y+=dy;return;}if(free(p.x+dx,p.y))p.x+=dx;if(free(p.x,p.y+dy))p.y+=dy;}
function movePlayer(dt){const dx=target.x-player.x,dy=target.y-player.y,d=Math.hypot(dx,dy);if(d<.03)return;const amount=Math.min(d,dt*PLAYER_SPEED),steps=Math.ceil(amount/.08);for(let i=0;i<steps;i++){slide(player,dx/d*amount/steps,dy/d*amount/steps);paint(player,1);const previous=playerHistory[playerHistory.length-1];if(!previous||Math.hypot(player.x-previous.x,player.y-previous.y)>.12)playerHistory.push({...player});}reveal();updateCamera();}
function moveEnemy(dt){if(elapsed<HEAD_START){$('#state').textContent='STARTING IN '+Math.ceil(HEAD_START-elapsed)+' s';return;}$('#state').textContent='PURSUING YOU';pathTimer-=dt;
  if(pathTimer<=0){const destination=nearest(player),next=aiPath[0],offCenter=Math.hypot(enemy.x-(Math.floor(enemy.x)+.5),enemy.y-(Math.floor(enemy.y)+.5))>.01;
    if(offCenter&&next!==undefined)aiPath=[next,...route(next,destination)];
    else{const origin=nearest(enemy);aiPath=route(origin,destination);if(offCenter)aiPath.unshift(origin);}pathTimer=.65;}
  let budget=dt*ENEMY_SPEED;while(budget>0&&aiPath.length){const i=aiPath[0],x=i%W+.5,y=Math.floor(i/W)+.5,dx=x-enemy.x,dy=y-enemy.y,d=Math.hypot(dx,dy),step=Math.min(d,budget);if(d>.001)slide(enemy,dx/d*step,dy/d*step);budget-=step;paint(enemy,2);if(d<=step+.001)aiPath.shift();else break;}
}
function resolveOutcome(){if(Math.hypot(player.x-exit.x,player.y-exit.y)<1.65)finish(true,'You reached the central portal.');else if(elapsed>=HEAD_START&&Math.hypot(player.x-enemy.x,player.y-enemy.y)<.8&&free((player.x+enemy.x)/2,(player.y+enemy.y)/2))finish(false,'The pursuer caught you.');}
function resize(){const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);scaleX=canvas.width/VIEW_SPAN;scaleY=canvas.height/VIEW_SPAN;minimap.width=Math.round(150*dpr);minimap.height=Math.round(150*dpr);updateCamera();}
function updateWisp(p,w,dt){if(p===enemy){w.trail.length=0;w.emit+=dt;if(w.emit>.08){w.emit=0;const a=Math.random()*Math.PI*2;w.particles.push({x:p.x+Math.cos(a)*1.3,y:p.y+Math.sin(a)*1.3,vx:-Math.cos(a)*.65,vy:-Math.sin(a)*.65,life:.7,size:.05+Math.random()*.035});}for(const q of w.particles){q.life-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;}w.particles=w.particles.filter(q=>q.life>0).slice(-12);return;}if(!w.previous||Math.hypot(p.x-w.previous.x,p.y-w.previous.y)>2){w.trail=[];w.particles=[];w.previous={...p};}for(const point of w.trail)point.life-=dt;w.trail=w.trail.filter(point=>point.life>0);
  const dx=p.x-w.previous.x,dy=p.y-w.previous.y,moving=Math.hypot(dx,dy)>.002;if(moving){w.trail.push({x:p.x,y:p.y,life:1.05,colorIndex:p.colorIndex});if(w.trail.length>90)w.trail.shift();}w.emit+=dt;
  if(w.emit>(moving?.025:.1)){w.emit=0;w.particles.push({x:p.x+(Math.random()-.5)*.45,y:p.y+(Math.random()-.5)*.45,vx:-dx/Math.max(dt,.001)*.18+(Math.random()-.5),vy:-dy/Math.max(dt,.001)*.18+(Math.random()-.5),life:.6+Math.random()*.5,colorIndex:p.colorIndex,size:.055+Math.random()*.065});}
  for(const particle of w.particles){particle.life-=dt;particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;}w.particles=w.particles.filter(particle=>particle.life>0).slice(-70);w.previous={...p};
}
function orb(p,color,w,phase){const unit=Math.min(scaleX,scaleY),x=p.x*scaleX,y=p.y*scaleY,pulse=1+Math.sin(effectTime*3.4+phase)*.09;
  if(p===enemy){
    const radius=unit*.7*1.5*pulse;
    ctx.save();ctx.globalCompositeOperation='source-over';
    // A small capped particle field keeps the black core easy to see.
    for(const q of w.particles){ctx.globalAlpha=Math.min(1,q.life*3)*.65;ctx.fillStyle='#9183ad';ctx.beginPath();ctx.arc(q.x*scaleX,q.y*scaleY,unit*q.size,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;ctx.fillStyle='#020205';ctx.strokeStyle='#80718f';ctx.lineWidth=unit*.055;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();return;
  }
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.lineJoin='round';
  for(let i=1;i<w.trail.length;i++){const a=w.trail[i-1],b=w.trail[i],fade=Math.min(a.life,b.life)/1.05;for(const [width,alpha] of [[.9,.12],[.4,.38],[.12,.65]]){ctx.globalAlpha=fade*fade*alpha;ctx.strokeStyle=PALETTE[b.colorIndex]||color;ctx.lineWidth=unit*width*fade;ctx.beginPath();ctx.moveTo(a.x*scaleX,a.y*scaleY);ctx.lineTo(b.x*scaleX,b.y*scaleY);ctx.stroke();}}
  for(const particle of w.particles){ctx.globalAlpha=Math.min(1,particle.life*2)*.8;ctx.fillStyle=PALETTE[particle.colorIndex]||color;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=unit*.6;ctx.beginPath();ctx.arc(particle.x*scaleX,particle.y*scaleY,unit*particle.size,0,Math.PI*2);ctx.fill();}
  ctx.shadowBlur=0;ctx.globalAlpha=1;const glow=ctx.createRadialGradient(x,y,0,x,y,unit*2.6*pulse);glow.addColorStop(0,color+'99');glow.addColorStop(.3,color+'44');glow.addColorStop(1,color+'00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,unit*2.6*pulse,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=color;ctx.lineWidth=unit*.08;ctx.globalAlpha=.55;for(let i=0;i<3;i++){const angle=effectTime*(i%2?-.9:1.2)+phase+i*2.1;ctx.beginPath();ctx.ellipse(x,y,unit*.85*pulse,unit*.43,angle,angle,angle+Math.PI*1.2);ctx.stroke();}
  ctx.globalAlpha=1;const core=ctx.createRadialGradient(x-unit*.09,y-unit*.09,0,x,y,unit*.7*pulse);core.addColorStop(0,'#ffffff');core.addColorStop(.22,'#edfff9');core.addColorStop(.5,color);core.addColorStop(1,color+'00');ctx.fillStyle=core;ctx.beginPath();ctx.arc(x,y,unit*.7*pulse,0,Math.PI*2);ctx.fill();ctx.restore();
}
function updateCamera(){const overview=mode==='won';cameraSpan=overview?W:VIEW_SPAN;camera.x=overview?0:player.x-cameraSpan/2;camera.y=overview?0:player.y-cameraSpan/2;scaleX=canvas.width/cameraSpan;scaleY=canvas.height/cameraSpan;}
function screenToWorld(x,y){return {x:camera.x+x*cameraSpan,y:camera.y+y*cameraSpan};}
function drawMinimap(){const sx=minimap.width/W,sy=minimap.height/H,u=Math.min(sx,sy);miniCtx.clearRect(0,0,minimap.width,minimap.height);miniCtx.fillStyle='#09101a';miniCtx.fillRect(0,0,minimap.width,minimap.height);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=index(x,y);if(known[i]>.1){miniCtx.globalAlpha=known[i];miniCtx.fillStyle=grid[i]?'#6b7a8d':'#253746';miniCtx.fillRect(x*sx,y*sy,sx+.2,sy+.2);}}miniCtx.globalAlpha=1;
  miniCtx.lineWidth=Math.max(1.4,u*.7);miniCtx.lineJoin='round';miniCtx.lineCap='round';for(let i=1;i<playerHistory.length;i++){const a=playerHistory[i-1],b=playerHistory[i];miniCtx.strokeStyle=PALETTE[b.colorIndex]||PALETTE[0];miniCtx.beginPath();miniCtx.moveTo(a.x*sx,a.y*sy);miniCtx.lineTo(b.x*sx,b.y*sy);miniCtx.stroke();}
  miniCtx.strokeStyle='#dce5f066';miniCtx.lineWidth=1;miniCtx.setLineDash([3,3]);miniCtx.strokeRect(camera.x*sx,camera.y*sy,cameraSpan*sx,cameraSpan*sy);miniCtx.setLineDash([]);
  if(known[cell(exit)]>.1){miniCtx.strokeStyle='#f4cc7b';miniCtx.lineWidth=1.5;miniCtx.beginPath();miniCtx.arc(exit.x*sx,exit.y*sy,u*1.7,0,Math.PI*2);miniCtx.stroke();}
  for(const [p,color,r] of [[enemy,PALETTE[enemy.colorIndex],2],[player,PALETTE[player.colorIndex],2.6]]){miniCtx.fillStyle=color;miniCtx.beginPath();miniCtx.arc(p.x*sx,p.y*sy,u*r,0,Math.PI*2);miniCtx.fill();}
}


function drawExitPortal(unit){
  const x=exit.x*scaleX,y=exit.y*scaleY,pulse=1+Math.sin(effectTime*2)*.06;
  ctx.save();ctx.translate(x,y);ctx.globalCompositeOperation='lighter';
  const halo=ctx.createRadialGradient(0,0,unit*.2,0,0,unit*3.8*pulse);
  halo.addColorStop(0,'#fff1b866');halo.addColorStop(.35,'#ffd36b44');halo.addColorStop(.65,'#e9a52d20');halo.addColorStop(1,'#d98a1800');
  ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,unit*3.8*pulse,0,Math.PI*2);ctx.fill();
  ctx.rotate(effectTime*.65);ctx.lineCap='round';ctx.shadowColor='#ffd36b';ctx.shadowBlur=unit*.7;
  for(let arm=0;arm<4;arm++){
    ctx.beginPath();for(let n=0;n<=72;n++){
      const t=n/72,a=arm*Math.PI/2+t*Math.PI*2.2,r=unit*(.18+1.55*t)*pulse;
      const px=Math.cos(a)*r,py=Math.sin(a)*r*.82;
      if(n===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.strokeStyle=arm%2?'#ffe9a2':'#efb846';ctx.lineWidth=unit*(arm%2?.09:.13);ctx.stroke();
  }
  ctx.shadowBlur=unit*.5;ctx.fillStyle='#fff2c4';
  for(let n=0;n<12;n++){
    const a=n*Math.PI*2/12-effectTime*.3,r=unit*(1.85+Math.sin(effectTime*1.5+n)*.13);
    ctx.globalAlpha=.35+.35*(1+Math.sin(effectTime*2+n))/2;ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r*.82,unit*.055,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;ctx.shadowBlur=unit;ctx.beginPath();ctx.arc(0,0,unit*.17*pulse,0,Math.PI*2);ctx.fill();ctx.restore();
}
function draw(){const unit=Math.min(scaleX,scaleY);ctx.fillStyle='#10151e';ctx.fillRect(0,0,canvas.width,canvas.height);updateCamera();ctx.save();ctx.translate(-camera.x*scaleX,-camera.y*scaleY);
  drawMapGeometry(unit);for(let y=Math.max(0,Math.floor(camera.y));y<Math.min(H,Math.ceil(camera.y+cameraSpan)+1);y++)for(let x=Math.max(0,Math.floor(camera.x));x<Math.min(W,Math.ceil(camera.x+cameraSpan)+1);x++){const i=index(x,y);if(!stage.geometryMask[i]&&grid[i]){ctx.fillStyle='#344152';ctx.fillRect(x*scaleX,y*scaleY,scaleX+.25,scaleY+.25);}}
  drawPaintTrails();
  ctx.save();ctx.fillStyle='#344152';ctx.strokeStyle='#607188';ctx.lineWidth=unit*.16;ctx.lineJoin='round';
  for(const o of obstacles){ctx.beginPath();ctx.moveTo(o.vertices[0].x*scaleX,o.vertices[0].y*scaleY);for(let i=1;i<o.vertices.length;i++)ctx.lineTo(o.vertices[i].x*scaleX,o.vertices[i].y*scaleY);ctx.closePath();ctx.fill();ctx.stroke();}ctx.restore();
  drawExitPortal(unit);
  drawColorOrbs();orb(player,PALETTE[player.colorIndex],wisps[0],0);
  // The terrain remains hidden; only the pursuer is drawn above the fog.
  ctx.fillStyle='#070b12';for(let y=Math.max(0,Math.floor(camera.y));y<Math.min(H,Math.ceil(camera.y+cameraSpan)+1);y++)for(let x=Math.max(0,Math.floor(camera.x));x<Math.min(W,Math.ceil(camera.x+cameraSpan)+1);x++){const opacity=1-known[index(x,y)];if(opacity>.005){ctx.globalAlpha=opacity;ctx.fillRect(x*scaleX,y*scaleY,scaleX+.4,scaleY+.4);}}ctx.globalAlpha=1;
  orb(enemy,PALETTE[enemy.colorIndex],wisps[1],2);ctx.restore();
}
function frame(t){const dt=Math.min((t-last)/1000,.035)||0;last=t;if(mode==='playing'){updateCamera();if(pointer)target=screenToWorld(pointer.x,pointer.y);elapsed+=dt;movePlayer(dt);moveEnemy(dt);resolveOutcome();$('#time').textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+(elapsed%60).toFixed(1).padStart(4,'0');$('#paint').textContent=Math.round(owners.reduce((n,v)=>n+(v===1),0)/openCount*100)+'%';updateScore();}
  const fxDt=dt;effectTime+=fxDt;updateWisp(player,wisps[0],fxDt);updateWisp(enemy,wisps[1],fxDt);draw();drawMinimap();requestAnimationFrame(frame);
}
function steer(e){const r=canvas.getBoundingClientRect();pointer={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};updateCamera();target=screenToWorld(pointer.x,pointer.y);}
canvas.addEventListener('pointermove',steer);canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);steer(e);});$('#start').onclick=start;$('#reset').onclick=()=>generate();
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r')generate();});window.addEventListener('resize',resize);generate();resize();requestAnimationFrame(frame);

