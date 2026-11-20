/* WeatherAPI / Open-Meteo with optional RainViewer positive-echo assistance. */
(function () {
  'use strict';
  var settings,changed,timer,debounce,request,radarRequest,generation=0;
  var location=null,weather=null,fetched=0,attempted=0,message='',sourceNote='',choices=[];
  var radar=null,radarAttempted=0,cacheKey='lantern-sky-local-v1',mustRefresh=false;
  function limit(n,a,b){return Math.max(a,Math.min(b,n));}
  function key(){return [settings.localCity.trim().toLowerCase(),settings.localCountry.trim().toUpperCase(),settings.localResult].join('|');}
  function interval(){return limit(Number(settings.weatherInterval)||30,5,180)*60000;}
  function emit(){if(changed)changed();}
  function validLocation(l){return l && Number.isFinite(l.latitude) && Math.abs(l.latitude)<=90 && Number.isFinite(l.longitude) && Math.abs(l.longitude)<=180;}
  function validWeather(w){return WeatherSources.valid(w) && typeof w.time==='string';}
  function active(){return settings.weatherAuto && !settings.demoMode && settings.localCity.trim();}
  function save(){
    try {localStorage.setItem(cacheKey,JSON.stringify({key:key(),location:location,weather:weather,fetched:fetched,provider:settings.weatherProvider,hasWeatherAPIKey:!!settings.weatherApiKey.trim()}));}catch(_){}
  }
  function restore(){
    try {
      var c=JSON.parse(localStorage.getItem(cacheKey));
      if(c && c.key===key() && validLocation(c.location)) {
        location=c.location;
        var same=(c.provider===settings.weatherProvider && c.hasWeatherAPIKey===!!settings.weatherApiKey.trim()) || (c.provider===undefined && !settings.weatherApiKey.trim());
        if(same && validWeather(c.weather) && Number.isFinite(c.fetched) && c.fetched<=Date.now()) {weather=c.weather;fetched=c.fetched;mustRefresh=!Number.isFinite(weather.data_epoch);}
      }
    }catch(_){}
  }
  function abortRequests(){
    if(request)request.abort();if(radarRequest)radarRequest.abort();request=radarRequest=null;
  }
  async function refreshRadar(force){
    if(!active() || !settings.radarEnabled || !location || radarRequest)return;
    var wait=limit(settings.radarInterval || 5,5,30)*60000;
    if(!force && Date.now()-radarAttempted<wait)return;
    var token=generation,controller=new AbortController();radarRequest=controller;radarAttempted=Date.now();
    try {
      var result=await RainRadar.check(location,controller.signal,force);
      if(token===generation){
        // Retain a still-recent positive frame during a temporary network outage.
        if(result.status!=='unavailable' || !radar || Date.now()/1000-radar.time>1200)radar=result;
      }
    }catch(_){if(token===generation && !radar)radar={status:'unavailable'};}
    finally{if(token===generation){radarRequest=null;emit();}}
  }
  async function refresh(force){
    if(!active()){emit();return;}
    if(request || (!force && Date.now()-attempted<Math.min(interval(),300000)))return;
    if(!force && !mustRefresh && weather && Date.now()-fetched<interval())return;
    var token=generation,controller=new AbortController();request=controller;attempted=Date.now();message='Consultando…';emit();
    try {
      if(!location){
        var country=settings.localCountry.trim().toUpperCase();
        if(country && !/^[A-Z]{2}$/.test(country))throw new Error('País: use duas letras, como BR ou PT');
        var geo=await WeatherSources.json('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(settings.localCity.trim())+'&count=10&language=pt&format=json'+(country?'&countryCode='+country:''),controller.signal);
        if(token!==generation)return;
        choices=(geo.results||[]).filter(validLocation);
        var selected=Math.round(limit(settings.localResult,1,10))-1;
        if(!choices.length)throw new Error('Localidade não encontrada. Revise cidade e país');
        if(!choices[selected])throw new Error('Há '+choices.length+' resultado(s). Reduza “Local encontrado”');
        location=choices[selected];save();emit();
      }
      refreshRadar(false);
      var result,note='';
      if(settings.weatherProvider===0){
        if(settings.weatherApiKey.trim()){
          try{result=await WeatherSources.weatherAPI(location,settings.weatherApiKey.trim(),controller.signal);}
          catch(e){if(token!==generation || controller.signal.aborted)return;note=e.message+'; usando reserva Open-Meteo.';}
        } else note='WeatherAPI sem chave configurada; usando Open-Meteo.';
      }
      if(!result)result=await WeatherSources.openMeteo(location,controller.signal);
      if(token!==generation)return;
      if(!validWeather(result))throw new Error('Resposta meteorológica incompleta');
      weather=result;fetched=Date.now();mustRefresh=false;sourceNote=note;message='';save();
    }catch(e){
      if(token===generation)message='Consulta falhou: '+e.message+'. Nova tentativa em até 5 min.';
    }finally{if(token===generation){request=null;emit();}}
  }
  function configure(reset,forceWeather){
    generation++;var busy=!!request;abortRequests();clearTimeout(debounce);
    if(busy){attempted=0;message='';}
    if(reset){location=weather=radar=null;mustRefresh=false;fetched=attempted=radarAttempted=0;choices=[];message=sourceNote='';restore();}
    if(forceWeather){fetched=attempted=0;message=sourceNote='';}
    emit();
    debounce=setTimeout(function(){refresh(!!forceWeather);refreshRadar(false);},1000);
  }
  function recentRadar(){
    return settings.radarEnabled && radar && radar.status==='ok' && Date.now()/1000-radar.time<=1200 && radar.time-Date.now()/1000<=300 ? radar : null;
  }
  function description(code){
    if(code<=3)return ['Céu limpo','Predominantemente limpo','Parcialmente nublado','Encoberto'][code];
    if(code===45 || code===48)return 'Neblina';if(code>=51 && code<=57)return 'Garoa';
    if(code>=61 && code<=67)return 'Chuva';if(code>=71 && code<=77)return 'Neve';
    if(code>=80 && code<=82)return 'Pancadas de chuva';if(code===85 || code===86)return 'Pancadas de neve';
    return code>=95?'Trovoada':'Condição não identificada';
  }
  function condition(){var r=recentRadar();return r && r.wet?'Chuva nas proximidades (radar)':weather?(weather.description || description(weather.weather_code)):'Aguardando dados meteorológicos';}
  function dataTime(epoch){
    if(!Number.isFinite(epoch))return 'horário não informado';
    try{return new Date(epoch*1000).toLocaleString('pt-BR',{timeZone:weather && weather.timezone || location && location.timezone || 'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
    catch(_){return new Date(epoch*1000).toISOString().slice(0,16).replace('T',' ')+' UTC';}
  }
  function stale(){return weather && (Date.now()-fetched>interval()+300000 || Number.isFinite(weather.data_epoch) && Date.now()/1000-weather.data_epoch>5400);}
  function radarLabel(){
    if(!settings.radarEnabled)return '';
    if(!radar)return 'Radar: aguardando consulta';
    if(radar.status==='uncovered')return 'Radar: sem cobertura no ponto escolhido';
    if(radar.status==='unavailable')return 'Radar: indisponível; mantida a condição da fonte meteorológica';
    if(!recentRadar())return 'Radar: quadro antigo; mantida a condição da fonte meteorológica';
    return 'Radar (quadro '+dataTime(radar.time)+'): '+(radar.wet?'eco de chuva próximo ao ponto':'sem eco de chuva no ponto')+' · área aproximada de '+radar.radiusKm.toFixed(1)+' km';
  }
  function demoSnapshot() {
    var mode=settings.demoMode;
    var days=[0,1,.42,0,.7,.18,.65,.6,0,.35], clouds=[0,.08,.22,.03,.92,1,.95,1,.02,.18];
    var phase=mode===8 ? .5 : settings.demoMoonPhase/100;
    var moon={phase:phase,fraction:(1-Math.cos(phase*Math.PI*2))/2,angle:0};
    var day=days[mode] || 0, elevation=mode===2 ? -.4 : mode===9 ? -1.7 : day*65-8;
    var moonVisible=day<.8;
    return {day:day,elevation:elevation,cloud:clouds[mode],moon:moon,moonAngle:phase<.5 ? -1.2 : 1.2,
      moonVisible:moonVisible,sunPosition:{azimuth:mode===9 ? -1.45 : mode===2 ? 1.45 : -.25,altitude:elevation*Math.PI/180},
      moonPosition:{azimuth:.85,altitude:.65},
      stars:(1-day)*Math.pow(1-clouds[mode],2)*(settings.moonDimsStars && moonVisible ? 1-moon.fraction*.75 : 1),
      wind:mode===5 ? -.85 : .22, rain:settings.localPrecipitation && mode>=4 && mode<=6 ? (mode===5 ? 1 : .6) : 0,
      snow:mode===6,fog:mode===7,storm:mode===5,temperature:mode===6 ? -2 : 24,
      condition:['','Céu limpo','Entardecer','Noite limpa','Chuva','Trovoada','Neve','Neblina','Lua cheia','Amanhecer'][mode]};
  }
  function snapshot(date) {
    if (settings.demoMode > 0) return demoSnapshot();
    date = date || new Date();
    if (!settings.weatherAuto || !location) return null;
    var sun = SunCalc.getPosition(date, location.latitude, location.longitude);
    var moon = SunCalc.getMoonIllumination(date);
    var pos = SunCalc.getMoonPosition(date, location.latitude, location.longitude);
    var elevation = sun.altitude * 180 / Math.PI;
    var day = settings.localDayNight ? limit((elevation + 8) / 18, 0, 1) : 0;
    var cloud = weather ? limit(weather.cloud_cover / 100, 0, 1) : null;
    var code = weather ? weather.weather_code : 0;
    var radarNow=recentRadar(), radarRain=radarNow && radarNow.wet;
    if(radarRain)cloud=Math.max(cloud || 0,.65);
    return { day: day, elevation: elevation, cloud: cloud,
      stars: (1 - day) * (cloud === null ? 1 : Math.pow(1 - cloud, 2)) * (settings.moonDimsStars && pos.altitude > 0 ? 1 - moon.fraction * .75 : 1),
      sunPosition: sun, moonPosition: pos, temperature: weather ? weather.temperature_2m : null,
      moon: moon, moonAngle: moon.angle - pos.parallacticAngle, moonVisible: !settings.localDayNight || pos.altitude > 0,
      wind: weather ? limit(weather.wind_speed_10m / 40, 0, 1) * -Math.sin(weather.wind_direction_10m * Math.PI / 180) : null,
      gust: weather && Number.isFinite(weather.wind_gusts_10m) ? limit(weather.wind_gusts_10m / Math.max(3,weather.wind_speed_10m),1,2) : 1,
      rain: settings.localPrecipitation ? Math.max(weather && (code>=50 || weather.precipitation>.05) ? limit(weather.precipitation / 4,0.12,1) : 0, radarRain ? radarNow.intensity : 0) : 0,
      snow: weather && weather.is_snow || (code >= 71 && code <= 77) || code === 85 || code === 86,
      fog: code === 45 || code === 48, storm: code >= 95 };
  }
  function shortLabel(){
    if(settings.demoMode>0){var demo=demoSnapshot();return 'Demonstração · '+demo.temperature+' °C · '+demo.condition;}
    if(!settings.weatherAuto)return 'Condições locais desativadas';
    if(!settings.localCity.trim())return 'Informe sua cidade';
    return (location?location.name:settings.localCity.trim())+' · '+(weather && Number.isFinite(weather.temperature_2m)?Math.round(weather.temperature_2m)+' °C':'-- °C')+' · '+condition();
  }
  function label() {
    if(settings.demoMode>0){var demo=demoSnapshot();return 'Demonstração · '+demo.condition+('\n'+demo.temperature+' °C · Lua iluminada '+Math.round(demo.moon.fraction*100)+'%');}
    if(!settings.weatherAuto)return 'Modo manual';
    if(!settings.localCity.trim())return 'Informe sua cidade em Personalizar → Clima e Lua locais';
    var parts=[];
    if(location)parts.push([location.name,location.admin1,location.country].filter(Boolean).join(', '));
    if(choices.length>1)parts.push('Local '+settings.localResult+'/'+choices.length+' — altere “Local encontrado” se necessário');
    if(weather){
      parts.push((Number.isFinite(weather.temperature_2m)?Math.round(weather.temperature_2m)+' °C · ':'')+condition()+' · nuvens '+weather.cloud_cover+'% · vento '+weather.wind_speed_10m+' km/h');
      parts.push('Fonte: '+(weather.source || 'Open-Meteo')+' · dados '+dataTime(weather.data_epoch)+(stale()?' · dados antigos':''));
      if(recentRadar() && recentRadar().wet)parts.push('Condição da fonte: '+(weather.description || description(weather.weather_code)));
      parts.push('Consulta: '+new Date(fetched).toLocaleTimeString('pt-BR')+' · há '+Math.max(0,Math.floor((Date.now()-fetched)/60000))+' min');
    }
    var radarInfo=radarLabel();if(radarInfo)parts.push(radarInfo);
    if(location && settings.localMoon){var m=SunCalc.getMoonIllumination(new Date());parts.push('Lua '+['nova','crescente','quarto crescente','gibosa crescente','cheia','gibosa minguante','quarto minguante','minguante'][Math.round(m.phase*8)%8]+' · iluminada '+Math.round(m.fraction*100)+'%');}
    if(sourceNote)parts.push(sourceNote);
    if(message)parts.push(message);
    return parts.join('\n');
  }
  window.LocalSky={
    init:function(p,callback){
      settings=p;changed=callback;
      if(settings.weatherProvider===undefined)settings.weatherProvider=0;
      if(typeof settings.weatherApiKey!=='string')settings.weatherApiKey='';
      if(settings.radarEnabled===undefined)settings.radarEnabled=true;
      if(!settings.radarInterval)settings.radarInterval=5;
      configure(true);
      timer=setInterval(function(){emit();refresh(false);refreshRadar(false);},60000);
      window.addEventListener('online',function(){attempted=radarAttempted=0;refresh(true);refreshRadar(true);});
      window.addEventListener('pagehide',function(){clearInterval(timer);abortRequests();});
    },
    configure:configure,
    refresh:function(){refresh(true);refreshRadar(true);},
    resume:function(){emit();refresh(false);refreshRadar(false);},
    snapshot:snapshot,label:label,shortLabel:shortLabel,
    attributions:function(){
      var a=[{text:'Localidade e '+(weather && weather.source==='WeatherAPI'?'reserva':'clima')+': Open-Meteo · CC BY 4.0',url:'https://open-meteo.com/'}];
      if(weather && weather.source==='WeatherAPI')a.push({text:'Clima: WeatherAPI.com',url:'https://www.weatherapi.com/'});
      if(settings.radarEnabled && active())a.push({text:'Radar: RainViewer',url:'https://www.rainviewer.com/'});
      return a;
    },
    diagnostics:function(){return {source:weather && weather.source || null,dataEpoch:weather && weather.data_epoch,radar:radar,location:location && location.name};}
  };
})();
