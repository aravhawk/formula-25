"""Register the driven lap to the geographic circuit and sample the surrounding DEM."""
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from io import BytesIO
from pathlib import Path
import json
import numpy as np
import requests
from PIL import Image
from scipy.spatial import cKDTree
from scipy.ndimage import gaussian_filter1d

CACHE = Path(__file__).resolve().parents[1] / 'data'
IDS = 'au-1953 cn-2004 jp-1962 bh-2002 sa-2021 us-2022 it-1953 mc-1929 es-1991 ca-1978 at-1969 gb-1948 be-1925 hu-1986 nl-1948 it-1922 az-2016 sg-2008 us-2012 mx-1962 br-1940 us-2023 qa-2004 ae-2009'.split()

def download(name, url):
    path = CACHE / name
    if not path.exists():
        r = requests.get(url, timeout=40)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path.read_bytes()

@lru_cache
def circuits():
    url = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson'
    return {f['properties']['id']: f['geometry']['coordinates']
            for f in json.loads(download('tracks', url))['features']}

def sample_loop(curve, count):
    path = np.r_[curve, curve[:1]]
    station = np.r_[0, np.cumsum(np.abs(np.diff(path)))]
    return np.interp(np.arange(count)*station[-1]/count, station, path)

def fit(src, dst):
    a, b = src-src.mean(), dst-dst.mean()
    scale = np.vdot(a,b)/np.vdot(a,a)
    return scale, dst.mean()-src.mean()*scale

def xy(z):
    return np.column_stack([z.real, z.imag])

def register(road, mapped):
    # Resolve timing-gate offset, rotation and driving direction before robust ICP.
    src = sample_loop(road, 160)
    best = np.inf
    for direction in [mapped, mapped[::-1]]:
        reference = sample_loop(direction, len(src))
        for phase in range(len(src)):
            dst = np.roll(reference, phase)
            a,b = fit(src, dst)
            err = np.median(np.abs(a*src+b-dst))
            if err < best:
                best,transform = err,(a,b)
    a,b = transform
    dense = sample_loop(mapped, int(np.sum(np.abs(np.roll(mapped,1)-mapped))))
    index = cKDTree(xy(dense))
    for _ in range(60):
        errors,near = index.query(xy(road*a+b))
        good = errors < max(2.5, np.percentile(errors,75))
        a,b = fit(road[good], dense[near[good]])
    errors,near = index.query(xy(road*a+b))
    return a,b,(dense[near]-b)/a,errors

def terrain(lonlat, metres, a, b, road, height):
    rows=columns=97
    x=np.linspace(road.real.min()-2300, road.real.max()+2300, columns)
    z=np.linspace(road.imag.min()-2300, road.imag.max()+2300, rows)
    samples=(x[None,:]+1j*z[:,None]).ravel()
    geo=xy(np.r_[samples,road]*a+b)/metres+lonlat
    zoom=12
    scale=256*2**zoom
    px=((geo[:,0]+180)/360*scale).astype(int)
    py=((1-np.arcsinh(np.tan(np.radians(geo[:,1])))/np.pi)/2*scale).astype(int)
    cells=np.column_stack((px//256,py//256))
    out=np.empty(len(px))
    def tile(pair):
        i,j=pair
        key=f'{zoom}/{i}/{j}.png'
        data=download('dem-'+key.replace('/','-'),'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'+key)
        pixels=np.asarray(Image.open(BytesIO(data))).astype(float)
        mask=np.all(cells==pair,axis=1)
        rgb=pixels[py[mask]%256,px[mask]%256,:3]
        out[mask]=rgb[:,0]*256+rgb[:,1]+rgb[:,2]/256-32768
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(tile,np.unique(cells,axis=0)))
    datum=np.median(out[len(samples):]-height)
    return dict(bounds=[round(v,2) for v in [x[0],z[0],x[-1],z[-1]]],rows=rows,columns=columns,
                heights=np.rint(out[:len(samples)]-datum).astype(int).tolist())

def surroundings(rnd, xyz):
    coords=np.asarray(circuits()[IDS[rnd-1]])[:,:2]
    origin=coords.mean(axis=0)
    metres=np.array([111320*np.cos(np.radians(origin[1])),-111320])
    local=(coords-origin)*metres
    road=xyz[:,0]+1j*xyz[:,2]
    a,b,center,err=register(road,local[:,0]+1j*local[:,1])
    (CACHE/f'align-{rnd:02}.json').write_text(json.dumps([origin.tolist(),metres.tolist(),
        [float(a.real),float(a.imag)],[float(b.real),float(b.imag)]]))
    tangent=np.roll(road,-1)-np.roll(road,1)
    normal=1j*tangent/np.maximum(np.abs(tangent),.01)
    # Keep the 2025 layout through revised corners where the map diverges.
    confidence=np.clip((12-err)/5,0,1)
    limit=3.0 if rnd==8 else 4.8
    line=gaussian_filter1d(np.clip(((road-center)/normal).real,-limit,limit)*confidence,2.0,mode='wrap')
    xyz[:,0]=(road-normal*line).real
    xyz[:,2]=(road-normal*line).imag
    print('map registration',rnd,round(np.median(err),2),'m median',flush=True)
    return dict(line=np.round(line,2).tolist(),terrain=terrain(origin,metres,a,b,road,xyz[:,1]))
