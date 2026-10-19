"""Editable Blender environment kit, five galleries / three authored silhouettes per biome.
Run Blender --background --factory-startup --python scripts/build-environment.py.
Evaluated bevels and weighted normals export to compact indexed palette meshes; six
BVH hemisphere samples bake local crevice and ground contact occlusion, never runtime ray tracing.
Game coordinates are X/Y/Z with Y up; Blender objects deliberately follow those axes.
"""
import bpy, bmesh, math, random, json, struct, base64, hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name!='Collection':bpy.data.collections.remove(c)
# One authoritative biome palette exported verbatim for runtime and Blender preview.
PALETTES=[]
colors=[['#56636d','#8a969e','#38454e','#8ce3ea'],['#7385a9','#b3c4da','#465576','#c3a4ff'],['#4a4650','#55505a','#30333c','#ff965a'],['#607b6e','#a8b98d','#43564f','#a5f5aa'],['#313b50','#7c8799','#202739','#ff8095']]
for biome in range(5):
    PALETTES.append([])
    for pal,name in enumerate(['rock','layer','shadow','accent']):
        metal=[.7 if biome==4 else .15,.65 if biome==4 else .2,.2,.25][pal]
        rough=[.35 if biome==1 else .88,.26 if biome==1 else .76,.92,.5][pal]
        glow=[None,None,'#76250e','#234e32','#5f233c'][biome] if pal==3 else None
        PALETTES[-1].append({'name':name,'color':colors[biome][pal],'metalness':metal,'roughness':rough,'emissive':glow,'emissiveIntensity':2 if glow else 1})
materials=[]
for name,color in [('Mineral body',(.22,.28,.3,1)),('Exposed faces',(.48,.58,.6,1)),('Crevice',(.09,.13,.15,1)),('Active inset',(.3,.7,.5,1))]:
    m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True
    m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=color
    materials.append(m)
collection=None

