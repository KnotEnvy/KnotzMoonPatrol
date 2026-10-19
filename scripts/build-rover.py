"""Author and export the Moon Patrol rover. Run with Blender 5.2 --background --python.

Coordinates in helper calls use the game's X-forward, Y-up, Z-width convention.
This script is authoritative: rebuilding replaces BOTH rover.blend and rover.json.
Hand edits to the generated .blend will be overwritten; make lasting changes here.
The editable .blend retains named components, material slots, and live bevels.
Evaluated geometry is exported by animation part/material, so runtime needs no loader.
"""
import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in bpy.data.materials:
    bpy.data.materials.remove(block)

PALETTE = {
    'ceramic': ('#d2d5c8', .42, .38),
    'graphite': ('#17252c', .48, .48),
    'orange': ('#d96832', .35, .44),
    'glass': ('#246978', .68, .18),
    'light': ('#9ce4e7', .2, .22),
    'metal': ('#6e8184', .76, .38),
}
def srgb_hex_linear(color):
    def linear(channel):
        value = int(channel, 16) / 255
        return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
    return tuple(linear(color[i:i+2]) for i in (1, 3, 5)) + (1,)

materials = {}
for name, (color, metal, rough) in PALETTE.items():
    m = bpy.data.materials.new(name)
    m.diffuse_color = srgb_hex_linear(color)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = m.diffuse_color
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if name == 'light':
        bsdf.inputs['Emission Color'].default_value = srgb_hex_linear('#2ba4b2')
        bsdf.inputs['Emission Strength'].default_value = 1.3
    materials[name] = m


def coord(p):
    return (p[0], -p[2], p[1])


def finish(obj, name, material, part='body', bevel=0):
    obj.name = name
    obj['animation_part'] = part
    obj.data.materials.append(materials[material])
    if part == 'wheel' and bevel < .04:
        bevel = 0
    if bevel:
        # Clamp to actual local mesh dimensions, before evaluated bevel topology.
        smallest=min(max(v.co[axis] for v in obj.data.vertices)-min(v.co[axis] for v in obj.data.vertices) for axis in range(3))
        bevel=min(bevel,.45*smallest)
    if bevel:
        modifier = obj.modifiers.new('Machined edge radius', 'BEVEL')
        modifier.width = bevel
        modifier.segments = (1 if part == 'wheel' or bevel < .02 else 2)
        modifier.harden_normals = True
        modifier.limit_method = 'ANGLE'
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        normal = obj.modifiers.new('Area weighted fabrication normals', 'WEIGHTED_NORMAL')
        normal.keep_sharp = True
        normal.weight = 50
    return obj


def box(name, size, position, material, bevel=.025, part='body', angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=coord(position))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler[1] = -angle
    return finish(obj, name, material, part, bevel)


def prism(name, profile, depth, z, material, bevel=.025, part='body'):
    vertices = [coord((x, y, zz)) for zz in (z-depth/2, z+depth/2) for x,y in profile]
    n = len(profile)
    # Converted coordinates preserve winding: front cap clockwise, rear CCW.
    faces = [tuple(reversed(range(n))), tuple(range(n, n*2))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, material, part, bevel)


def cylinder(name, radius, depth, position, material, part='body', vertices=24, bevel=.012, axis='z'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=coord(position))
    obj = bpy.context.object
    if axis == 'z':
        obj.rotation_euler[0] = math.pi/2
    elif axis == 'x':
        obj.rotation_euler[1] = math.pi/2
    return finish(obj, name, material, part, bevel)


def ring(name, major, minor, position, material, part='wheel', major_segments=24, minor_segments=4):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=major_segments,
                                  minor_segments=minor_segments, location=coord(position))
    obj=bpy.context.object
    obj.rotation_euler[0]=math.pi/2
    for face in obj.data.polygons:
        face.use_smooth=True
    return finish(obj,name,material,part)

