"""Blender 5.2 authoring source. Run Blender --background --factory-startup --python this_file.
This script is authoritative: regeneration overwrites the exported .blend gallery.
Manual Blender gallery edits must be ported here before regeneration. This pass is
geometry plus vertex AO; it has no UV/PBR texture bake or texture-ready claim.
Writes editable per-archetype collections and a compact, indexed runtime palette export.
The export evaluates bevel + weighted-normal modifiers, indexes position/normal pairs,
and encodes int16 positions/normals, uint16 indices, and normalized uint8 RGB AO.
Vertex tuples and cyclically normalized triangles are canonically sorted: Blender's
sphere loop enumeration can vary between processes even when all geometry is equal.
AO is geometric visibility: 12 deterministic cosine-weighted hemisphere rays against
an evaluated per-archetype BVH, radius .55 (boss 1), origin offset .012, floor .65.
No ground occlusion, random dirt, texture dependency, or runtime ray tracing is used.
Coordinates intentionally match the game's X/Y/Z (Y is up); no runtime conversion.
"""
import bpy, bmesh, math, json, base64, struct, random, hashlib
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.name != 'Collection': bpy.data.collections.remove(col)
materials=[]
for name,color,metal,rough in [('Obsidian mechanisms',(.034,.053,.072,1),.45,.64),('Titanium armor',(.423,.509,.527,1),.35,.56),('Signal',(.98,.19,.13,1),.3,.25)]:
    m=bpy.data.materials.new(name); m.diffuse_color=color; m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=color; bs.inputs['Metallic'].default_value=metal; bs.inputs['Roughness'].default_value=rough
    if name == 'Signal':
        bs.inputs['Emission Color'].default_value=(.71,.025,.03,1); bs.inputs['Emission Strength'].default_value=2
    materials.append(m)
collection=None

def add(o,name,mat,bevel=0,smooth=False):
    o.name=name
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    for c in list(o.users_collection): c.objects.unlink(o)
    collection.objects.link(o); o.data.materials.append(materials[mat]); o['palette']=mat
    if smooth or bevel:
        for f in o.data.polygons: f.use_smooth=True
    if bevel:
        # Use unrotated mesh extents: rotating a thin plate must not permit a wide bevel.
        smallest=min(max(v.co[i] for v in o.data.vertices)-min(v.co[i] for v in o.data.vertices) for i in range(3))
        bevel=min(bevel,.45*smallest)
        b=o.modifiers.new('Machined edge radii','BEVEL'); b.width=bevel; b.segments=1 if bevel<.02 else 2; b.harden_normals=True
        n=o.modifiers.new('Face weighted normals','WEIGHTED_NORMAL'); n.keep_sharp=True; n.weight=40
    return o

def box(name,pos,size,mat=1,b=.045,rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos); o=bpy.context.object; o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if rot:o.rotation_euler=rot
    return add(o,name,mat,b)

def cyl(name,pos,r,depth,mat=0,r2=None,axis=(0,1,0),verts=24):
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=pos)
    o=bpy.context.object; o.rotation_euler=Vector((0,0,1)).rotation_difference(Vector(axis)).to_euler()
    return add(o,name,mat,.018,True)

def sphere(name,pos,scale,mat=0,segments=24,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=pos);o=bpy.context.object;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return add(o,name,mat,0,True)

def beam(name,a,b,r=.08,mat=0):
    d=Vector(b)-Vector(a); return cyl(name,(Vector(a)+Vector(b))/2,r,d.length,mat,axis=d,verts=12)

def ring(name,pos,major,minor,mat=0):
    bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=8,location=pos,major_radius=major,minor_radius=minor,rotation=(math.pi/2,0,0))
    return add(bpy.context.object,name,mat,0,True)

def plate(name,outline,y0,y1,mat=1,b=.025):
    n=len(outline); vs=[(x,y,z) for y in [y0,y1] for x,z in outline]
    fs=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);collection.objects.link(o)
    # Recalculate exterior normals, including mirrored outlines.
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
    return add(o,name,mat,b)

