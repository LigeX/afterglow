'use strict';
// One shared player preserves the soundtrack across menus and game outcomes.
(()=>{
 const track=new Audio('audio/fairy-adventure.ogg');track.loop=true;track.preload='auto';track.volume=.35;
 const button=document.querySelector('#music-toggle');let enabled=true,started=false;
 const sync=()=>{button.textContent=enabled?'Music: On':'Music: Off';button.setAttribute('aria-pressed',String(enabled));};
 const play=()=>{if(!enabled||document.hidden)return;started=true;track.play().catch(()=>{});};
 window.startCosmicMusic=play;
 // Autoplay may be blocked until the first user gesture, including on the menu.
 play();document.addEventListener('pointerdown',play,{once:true});document.addEventListener('keydown',play,{once:true});
 button.onclick=()=>{enabled=!enabled;sync();if(enabled)play();else track.pause();};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)track.pause();else if(started)play();});
 sync();
})();
