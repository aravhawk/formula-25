"""Bake Sentinel-2 imagery and OSM building envelopes into track assets.

Run after season.py. Requires rasterio, pyproj, mapbox-vector-tile, shapely and Pillow.
"""
import json
from concurrent.futures import ThreadPoolExecutor
import sys
import mapbox_vector_tile
import numpy as np
from PIL import Image
from pyproj import Transformer
import rasterio
from rasterio.windows import Window
from shapely.geometry import Polygon,LineString
from shapely.prepared import prep
import requests
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree
from shapely.geometry import shape, box
from geography import CACHE, download, xy
from season import OUT, ROOT, save

def imagery(rnd,lonlat,track,to_geo):
    path=ROOT/f'public/assets/land-{rnd:02}.webp'
    source=CACHE/f'scene-{rnd:02}.txt'
    if source.exists() and path.exists(): return source.read_text()
    x0,z0,x1,z1=track['terrain']['bounds']
    axis=np.linspace(0,1,640)
    grid=x0+(x1-x0)*axis[None,:]+1j*(z0+(z1-z0)*axis[:,None])
    geo=to_geo(grid.ravel())
    lon,lat=lonlat
    q={'collections':'sentinel-2-l2a','bbox':f'{lon-.005},{lat-.005},{lon+.005},{lat+.005}',
       'datetime':'2025-01-01T00:00:00Z/2025-10-01T00:00:00Z','limit':100}
    req=requests.Request('GET','https://earth-search.aws.element84.com/v1/search',params=q).prepare()
    items=json.loads(download(f'stac-{rnd:02}.json',req.url))['features']
    best=None
    coverage={}
    for item in sorted(items,key=lambda f:f['properties']['eo:cloud_cover']):
        tile=item['properties']['grid:code']
        if coverage.get(tile,0)>=2:continue
        url=item['assets']['visual']['href']
        try:
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_MAX_RETRY=2,
                              CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif'),rasterio.open(url) as src:
                east,north=Transformer.from_crs(4326,src.crs,always_xy=True).transform(*geo.T)
                col,row=~src.transform*(east,north)
                left,top=np.floor([col.min()-1,row.min()-1]).astype(int)
                size=np.ceil([col.max()+2-left,row.max()+2-top]).astype(int)
                if left>=src.width or top>=src.height or left+size[0]<=0 or top+size[1]<=0:continue
                raw=src.read([1,2,3],window=Window(left,top,*size),boundless=True,fill_value=0)
                coords=np.stack([row-top-.5,col-left-.5])
                rgb=np.stack([map_coordinates(b,coords,order=1) for b in raw],axis=-1).reshape(640,640,3)
                invalid=lambda im:(im.max(axis=2)<8)|(im.min(axis=2)>213)
                scene=item['id']
                if best is not None:
                    improve=invalid(best[2])&~invalid(rgb)
                    rgb=np.where(improve[:,:,None],rgb,best[2])
                    scene=best[1]+' '+scene if improve.any() else best[1]
                score=invalid(rgb).mean()
                if best is None or score<best[0]:best=(score,scene,rgb)
                coverage[tile]=coverage.get(tile,0)+1
                if score<.06: break
        except rasterio.errors.RasterioError as error:
            print(rnd,'raster read',str(error)[:100],flush=True)
    if best is None:raise RuntimeError(f'No covering scene for {rnd}')
    Image.fromarray(best[2]).save(path,quality=86)
    source.write_text(best[1])
    return best[1]

def buildings(rnd,geo,track,to_world,template):
    zoom=14;n=2**zoom
    px=(geo[:,0]+180)/360*n
    py=(1-np.arcsinh(np.tan(np.radians(geo[:,1])))/np.pi)/2*n
    points=np.array(track['points']);spatial=cKDTree(points[:,[0,2]])
    course=prep(LineString(points[:,[0,2]]).buffer(8))
    result=[]
    margin=.35
    for x in range(int(px.min()-margin),int(px.max()+margin)+1):
        for y in range(int(py.min()-margin),int(py.max()+margin)+1):
            tile=download(f'osm-{zoom}-{x}-{y}.mvt',template.format(z=zoom,x=x,y=y))
            layer=mapbox_vector_tile.decode(tile,default_options={'y_coord_down':True}).get('building',{})
            extent=layer.get('extent',4096)
            for feature in layer.get('features',[]):
                props=feature['properties']
                if props.get('hide_3d'):continue
                geom=shape(feature['geometry'])
                if not geom.is_valid: geom=geom.buffer(0)
                geom=geom.intersection(box(0,0,extent,extent)).simplify(1.8)
                polygons=geom.geoms if geom.geom_type=='MultiPolygon' else [geom]
                for poly in polygons:
                    if poly.geom_type!='Polygon' or poly.is_empty or poly.area<30:continue
                    ring=np.array(poly.exterior.coords)[:-1]
                    lon=(x+ring[:,0]/extent)/n*360-180
                    lat=np.degrees(np.arctan(np.sinh(np.pi*(1-2*(y+ring[:,1]/extent)/n))))
                    footprint=xy(to_world(np.column_stack([lon,lat])))
                    dist,index=spatial.query(footprint)
                    if dist.min()>440 or dist.min()<9:continue
                    # Avoid intersecting track bridges, the driving surface, and the
                    # playable garage complex. Courtyard holes are kept outdoors.
                    if dist.min()<85:
                        if course.intersects(Polygon(footprint)):continue
                    height=max(2,float(props.get('render_height',8)))
                    base=max(0,float(props.get('render_min_height',0)))
                    if base>=height:continue
                    rings=[footprint.round(1).flatten().tolist()]
                    for interior in poly.interiors:
                        hole=np.array(interior.coords)[:-1]
                        hx=(x+hole[:,0]/extent)/n*360-180
                        hy=np.degrees(np.arctan(np.sinh(np.pi*(1-2*(y+hole[:,1]/extent)/n))))
                        rings.append(xy(to_world(np.column_stack([hx,hy]))).round(1).flatten().tolist())
                    result.append([round(base,1),round(height,1),int(index[np.argmin(dist)]),rings])
    save(OUT/f'buildings-{rnd:02}.json',result)
    return len(result)

def build(rnd,template):
    origin,metres,a,b=json.loads((CACHE/f'align-{rnd:02}.json').read_text())
    a,b=complex(*a),complex(*b)
    def to_geo(world):return xy(world*a+b)/metres+origin
    def to_world(geo):
        local=(geo-origin)*metres
        return (local[:,0]+1j*local[:,1]-b)/a
    track=json.loads((OUT/f'{rnd:02}.json').read_text())
    points=np.array(track['points'])
    geo=to_geo(points[:,0]+1j*points[:,2])
    count=buildings(rnd,geo,track,to_world,template)
    print('buildings',rnd,count,flush=True)
    scene=imagery(rnd,geo.mean(axis=0),track,to_geo)
    print('imagery',rnd,scene,flush=True)

if __name__=='__main__':
    template=json.loads(download('openfreemap.json','https://tiles.openfreemap.org/planet'))['tiles'][0]
    rounds=[int(v) for v in sys.argv[1:]] or range(1,25)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda rnd:build(rnd,template),rounds))
