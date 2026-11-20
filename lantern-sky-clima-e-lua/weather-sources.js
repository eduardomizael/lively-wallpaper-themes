/* Provider adapters; API keys remain only in Lively's local settings. */
(function () {
  'use strict';
  async function get(url, signal) {
    var controller=new AbortController(), timeout=setTimeout(function(){controller.abort();},12000);
    function cancel(){controller.abort();}
    if(signal) { if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true}); }
    try {
      var response=await fetch(url,{signal:controller.signal,cache:'no-store'});
      var data=await response.json();
      if(!response.ok || data.error) {
        var code=data.error && data.error.code;
        throw new Error(code===2006 ? 'Chave WeatherAPI inválida' : code===2007 ? 'Cota WeatherAPI excedida' : code===2008 ? 'Chave WeatherAPI desativada' : 'Serviço meteorológico indisponível (HTTP '+response.status+')');
      }
      return data;
    } catch(e) {
      if(e.name==='AbortError')throw new Error('Tempo limite da consulta excedido');
      if(e instanceof TypeError)throw new Error('Falha de conexão com o serviço meteorológico');
      if(e instanceof SyntaxError)throw new Error('Resposta meteorológica inválida');
      throw e;
    } finally {clearTimeout(timeout);if(signal)signal.removeEventListener('abort',cancel);}
  }
  function valid(w) {return w && ['cloud_cover','weather_code','wind_speed_10m','wind_direction_10m','precipitation'].every(function(k){return Number.isFinite(w[k]);});}
  function codeFromWeatherAPI(code,precip,cloud) {
    if([1087,1273,1276,1279,1282].includes(code))return 95;
    if([1066,1069,1114,1117,1204,1207,1210,1213,1216,1219,1222,1225,1237,1249,1252,1255,1258,1261,1264].includes(code))return 73;
    if([1030,1135,1147].includes(code))return 45;
    if([1072,1150,1153,1168,1171].includes(code))return 51;
    if([1063,1180,1183,1186,1189,1192,1195,1198,1201,1240,1243,1246].includes(code) || precip>.05)return precip>2?63:61;
    if(code===1000)return 0;
    if(code===1003)return 2;
    if(code===1006 || code===1009)return 3;
    return cloud>75?3:cloud>30?2:1;
  }
  window.WeatherSources={
    valid:valid,
    json:get,
    openMeteo:async function(location,signal) {
      var data=await get('https://api.open-meteo.com/v1/forecast?latitude='+location.latitude+'&longitude='+location.longitude+'&current=cloud_cover,weather_code,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m&timezone=auto&timeformat=unixtime&forecast_days=1',signal);
      var w=data.current;if(!valid(w))throw new Error('Resposta Open-Meteo incompleta');
      w=Object.assign({},w,{source:'Open-Meteo',timezone:data.timezone || location.timezone});
      if(Number.isFinite(w.time)){w.data_epoch=w.time;w.time=new Date(w.time*1000).toISOString();}
      // A non-zero precipitation estimate also counts if the condition code says clear.
      if(w.precipitation>.05 && w.weather_code<50)w.weather_code=w.precipitation>2?63:61;
      return w;
    },
    weatherAPI:async function(location,key,signal) {
      var data=await get('https://api.weatherapi.com/v1/current.json?key='+encodeURIComponent(key)+'&q='+location.latitude+','+location.longitude+'&lang=pt&aqi=no',signal);
      var c=data.current;
      if(!c || !c.condition)throw new Error('Resposta WeatherAPI incompleta');
      var code=codeFromWeatherAPI(c.condition.code,c.precip_mm,c.cloud);
      var w={source:'WeatherAPI',time:c.last_updated || '',data_epoch:c.last_updated_epoch,timezone:data.location && data.location.tz_id || location.timezone,
        weather_code:code,description:typeof c.condition.text==='string'?c.condition.text:'',cloud_cover:c.cloud,temperature_2m:c.temp_c,
        precipitation:c.precip_mm,wind_speed_10m:c.wind_kph,wind_direction_10m:c.wind_degree,wind_gusts_10m:c.gust_kph,
        is_snow:[1066,1069,1114,1117,1204,1207,1210,1213,1216,1219,1222,1225,1237,1249,1252,1255,1258,1261,1264,1279,1282].includes(c.condition.code)};
      if(!valid(w) || !Number.isFinite(w.data_epoch))throw new Error('Resposta WeatherAPI incompleta');
      return w;
    }
  };
})();
