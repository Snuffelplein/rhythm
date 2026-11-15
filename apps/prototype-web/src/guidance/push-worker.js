// Generic content only. Never interpret server-provided navigation URLs or HTML.
self.addEventListener('push',event=>{
  let kind='checkin';try{const data=event.data?.json();if(data?.version===1&&['winddown','bed','wake','checkin','test'].includes(data.kind))kind=data.kind;}catch{}
  const text={winddown:'Je gekozen moment voor je avondroutine is er. Open Rhythm en kijk wat haalbaar is.',bed:'Je gekozen bedtijd nadert. Open je plan; je mag je tijd aanpassen.',wake:'Je gekozen dagstart is er. Neem rustig een moment om in te checken.',checkin:'Hoe gaat het met je? Een korte check-in is genoeg.',test:'Dit is je testmelding. Herinneringen staan los van een systeemwekker.'};
  event.waitUntil(self.registration.showNotification('Rhythm',{body:text[kind],icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:`rhythm-${kind}`,data:{kind},renotify:false}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=new URL('/?open=plan',self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing){existing.postMessage({type:'rhythm-open-plan'});await existing.focus();}else await self.clients.openWindow(target);
  })());
});
