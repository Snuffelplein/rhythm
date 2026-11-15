export function isPushEndpoint(value) {
  try {
    const u=new URL(value);
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.pathname!=='/'&&(
      ['fcm.googleapis.com','updates.push.services.mozilla.com'].includes(u.hostname)||
      /^(?:[a-z0-9-]+\.)+(?:push\.apple\.com|notify\.windows\.com)$/.test(u.hostname)
    );
  } catch { return false; }
}
export function notificationFor(kind) {
  const text={winddown:'Je gekozen moment voor je avondroutine is er. Open Rhythm en kijk wat haalbaar is.',bed:'Je gekozen bedtijd nadert. Open je plan; je mag je tijd aanpassen.',wake:'Je gekozen dagstart is er. Neem rustig een moment om in te checken.',checkin:'Hoe gaat het met je? Een korte check-in is genoeg.',test:'Dit is je testmelding. Herinneringen staan los van een systeemwekker.'};
  return JSON.stringify({version:1,kind:kind in text?kind:'checkin',title:'Rhythm',body:text[kind]??text.checkin});
}
