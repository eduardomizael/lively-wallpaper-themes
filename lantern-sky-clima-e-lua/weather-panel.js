/* One weather card that grows from its summary into the complete information. */
(function(){
  'use strict';
  var panel=document.getElementById('weatherPanel'),button=document.getElementById('weatherSummary');
  var text=document.getElementById('weatherSummaryText'),body=document.getElementById('weatherDetails');
  var open=false,visible=false,initialized=false,frame=0;
  var measure=document.createElement('canvas').getContext('2d');
  function layout(){
    if(!visible)return;
    var style=getComputedStyle(button);
    measure.font=style.font;
    var summaryHeight=Math.max(32,Math.ceil(parseFloat(style.lineHeight)+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)));
    var maximum=Math.max(0,window.innerWidth-32),expandedWidth=Math.min(488,maximum);
    var summaryWidth=Math.min(maximum,Math.ceil(measure.measureText(text.textContent).width+22));
    panel.style.setProperty('--summary-height',summaryHeight+'px');
    panel.style.setProperty('--expanded-width',expandedWidth+'px');
    var bottom=parseFloat(getComputedStyle(panel).bottom)||80;
    var available=Math.max(0,window.innerHeight-bottom-summaryHeight-16);
    body.style.maxHeight=available+'px';
    panel.style.width=(open?expandedWidth:summaryWidth)+'px';
    panel.style.height=(summaryHeight+(open?Math.min(body.scrollHeight,available):0))+'px';
  }
  function expand(value){
    open=!!value && visible;
    panel.classList.toggle('is-expanded',open);
    button.setAttribute('aria-expanded',String(open));
    body.setAttribute('aria-hidden',String(!open));
    body.inert=!open;
    layout();
  }
  button.addEventListener('click',function(){expand(!open);});
  panel.addEventListener('pointerdown',function(e){e.stopPropagation();});
  panel.addEventListener('click',function(e){e.stopPropagation();});
  document.addEventListener('pointerdown',function(e){if(open && !panel.contains(e.target))expand(false);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape' && open){expand(false);button.focus();}});
  window.addEventListener('resize',function(){cancelAnimationFrame(frame);frame=requestAnimationFrame(layout);});
  window.WeatherPanel={
    update:function(data){
      visible=!!data.visible;
      panel.style.display=visible?'block':'none';
      text.textContent=data.summary;
      document.getElementById('weatherStatus').textContent=data.details;
      var credits=document.getElementById('weatherCredits');credits.textContent='';
      data.credits.forEach(function(item,index){
        if(index)credits.appendChild(document.createTextNode(' · '));
        var a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener';a.textContent=item.text;credits.appendChild(a);
      });
      if(!visible){expand(false);initialized=false;return;}
      if(!initialized){
        panel.classList.add('no-motion');expand(false);panel.getBoundingClientRect();
        requestAnimationFrame(function(){panel.classList.remove('no-motion');});initialized=true;
      }else layout();
    }
  };
})();
