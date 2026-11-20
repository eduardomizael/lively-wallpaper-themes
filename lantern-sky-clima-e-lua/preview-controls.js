(function () {
  'use strict';
  if (!new URLSearchParams(location.search).has('preview')) return;
  var style=document.createElement('style');
  style.textContent='#previewControls{position:fixed;left:16px;top:16px;z-index:60;max-width:350px;padding:12px 16px;background:rgba(8,18,35,.88);border:1px solid #ffffff25;border-radius:12px;color:#eaf3ff;font:13px/1.7 Segoe UI,sans-serif;box-shadow:0 8px 40px #0004}#previewControls summary{cursor:pointer;font-weight:600}#previewControls label{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-top:8px}#previewControls select,#previewControls input{max-width:185px;background:#1c3048;color:#fff;border:1px solid #ffffff30;border-radius:5px;padding:4px}#previewControls small{display:block;color:#b5c8df;margin-top:10px;max-width:300px}';
  document.head.appendChild(style);
  var panel=document.createElement('details');panel.id='previewControls';panel.open=true;
  panel.innerHTML='<summary>Prévia do Lantern Sky</summary><label>Cenário <select id="previewMode"><option value="0">Condições reais</option><option value="1">Dia limpo</option><option value="2">Pôr do sol</option><option value="3">Noite limpa</option><option value="4">Chuva</option><option value="5">Tempestade</option><option value="6">Neve</option><option value="7">Neblina</option><option value="8">Lua cheia</option><option value="9">Amanhecer</option></select></label><label>Paisagem <select id="previewScenery"><option value="3">Somente céu</option><option value="1">Lago e montanhas</option><option value="0">Lago e portal</option><option value="2">Montanhas</option><option value="4">Floresta</option></select></label><label>Fase da Lua <input id="previewPhase" type="range" min="0" max="100" value="50" aria-label="Fase da Lua"></label><label>Mostrar informações <input id="previewPanel" type="checkbox" checked></label><label>Cidade <input id="previewCity" placeholder="Sua cidade" aria-label="Cidade"></label><label>País <input id="previewCountry" value="BR" maxlength="2" aria-label="País"></label><small>Esta prévia tem configurações próprias. No Lively, use Personalizar. Recolha este painel clicando no título.</small>';
  document.body.appendChild(panel);
  var sources=document.createElement('div');
  sources.innerHTML='<label>Fonte <select id="previewSource"><option value="0">WeatherAPI + reserva</option><option value="1">Open-Meteo</option></select></label><label>Chave WeatherAPI <input id="previewKey" type="password" autocomplete="off" placeholder="Opcional" aria-label="Chave WeatherAPI"></label><label>Radar de chuva <input id="previewRadar" type="checkbox" checked></label>';
  panel.insertBefore(sources,panel.querySelector('small'));
  document.getElementById('previewSource').addEventListener('input',function(e){livelyPropertyListener('weatherProvider',e.target.value);});
  document.getElementById('previewKey').addEventListener('input',function(e){livelyPropertyListener('weatherApiKey',e.target.value);});
  document.getElementById('previewRadar').addEventListener('input',function(e){livelyPropertyListener('radarEnabled',e.target.checked);});
  [['previewMode','demoMode'],['previewScenery','scenery'],['previewPhase','demoMoonPhase'],['previewCity','localCity'],['previewCountry','localCountry']].forEach(function(pair){
    document.getElementById(pair[0]).addEventListener('input',function(e){livelyPropertyListener(pair[1],e.target.value);});
  });
  document.getElementById('previewPanel').addEventListener('input',function(e){livelyPropertyListener('localStatus',e.target.checked);});
  document.getElementById('previewMode').value='2';
  livelyPropertyListener('transitionSeconds',3);
  livelyPropertyListener('demoMode',2);
})();
