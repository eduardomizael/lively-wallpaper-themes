(function (root) {
  'use strict';
  const { TAU, clamp, shotPosition } = root.CircuitEngine;
  function drawScene(ctx, system, config, rgba, nucleusSprites, oriOrbs) {
    const intensity = config.glow / 100;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    function arc(x, y, r, start, length, opacity, width = 1) {
      if (length <= 0 || opacity <= 0) return;
      ctx.beginPath(); ctx.arc(x, y, Math.max(.5, r), start, start + length);
      ctx.strokeStyle = rgba(opacity * intensity); ctx.lineWidth = width; ctx.stroke();
    }
    for (const station of system.stations.values()) {
      const opacity = system.opacity(station);
      if (opacity <= 0) continue;
      const { x, y, radius: r } = station.icon;
      const active = station.icon.id === system.current?.id;
      const charging = active && system.phase === 'charge';
      const charge = charging ? system.charge : 0;
      const rotation = system.time * .58 + station.spin;
      const hit = Math.max(0, 1 - (system.time - station.hitTime) / .42);
      const flare = Math.max(hit, station.emission / .2);
      const style = root.CircuitEngine.stationMarkerStyle(station,config.markerStyle);
      if (style >= 2 && oriOrbs?.drawStation(ctx,station,system.time,charge,flare,opacity,intensity,style)) continue;
      if (style >= 1 && nucleusSprites) {
        root.CircuitNucleus.drawStation(ctx, nucleusSprites, station, system.time, charge, flare, opacity, intensity);
        continue;
      }
      // Only a recently hit station exists here. No rings are drawn for untouched icons.
      for (let i = 0; i < 3; i++) arc(x, y, r, rotation + i * TAU / 3, .96, opacity * (.4 + flare * .5), 1.1);
      for (let i = 0; i < 2; i++) arc(x, y, r * 1.18, -rotation * .72 + i * Math.PI, .52, opacity * .3);
      for (let i = 0; i < 14; i++) {
        const lit = charging && i / 14 <= charge;
        arc(x, y, r * .82, i * TAU / 14 - Math.PI / 2, .19, opacity * (lit ? .85 : .1), lit ? 2 : .7);
      }
      ctx.strokeStyle = rgba(opacity * .3 * intensity); ctx.lineWidth = .8;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = rotation * .3 + Math.PI / 4 + i * Math.PI / 2;
        const ux = Math.cos(a), uy = Math.sin(a), rr = r * 1.29;
        ctx.moveTo(x + ux * rr - uy * 3, y + uy * rr + ux * 3);
        ctx.lineTo(x + ux * (rr + 3), y + uy * (rr + 3));
        ctx.lineTo(x + ux * rr + uy * 3, y + uy * rr - ux * 3);
      }
      ctx.stroke();
      if (charging) {
        const ignition = charge ** 5;
        arc(x, y, r * 1.07, -Math.PI / 2, charge * TAU, opacity * (.16 + charge * .35), 1.2);
        if (ignition > .1) {
          ctx.shadowColor = config.accent; ctx.shadowBlur = 12 * ignition * intensity;
          arc(x, y, r, rotation, 1.2, ignition * opacity, 2);
          ctx.shadowBlur = 0;
        }
      }
      if (flare > 0) {
        arc(x, y, r * (1 + .3 * (1 - flare)), 0, TAU, flare * opacity * .6, 1.3);
        const halo = ctx.createRadialGradient(x, y, r * .65, x, y, r * 1.65);
        halo.addColorStop(0, rgba(0)); halo.addColorStop(.5, rgba(flare * opacity * .12 * intensity)); halo.addColorStop(1, rgba(0));
        ctx.fillStyle = halo; ctx.fillRect(x - r * 1.7, y - r * 1.7, r * 3.4, r * 3.4);
      }
    }
    if (system.shot) {
      const shot = system.shot, head = shotPosition(shot);
      const dx = shot.to.x - shot.from.x, dy = shot.to.y - shot.from.y, length = Math.hypot(dx, dy);
      const tailLength = Math.min(config.trail, length * head.progress);
      const tx = head.x - dx / (length || 1) * tailLength, ty = head.y - dy / (length || 1) * tailLength;
      if (tailLength > .01 && config.shotStyle !== 1) {
        const beam = ctx.createLinearGradient(tx, ty, head.x, head.y);
        beam.addColorStop(0, rgba(0)); beam.addColorStop(.65, rgba(.35 * intensity)); beam.addColorStop(1, rgba(intensity));
        ctx.strokeStyle = beam; ctx.lineWidth = 1.6;
        ctx.shadowColor = config.accent; ctx.shadowBlur = 9 * intensity;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(head.x, head.y); ctx.stroke(); ctx.shadowBlur = 0;
      }
      if(config.shotStyle===1){
        const glow=ctx.createRadialGradient(head.x,head.y,0,head.x,head.y,12);
        glow.addColorStop(0,rgba(.65*intensity));glow.addColorStop(.3,rgba(.3*intensity));glow.addColorStop(1,rgba(0));
        ctx.fillStyle=glow;ctx.fillRect(head.x-12,head.y-12,24,24);
      }
      ctx.fillStyle = config.shotStyle===1?`rgba(220,250,255,${.9*intensity})`:rgba(.9 * intensity);
      ctx.beginPath(); ctx.arc(head.x, head.y, 2, 0, TAU); ctx.fill();
    }
    for (const p of system.particles) {
      ctx.fillStyle = rgba(clamp(p.life / p.maxLife, 0, 1) * .7 * intensity);
      ctx.fillRect(p.x, p.y, 1.3, 1.3);
    }
  }
  root.CircuitHud = { drawScene };
})(window);