def profile(name,outline,z,width,mat=1,b=.03):
    # Extruded side-profile silhouette, with a real sloped glacis/fin face.
    n=len(outline);vs=[(x,y,z+side*width/2) for side in [-1,1] for x,y in outline]
    fs=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);collection.objects.link(o)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
    return add(o,name,mat,b)

def saucer(radius,segments=8):
    cyl('Recessed circumferential chassis',(0,-.1,0),radius*.93,.35,0,r2=radius*.72,verts=40)
    for i in range(segments):
        a=i*math.tau/segments; da=math.tau/segments*.43
        outline=[(math.cos(t)*r,math.sin(t)*r) for r,t in [(radius*.48,a-da),(radius*.98,a-da),(radius,a),(radius*.98,a+da),(radius*.48,a+da)]]
        plate('Radial armored petal %02d'%i,outline,.02,.23,1,.035)
    sphere('Inset command canopy',(0,.35,0),(radius*.46,.32,radius*.46),0)

def build(kind):
    global collection
    collection=bpy.data.collections.new(kind);bpy.context.scene.collection.children.link(collection)
    if kind=='drone':
        saucer(1.38)
        ring('Hull separation lip',(0,-.12,0),1.23,.055,0)
        for x in [-.72,0,.72]:
            plate('Integrated tapered optical housing',[(x-.26,.88),(x+.26,.88),(x+.23,1.29),(x+.16,1.34),(x-.16,1.34),(x-.23,1.29)],.22,.54,0,.045)
            box('Raised forward optical sensor',(x,.39,1.34),(.31,.26,.08),2,.035)
        ring('Readable energized rim',(0,-.065,0),1.33,.055,2)
        cyl('Lower thruster shroud',(0,-.36,0),.46,.23,0,r2=.32)
        cyl('Lower thruster lens',(0,-.49,0),.28,.04,2)
        for z in [-.82,.82]:box('Raised dorsal rib',(0,.38,z),(.9,.12,.1),1,.025)
    elif kind=='hunter':
        saucer(1.72,6)
        # A hanging hoop clears the body at the shallow gameplay viewing angle.
        ring('Tractor emitter frame',(0,-.72,0),1.72,.105,0)
        ring('Tractor energized aperture',(0,-.86,0),1.72,.085,2)
        plate('Asymmetric armored tractor prow',[(-1.97,-.24),(-1.97,.24),(-.62,.58),(.5,.34),(.5,-.34),(-.62,-.58)],.22,.63,1,.065)
        box('Raised prow command module',(-.61,.67,0),(.89,.69,.69),0,.12,rot=(0,0,.19))
        box('Prow armor crest',(-.61,.99,0),(1.05,.16,.78),1,.045,rot=(0,0,.19))
        box('Prow forward acquisition visor',(-.74,.79,.39),(.62,.24,.12),2,.035)
        for i in range(6):
            a=i*math.tau/6; x,z=math.cos(a),math.sin(a)
            beam('Emitter support',(x*1.24,-.12,z*1.24),(x*1.72,-.76,z*1.72),.1,1)
        sphere('Hanging tractor lens',(0,-.56,0),(.53,.25,.53),2)
        box('Twin sensor visor',(0,.47,1.05),(.66,.13,.1),2,.03)
    elif kind=='bomber':
        box('Armored carrier fuselage',(0,.02,0),(2.65,.7,1.42),0,.16)
        plate('Bridge recessed chassis',[(-1.28,-.57),(-1.48,0),(-1.28,.57),(.5,.57),(.85,0),(.5,-.57)],.26,.58,0,.055)
        plate('Bridge nose armor',[(-1.29,-.53),(-1.46,0),(-1.29,.53),(-.69,.53),(-.69,-.53)],.53,.66,1,.035)
        for z in [-.39,.39]:box('Bridge lateral armor',(-.04,.61,z),(.99,.13,.26),1,.03)
        box('Bridge central recessed access',(-.05,.59,0),(.9,.045,.38),0,.025)
        for x in [-.34,-.1,.14]:box('Bridge cooling louver',(x,.625,0),(.09,.035,.3),1,.012)
        plate('Bridge rear sloped armor',[(.5,-.51),(.8,0),(.5,.51),(.46,.51),(.46,-.51)],.51,.62,1,.025)
        box('Bridge visor',(-1.53,.52,0),(.15,.19,.87),2,.035)
        for z in [-1.28,1.28]:
            box('Nacelle pylon',(.1,.07,z*.6),(1.6,.15,.8),0,.045)
            box('Nacelle recessed pressure shell',(.15,-.04,z),(3.3,.56,.61),0,.11)
            for x in [-1.08,-.31,.46,1.23]:
                box('Segmented nacelle upper armor',(x,.22,z),(.7,.16,.64),1,.045)
                for side in [-1,1]:box('Nacelle removable cheek',(x,-.055,z+side*.3),(.67,.3,.055),1,.03)
            box('Engine service recess',(.42,.315,z),(.8,.03,.42),0,.025)
            for x in [.16,.38,.6]:box('Engine radiator louver',(x,.345,z),(.09,.035,.33),1,.012)
            # An armored horseshoe around the open intake creates actual depth.
            for side in [-1,1]:box('Intake protective cheek',(-1.45,-.04,z+side*.29),(.33,.51,.11),1,.03)
            box('Intake brow',(-1.45,.235,z),(.33,.12,.55),1,.025)
            cyl('Deep forward intake',(-1.53,-.04,z),.23,.09,0,axis=(1,0,0))
            cyl('Intake hub',(-1.59,-.04,z),.1,.1,1,axis=(1,0,0),verts=12)
            box('Rear drive outlet',(1.83,-.04,z),(.1,.28,.42),0,.025)
            box('Drive energized slit',(1.89,-.04,z),(.04,.12,.3),2,.01)

        box('Open bomb bay well',(0,-.38,0),(1.7,.17,.86),0,.03)
        for z in [-.51,.51]:box('Bay articulated door',(0,-.48,z),(1.75,.12,.2),1,.025,rot=(0,0,z*.24))
        for x in [-.52,0,.52]:
            cyl('Ready torpedo',(x,-.55,0),.14,.6,1,axis=(0,0,1),verts=12)
            box('Bay arming indicator',(x,-.63,.33),(.2,.06,.12),2,.015)
    elif kind=='interceptor':
        plate('Arrowhead pressure hull',[(-2.05,0),(-.3,-.52),(1.3,-.36),(1.7,0),(1.3,.36),(-.3,.52)],-.12,.19,1,.065)
        for s in [-1,1]:
            plate('Swept scimitar wing',[(-.5,s*.3),(.85,s*1.35),(1.72,s*1.45),(1.05,s*.55)],-.14,-.02,0,.035)
            plate('Wing leading armor',[(-.38,s*.38),(.85,s*1.28),(1.27,s*1.31),(.7,s*.68)],-.005,.07,1,.02)
            cyl('Vector engine',(1.13,.02,s*.43),.22,.85,0,axis=(1,0,0),verts=20)
            cyl('Recessed exhaust',(1.57,.02,s*.43),.15,.025,2,axis=(1,0,0),verts=20)
        sphere('Smoked low canopy',(-.2,.24,0),(.7,.21,.29),0)
        box('Canopy red slit',(-.45,.32,.24),(.5,.1,.06),2,.01)
        for z in [-.4,.4]:
            profile('Swept dorsal stabilizer',[(.39,.1),(1.48,.1),(1.23,.38),(.97,1.17),(.65,1.22)],z,.08,1,.022)
            profile('Stabilizer inset',[(.65,.35),(1.22,.27),(.96,1.04),(.79,1.08)],z+.045,.025,0,.012)
            box('Fin identification lamp',(.81,1.1,z+.065),(.27,.095,.065),2,.018)
        profile('Ventral directional keel',[(.4,-.09),(1.35,-.09),(1.12,-.58),(.85,-.68)],0,.1,0,.025)
        # Permanent roll exposes the swept planform in the low side-on game camera.
        bank=Matrix.Rotation(math.radians(25),4,'X')
        for o in collection.objects:o.matrix_world=bank@o.matrix_world
    elif kind=='mine':
        sphere('Mine pressure sphere',(0,0,0),(.61,.61,.61),0)
        ring('Equatorial armor band',(0,0,0),.59,.08,1)
        for i in range(6):
            a=i*math.tau/6;d=Vector((math.sin(a),math.cos(a),0))
            cyl('Detonator socket',d*.55,.18,.2,1,axis=d,verts=12)
            cyl('Contact spike',d*.88,.12,.52,0,r2=.015,axis=d,verts=8)
        cyl('Front lens bezel',(0,0,.57),.29,.1,1,axis=(0,0,1),verts=24)
        sphere('Armed sensor',(0,0,.65),(.21,.21,.09),2)
    elif kind=='skimmer':
        profile('Sloped armored glacis',[(-1.52,-.12),(-1.04,.42),(.64,.42),(1.18,.11),(1.12,-.14)],0,1.25,1,.065)
        box('Recessed glacis access',(-.29,.443,0),(.73,.05,.72),0,.035)
        box('Armored access hatch',(-.29,.48,0),(.6,.05,.58),1,.025)
        for z in [-.51,.51]:beam('Glacis edge rail',(-1.26,.17,z),(-.96,.43,z),.045,0)
        for z in [-.83,.83]:
            profile('Angled hover skid',[(-1.39,-.18),(-1.06,.03),(.94,.03),(1.36,-.2),(1.08,-.43),(-1.08,-.43)],z,.46,0,.06)
            for x in [-.85,-.35,.15,.65]:box('Pontoon sacrificial pad',(x,-.16,z),(.29,.43,.5),1,.05)
            box('Suspension float slit',(-.12,-.4,z*.99),(1.75,.06,.49),2,.015)
        box('Remote turret',(-.18,.56,0),(.86,.38,.7),0,.085)
        cyl('Barrel cooling sleeve',(-.91,.56,0),.12,.85,1,axis=(1,0,0),verts=16)
        cyl('Recessed muzzle',(-1.36,.56,0),.075,.05,0,axis=(1,0,0),verts=16)
        box('Acquisition visor',(-.24,.64,.36),(.42,.09,.05),2,.025)
    elif kind=='leech':
        for i in range(6):
            y=-1.16+i*.39;x=math.sin(i*.65)*.14;r=.3+i*.055
            sphere('Flexible vertebral coupling',(x,y,0),(r*.74,.27,.32),0,16,8)
            # A pointed shell overlaps the joint; the exposed flexible gap remains dark.
            shell=[(x-r*.87,y-.07,.09),(x-r*.61,y+.16,.12),(x+r*.61,y+.16,.12),(x+r*.87,y-.07,.09),(x+r*.57,y-.28,.14),(x,y-.36,.2),(x-r*.57,y-.28,.14),
                   (x-r*.58,y-.05,.42),(x,y+.17,.49),(x+r*.58,y-.05,.42),(x,y-.28,.49)]
            faces=[(6,5,4,3,2,1,0),(0,1,8,7),(1,2,8),(2,3,9,8),(3,4,10,9),(4,5,10),(5,6,7,10),(6,0,7),(7,8,9,10)]
            me=bpy.data.meshes.new('Tapered overlapping chitin');me.from_pydata(shell,[],faces);me.update()
            o=bpy.data.objects.new('Pointed chitin shield',me);collection.objects.link(o);add(o,o.name,1,.028)
            profile('Raised rear shell spine',[(x-.04,y-.13),(x+.04,y-.13),(x+.025,y+.2),(x-.025,y+.2)],.59,.15,0,.015)
            for s in [-1,1]:
                a=(x+s*r*.65,y-.05,.06); b=(x+s*(r+.16),y-.19,.09); c=(x+s*(r+.26),y-.4,.23)
                beam('Jointed lateral limb',a,b,.065,0);beam('Hooked grasping digit',b,c,.045,1)
        cyl('Tapered caudal spine',(0,-1.52,.16),.12,.5,1,r2=.012,axis=(0,-1,0),verts=8)
        for s in [-1,1]:
            beam('Mandible hinge',(s*.31,1.02,.1),(s*.46,1.31,.14),.1,0)
            beam('Curved feeding fang',(s*.46,1.31,.14),(s*.2,1.54,.23),.07,1)
            sphere('Feeding sensor',(s*.22,.94,.57),(.115,.13,.07),2,16,8)
    elif kind=='rock':
        # Seven distinct sheared chunks, each with a broken shoulder and chisel bevel.
        rng=random.Random(984)
        specs=[(-.58,-.04,-.23,.76,1.04,.72),(.51,-.08,-.15,.73,.93,.76),(-.06,.13,.38,.57,1.1,.55),(-.87,-.65,.41,.48,.45,.57),(.77,-.64,.5,.51,.48,.5),(-.27,-.68,.88,.52,.38,.29),(.09,.67,-.31,.39,.56,.44)]
        for i,(cx,cy,cz,rx,ry,rz) in enumerate(specs):
            n=5;vs=[];phase=i*.73
            for level,(height,scale,shift) in enumerate([(-1,.93,-.14),(.25,1,.07),(1,.53,.2)]):
                for j in range(n):
                    a=j*math.tau/n+phase;ir=rng.uniform(.88,1.12)
                    vs.append((cx+math.cos(a)*rx*scale*ir+shift*rx,cy+height*ry+rng.uniform(-.08,.08)*ry,cz+math.sin(a)*rz*scale*ir+shift*rz))
            fs=[tuple(range(n-1,-1,-1)),tuple(range(n*2,n*3))]
            for level in range(2):
                for j in range(n):fs.append((level*n+j,level*n+(j+1)%n,(level+1)*n+(j+1)%n,(level+1)*n+j))
            me=bpy.data.meshes.new('Sheared basalt fracture');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('Chiselled basalt chunk '+str(i),me);collection.objects.link(o)
            add(o,o.name,0 if i in [1,3,5] else 1,.045)
        # Embedded angular inclusions emerge from the dark fracture on the player-facing side.
        for x,y,z,sc in [(-.19,.25,.84,.18),(.09,-.07,.99,.14),(.38,-.34,.91,.12)]:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=sc,location=(x,y,z));o=bpy.context.object;o.scale=(.5,1.9,.55);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);add(o,'Embedded quartz cleavage',2,.012)
    elif kind=='boss':
        cyl('Carrier ring chassis',(0,.05,0),4.55,.66,0,r2=3.7,verts=56)
        for s in [-1,1]:
            plate('Wing recessed structural frame',[(s*.95,-2.55),(s*3.65,-1.95),(s*4.6,-.4),(s*4.6,.55),(s*3.55,2.05),(s*1.05,2.5)],.23,.51,0,.07)
            plate('Leading edge wing armor',[(s*1.02,-2.5),(s*3.61,-1.9),(s*4.46,-.47),(s*3.48,-.82),(s*1.08,-1.24)],.48,.69,1,.055)
            plate('Trailing edge wing armor',[(s*1.12,1.23),(s*3.49,.88),(s*4.43,.58),(s*3.48,1.98),(s*1.12,2.42)],.48,.66,1,.055)
            plate('Outer wing shield',[(s*3.72,-.86),(s*4.52,-.36),(s*4.52,.49),(s*3.72,.86)],.48,.69,1,.045)
            for z in [-1.77,1.7]:
                box('Wing service hatch',(s*2.19,.715,z),(.72,.07,.42),0,.04)
                box('Service hatch inset',(s*2.19,.755,z),(.58,.035,.29),1,.025)
            # Grouped heat exchangers fill the structural channel between armor panels.
            for z in [-.96,.96]:
                box('Deep radiator housing',(s*2.01,.53,z),(1.09,.09,.39),0,.03)
                for x in [1.65,1.89,2.13,2.37]:box('Radiator blade',(s*x,.62,z),(.11,.12,.31),1,.015)
            beam('Pylon hydraulic actuator',(s*2.65,.48,-.68),(s*2.65,1.1,-.45),.08,1)
            box('Monolithic command pylon',(s*3.1,.84,0),(1.05,1.3,1.48),0,.15)
            for z in [-.53,.53]:box('Pylon split armored cap',(s*3.1,1.5,z),(1.19,.19,.48),1,.06)
            for z in [-.42,0,.42]:box('Pylon side access rib',(s*3.64,.93,z),(.06,.72,.12),1,.02)
            box('Pylon signal strip',(s*3.1,1.59,.12),(.44,.035,.64),2,.02)
            for z in [-1.1,1.1]:
                cyl('Heavy thruster collar',(s*2.4,-.34,z),.47,.52,0,r2=.35,verts=24)
                cyl('Heavy thruster mouth',(s*2.4,-.63,z),.31,.07,2,verts=24)
            beam('Underslung cannon',(s*3.1,-.22,.6),(s*3.1,-1.1,.6),.14,1)

        sphere('Recessed command pressure dome',(0,.72,0),(1.5,.6,1.25),0)
        cyl('Crown central core housing',(0,1.11,0),.52,.44,0,r2=.4,verts=24)
        cyl('Crown core aperture',(0,1.35,0),.28,.04,2,verts=24)
        for i in range(8):
            a=i*math.tau/8;d=.27
            outline=[(math.cos(t)*r,math.sin(t)*r*.85) for r,t in [(.63,a-d),(1.37,a-d),(1.49,a),(1.37,a+d),(.63,a+d)]]
            plate('Segmented crown shield',outline,1.02,1.19,1,.04)
        ring('Crown cooling channel',(0,.9,0),1.37,.065,0)
        for i in range(12):
            a=i*math.tau/12;d=.15
            outline=[(math.cos(t)*r,math.sin(t)*r) for r,t in [(3.55,a-d),(4.38,a-d),(4.38,a+d),(3.55,a+d)]]
            plate('Recessed circumferential hull panel',outline,.08,.16,1,.02)
        ring('Reactor armored retaining ring',(0,-.47,0),1.1,.18,1)
        sphere('Exposed central reactor',(0,-.58,0),(.86,.77,.86),2)
        for i in range(8):
            a=i*math.tau/8;beam('Reactor containment rib',(math.cos(a)*1.07,-.34,math.sin(a)*1.07),(math.cos(a)*.74,-1.05,math.sin(a)*.74),.07,0)
        for x in [-.7,0,.7]:box('Command optic',(x,.71,1.35),(.36,.14,.1),2,.035)