# A low armored bathtub with tapered bow, inset underside and structural sill.
prism('Chassis / tapered pressure tub', [(-2.26,-.24),(2.22,-.24),(2.34,.06),(1.94,.38),(-1.98,.38),(-2.3,.08)], 1.92, 0, 'graphite', .07)
prism('Hull / ceramic upper armor', [(-2.16,.2),(2.14,.2),(1.97,.62),(-1.84,.7),(-2.18,.5)], 1.98, 0, 'ceramic', .065)
box('Hull / belly keel',(3.8,.17,1.24),(-.08,-.3,0),'metal',.04)
for side in [-1,1]:
    z=side
    # Real panel separation: dark recessed channel around individual access doors.
    box('Sill / recessed lower channel',(4.13,.19,.11),(-.1,.2,z*1.015),'graphite',.02)
    box('Sill / impact rail',(4.2,.11,.23),(-.08,.07,z*1.07),'metal',.025)
    prism('Aft / orange shoulder', [(-2.12,.35),(-.42,.35),(-.42,.65),(-1.89,.7),(-2.12,.54)], .055,z*1.028,'orange',.018)
    box('Service / recessed cassette',(1.17,.29,.045),(-1.22,.46,z*1.067),'graphite',.025)
    for i in range(5):
        box('Cooling / diagonal louvre',(.065,.22,.035),(-1.64+i*.2,.46,z*1.101),'metal',.008,angle=-.22)
    box('Bow / separate armor panel',(.83,.34,.07),(1.48,.41,z*1.03),'ceramic',.04)
    box('Bow / identity stripe',(.16,.33,.08),(1.18,.42,z*1.075),'orange',.012)
    box('Step / side foot rail',(.68,.075,.14),(.32,.07,z*1.21),'graphite',.018)
    # Two compact tow points and retained headlight mounts.
    box('Nose / headlight housing',(.17,.26,.47),(2.06,.42,z*.72),'graphite',.035)
    box('Nose / headlight lens',(.035,.12,.32),(2.157,.45,z*.72),'light',.018)
    box('Tail / motor pod',(.48,.34,.42),(-2.15,.1,z*.66),'graphite',.055)
    box('Tail / orange pod cap',(.055,.21,.3),(-2.415,.1,z*.66),'orange',.02)
box('Nose / collision bumper',(.18,.22,2.28),(2.24,.02,0),'graphite',.035)
box('Nose / recessed bumper insert',(.025,.065,1.46),(2.342,.03,0),'metal',.01)

# Faceted, angled pressure cabin. Sealed glass is recessed behind the shell frames.
cabin=[(-.36,.66),(1.46,.66),(1.36,1.26),(1.07,1.59),(-.19,1.59),(-.4,1.36)]
prism('Cabin / pressure shell',cabin,1.73,0,'ceramic',.055)
# Broad side windows, charcoal seals, enamel frames and a substantial B pillar.
for side in [-1,1]:
    z=side*.876
    seal=[(-.22,.97),(1.27,.97),(1.21,1.24),(.99,1.47),(-.16,1.47)]
    glass=[(-.13,1.035),(1.18,1.035),(1.13,1.22),(.94,1.395),(-.09,1.395)]
    prism('Cabin / recessed side seal',seal,.028,z,'graphite',.016)
    prism('Cabin / blue side glazing',glass,.019,z+side*.018,'glass',.012)
    box('Cabin / vertical orange pillar',(.13,.5,.06),(.13,1.23,z+side*.04),'orange',.018)
    box('Cabin / door lower panel',(.66,.21,.035),(.58,.82,z+side*.006),'ceramic',.025)
    box('Cabin / recessed door handle',(.19,.035,.025),(.72,.926,z+side*.028),'graphite',.007)
    box('Cabin / roof edge rail',(1.54,.075,.095),(.48,1.62,z*.98),'graphite',.02)
    # Geometric expedition badge: orange square, pale inset, dark bar.
    box('Marking / mission badge',(.22,.17,.018),(-.17,.81,z+side*.028),'orange',.009)
    box('Marking / badge stripe',(.11,.022,.021),(-.17,.81,z+side*.041),'ceramic',.002)
