import time
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from . import config, db, workers
from .modem import FakeModem, modem

app = FastAPI(title="SMS Gateway")


def auth(x_api_key: str = Header(default="")) -> None:
    if x_api_key != config.API_KEY:
        raise HTTPException(401, "bad API key")


class SendIn(BaseModel):
    to: str
    text: str
    kind: str = "transactional"  # 'marketing' skips opted-out numbers
    delay_seconds: float = 0


class BulkIn(BaseModel):
    numbers: List[str]
    text: str
    kind: str = "marketing"


def _queue(to: str, text: str, kind: str, delay: float = 0) -> dict:
    if kind not in ("transactional", "marketing"):
        raise HTTPException(400, "kind must be transactional or marketing")
    try:
        number = workers.normalize(to)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if kind == "marketing" and db.is_optout(number):
        return {"to": number, "status": "skipped", "reason": "opted out"}
    id_ = db.enqueue(number, text, kind, time.time() + delay if delay else None)
    return {"id": id_, "to": number, "status": "queued", "segments": workers.segments(text)}


@app.on_event("startup")
def _startup() -> None:
    workers.start()


@app.post("/send", dependencies=[Depends(auth)])
def send(body: SendIn):
    return _queue(body.to, body.text, body.kind, body.delay_seconds)


@app.post("/send/bulk", dependencies=[Depends(auth)])
def send_bulk(body: BulkIn):
    results = []
    for n in dict.fromkeys(body.numbers):  # dedupe, keep order
        try:
            results.append(_queue(n, body.text, body.kind))
        except HTTPException as e:
            results.append({"to": n, "status": "rejected", "reason": e.detail})
    return {"count": len(results), "results": results}


@app.get("/messages/out", dependencies=[Depends(auth)])
def out(limit: int = 50, status: Optional[str] = None):
    return db.list_outbox(limit, status)


@app.get("/messages/in", dependencies=[Depends(auth)])
def inbox(limit: int = 50):
    return db.list_inbox(limit)


@app.get("/optouts", dependencies=[Depends(auth)])
def optouts():
    return db.list_optouts()


@app.delete("/optouts/{number}", dependencies=[Depends(auth)])
def optout_remove(number: str):
    db.remove_optout(workers.normalize(number))
    return {"ok": True}


@app.get("/status", dependencies=[Depends(auth)])
def status():
    try:
        m = modem.status()
    except Exception as e:  # noqa: BLE001
        m = {"connected": False, "error": str(e)}
    return {"modem": m, "sent_today": db.sent_today(), "daily_limit": config.DAILY_LIMIT}


if isinstance(modem, FakeModem):

    class InjectIn(BaseModel):
        sender: str
        text: str

    @app.post("/debug/inject", dependencies=[Depends(auth)])
    def inject(body: InjectIn):
        modem.inject(body.sender, body.text)
        return {"ok": True}


@app.get("/", response_class=HTMLResponse)
def dashboard():
    return """<!doctype html><meta charset=utf-8><title>SMS Gateway</title>
<style>body{font:14px system-ui;max-width:900px;margin:24px auto;padding:0 16px}
table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}
input,textarea,button{font:inherit;padding:6px;margin:2px 0}textarea{width:100%}</style>
<h2>SMS Gateway</h2>
<p>API key: <input id=k type=password> <button onclick=load()>Učitaj</button> <span id=st></span></p>
<h3>Pošalji</h3><input id=to placeholder="064 123 4567"><br>
<textarea id=tx rows=3 placeholder="Tekst poruke"></textarea><br>
<button onclick=send()>Pošalji</button>
<h3>Poslato</h3><table id=out></table><h3>Primljeno</h3><table id=inb></table>
<script>
const h=()=>({'x-api-key':k.value,'content-type':'application/json'});
const t=s=>new Date(s*1000).toLocaleString();
async function load(){
 let s=await fetch('/status',{headers:h()});if(!s.ok){st.textContent='pogrešan ključ';return}
 s=await s.json();st.textContent=(s.modem.connected?'modem OK ('+(s.modem.operator||'?')+')':'modem NIJE dostupan')+' · danas '+s.sent_today+'/'+s.daily_limit;
 let o=await (await fetch('/messages/out',{headers:h()})).json();
 out.innerHTML='<tr><th>Kada<th>Kome<th>Status<th>Tekst</tr>'+o.map(m=>`<tr><td>${t(m.created_at)}<td>${m.to_number}<td>${m.status}${m.error?' ('+m.error+')':''}<td>${m.text}</tr>`).join('');
 let i=await (await fetch('/messages/in',{headers:h()})).json();
 inb.innerHTML='<tr><th>Kada<th>Od<th>Tekst</tr>'+i.map(m=>`<tr><td>${t(m.received_at)}<td>${m.sender}<td>${m.text}</tr>`).join('');
}
async function send(){await fetch('/send',{method:'POST',headers:h(),body:JSON.stringify({to:to.value,text:tx.value})});tx.value='';load()}
</script>"""