kinds=['drone','bomber','hunter','interceptor','rock','mine','skimmer','leech','boss']
for k in kinds:build(k)
# One authoritative sRGB palette table is exported for the runtime and used by Blender.
def material_config(color,metalness,roughness,name,emissive='#000000',intensity=0):
    return {'color':color,'metalness':metalness,'roughness':roughness,'name':name,'emissive':emissive,'emissiveIntensity':intensity}
material_table={}
for k in kinds:
    mineral=k=='rock'
    armor_color={'rock':'#745848','leech':'#a1aa8b','hunter':'#9cbbb3','bomber':'#aeb6ac','boss':'#9aaeb5'}.get(k,'#aebdc0')
    material_table[k]=[
        material_config('#4a3830' if mineral else '#303d37' if k=='leech' else '#34414c',.05 if mineral else .45,.95 if mineral else .64,k+'-mechanisms'),
        material_config(armor_color,.05 if mineral else .12 if k=='leech' else .35,.95 if mineral else .56,k+'-armor'),
        material_config('#d1b685' if mineral else '#80ffe1' if k=='hunter' else '#fc685a',.3,.25,'mineral-seam' if mineral else k+'-signal','#453012' if mineral else '#28b58b' if k=='hunter' else '#b52c31',.3 if mineral else 2),
    ]
