/* Visual extensions for Lantern Sky. All assets are drawn locally on Canvas. */
(function () {
  'use strict';
  var P, current = null, origin = null, target = null, elapsed = 0;
  var clock = 0, nextStrike = 2, strike = null, strikes = 0, windOffset = 0;
  var moonCanvas = document.createElement('canvas'), moonKey = '', paper = new WeakMap();
  var live = null, lastAstronomy = -Infinity;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function mix(a, b, u) { return a + (b - a) * u; }
  function easing(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function copy(a) {
    if (!a) return {day:0, rain:0, snow:0, fog:0, wind:0, storm:0, cloud:0, moonlight:0, stars:1, gust:1};
    return {day:a.day, rain:a.rain, snow:a.snow ? 1 : 0, fog:a.fog ? 1 : 0, wind:a.wind || 0,
      storm:a.storm ? 1 : 0, cloud:a.cloud || 0, moonlight:a.moonVisible ? a.moon.fraction : 0, stars:a.stars, gust:a.gust || 1};
  }
  function position(pos, w, h, horizon, fallback) {
    if (!pos) return fallback;
    // Panoramic composition: south in the centre, east on the left, west on the right.
    return {x:w * (0.5 + pos.azimuth / (2 * Math.PI)), y:horizon - Math.sin(pos.altitude) * horizon * 0.88,
      visible:pos.altitude > -0.015};
  }
  function glow(g, x, y, radius, color, alpha) {
    var grad = g.createRadialGradient(x,y,0,x,y,radius);
    grad.addColorStop(0,'rgba('+color+','+alpha+')'); grad.addColorStop(1,'rgba('+color+',0)');
    g.fillStyle=grad; g.fillRect(x-radius,y-radius,radius*2,radius*2);
  }
  function bakeMoon(fraction, radius) {
    var size = Math.ceil(radius * 2 + 8), k = size + ':' + fraction.toFixed(4);
    if (k === moonKey) return; moonKey = k;
    moonCanvas.width=moonCanvas.height=size;
    var g=moonCanvas.getContext('2d'), c=size/2;
    g.translate(c,c); g.fillStyle='#f5f0df'; g.beginPath(); g.arc(0,0,radius,0,Math.PI*2); g.fill();
    for(var i=0;i<13;i++) {
      var a=i*2.39996, r=radius*Math.sqrt((i+.5)/16);
      g.fillStyle='rgba(95,100,120,.13)'; g.beginPath(); g.arc(Math.cos(a)*r,Math.sin(a)*r,radius*(.06+(i%3)*.025),0,Math.PI*2); g.fill();
    }
    g.globalCompositeOperation='destination-in'; g.beginPath();
    // Top-lit sphere. The curved terminator spans new, quarter, gibbous and full phases.
    for(var x=-radius;x<=radius;x+=.5) {
      var edge=Math.sqrt(Math.max(0,radius*radius-x*x)), y=(2*fraction-1)*edge;
      g.rect(x,-edge,.65,y+edge);
    }
    g.fill();
  }
  window.SceneFX = {
    init:function(settings) { P=settings; },
    setTarget:function(a) {
      origin=current ? Object.assign({},current) : copy(a); target=copy(a);
      if(!current) current=copy(a); elapsed=0; lastAstronomy=-Infinity;
    },
    update:function(dt) {
      clock+=dt; elapsed+=dt;
      if(target) {
        var u=easing(elapsed/Math.max(1,P.transitionSeconds));
        Object.keys(target).forEach(function(k) { current[k]=mix(origin[k],target[k],u); });
      }
      if(current) {
        var gust=P.windGusts ? 1 + P.gustStrength/100*current.gust*(.48*Math.sin(clock*.37)+.25*Math.sin(clock*.91+1)+.17*Math.sin(clock*.11)) : 1;
        windOffset += dt * current.wind * gust;
        if(current.storm>.5 && P.stormLightning && P.lightningIntensity>0) {
          nextStrike-=dt;
          if(nextStrike<=0) { strike={age:0,x:.22+.58*((Math.sin(++strikes*91.7)+1)/2)}; nextStrike=16+(Math.sin(strikes*19.1)+1)*9; }
        } else { strike=null; nextStrike=2; }
      }
      if(strike) { strike.age+=dt; if(strike.age>1.1) strike=null; }
    },
    state:function() { return current; },
    wind:function(base) {
      if(!current || !P.windGusts) return base;
      return base*Math.max(.08,1+P.gustStrength/100*current.gust*(.48*Math.sin(clock*.37)+.25*Math.sin(clock*.91+1)+.17*Math.sin(clock*.11)));
    },
    cloudOffset:function() { return windOffset; },
    nightGlow:function() { return P.ambientLanterns && current ? 1-current.day*.9 : 1; },
    daylight:function() { return P.ambientLanterns && current ? current.day : 0; },
    paperSprite:function(sprite) {
      if(paper.has(sprite)) return paper.get(sprite);
      var c=document.createElement('canvas'); c.width=sprite.c.width; c.height=sprite.c.height;
      var g=c.getContext('2d'); g.drawImage(sprite.c,0,0);
      g.globalCompositeOperation='source-atop'; g.fillStyle='rgba(98,128,147,.35)'; g.fillRect(0,0,c.width,c.height);
      paper.set(sprite,c); return c;
    },
    bodies:function(g,w,h,horizon,ratio,base) {
      if(!base) return {moon:null,sun:null};
      if(clock-lastAstronomy>=1) { live=LocalSky.snapshot() || base; lastAstronomy=clock; }
      var a=live || base, size=h*.029, moonSize=h*.026;
      var sun=position(a.sunPosition,w,h,horizon,{x:w*.72,y:h*.2,visible:true});
      var moon=position(a.moonPosition,w,h,horizon,{x:w*.8,y:h*.17,visible:a.moonVisible});
      if(!P.celestialMotion) { sun={x:w*.72,y:h*.2,visible:a.elevation>0}; moon={x:w*.8,y:h*.17,visible:a.moonVisible}; }
      if(!P.localDayNight) { sun.visible=false; moon={x:w*.8,y:h*.17,visible:true}; }
      g.save(); g.setTransform(ratio,0,0,ratio,0,0); g.beginPath();g.rect(0,0,w,horizon);g.clip();
      if(sun.visible && P.localDayNight) {
        var warm=clamp(1-a.elevation/25,0,1), color=warm>.3?'255,179,95':'255,240,190';
        glow(g,sun.x,sun.y,size*7,color,.26);
        g.fillStyle=warm>.3?'#ffcd88':'#fff6d4';g.beginPath();g.arc(sun.x,sun.y,size,0,Math.PI*2);g.fill();
      }
      if(P.localMoon && moon.visible && a.moon.fraction>.003) {
        bakeMoon(a.moon.fraction,moonSize*ratio);
        glow(g,moon.x,moon.y,moonSize*5,'207,222,255',a.moon.fraction*.18*(1-a.day*.8));
        g.save();g.translate(moon.x,moon.y);g.rotate(a.moonAngle);
        g.globalAlpha=1-a.day*.42;
        g.drawImage(moonCanvas,-moonCanvas.width/ratio/2,-moonCanvas.height/ratio/2,moonCanvas.width/ratio,moonCanvas.height/ratio);
        g.restore();
      } else moon.visible=false;
      g.restore();
      return {sun:sun,moon:moon,moonFraction:a.moon.fraction};
    },
    reflections:function(g,w,h,horizon,ratio,bodies) {
      if(!bodies) return;
      g.save(); g.setTransform(ratio,0,0,ratio,0,0);g.beginPath();g.rect(0,horizon,w,h-horizon);g.clip();
      ['sun','moon'].forEach(function(kind) {
        var body=bodies[kind];if(!body || !body.visible)return;
        var strength=kind==='sun'?.25:.16*bodies.moonFraction;
        g.fillStyle=kind==='sun'?'#ffd497':'#e2eaff';
        for(var i=0;i<42;i++) {
          var u=i/42, y=horizon+3+Math.pow(u,1.4)*(h-horizon), width=(3+u*85)*h/1080;
          var wave=.6+.4*Math.sin(clock*1.7+i*2.4);
          g.globalAlpha=strength*(1-u*.6)*wave*(1-(current?current.cloud:0)*.8);
          g.fillRect(body.x+Math.sin(clock+i)*4-width/2,y,width*wave,1+u*2);
        }
      });g.restore();
    },
    lightning:function(g,w,h,horizon,ratio) {
      if(!strike || !P.stormLightning || P.lightningIntensity<=0)return;
      var age=strike.age, pulse=Math.exp(-age*11)+.5*Math.exp(-Math.pow((age-.22)*20,2));
      var strength=P.lightningIntensity/100*pulse, x=w*strike.x;
      g.save();g.setTransform(ratio,0,0,ratio,0,0);g.beginPath();g.rect(0,0,w,horizon);g.clip();
      glow(g,x,horizon*.32,w*.7,'194,212,255',strength*.55);
      g.strokeStyle='rgba(225,234,255,'+strength+')';g.lineWidth=Math.max(.6,h/1080*1.4);
      g.beginPath();g.moveTo(x,horizon*.12);
      for(var i=1;i<8;i++)g.lineTo(x+Math.sin(i*2.6+strikes)*w*.017,horizon*(.12+i*.065));
      g.stroke();g.restore();
    },
    debug:function() { return {current:current,elapsed:elapsed,clock:clock,strike:!!strike,offset:windOffset}; }
  };
})();