def add(o,name,pal=0,bevel=0,smooth=False):
    o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    collection.objects.link(o);o.data.materials.append(materials[pal]);o['palette']=pal
    if smooth or bevel:
        for f in o.data.polygons:f.use_smooth=True
    if bevel:
        mod=o.modifiers.new('Dressed edge bevel','BEVEL');mod.width=min(bevel,min(o.dimensions)*.45);mod.segments=1;mod.harden_normals=True
        mod=o.modifiers.new('Weighted construction normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=45
    return o

def mesh(name,vertices,faces,pal=0,bevel=0,smooth=False):
    me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update()
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    o=bpy.data.objects.new(name,me);collection.objects.link(o);return add(o,name,pal,bevel,smooth)

def box(name,p,size,pal=0,b=.055):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return add(o,name,pal,b)

def fractured(name,p,r,h,seed,pal=0,ice=False):
    rng=random.Random(seed);sides=7;vs=[];fs=[]
    radial=[rng.uniform(.78,1.15) for _ in range(sides)]
    for ring in range(3):
        for j in range(sides):
            a=j*math.tau/sides;factor=[1,.92,.63][ring]
            sy=0 if ring==0 else h*([0,.5,.88][ring]+.1*math.cos(a+seed)+rng.uniform(-.07,.07))
            vs.append((p[0]+math.cos(a)*r*radial[j]*factor+ring*r*.16,p[1]+sy,p[2]+math.sin(a)*r*radial[j]*factor*(.35 if ice else .6)))
    vs.extend([(p[0],p[1],p[2]),(p[0]+r*.35,p[1]+h*.9,p[2])])
    for j in range(sides):
        n=(j+1)%sides
        for ring in range(2):
            a=ring*sides+j;b=ring*sides+n;fs.append((a,a+sides,b+sides,b))
        fs.extend([(21,n,j),(22,14+j,14+n)])
    o=mesh(name,vs,fs,pal)
    # Face palette follows one tilted bedding plane; restrained exposed cleavage.
    o.data.materials.append(materials[1])
    for f in o.data.polygons:
        if f.normal.y>.7 or (.36<h and abs(f.center.y-p[1]-h*.48)<h*.08):f.material_index=1
    return o

def column(name,p,r,h,seed):
    rng=random.Random(seed);n=6;vs=[];fs=[]
    for level in range(3):
        for j in range(n):
            a=j*math.tau/n;scale=[1,.93,.84][level];sy=[0,h*.62,h][level]
            if level==2:sy+=rng.uniform(-.2,.2)
            vs.append((p[0]+math.cos(a)*r*scale,p[1]+sy,p[2]+math.sin(a)*r*scale))
    for level in range(2):
        for j in range(n):a=level*n+j;b=level*n+(j+1)%n;fs.append((a,a+n,b+n,b))
    fs.extend([tuple(range(n-1,-1,-1)),tuple(range(12,18))]);return mesh(name,vs,fs,0,.035)

def stem(name,p,h,bend,r=.2):
    vs=[];fs=[];n=7;levels=5
    for level in range(levels):
        t=level/(levels-1);cx=p[0]+bend*math.sin(t*math.pi*.7);cz=p[2]+bend*.32*math.sin(t*math.pi)
        radius=r*(1.6-t*.7)
        for j in range(n):
            a=j*math.tau/n;vs.append((cx+math.cos(a)*radius,p[1]+h*t,cz+math.sin(a)*radius))
    for level in range(levels-1):
        for j in range(n):a=level*n+j;b=level*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    fs.extend([tuple(range(n-1,-1,-1)),tuple(range((levels-1)*n,levels*n))])
    mesh(name,vs,fs,1,0,True);return (p[0]+bend*math.sin(math.pi*.7),p[1]+h,p[2])

def cap(name,p,r,seed):
    rng=random.Random(seed);n=12;vs=[];fs=[]
    scallop=[rng.uniform(.88,1.08) for _ in range(n)]
    profile=[(.08,-.16),(.68,-.2),(1,0),(.9,.23),(.48,.43),(.04,.49)]
    for rad,h in profile:
        for j in range(n):
            a=j*math.tau/n;vs.append((p[0]+math.cos(a)*r*rad*scallop[j],p[1]+h*r,p[2]+math.sin(a)*r*rad*scallop[j]*.78))
    for level in range(len(profile)-1):
        for j in range(n):a=level*n+j;b=level*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    fs.extend([tuple(range(n-1,-1,-1)),tuple(range(60,72))]);o=mesh(name,vs,fs,0,0,True)
    o.data.materials.append(materials[2]);o.data.materials.append(materials[3])
    for f in o.data.polygons:
        if f.center.y<p[1]-.02:f.material_index=1
        elif abs(f.center.y-p[1])<r*.12:f.material_index=2
    return o

def build(biome,v):
    if biome==0:
        if v==0:
            fractured('Long split mare slab',(-.6,0,0),3.1,3.2,11)
            fractured('Detached tilted heel',(2.3,0,.4),1.3,1.35,30,2)
        elif v==1:
            fractured('Uplifted fault left',(-1.4,0,0),1.8,5,47)
            fractured('Broken fault right',(1.45,0,.3),1.5,3.4,77)
        else:
            fractured('Eroded sloping shelf',(0,0,0),3.5,2.2,29)
            fractured('Dislodged upper fragment',(-1.1,1.7,-.3),1.35,1.5,100)
    elif biome==1:
        for j in range([2,4,3][v]):
            h=([5.4,4.8,2.8][v])*(.72+j*.1)
            o=fractured('Sheared pressure blade %d'%j,((j-1)*1.35,0,-j*.25),[1.6,1.05,1.4][v],h,120+v*10+j,1 if j%2==0 else 0,True)
            # Actual shearing in the mesh avoids a cylindrical/conical crystal silhouette.
            for vertex in o.data.vertices:vertex.co.x+=(vertex.co.y/h)*([-.15,.8,-.4][v])
        fractured('Shattered fallen ice foot',(2.1,0,.7),1.1,1.3,199,1,True)
    elif biome==2:
        n=[6,3,4][v]
        for j in range(n):
            a=j*math.tau/n
            column('Hexagonal joint column %d'%j,(math.cos(a)*1.25,0,math.sin(a)*.85),.65,[4.4,2.8,3.2][v]*(.65+random.Random(v*21+j).random()*.45),j+2)
        if v==1:fractured('Basalt collapse shoulder',(1.8,0,-.4),2,3.6,322)
        if v==2:fractured('Vent fault crust',(-.7,0,0),2.8,1.1,342,2)
        box('Recessed vent ember',(0,.12,0),(1.4,.08,.65),3,0)
    elif biome==3:
        if v==0:
            tip=stem('Curved pale fruiting stalk',(-.6,0,-.3),4.5,.85,.25);cap('Broad scalloped crown',tip,1.55,301)
            tip=stem('Younger bent stalk',(1.6,0,.5),2,-.5,.15);cap('Young fruiting crown',tip,.9,302)
        elif v==1:
            fractured('Colony host stone',(-.4,0,-.3),1.4,3.1,350,2)
            for j in range(3):cap('Overlapping asymmetrical shelf %d'%j,(.4+j*.2,.8+j*.8,.5-j*.15),1.65-j*.2,360+j)
        else:
            for j in range(3):
                tip=stem('Curved clustered stem %d'%j,(-1.4+j*1.3,0,math.sin(j)*.5),1.5+j*.8,[-.4,.5,-.65][j],.15+j*.025)
                cap('Cluster scalloped cap %d'%j,tip,1.05+j*.15,380+j)
    else:
        if v==0:
            box('Grounded service plinth',(0,.3,0),(3.7,.6,2.8),2)
            box('Bevelled uplink body',(0,3.5,0),(2.4,6.5,1.9),0,.1)
            box('Inset front equipment well',(0,3.4,1.0),(1.4,4.8,.16),2,.04)
            for side in [-1,1]:
                box('Chamfered load buttress',(side*1.55,2.7,0),(.55,5.2,2.3),1,.075)
                box('Recessed vertical uplink',(side*.48,3.4,1.12),(.1,3.7,.06),3,.015)
            box('Asymmetric armored cornice',(.35,6.9,0),(4,.5,2.7),1,.08)
            box('Rear comms housing',(-.5,7.6,-.3),(1.2,.9,1.1),0,.07)
        elif v==1:
            box('Low station raft',(0,.25,0),(6.5,.5,3),2)
            box('Low switch-house body',(0,1.9,0),(5.6,3.1,2.4),0,.11)
            box('Chamfered roof overhang',(.2,3.6,0),(6.3,.4,2.9),1,.08)
            box('Offset ventilation riser',(-2,2.9,-.3),(1,5.1,1.5),1,.07)
            for j in range(3):
                box('Recessed equipment bay',(-1.5+j*1.55,1.9,1.25),(1.1,2.0,.14),2,.045)
                box('Bay status lens',(-1.5+j*1.55,2.5,1.35),(.55,.1,.08),3,.02)
        else:
            for side in [-1,1]:
                box('Splayed transmitter foot',(side*2,.35,0),(1.7,.7,2.5),2)
                box('Bevelled structural pylon',(side*2,3,0),(.8,5.6,1.9),1,.075)
            box('Transmission header',(0,5.9,0),(5.5,.6,2.2),0,.08)
            box('Hanging resonator',(-.6,4.1,0),(.8,2.8,.75),2,.06)
            box('Resonator active inset',(-.6,4.1,.43),(.12,2.2,.08),3,.02)
            box('Offset antenna block',(.9,6.6,0),(2.3,.6,1.25),1,.06)

keys=[]
for biome in range(5):
    for variant in range(4):
        key=f'biome{biome}-{variant}' if variant<3 else f'debris-{biome}'
        keys.append(key);collection=bpy.data.collections.new(key);bpy.context.scene.collection.children.link(collection)
        if variant<3:build(biome,variant)
        elif biome==4:box('Discarded chamfered panel',(0,.12,0),(.8,.24,.65),1,.025)
        else:fractured('Loose fractured fragment',(0,0,0),.65,.4,biome*21,0,biome==1)

out={'generatorScriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'palettes':PALETTES,'version':1,'generator':'Blender '+bpy.app.version_string,'positionScale':2048,'normalScale':32767,'ambientOcclusion':{'method':'6 cosine hemisphere BVH rays','floor':.72,'radius':.65,'normalOffset':.008,'bakeGroundY':-.015,'groundExported':False},'models':{}}
deps=bpy.context.evaluated_depsgraph_get()
for key in keys:
    col=bpy.data.collections[key];vertices=[];faces=[]
    for o in col.objects:
        ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();offset=len(vertices)
        vertices.extend(o.matrix_world@v.co for v in me.vertices)
        faces.extend(tuple(offset+i for i in t.vertices) for t in me.loop_triangles);ev.to_mesh_clear()
    # Invisible AO receiver only: these two triangles never enter exported batches.
    offset=len(vertices)
    vertices.extend([Vector((-20,-.015,-20)),Vector((20,-.015,-20)),Vector((20,-.015,20)),Vector((-20,-.015,20))])
    faces.extend([(offset,offset+2,offset+1),(offset,offset+3,offset+2)])
    bvh=BVHTree.FromPolygons(vertices,faces,all_triangles=True);cache={}
    def shade(p,n):
        key=tuple(p)+tuple(n)
        if key in cache:return cache[key]
        tangent=n.cross(Vector((0,0,1)) if abs(n.z)<.9 else Vector((0,1,0))).normalized();bitangent=n.cross(tangent);blocked=0
        for j in range(6):
            z=math.sqrt((j+.5)/6);r=math.sqrt(1-z*z);a=j*2.39996323
            direction=tangent*(math.cos(a)*r)+bitangent*(math.sin(a)*r)+n*z
            if bvh.ray_cast(p+n*.008,direction,.65)[0] is not None:blocked+=1
        val=round(255*(1-.28*blocked/6));cache[key]=val;return val
    batches=[]
    for pal in range(4):
        pp=[];nn=[];cc=[];ii=[];lookup={}
        for o in col.objects:
            ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();nm=o.matrix_world.to_3x3().inverted().transposed()
            for tri in me.loop_triangles:
                actual=tri.material_index
                material=me.materials[actual] if len(me.materials)>actual else materials[o['palette']]
                if {m.name:i for i,m in enumerate(materials)}.get(material.name)!=pal:continue
                corners=[o.matrix_world@me.vertices[i].co for i in tri.vertices]
                if (corners[1]-corners[0]).cross(corners[2]-corners[0]).length_squared<1e-12:continue
                for li in tri.loops:
                    loop=me.loops[li];v=o.matrix_world@me.vertices[loop.vertex_index].co;n=(nm@me.corner_normals[li].vector).normalized()
                    p=tuple(round(c*2048) for c in v);normal=tuple(round(c*32767) for c in n);ident=p+normal
                    if ident not in lookup:
                        lookup[ident]=len(pp)//3;pp.extend(p);nn.extend(normal);c=shade(v,n);cc.extend([c]*3)
                    ii.append(lookup[ident])
            ev.to_mesh_clear()
        if ii:
            encode=lambda a,t:base64.b64encode(struct.pack('<'+t*len(a),*a)).decode('ascii')
            assert max(abs(p) for p in pp)<32768
            batches.append({'palette':pal,'position':encode(pp,'h'),'normal':encode(nn,'h'),'color':encode(cc,'B'),'index':encode(ii,'H'),'triangles':len(ii)//3})
    out['models'][key]=batches;print(key,sum(b['triangles'] for b in batches),'triangles',flush=True)
(ROOT/'src/game/assets/environment.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
# The runtime table also drives Blender preview values, with explicit sRGB decoding.
def linear_rgba(hex_color):
    values=[int(hex_color[i:i+2],16)/255 for i in [1,3,5]]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in values)+(1,)
for biome,definitions in enumerate(PALETTES):
    preview=[]
    for pal,definition in enumerate(definitions):
        m=materials[pal].copy();m.name=f'Biome {biome} palette {pal}'
        value=linear_rgba(definition['color'])
        m.diffuse_color=value;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=value
        bs.inputs['Metallic'].default_value=definition['metalness'];bs.inputs['Roughness'].default_value=definition['roughness']
        if definition['emissive']:
            bs.inputs['Emission Color'].default_value=linear_rgba(definition['emissive']);bs.inputs['Emission Strength'].default_value=definition['emissiveIntensity']
        preview.append(m)
    for key in [f'biome{biome}-{j}' for j in range(3)]+[f'debris-{biome}']:
        for o in bpy.data.collections[key].objects:
            for slot in o.material_slots:slot.material=preview[materials.index(slot.material)]
# Gallery instances keep the source objects at the runtime origin and independently editable.
main=bpy.context.scene
for col in list(main.collection.children):main.collection.children.unlink(col)
for biome,name in enumerate(['Lunar fracture gallery','Ice shear gallery','Basalt joint gallery','Fungal colony gallery','Citadel construction gallery']):
    scene=main if biome==0 else bpy.data.scenes.new(name);scene.name=name
    for variant in range(3):
        o=bpy.data.objects.new(f'Variant {variant+1} editable collection',None);o.instance_type='COLLECTION';o.instance_collection=bpy.data.collections[f'biome{biome}-{variant}'];o.location=(variant*10,0,0);scene.collection.objects.link(o)
    # Keep loose fragment collections saved as well.
    o=bpy.data.objects.new('Loose fragment kit',None);o.instance_type='COLLECTION';o.instance_collection=bpy.data.collections[f'debris-{biome}'];o.location=(0,0,5);scene.collection.objects.link(o)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/environment.blend'))
print('ENVIRONMENT_EXPORT '+json.dumps({'models':{k:sum(b['triangles'] for b in v) for k,v in out['models'].items()},'ao':out['ambientOcclusion']}),flush=True)
