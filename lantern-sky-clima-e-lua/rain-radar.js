/* RainViewer Universal Blue palette, CC attribution in the wallpaper.
 * Positive echoes only: no echo or missing data never suppresses provider rain.
 */
(function(){
  'use strict';
  var palette=window.RainRadarPalette || [], coverageCache=new Map();
  function tile(latitude,longitude) {
    var lat=Math.max(-85,Math.min(85,latitude)),n=128;
    var wx=(longitude+180)/360*n,wy=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n;
    var x=Math.min(127,Math.max(0,Math.floor(wx))),y=Math.min(127,Math.max(0,Math.floor(wy)));
    return {x:x,y:y,px:Math.max(0,Math.min(255,Math.floor((wx-x)*256))),py:Math.max(0,Math.min(255,Math.floor((wy-y)*256))),meters:156543.03392*Math.cos(lat*Math.PI/180)/n};
  }
  async function pixels(url,signal) {
    var r=await fetch(url,{signal:signal,cache:'default'});if(!r.ok)throw new Error('Imagem de radar indisponível');
    var bitmap=await createImageBitmap(await r.blob());
    try {
      if(bitmap.width!==256 || bitmap.height!==256)throw new Error('Imagem de radar inesperada');
      var c=document.createElement('canvas');c.width=c.height=256;
      var g=c.getContext('2d',{willReadFrequently:true});g.drawImage(bitmap,0,0);
      return g.getImageData(0,0,256,256).data;
    }finally{bitmap.close();}
  }
  function dbz(r,g,b,a) {
    if(a<200)return null;
    var best=Infinity,value=null;
    palette.forEach(function(p){var d=(r-p[1])**2+(g-p[2])**2+(b-p[3])**2;if(d<best){best=d;value=p[0];}});
    return best<=256 ? value : null;
  }
  async function check(location,parentSignal,force) {
    var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},14000);
    function cancel(){controller.abort();}
    if(parentSignal){if(parentSignal.aborted)cancel();else parentSignal.addEventListener('abort',cancel,{once:true});}
    try {
      if(!Array.isArray(palette) || palette.length<20)throw new Error('Legenda de radar indisponível');
      var r=await fetch('https://api.rainviewer.com/public/weather-maps.json',{signal:controller.signal,cache:'no-store'});
      if(!r.ok)throw new Error('Radar indisponível');var meta=await r.json();
      var host=new URL(meta.host);
      if(host.protocol!=='https:' || !(host.hostname==='rainviewer.com' || host.hostname.endsWith('.rainviewer.com')))throw new Error('Origem de radar inválida');
      var frames=meta.radar && meta.radar.past;
      if(!Array.isArray(frames) || !frames.length)return {status:'unavailable'};
      var frame=frames.filter(function(f){return Number.isFinite(f.time) && typeof f.path==='string' && /^\/v2\/radar\/[\w/-]+$/.test(f.path);}).sort(function(a,b){return b.time-a.time;})[0];
      if(!frame)return {status:'unavailable'};
      var now=Date.now()/1000;
      if(now-frame.time>1200 || frame.time-now>300)return {status:'stale',time:frame.time};
      var p=tile(location.latitude,location.longitude),suffix='/256/7/'+p.x+'/'+p.y;
      var cacheID=host.origin+suffix, cached=coverageCache.get(cacheID),mask;
      if(!force && cached && Date.now()-cached.at<86400000)mask=cached.mask;
      else {mask=await pixels(host.origin+'/v2/coverage/0'+suffix+'/0/0_0.png',controller.signal);coverageCache.set(cacheID,{at:Date.now(),mask:mask});}
      var centre=(p.py*256+p.px)*4;
      if(mask[centre+3]>=64)return {status:'uncovered',time:frame.time};
      var img=await pixels(host.origin+frame.path+suffix+'/2/0_0.png',controller.signal);
      var radius=Math.min(3,Math.max(1,Math.ceil(2000/p.meters))),wet=0,checked=0,strongest=0;
      for(var dy=-radius;dy<=radius;dy++)for(var dx=-radius;dx<=radius;dx++) {
        if(dx*dx+dy*dy>radius*radius || p.px+dx<0 || p.px+dx>255 || p.py+dy<0 || p.py+dy>255)continue;
        var i=((p.py+dy)*256+p.px+dx)*4;
        if(mask[i+3]>=64)continue;
        checked++;var value=dbz(img[i],img[i+1],img[i+2],img[i+3]);
        if(value!==null && value>=15){wet++;strongest=Math.max(strongest,value);}
      }
      return {status:checked?'ok':'uncovered',time:frame.time,wet:wet>=2,dbz:strongest,
        intensity:wet>=2?Math.max(.12,Math.min(1,(strongest-10)/40)):0,radiusKm:radius*p.meters/1000};
    }catch(e){if(parentSignal && parentSignal.aborted)throw e;return {status:'unavailable'};}
    finally{clearTimeout(timeout);if(parentSignal)parentSignal.removeEventListener('abort',cancel);}
  }
  window.RainRadar={check:check,tile:tile};
})();
