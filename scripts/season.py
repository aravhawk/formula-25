"""Rebuild the bundled circuit models with requests, NumPy and SciPy."""
from geography import surroundings
import datetime as dt
import json
import time
from pathlib import Path

import numpy as np
import requests
from scipy.ndimage import gaussian_filter1d

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data'
OUT = ROOT / 'public' / 'season'
CACHE.mkdir(exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
OPEN = 'https://api.openf1.org/v1/'
JOL = 'https://api.jolpi.ca/ergast/f1/2025'
# Official circuit lengths in metres and scheduled Grand Prix laps in calendar order.
SPECS = [
 ('Australia','Melbourne',5278,58,'park','day'),('China','Shanghai',5451,56,'arena','day'),
 ('Japan','Suzuka',5807,53,'hills','day'),('Bahrain','Sakhir',5412,57,'desert','night'),
 ('Saudi Arabia','Jeddah',6174,50,'coast','night'),('Miami','Miami Gardens',5412,57,'marina','day'),
 ('Emilia-Romagna','Imola',4909,63,'forest','day'),('Monaco','Monte Carlo',3337,78,'harbour','day'),
 ('Spain','Barcelona',4657,66,'hills','day'),('Canada','Montréal',4361,70,'island','day'),
 ('Austria','Spielberg',4318,71,'alpine','day'),('Great Britain','Silverstone',5891,52,'airfield','day'),
 ('Belgium','Spa-Francorchamps',7004,44,'forest','day'),('Hungary','Budapest',4381,70,'hills','day'),
 ('Netherlands','Zandvoort',4259,72,'dunes','day'),('Italy','Monza',5793,53,'forest','day'),
 ('Azerbaijan','Baku',6003,51,'city','day'),('Singapore','Marina Bay',4940,62,'city','night'),
 ('United States','Austin',5513,56,'prairie','day'),('Mexico','Mexico City',4304,71,'stadium','day'),
 ('São Paulo','Interlagos',4309,71,'park','day'),('Las Vegas','Las Vegas',6201,50,'strip','night'),
 ('Qatar','Lusail',5419,57,'desert','night'),('Abu Dhabi','Yas Island',5281,58,'marina','dusk')]
last_request = 0
def fetch(key, url):
    global last_request
    path = CACHE / (key + '.json')
    if path.exists(): return json.loads(path.read_text())
    for attempt in range(7):
        if url.startswith(OPEN): time.sleep(max(0, last_request + 2.15 - time.monotonic()))
        last_request = time.monotonic()
        response = requests.get(url, timeout=40)
        if response.status_code in [429,500,502,503,504]:
            time.sleep(max(int(response.headers.get('Retry-After','0') or 0),2**attempt));continue
        response.raise_for_status()
        data = response.json()
        path.write_text(json.dumps(data))
        return data
    raise RuntimeError(url)

def timestamp(value): return dt.datetime.fromisoformat(value).timestamp()
def window(t): return dt.datetime.fromtimestamp(t,dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')
def save(path, value): path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')

def get_lap(session, rnd, length):
    key={17:9899,22:9852}.get(rnd,session['session_key'])
    laps=fetch(f'laps-{key}',OPEN+f'laps?session_key={key}&driver_number=1')
    lap=min((v for v in laps if v['lap_duration'] and v['date_start'] and not v['is_pit_out_lap']),key=lambda v:v['lap_duration'])
    start=timestamp(lap['date_start']);end=start+lap['lap_duration']
    query=f'?session_key={key}&driver_number=1&date>={window(start-1)}&date<={window(end+1)}'
    loc=fetch(f'position-{key}',OPEN+'location'+query)
    data=sorted({timestamp(v['date']):(v['x'],v['z'],-v['y']) for v in loc}.items())
    times=np.array([t for t,p in data]); raw=np.array([p for t,p in data])*.1
    values=np.arange(start,end,.20)
    xyz=np.stack([np.interp(values,times,column) for column in raw.T],axis=1)
    # The spatial samples follow the qualifying line. Fit a periodic road through
    # them and gently filter sensor stair steps without moving the braking zones.
    segment=np.linalg.norm(np.diff(xyz[:,[0,2]],axis=0,append=xyz[:1,[0,2]]),axis=1)
    measured=segment.sum()
    station=np.r_[0,np.cumsum(segment)]*length/measured
    keep=np.r_[np.diff(station)>.01,True]
    nodes=round(length/4)
    grid=np.arange(nodes)*length/nodes
    xyz=np.stack([np.interp(grid,station[keep],np.r_[col,col[0]][keep]) for col in xyz.T],axis=1)
    xyz[:,[0,2]]=(xyz[:,[0,2]]-xyz[0,[0,2]])*length/measured
    xyz[:,1]-=np.min(xyz[:,1])
    for i in range(3): xyz[:,i]=gaussian_filter1d(xyz[:,i],2.2 if i==1 else 1.2,mode='wrap')
    s_at=lambda date:float(np.interp(timestamp(date),values,station[:-1]))
    sect=[round(np.interp(start+sum(lap['duration_sector_'+str(j)] for j in range(1,i+1)),values,station[:-1])) for i in [1,2]]
    zones=[];opened=None
    telemetry=sorted(fetch(f'car-{key}',OPEN+'car_data'+query),key=lambda v:v['date'])
    for v in telemetry:
        pos=s_at(v['date'])
        if v['drs'] in [10,12,14]:
            if opened is None: opened=pos
        elif opened is not None:
            if pos-opened>70: zones.append([round(opened),round(pos)])
            opened=None
    if opened is not None and length-opened>40: zones.append([round(opened),length])
    # Join the zone that crosses the timing line.
    if len(zones)>1 and zones[0][0]<20 and zones[-1][1]>=length-20:
        zones[-1][1]=length+zones.pop(0)[1]
    print(rnd,session['location'],key,len(loc),round(measured/length,3),round(np.ptp(xyz[:,1]),1),round(np.max(segment)),zones,flush=True)
    context=surroundings(rnd,xyz)
    speed=np.interp(grid,[s_at(v['date']) for v in telemetry],[v['speed'] for v in telemetry])
    elapsed=np.interp(np.r_[grid,length],station[keep],np.r_[values-start,lap['lap_duration']][keep])
    elapsed[0]=0
    save(OUT/f'{rnd:02}.json',{**context,'elapsedMs':np.rint(elapsed*1000).astype(int).tolist(),'speed':np.rint(speed).astype(int).tolist(),'length':length,'step':length/nodes,'points':np.round(xyz,2).tolist(),'sectors':sect,'zones':zones,'session':key,'lap':lap['lap_number']})
    return round(lap['lap_duration'],3)

def main():
    schedule=fetch('schedule',JOL+'.json')['MRData']['RaceTable']['Races']
    sessions=sorted(fetch('sessions',OPEN+'sessions?year=2025&session_name=Qualifying'),key=lambda v:v['date_start'])
    races={}
    for offset in range(0,480,100):
        table=fetch(f'results-{offset}',JOL+f'/results.json?limit=100&offset={offset}')['MRData']['RaceTable']['Races']
        for race in table:races.setdefault(int(race['round']),[]).extend(race['Results'])
    season=[]
    assert len(schedule)==len(sessions)==len(SPECS)==24
    for rnd,(event,session,spec) in enumerate(zip(schedule,sessions,SPECS),1):
        name,city,length,laps,land,light=spec
        drivers=sorted(races[rnd],key=lambda v:int(v['grid']) or 99)
        grid=[{'id':v['Driver']['code'],'name':v['Driver']['givenName']+' '+v['Driver']['familyName'],'team':v['Constructor']['constructorId']} for v in drivers]
        # A DNS before the results classification can leave an empty slot.
        if len(grid)<20:
            qualifying=fetch(f'qualifying-{rnd}',JOL+f'/{rnd}/qualifying.json')['MRData']['RaceTable']['Races'][0]['QualifyingResults']
            for v in qualifying:
                dr=v['Driver']
                if dr['code'] not in [item['id'] for item in grid]:
                    grid.append({'id':dr['code'],'name':dr['givenName']+' '+dr['familyName'],'team':v['Constructor']['constructorId']})
        assert len(grid)==20,(rnd,len(grid))
        ref=get_lap(session,rnd,length)
        season.append(dict(round=rnd,name=name,city=city,circuit=event['Circuit']['circuitName'],date=event['date'],length=length,laps=laps,land=land,light=light,grid=grid,reference=ref))
    save(OUT/'calendar.json',season)
if __name__=='__main__':main()
