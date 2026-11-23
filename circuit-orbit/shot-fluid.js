(function(root){
  'use strict';
  const E=root.CircuitEngine;
  class ShotFluid {
    constructor(canvas,sharedFluid=null){this.canvas=canvas;this.shared=Boolean(sharedFluid);this.fluid=sharedFluid;this.width=1;this.height=1;this.puffs=[];this.time=0;this.manualUntil=0;this.activeUntil=0;}
    get active(){return Boolean((this.shared?this.time<this.activeUntil:this.fluid?.active)||this.puffs.length);}
    resize(w,h){this.width=w;this.height=h;if(!this.shared)this.fluid?.resize(w,h);this.puffs=[];}
    clear(){if(!this.shared)this.fluid?.clear();this.puffs=[];this.manualUntil=0;this.activeUntil=0;}
    ensureFluid(){if(!this.fluid){this.fluid=new root.CircuitMouseFluid.MouseFluid(this.canvas);this.fluid.resize(this.width,this.height);}}
    burst(x,y,r=18){
      if(![x,y,r].every(Number.isFinite)||x<0||y<0||x>this.width||y>this.height)return false;
      this.ensureFluid();this.manualUntil=this.time+1.6;this.activeUntil=Math.max(this.activeUntil,this.time+Math.max(2.4,this.fluid?.lifetime||2.4));
      this.emit(x,y,0,0,180,2.5,25);
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4+this.time*.7,c=Math.cos(a),s=Math.sin(a);
        this.emit(x+c*r,y+s*r,c*18,s*18,120,1.25,i%2?22:-22);
      }return true;
    }
    capture(system){return {shot:system?.shot,head:system?.shot?E.shotPosition(system.shot):null,sequence:system?.sequence};}
    emit(x,y,dx,dy,size,density,twist){
      if(this.fluid?.supported){this.fluid.inject(x,y,dx,dy,size,density,twist);return;}
      if(x<0||y<0||x>this.width||y>this.height)return;
      this.puffs.push({x,y,size:size*.45,started:this.time,density});if(this.puffs.length>96)this.puffs.shift();
    }
    update(dt,system,before,config){
      this.time+=dt;
      system=system||{shot:null,sequence:0,current:null};
      const manual=this.time<this.manualUntil,shots=config.shotStyle===1;
      if(!shots&&!manual){if(this.active)this.clear();return;}
      this.ensureFluid();
      const lifetime=Math.max(.55+config.trail/350,manual?1.6:0);
      const sharedLifetime=Math.max(2.4,lifetime);
      this.fluid.lifetime=this.shared?sharedLifetime:lifetime;
      this.puffs=this.puffs.filter(p=>this.time-p.started<lifetime);
      if(shots&&before.shot){
        this.activeUntil=Math.max(this.activeUntil,this.time+this.fluid.lifetime);
        const end=system.shot===before.shot?E.shotPosition(system.shot):before.shot.to;
        const start=before.head,dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
        const count=Math.min(24,Math.ceil(length/12));
        for(let i=1;i<=count;i++)this.emit(start.x+dx*i/count,start.y+dy*i/count,dx/count*.35,dy/count*.35,80+config.trail*.18,.42,12*Math.sin(this.time*8+i*.4));
      }
      if(shots&&system.sequence!==before.sequence&&system.current){
        const icon=system.current,r=Math.max(10,Math.min(28,icon.radius*.65));
        const until=this.manualUntil;this.burst(icon.x,icon.y,r);this.manualUntil=until;
      }
      if(!this.shared)this.fluid.update(dt,{mouseFog:true,mouseFogStrength:config.glow,accent:config.accent});
    }
    drawFallback(ctx,sprites,config){
      if(!this.puffs.length||!sprites?.length)return;
      const lifetime=this.fluid?.lifetime||(.55+config.trail/350);
      for(const p of this.puffs){const age=(this.time-p.started)/lifetime,r=p.size*(1+age*.8),index=Math.floor((this.time*.32+p.started*.17)%1*sprites.length);
        ctx.globalAlpha=Math.max(0,(1-age)**2)*config.glow/100*Math.min(.7,p.density*.35);
        ctx.drawImage(sprites[index],p.x-r,p.y-r,r*2,r*2);
      }ctx.globalAlpha=1;
    }
  }
  root.CircuitShotFluid={ShotFluid};
})(window);