# Angled bow glazing follows pressure-shell slope rather than a floating cube.
prism('Cabin / windshield gasket',[(1.397,.97),(1.443,.97),(1.354,1.262),(1.301,1.257)],1.51,0,'graphite',.012)
prism('Cabin / inset windshield',[(1.422,1.018),(1.431,1.02),(1.367,1.226),(1.35,1.226)],1.35,0,'glass',.006)
box('Cabin / windshield center mullion',(.044,.29,.065),(1.391,1.12,0),'ceramic',.008,angle=.25)
box('Roof / raised equipment cap',(.66,.095,1.1),(.46,1.664,0),'ceramic',.028)
box('Roof / orange inset',(.3,.015,.88),(.48,1.721,0),'orange',.008)

# Recessed equipment bed at the rear: large clear masses with spaced radiator ribs.
box('Deck / gasket',(1.46,.14,1.67),(-1.38,.75,0),'graphite',.045)
box('Deck / radiator block',(1.2,.16,1.4),(-1.4,.87,0),'metal',.025)
for i in range(7):
    box('Deck / radiator fins',(.085,.1,1.22),(-1.94+i*.18,.985,0),'graphite',.008)
for side in [-1,1]:
    box('Deck / raised guard',(1.4,.08,.09),(-1.4,.99,side*.79),'ceramic',.018)
box('Antenna / mast',(.065,1.05,.065),(-1.75,1.51,-.7),'graphite',.012)
box('Antenna / orange tip',(.1,.15,.1),(-1.75,2.11,-.7),'orange',.02)
# Fixed front blaster remains aligned with the original projectile origin.
box('Blaster / root',(.37,.31,.49),(2.18,.6,0),'ceramic',.04)
box('Blaster / dark barrel',(.62,.18,.31),(2.52,.6,0),'graphite',.025)
box('Blaster / collar',(.13,.24,.4),(2.73,.6,0),'orange',.025)
box('Blaster / muzzle aperture',(.04,.12,.29),(2.86,.6,0),'light',.014)

# Independently aiming vertical weapon/sensor, authored in pivot-local coordinates.
cylinder('Turret / rotary base',.35,.13,(0,-.005,0),'graphite','turret',24,.018,axis='y')
box('Turret / armored receiver',(.48,.3,.47),(0,.17,0),'ceramic',.045,'turret')
box('Turret / barrel',(.14,.79,.18),(0,.69,0),'ceramic',.02,'turret')
box('Turret / recessed barrel line',(.028,.62,.025),(.08,.69,.07),'graphite',.006,'turret')
box('Turret / muzzle housing',(.23,.19,.28),(0,1.13,0),'graphite',.03,'turret')
box('Turret / vertical aperture',(.15,.035,.19),(0,1.239,0),'light',.009,'turret')

# One reusable wheel, instanced at all six physics pivots. Tire radius remains .66.
cylinder('Wheel / tire carcass',.625,.47,(0,0,0),'graphite','wheel',32,.045)
# Twelve broad split chevrons read at gameplay scale; grooves remain true geometry.
for i in range(14):
    a=i*math.tau/14
    for side in [-1,1]:
        tread=box('Wheel / angled traction pad',(.19,.065,.225),(math.sin(a)*.632,math.cos(a)*.632,side*.116),'graphite',.012,'wheel',angle=-a)
        # The large circumferential pads avoid noisy, subpixel surface detail.
for side in [-1,1]:
    cylinder('Wheel / recessed rim',.414,.035,(0,0,side*.249),'metal','wheel',24,.012)
    ring('Wheel / ceramic bead ring',.378,.035,(0,0,side*.274),'ceramic',major_segments=24,minor_segments=4)
    cylinder('Wheel / dark hub well',.291,.042,(0,0,side*.275),'graphite','wheel',16,.012)
    for i in range(6):
        a=i*math.tau/6
        box('Wheel / radial spoke',(.105,.24,.037),(math.sin(a)*.204,math.cos(a)*.204,side*.303),'ceramic',.012,'wheel',angle=-a)
    cylinder('Wheel / orange axle cap',.147,.075,(0,0,side*.311),'orange','wheel',12,.012)
    cylinder('Wheel / axle inset',.073,.013,(0,0,side*.354),'graphite','wheel',8,.004)