def linear_hex(hex_color):
    rgb=[int(hex_color[i:i+2],16)/255 for i in [1,3,5]]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb)+(1,)
for k in kinds:
    scene=bpy.data.scenes.new(k.title()+' asset');scene.collection.children.link(bpy.data.collections[k])
    palette=[]
    for config in material_table[k]:
        m=bpy.data.materials.new(config['name']);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF')
        m.diffuse_color=linear_hex(config['color']);bs.inputs['Base Color'].default_value=linear_hex(config['color'])
        bs.inputs['Metallic'].default_value=config['metalness'];bs.inputs['Roughness'].default_value=config['roughness']
        bs.inputs['Emission Color'].default_value=linear_hex(config['emissive']);bs.inputs['Emission Strength'].default_value=config['emissiveIntensity'];palette.append(m)
    for o in bpy.data.collections[k].objects:o.data.materials[0]=palette[o['palette']]
# Fit visible authored pieces to unchanged shot circles. The yawing drone uses a
# 3D sphere envelope; all other bank-only models preserve the XY circle under pose.
# Uniform original-object transforms keep Blender preview and runtime geometry identical.
hit_radii={k:5.0 if k=='boss' else 2.5 if k=='bomber' else 1.5 for k in kinds}
model_scales={}
bpy.context.view_layer.update();fit_deps=bpy.context.evaluated_depsgraph_get()
for k in kinds:
    radius=0
    for o in bpy.data.collections[k].objects:
        ev=o.evaluated_get(fit_deps);me=ev.to_mesh()
        for v in me.vertices:
            p=o.matrix_world@v.co;radius=max(radius,p.length if k=='drone' else math.hypot(p.x,p.y))
        ev.to_mesh_clear()
    scale=min(1,(hit_radii[k]-.003)/radius);model_scales[k]=scale
    transform=Matrix.Diagonal((scale,scale,scale,1))
    for o in bpy.data.collections[k].objects:o.matrix_world=transform@o.matrix_world
    bpy.context.view_layer.update();fit_deps.update()