# Static suspension anchor blocks retain six wheel motion clearances.
for z in [-1.17,1.17]:
    for x in [-1.55,0,1.55]:
        box('Suspension / shoulder anchor',(.33,.24,.29),(x-.27,-.06,z*.58),'graphite',.035)

# Production details follow actual service boundaries rather than surface noise.
for side in [-1,1]:
    z=side
    # The utility hatch lives in the broad flank below the cabin.
    box('Service / hatch perimeter',(.96,.275,.022),(.48,.443,z*1.041),'graphite',.012)
    box('Service / inset ceramic hatch',(.91,.227,.026),(.48,.443,z*1.058),'ceramic',.014)
    for x in [.09,.87]:
        for y in [.36,.524]:
            cylinder('Service / captive hex fastener',.024,.012,(x,y,z*1.079),'metal',vertices=6,bevel=0)
    # Door perimeter aligns with the orange hinge pillar and window reveal.
    box('Door / rear seam',(.022,.7,.016),(.245,1.105,z*.908),'graphite',.004)
    box('Door / threshold seam',(.99,.022,.016),(.75,.756,z*.892),'graphite',.004)
    for y in [.84,1.35]:
        box('Door / structural hinge',(.11,.085,.053),(.245,y,z*.925),'metal',.009)
    box('Door / latch recess',(.21,.062,.025),(1.09,.844,z*.901),'graphite',.009)
    box('Door / latch pull',(.12,.025,.035),(1.09,.844,z*.919),'metal',.006)
    # Distinct vent support rails, with visible dark gaps between louvres.
    for y in [.328,.59]:
        box('Cooling / inset vent lip',(1.09,.026,.025),(-1.22,y,z*1.103),'metal',.006)
    for x in [-1.74,-.7]:
        cylinder('Cooling / housing screw',.026,.012,(x,.458,z*1.111),'ceramic',vertices=6,bevel=0)
    # Small painted typography is real geometry, not a repeated face texture.
    bpy.ops.object.text_add(location=coord((.48,.395,z*1.078)))
    label=bpy.context.object
    label.data.body='VR / 06'
    label.data.align_x='CENTER'
    label.data.size=.14
    label.data.space_character=1.12
    label.data.resolution_u=2
    label.rotation_euler=(math.pi/2,0,0) if side==1 else (-math.pi/2,0,math.pi)
    bpy.ops.object.convert(target='MESH')
    finish(bpy.context.object,'Marking / VR 06 mission stencil','graphite')
    # Forward recovery eyes are real open rings, attached to bumper brackets.
    box('Recovery / bracket',(.14,.16,.2),(2.245,-.055,z*.77),'metal',.015)
    bpy.ops.mesh.primitive_torus_add(major_radius=.085,minor_radius=.024,major_segments=12,
        minor_segments=4,location=coord((2.35,-.055,z*.77)))
    eye=bpy.context.object
    eye.rotation_euler[1]=math.pi/2
    finish(eye,'Recovery / tow eye','orange')
# Hood and tail panels use narrow machined breaks and selected exposed hardware.
box('Hood / hatch shadow',(.56,.027,.9),(1.73,.653,0),'graphite',.018)
box('Hood / access hatch',(.5,.029,.84),(1.73,.672,0),'ceramic',.02)
for z in [-.34,.34]:
    box('Hood / hatch latch',(.13,.024,.065),(1.87,.698,z),'metal',.006)

# Organized editable source. Display collections follow animation boundaries.
for part in ['body','wheel','turret']:
    collection=bpy.data.collections.new('ROVER / '+part.upper())
    bpy.context.scene.collection.children.link(collection)
    for obj in list(bpy.context.scene.objects):
        if obj.get('animation_part')==part:
            for old in list(obj.users_collection): old.objects.unlink(obj)
            collection.objects.link(obj)
# Export evaluated, indexed geometry. Quantization keeps source imports compact.
depsgraph=bpy.context.evaluated_depsgraph_get()
# BVH baking uses the actual evaluated assembly; no procedural dirt/noise.
# A wheel-only BVH avoids baking a stationary chassis shadow onto spinning wheels.
bvh_vertices=[]
bvh_faces=[]
wheel_vertices=[]
wheel_faces=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH': continue
    evaluated=obj.evaluated_get(depsgraph)
    mesh=evaluated.to_mesh()
    mesh.calc_loop_triangles()
    world=[obj.matrix_world@v.co for v in mesh.vertices]
    triangles=[tuple(tri.vertices) for tri in mesh.loop_triangles
        if (world[tri.vertices[1]]-world[tri.vertices[0]]).cross(world[tri.vertices[2]]-world[tri.vertices[0]]).length*.5>=1e-10]
    part=obj['animation_part']
    offsets=[Vector((0,0,0))]
    if part=='wheel':
        base=len(wheel_vertices)
        wheel_vertices.extend(world)
        wheel_faces.extend(tuple(base+i for i in tri) for tri in triangles)
        offsets=[Vector(coord((x,-.6,z))) for z in [-1.17,1.17] for x in [-1.55,0,1.55]]
    elif part=='turret': offsets=[Vector(coord((-.6,1.18,0)))]
    for offset in offsets:
        base=len(bvh_vertices)
        bvh_vertices.extend(p+offset for p in world)
        bvh_faces.extend(tuple(base+i for i in tri) for tri in triangles)
    evaluated.to_mesh_clear()
assembly_bvh=BVHTree.FromPolygons(bvh_vertices,bvh_faces,all_triangles=True)
wheel_bvh=BVHTree.FromPolygons(wheel_vertices,wheel_faces,all_triangles=True)
ao_cache={}
def baked_color(obj,p,normal):
    part=obj['animation_part']
    sample_point=p+Vector(coord((-.6,1.18,0))) if part=='turret' else p
    key=(part,tuple(round(v,4) for v in sample_point),tuple(round(v,3) for v in normal))
    ao=ao_cache.get(key)
    if ao is None:
        tangent=normal.cross(Vector((0,0,1)))
        if tangent.length<.01: tangent=normal.cross(Vector((0,1,0)))
        tangent.normalize()
        bitangent=normal.cross(tangent).normalized()
        bvh=wheel_bvh if part=='wheel' else assembly_bvh
        blocked=0
        for i in range(12):
            u=(i+.5)/12
            phi=i*2.399963229728653
            radial=math.sqrt(u)
            direction=tangent*(math.cos(phi)*radial)+bitangent*(math.sin(phi)*radial)+normal*math.sqrt(1-u)
            hit,_,_,distance=bvh.ray_cast(sample_point+normal*.006,direction,.48)
            if hit is not None: blocked+=1-distance/.48
        ao=max(.65,1-blocked/12*.58)
        ao_cache[key]=ao
    # Named panel finishes stay consistent and restrained across both sides.
    tint=(1.,1.,1.)
    name=obj.name
    if 'inset ceramic hatch' in name: tint=(.91,.94,.91)
    elif 'pressure shell' in name: tint=(.98,.99,1.)
    elif 'armor panel' in name: tint=(.95,.965,.94)
    elif 'belly keel' in name or 'impact rail' in name: tint=(.87,.865,.82)
    # Wear belongs at the wheel's contact structure, not random facet speckles.
    elif part=='wheel' and ('tire carcass' in name or 'traction pad' in name): tint=(1.,.975,.93)
    return tuple(round(255*ao*t) for t in tint)