# Export evaluated bevels and weighted normals, deduplicated per palette.
out={'version':1,'generator':'Blender '+bpy.app.version_string,'generatorScriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'positionScale':4096,'normalScale':32767,'ambientOcclusion':{'method':'12 cosine hemisphere BVH rays','floor':0.65,'radius':0.55,'bossRadius':1.0},'materials':material_table,'modelScales':model_scales,'hitRadius':hit_radii,'models':{}}
deps=bpy.context.evaluated_depsgraph_get()
for k in kinds:
    # Actual geometric visibility from evaluated model triangles, without ground or random dirt.
    world_vertices=[]; world_faces=[]
    for o in bpy.data.collections[k].objects:
        if o.type!='MESH':continue
        ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();offset=len(world_vertices)
        world_vertices.extend(o.matrix_world@v.co for v in me.vertices)
        world_faces.extend(tuple(offset+i for i in t.vertices) for t in me.loop_triangles)
        ev.to_mesh_clear()
    bvh=BVHTree.FromPolygons(world_vertices,world_faces,all_triangles=True)
    ao_cache={}
    def visibility(p,n):
        key=tuple(p)+tuple(n)
        if key in ao_cache:return ao_cache[key]
        tangent=n.cross(Vector((0,0,1)) if abs(n.z)<.9 else Vector((0,1,0))).normalized();bitangent=n.cross(tangent)
        blocked=0
        for j in range(12):
            z=math.sqrt((j+.5)/12);r=math.sqrt(1-z*z);a=j*2.399963229728653
            direction=tangent*(math.cos(a)*r)+bitangent*(math.sin(a)*r)+n*z
            if bvh.ray_cast(p+n*.012,direction,1.0 if k=='boss' else .55)[0] is not None:blocked+=1
        value=round(255*(1-.35*blocked/12));ao_cache[key]=value;return value
    batches=[];total=0;removed=0
    for pal in range(3):
        vertices=[];normals=[];colors=[];indices=[];lookup={}
        for o in bpy.data.collections[k].objects:
            if o.type!='MESH' or o.get('palette')!=pal:continue
            ev=o.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles();nm=o.matrix_world.to_3x3().inverted().transposed()
            for tri in me.loop_triangles:
                # Filter in final quantized coordinates, since packing can collapse tiny faces.
                pts=[Vector(tuple(round(c*4096)/4096 for c in o.matrix_world@me.vertices[i].co)) for i in tri.vertices]
                if (pts[1]-pts[0]).cross(pts[2]-pts[0]).length*.5<1e-10:
                    removed+=1;continue
                for li in tri.loops:
                    loop=me.loops[li];v=o.matrix_world@me.vertices[loop.vertex_index].co;n=(nm@me.corner_normals[li].vector).normalized()
                    p=tuple(round(c*4096) for c in v);nn=tuple(round(c*32767) for c in n);key=p+nn
                    if key not in lookup:
                        lookup[key]=len(vertices)//3;vertices.extend(p);normals.extend(nn);shade=visibility(v,n);colors.extend([shade]*3)
                    indices.append(lookup[key])
            ev.to_mesh_clear()
        if indices:
            # Canonicalize actual packed values, not a digest. Preserve each face's winding.
            keys=[tuple(vertices[i:i+3]+normals[i:i+3]+colors[i:i+3]) for i in range(0,len(vertices),3)]
            order=sorted(range(len(keys)),key=lambda i:keys[i]);remap={old:new for new,old in enumerate(order)}
            vertices=[c for old in order for c in keys[old][:3]]
            normals=[c for old in order for c in keys[old][3:6]]
            colors=[c for old in order for c in keys[old][6:9]]
            triangles=[]
            for i in range(0,len(indices),3):
                tri=tuple(remap[j] for j in indices[i:i+3])
                triangles.append(min(tri,tri[1:]+tri[:1],tri[2:]+tri[:2]))
            indices=[i for tri in sorted(triangles) for i in tri]
            assert len(vertices)//3<65536
            enc=lambda a,t:base64.b64encode(struct.pack('<'+t*len(a),*a)).decode('ascii')
            batches.append({'palette':pal,'position':enc(vertices,'h'),'normal':enc(normals,'h'),'index':enc(indices,'H'),'color':enc(colors,'B'),'triangles':len(indices)//3})
            total+=len(indices)//3
    out['models'][k]=batches;print(k,total,'triangles;',removed,'degenerates removed',flush=True)
    out.setdefault('degenerateTrianglesRemoved',{})[k]=removed
    assert total<(18000 if k=='boss' else 8000),(k,total)
(ROOT/'src/game/assets/enemies.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
# Main scene opens with the scout visible; the scene selector exposes the other eight assets.
for k in kinds:
    if k!='drone': bpy.context.scene.collection.children.unlink(bpy.data.collections[k])
bpy.context.scene.name='Drone asset (default)'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/enemies.blend'))

print('ENEMY_EXPORT '+json.dumps({'models':{k:sum(b['triangles'] for b in v) for k,v in out['models'].items()},'ao':out['ambientOcclusion'],'degenerateTrianglesRemoved':out['degenerateTrianglesRemoved'],'generatorScriptSha256':out['generatorScriptSha256'],'modelScales':model_scales,'hitRadius':hit_radii,'batches':sum(len(v) for v in out['models'].values())}),flush=True)