groups={}
for obj in bpy.context.scene.objects:
    if obj.type!='MESH': continue
    key=(obj['animation_part'],obj.data.materials[0].name)
    out=groups.setdefault(key,{'part':key[0],'material':key[1],'position':[],'normal':[],'color':[],'index':[],'lookup':{}})
    evaluated=obj.evaluated_get(depsgraph)
    mesh=evaluated.to_mesh()
    mesh.calc_loop_triangles()
    transform=obj.matrix_world
    normal_transform=transform.to_3x3().inverted().transposed()
    for tri in mesh.loop_triangles:
        # Validate the EXPORTED quantized triangle, not only Blender's float mesh.
        # Quantization itself can collapse a very short bevel edge.
        points=[transform@mesh.vertices[index].co for index in tri.vertices]
        quantized=[Vector(tuple(round(value*10000) for value in point)) for point in points]
        if (quantized[1]-quantized[0]).cross(quantized[2]-quantized[0]).length*.5/1e8<1e-10:
            continue
        for loop_index in tri.loops:
            loop=mesh.loops[loop_index]
            p=transform@mesh.vertices[loop.vertex_index].co
            normal=(normal_transform@mesh.corner_normals[loop_index].vector).normalized()
            position=tuple(round(v*10000) for v in (p.x,p.z,-p.y))
            n=tuple(round(v*32767) for v in (normal.x,normal.z,-normal.y))
            color=baked_color(obj,p,normal)
            vertex=position+n+color
            index=out['lookup'].get(vertex)
            if index is None:
                index=len(out['position'])//3
                out['lookup'][vertex]=index
                out['position'].extend(position)
                out['normal'].extend(n)
                out['color'].extend(color)
            out['index'].append(index)
    evaluated.to_mesh_clear()
result=[]
for out in groups.values():
    del out['lookup']
    result.append(out)
triangles={part:sum(len(g['index'])//3 for g in result if g['part']==part) for part in ['body','wheel','turret']}
asset={'version':1,'generatorScriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'generator':'Blender 5.2 / scripts/build-rover.py','positionScale':10000,'normalScale':32767,
       'colorScale':255,'ambientOcclusion':{'samples':12,'radius':.48,'floor':.65},'triangles':triangles,'materials':{name:{'color':v[0],'metalness':v[1],'roughness':v[2]} for name,v in PALETTE.items()},'meshes':result}
output=ROOT/'src/game/assets/rover.json'
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(asset,separators=(',',':')),encoding='utf8')
# Source scene previews the assembled rover while preserving runtime-local wheel/turret.
for obj in bpy.context.scene.objects:
    if obj.get('animation_part')=='turret': obj.location+=Vector(coord((-.6,1.18,0)))
# Linked display copies of the master wheel; they do not affect exported geometry.
wheel_objects=[o for o in bpy.context.scene.objects if o.get('animation_part')=='wheel']
for index,(x,z) in enumerate(( (x,z) for z in [-1.17,1.17] for x in [-1.55,0,1.55] )):
    for original in wheel_objects:
        if index==0:
            obj=original
        else:
            obj=original.copy()
            bpy.data.collections['ROVER / WHEEL'].objects.link(obj)
        # copies of master positions must not inherit the first display offset
        offset=Vector(coord((x,-.6,z)))
        obj.location=original.location+offset if index==0 else original.location-Vector(coord((-1.55,-.6,-1.17)))+offset
        obj['preview_instance']=index
bpy.context.scene['asset_notes']='Export uses game Y-up. Wheel master is local to its pivot; six linked copies shown here. Re-run script to rebuild JSON.'
bpy.context.scene['runtime_triangles']=triangles['body']+6*triangles['wheel']+triangles['turret']
bpy.context.scene.world.color=(.16,.19,.23)
source=ROOT/'assets/source/rover.blend'
source.parent.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(source))
print('ROVER_EXPORT '+json.dumps({'triangles':triangles,'runtimeTriangles':bpy.context.scene['runtime_triangles'],'batches':len(result),'jsonBytes':output.stat().st_size,'blendBytes':source.stat().st_size}))
