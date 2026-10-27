### Information Desk (`information`)

#### 1. Purpose & Real-World Analogue

A multi-tier customer service counter featuring a standard standing desk, an integrated lower wheelchair-accessible counter section, back panel signage, digital interaction tablet, brochure racks, and an elevated overhead wayfinding banner visible across the hall floor.

#### 2. Shape & Construction

Assembly tree centered at bottom base plane $(0, 0, 0)$:

* `MainStandingCounter`: `BoxGeometry` ($1.2\text{ m} \times 1.1\text{ m} \times 0.6\text{ m}$) at $X = -0.4\text{ m}$. Standard standing height counter.
* `AccessibleLowerCounter`: `BoxGeometry` ($0.8\text{ m} \times 0.76\text{ m} \times 0.6\text{ m}$) at $X = +0.6\text{ m}$. ADA-compliant knee-clearance desk.
* `CounterPlinth`: Base kick-plate (`BoxGeometry` $2.0\text{ m} \times 0.08\text{ m} \times 0.52\text{ m}$) recessed $0.04\text{ m}$ inward.
* `BackWallPanel`: Vertical backdrop (`BoxGeometry` $2.0\text{ m} \times 2.4\text{ m} \times 0.08\text{ m}$) at $Z = -0.46\text{ m}$.
* `BrochureRack`: Tiered wire/acrylic stand (`ExtrudeGeometry` $0.35\text{ m} \times 0.4\text{ m} \times 0.25\text{ m}$) placed on standing counter surface.
* `InteractionTablet`: Angled touch terminal (`BoxGeometry` $0.25\text{ m} \times 0.2\text{ m} \times 0.15\text{ m}$) tilted $45^\circ$ on counter top.
* `DeskLamp`: Gooseneck LED fixture (`TubeGeometry` + `CylinderGeometry`) mounted on back corner.
* `FloatingSignBanner`: Suspended overhead disc/cube (`CylinderGeometry` radius $0.4\text{ m}$, height $0.4\text{ m}$) floating at $Y = 3.5\text{ m}$ via vertical support rod (`CylinderGeometry` radius $0.015\text{ m}$, height $1.1\text{ m}$).

#### 3. Dimensions & Parameters

| Parameter | Default | Min | Max | Scales How | Locked? |
| --- | --- | --- | --- | --- | --- |
| Overall Width ($W$) | $2.0\text{ m}$ | $1.6\text{ m}$ | $3.2\text{ m}$ | Stretch X | No |
| Back Wall Height ($H$) | $2.4\text{ m}$ | $2.0\text{ m}$ | $3.2\text{ m}$ | Stretch Y | No |
| Depth ($D$) | $1.0\text{ m}$ | $0.8\text{ m}$ | $1.5\text{ m}$ | Stretch Z | No |
| Standing Counter Height | $1.1\text{ m}$ | $1.0\text{ m}$ | $1.15\text{ m}$ | Fixed Standard | Yes |
| Accessible Counter Height | $0.76\text{ m}$ | $0.72\text{ m}$ | $0.80\text{ m}$ | Fixed ADA Standard | Yes |
| Floating Sign Height | $3.5\text{ m}$ | $2.8\text{ m}$ | $4.5\text{ m}$ | Y-Offset | No |

#### 4. Materials & Colors

* `MainStandingCounter` & `BackWallPanel`: Matte Panel, Hex `#1E2022` (Neutral Dark), Roughness `0.85`, Metalness `0.05`.
* `CounterTopSurfaces`: High-Pressure Laminate, Hex `#F8F9FA` (Neutral White), Roughness `0.2`, Metalness `0.0`.
* `AccessibleLowerCounter`: Accent Trim, Wayfinding Cyan Hex `#06B6D4`, Roughness `0.8`, Metalness `0.0`.
* `FloatingSignBanner`: Emissive Acrylic, Wayfinding Cyan Hex `#06B6D4`, Emissive Intensity `0.6`.
* `BrochureRack`: Polished Acrylic, Hex `#F8F9FA`, Roughness `0.1`, Metalness `0.0`, Transmission `0.9`.

#### 5. Realism Details

* `[always]` $0.02\text{ m}$ chamfer edge bevel on front counter top edges; recessed $0.7\text{ m}$ knee clearance under accessible desk section.
* `[near-only]` Stacked colorful paper brochure sheets inside acrylic rack slots.
* `[near-only]` Glowing LED perimeter light strip beneath counter top overhang edge.

#### 6. Signage & Text

* **Back Panel & Floating Banner "i" Pictogram (Procedural Canvas Shape):**
```javascript
// 2D Canvas Context Draw Steps for "i" Symbol:
ctx.fillStyle = "#06B6D4"; // Wayfinding Cyan background circle
ctx.beginPath(); ctx.arc(128, 128, 120, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#FFFFFF"; // High-contrast White "i"
ctx.beginPath(); ctx.arc(128, 70, 16, 0, Math.PI * 2); ctx.fill(); // Top dot
ctx.roundRect(112, 106, 32, 80, 8); ctx.fill(); // Lower stem

```


* **Top-Down Legibility:** Floating banner renders as a glowing cyan circle with a centered white `"i"` icon in orthographic 2D view.

#### 7. Moving Parts

* `None` (Static facility counter).

#### 8. Layer Split

* **Visual:** Counter structures, back panel, floating overhead banner, tablet, rack, and desk lamp.
* **Collision:** Solid perimeter box collider surrounding counter base footprint ($2.0\text{ m} \times 1.1\text{ m} \times 0.6\text{ m}$).
* **Navigation:** Walkable clear area around staff and customer approaches. Customer interaction node placed in front of counter; staff node placed behind counter.

#### 9. Connectivity

* `CustomerApproachNode`: Local coordinate $(0, 0, +0.8)$, facing $-Z$.
* `StaffNode`: Local coordinate $(0, 0, -0.7)$, facing $+Z$.

#### 10. Placement & Interaction Behavior

* **2D Top-Down View:** Rectangular counter outline with cyan split step showing accessible section, staff stool icons, and floating overhead `"i"` marker.

#### 11. LOD & Performance

* **Near Detail:** 3,400 triangles (includes tablet, lamp tube curve, brochure stacks, bevels).
* **Far Detail:** 90 triangles (merged dual-height counter box + cylinder sign disc).
* **Instancing Candidate:** Yes.

#### 12. Reference Images

* `trade show information desk counter accessible lower section`: Look for dual-height counter sections and ADA knee clearance.
* `exhibition information kiosk floating sign overhead i symbol`: Look for elevated overhead wayfinding banners.
* `modular reception desk brochure rack tablet holder`: Look for desktop prop integration.

#### 13. Open Questions / Flagged Conflicts

* *Real-World Height Realignment:* Input default $1.1\text{ m}$ is ideal for standing customer transactions. Added the $0.76\text{ m}$ lower counter section to meet ADA accessibility standards without overriding the primary height requirement.

---

### Food & Beverage Kiosk (`food-kiosk`)

#### 1. Purpose & Real-World Analogue

A self-contained modular retail food and coffee stall featuring a front service counter, retractable fabric awning, overhead chalk menu board, commercial coffee machine, cash terminal, and a dedicated customer queuing clear zone.

#### 2. Shape & Construction

Assembly tree centered at bottom footprint base $(0, 0, 0)$:

* `KioskCabinEnclosure`: Modular timber/steel frame box (`BoxGeometry` $3.0\text{ m} \times 2.6\text{ m} \times 2.0\text{ m}$) with a large front opening ($2.6\text{ m} \times 1.4\text{ m}$).
* `FrontServiceCounter`: Heavy wood-finish counter (`BoxGeometry` $2.8\text{ m} \times 0.95\text{ m} \times 0.6\text{ m}$) set flush to front opening.
* `FabricAwning`: Striped canopy (`ExtrudeGeometry` overhang $0.8\text{ m}$, width $3.0\text{ m}$) angled at $15^\circ$ slope over front counter.
* `OverheadMenuBoard`: Horizontal sign band (`BoxGeometry` $2.4\text{ m} \times 0.45\text{ m} \times 0.03\text{ m}$) suspended behind/above counter.
* `CoffeeMachineProp`: Stainless steel espresso machine (`BoxGeometry` $0.5\text{ m} \times 0.4\text{ m} \times 0.4\text{ m}$) with dual portafilter spouts.
* `POSTerminal`: Payment register screen (`BoxGeometry` $0.25\text{ m} \times 0.25\text{ m} \times 0.2\text{ m}$) on customer side.
* `CupStacks`: Dual paper cup cylinders (`CylinderGeometry` radius $0.04\text{ m}$, height $0.3\text{ m}$).
* `LEDWarmStrips`: Linear warm light bar (`BoxGeometry` $2.6\text{ m} \times 0.03\text{ m} \times 0.03\text{ m}$) under awning.

#### 3. Dimensions & Parameters

| Parameter | Default | Min | Max | Scales How | Locked? |
| --- | --- | --- | --- | --- | --- |
| Width ($W$) | $3.0\text{ m}$ | $2.4\text{ m}$ | $5.0\text{ m}$ | Stretch X | No |
| Height ($H$) | $2.6\text{ m}$ | $2.2\text{ m}$ | $3.5\text{ m}$ | Stretch Y | No |
| Depth ($D$) | $2.0\text{ m}$ | $1.8\text{ m}$ | $3.0\text{ m}$ | Stretch Z | No |
| Counter Height | $0.95\text{ m}$ | $0.9\text{ m}$ | $1.05\text{ m}$ | Ergonomic Standard | Yes |
| Queue Reserved Zone Depth | $2.0\text{ m}$ | $1.5\text{ m}$ | $3.0\text{ m}$ | Extrudes Front Clearance | Yes |

#### 4. Materials & Colors

* `KioskCabinEnclosure`: Matte Panel, Hex `#1E2022` (Neutral Dark) / Warm Timber Hex `#9A3412`, Roughness `0.7`, Metalness `0.1`.
* `FrontServiceCounter`: Polished Wood, Hex `#7C2D12`, Roughness `0.4`, Metalness `0.0`.
* `FabricAwning`: Alternating Canvas Stripes, Neutral White Hex `#F8F9FA` & Accent Blue Hex `#2563EB`, Roughness `0.8`, Metalness `0.0`.
* `CoffeeMachineProp` & `Trim`: Brushed Stainless Steel, Hex `#C0C4C8`, Roughness `0.2`, Metalness `0.9`.
* `OverheadMenuBoard`: Chalkboard Matte, Hex `#1E2022`, Roughness `0.95`, Metalness `0.0`.

#### 5. Realism Details

* `[always]` Warm LED light glow strip beneath awning illuminating counter props.
* `[near-only]` Inset steam wand spouts and pressure gauge dials on espresso machine prop.
* `[near-only]` Chalk-drawn coffee cup and food icon graphics on menu board.

#### 6. Signage & Text

* **Menu Board Text:** Editable dynamic `CanvasTexture` displaying item prices (e.g. `"ESPRESSO - $3.50 | LATTE - $4.50 | SANDWICH - $7.00"`).
* **Food/Fork Pictogram (Procedural Canvas Shape):**
```javascript
// 2D Canvas Context Draw Steps for Fork & Knife Icon:
ctx.fillStyle = "#F59E0B"; // Amber background circle
ctx.beginPath(); ctx.arc(128, 128, 120, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#FFFFFF";
// Draw Fork tines & stem
ctx.fillRect(80, 70, 8, 50); ctx.fillRect(96, 70, 8, 50); ctx.fillRect(112, 70, 8, 50);
ctx.fillRect(80, 115, 40, 10); ctx.fillRect(96, 125, 8, 65);
// Draw Knife blade & stem
ctx.beginPath(); ctx.moveTo(152, 70); ctx.lineTo(168, 70); ctx.lineTo(168, 130); ctx.lineTo(152, 110); ctx.fill();
ctx.fillRect(156, 130, 8, 60);

```



#### 7. Moving Parts

* `None` (Static retail stall).

#### 8. Layer Split

* **Visual:** Cabin box, awning, counter, menu board, coffee machine, cups, POS terminal, and lights.
* **Collision:** Solid cabin box ($3.0\text{ m} \times 2.6\text{ m} \times 2.0\text{ m}$) plus awning overhead clearance plane.
* **Navigation:** Cabin interior is **STAFF ONLY** (restricted access). The customer front features a $3.0\text{ m} \times 2.0\text{ m}$ **Queue Reserved Zone** that remains clear of booth placement and contains customer waiting nodes.

#### 9. Connectivity

* `QueueEntryPortal`: Local coordinate $(0, 0, +2.5)$, facing $-Z$ toward counter.
* `StaffDoorway`: Rear side service hatch door at local coordinate $(-1.3, 0, -1.0)$.

#### 10. Placement & Interaction Behavior

* **2D Top-Down View:** Rectangular cabin outline (`#1E2022`), striped awning hatch pattern, counter line, and a blue dashed box extending $2.0\text{ m}$ in front marked `"FOOD KIOSK - QUEUE CLEAR ZONE"`.

#### 11. LOD & Performance

* **Near Detail:** 6,500 triangles (includes coffee machine, POS, cups, awning stripe ridges).
* **Far Detail:** 120 triangles (textured box cabin with sloped awning plane).
* **Instancing Candidate:** Counter props and espresso machines use instancing.

#### 12. Reference Images

* `modular food kiosk trade show stall awning menu board`: Look for awning mounting and front service counter layout.
* `exhibition coffee stall counter espresso machine POS`: Look for counter-top equipment placement.
* `trade show food court queuing clear zone floor plan`: Look for front queue zone demarcations.

#### 13. Open Questions / Flagged Conflicts

* *Style Justification:* Selected modern timber/steel modular stall over food truck. A modular stall integrates seamlessly with indoor trade-show floor grids, matches the shared design language, and occupies an efficient $3\times 2.6\times 2\text{ m}$ footprint without wheel overhangs.

---

### Drinking Water Station (`water`)

#### 1. Purpose & Real-World Analogue

A dual-height commercial stainless-steel drinking fountain and bottle-refill station featuring a primary drinking basin, an ADA wheelchair-accessible lower basin, an automated bottle refill spout, and a blue wayfinding emblem.

#### 2. Shape & Construction

Assembly tree centered at bottom ground plane $(0, 0, 0)$:

* `MainPedestalStand`: Vertical wall/floor column (`BoxGeometry` $0.4\text{ m} \times 1.2\text{ m} \times 0.4\text{ m}$) at $X = -0.1\text{ m}$.
* `UpperBottleRefillAlcove`: Recessed bottle-fill cavity (`BoxGeometry` $0.3\text{ m} \times 0.45\text{ m} \times 0.2\text{ m}$) set into upper stand face ($Y = 0.75\text{ m} \to 1.2\text{ m}$).
* `UpperDrinkingBasin`: Cantilevered oval basin (`ExtrudeGeometry` / `CylinderGeometry` $0.4\text{ m} \times 0.15\text{ m} \times 0.45\text{ m}$) at $Y = 0.95\text{ m}$.
* `LowerWheelchairBasin`: Secondary accessible basin (`ExtrudeGeometry` $0.4\text{ m} \times 0.15\text{ m} \times 0.45\text{ m}$) mounted at $X = +0.25\text{ m}, Y = 0.76\text{ m}$ (ADA height).
* `BubblerSpouts`: Dual curved chrome spouts (`TubeGeometry` radius $0.008\text{ m}$) on both basins.
* `BottleFillSensor`: Infrared sensor window (`BoxGeometry` $0.05\text{ m} \times 0.03\text{ m} \times 0.01\text{ m}$) above refill alcove.
* `WaterJetMesh`: Procedural animated water stream (`TubeGeometry` / `CylinderGeometry` radius $0.004\text{ m}$) arching from bubbler to drain.
* `DripTrayGrates`: Perforated drain plates (`BoxGeometry` $0.25\text{ m} \times 0.01\text{ m} \times 0.2\text{ m}$) inside basins.

#### 3. Dimensions & Parameters

| Parameter | Default | Min | Max | Scales How | Locked? |
| --- | --- | --- | --- | --- | --- |
| Width ($W$) | $0.6\text{ m}$ | $0.5\text{ m}$ | $0.9\text{ m}$ | Stretch X | No |
| Height ($H$) | $1.2\text{ m}$ | $1.1\text{ m}$ | $1.4\text{ m}$ | Stretch Y | No |
| Depth ($D$) | $0.6\text{ m}$ | $0.5\text{ m}$ | $0.8\text{ m}$ | Stretch Z | No |
| Primary Basin Height | $0.95\text{ m}$ | $0.9\text{ m}$ | $1.0\text{ m}$ | Fixed Standard | Yes |
| Accessible Basin Height | $0.76\text{ m}$ | $0.72\text{ m}$ | $0.80\text{ m}$ | Fixed ADA Standard | Yes |

#### 4. Materials & Colors

* `MainPedestalStand` & `Basins`: Brushed Stainless Steel, Hex `#C0C4C8`, Roughness `0.25`, Metalness `0.85`.
* `RefillAlcoveBacking`: Antimicrobial Dark Polypropylene, Hex `#1E2022`, Roughness `0.6`, Metalness `0.0`.
* `WaterJetMesh` & `DripDetail`: Translucent Water Cyan, Hex `#06B6D4`, Roughness `0.05`, Metalness `0.0`, Transmission `0.9`.
* `WayfindingEmblem`: Emissive Cyan, Hex `#06B6D4`, Emissive Intensity `0.8`.

#### 5. Realism Details

* `[always]` Dual-height basin offset ($0.95\text{ m}$ standard vs $0.76\text{ m}$ wheelchair basin).
* `[near-only]` Subtle glossy puddle decal plane ($0.2\text{ m}$ diameter, roughness `0.05`) on floor beneath lower basin.
* `[near-only]` Digital bottle count display screen ($0.1\text{ m} \times 0.04\text{ m}$) showing green LED text (`"SAVED: 12,480 BOTTLES"`).

#### 6. Signage & Text

* **Water Drop Pictogram (Procedural Canvas Shape):**
```javascript
// 2D Canvas Context Draw Steps for Water Droplet Icon:
ctx.fillStyle = "#06B6D4"; // Wayfinding Cyan background circle
ctx.beginPath(); ctx.arc(128, 128, 120, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#FFFFFF"; // White Water Drop
ctx.beginPath();
ctx.moveTo(128, 60); // Top sharp point
ctx.bezierCurveTo(80, 130, 80, 175, 128, 175); // Left curve & bottom bulb
ctx.bezierCurveTo(176, 175, 176, 130, 128, 60); // Right curve
ctx.fill();

```


* **Top-Down View:** Prominent blue water drop icon centered over stand footprint.

#### 7. Moving Parts

* **Water Jet Flow Animation:**
* *Trigger:* Continuous frame loop (decorative flow).
* *Animation:* UV texture scroll along `WaterJetMesh` tube ($v_{\text{scroll}} = -1.2 \cdot t$) creating the illusion of streaming water droplets.



#### 8. Layer Split

* **Visual:** Pedestal stand, dual basins, spouts, refill alcove, water jet, puddle plane, and cyan emblem.
* **Collision:** Simplified bounding box surrounding stand and cantilevered basins ($0.6\text{ m} \times 1.2\text{ m} \times 0.6\text{ m}$).
* **Navigation:** Blocked obstacle footprint; generates an approach landing node directly in front of basins.

#### 9. Connectivity

* `ApproachLandingNode`: Local coordinate $(0, 0, +0.6)$, facing $-Z$.

#### 10. Placement & Interaction Behavior

* **2D Top-Down View:** Dual basin outline box (`#C0C4C8`) with centered cyan water droplet symbol (`#06B6D4`).

#### 11. LOD & Performance

* **Near Detail:** 2,800 triangles (includes curved basin lips, spouts, animated water stream).
* **Far Detail:** 60 triangles (merged box stand + flat sign plate).
* **Instancing Candidate:** Yes.

#### 12. Reference Images

* `commercial drinking water fountain refill station dual height`: Look for dual high/low basin cantilevers and bottle fill alcove.
* `wall mounted water cooler bottle filler station stainless steel`: Look for sensor window placement.
* `ISO 7010 drinking water sign symbol blue`: Look for standardized water drop emblem layout.

#### 13. Open Questions / Flagged Conflicts

* *None.*

---

### First Aid Station (`first-aid`)

#### 1. Purpose & Real-World Analogue

A high-visibility emergency medical station featuring a clean white enclosure, standardized safety green cross branding, an elevated rotating beacon light, an entry door, and an interior hint depicting a medical cot and supply cabinet.

#### 2. Shape & Construction

Assembly tree centered at bottom floor center $(0, 0, 0)$:

* `StationEnclosure`: Modular white room box (`BoxGeometry` $2.0\text{ m} \times 2.0\text{ m} \times 2.0\text{ m}$).
* `FrontEntryDoor`: Single hinged door with vision panel (`BoxGeometry` $0.9\text{ m} \times 1.9\text{ m} \times 0.04\text{ m}$) set into front wall.
* `VisionPanelGlass`: Clear window in upper door leaf (`BoxGeometry` $0.4\text{ m} \times 0.5\text{ m} \times 0.01\text{ m}$).
* `BeaconLightDome`: Overhead cylindrical flashing beacon (`CylinderGeometry` radius $0.08\text{ m}$, height $0.15\text{ m}$) on roof at $Y = 2.1\text{ m}$.
* `RoofSignageTower`: 4-sided elevated sign header (`BoxGeometry` $0.8\text{ m} \times 0.4\text{ m} \times 0.8\text{ m}$) elevated at $Y = 2.5\text{ m}$ on support post.
* `InteriorMedicalCot` (Low-poly interior hint visible through door window): Canvas examination cot (`BoxGeometry` $0.7\text{ m} \times 0.45\text{ m} \times 1.8\text{ m}$).
* `InteriorKitCabinet`: White wall cabinet (`BoxGeometry` $0.4\text{ m} \times 0.6\text{ m} \times 0.2\text{ m}$) with green cross decal.

#### 3. Dimensions & Parameters

| Parameter | Default | Min | Max | Scales How | Locked? |
| --- | --- | --- | --- | --- | --- |
| Width ($W$) | $2.0\text{ m}$ | $1.8\text{ m}$ | $3.0\text{ m}$ | Stretch X | No |
| Height ($H$) | $2.0\text{ m}$ (Room) / $2.8\text{ m}$ (Beacon) | $2.0\text{ m}$ | $3.2\text{ m}$ | Stretch Y | No |
| Depth ($D$) | $2.0\text{ m}$ | $1.8\text{ m}$ | $3.0\text{ m}$ | Stretch Z | No |
| Door Clear Width | $0.9\text{ m}$ | $0.8\text{ m}$ | $1.0\text{ m}$ | Fixed | Yes |

#### 4. Materials & Colors

* `StationEnclosure`: Matte Panel, Hex `#F8F9FA` (Neutral White), Roughness `0.85`, Metalness `0.05`.
* `GreenCrossDecals` & `Header`: Safety Green, Hex `#10B981`, Roughness `0.5`, Metalness `0.0`.
* `BeaconLightDome`: Emissive Green Glass, Safety Green Hex `#10B981`, Emissive Intensity `0.9`.
* `VisionPanelGlass`: Clear Glass, Hex `#F8F9FA`, Roughness `0.05`, Metalness `0.0`, Transmission `0.9`.

#### 5. Realism Details

* `[always]` High-visibility Safety Green (`#10B981`) cross symbols applied to all 4 exterior faces and roof sign header.
* `[near-only]` Aluminum door handle lever ($0.12\text{ m}$) and door threshold kick plate.
* `[near-only]` Red cross first aid box visible on interior shelf through door window.

#### 6. Signage & Text

* **Green Safety Cross Pictogram (Procedural Canvas Shape):**
```javascript
// 2D Canvas Context Draw Steps for ISO 7010 First Aid Cross:
ctx.fillStyle = "#10B981"; // Safety Green background square
ctx.fillRect(8, 8, 240, 240);
ctx.fillStyle = "#FFFFFF"; // Equal-arm White Cross
ctx.fillRect(104, 40, 48, 176); // Vertical bar
ctx.fillRect(40, 104, 176, 48); // Horizontal bar

```


* **Top-Down View:** White square box with a large centered green safety cross and bright green beacon dot.

#### 7. Moving Parts

* **Flashing Beacon Light:**
* *Trigger:* Continuous frame loop.
* *Animation:* Emissive intensity modulation on `BeaconLightDome` material ($I = 0.3 + 0.6 \cdot \sin(6 \cdot t)$) producing a pulsating emergency beacon effect.



#### 8. Layer Split

* **Visual:** Room enclosure, door with vision panel, roof sign header, beacon light, interior cot, and cabinet.
* **Collision:** Solid room box collider ($2.0\text{ m} \times 2.0\text{ m} \times 2.0\text{ m}$).
* **Navigation:** Room interior is reserved for emergency routing; entry door forms a portal node into the first-aid station.

#### 9. Connectivity

* `EmergencyEntryLanding`: Local coordinate $(0, 0, +1.2)$, facing $-Z$.

#### 10. Placement & Interaction Behavior

* **2D Top-Down View:** White square outline (`#F8F9FA`), thick green perimeter stroke (`#10B981`), central green cross symbol, and beacon indicator.

#### 11. LOD & Performance

* **Near Detail:** 2,200 triangles (includes door handle, interior cot frame, beacon base, sign bevels).
* **Far Detail:** 48 triangles (simple box room + cylinder beacon).
* **Instancing Candidate:** Yes.

#### 12. Reference Images

* `first aid booth trade show venue green cross beacon`: Look for roof beacon light placement and green cross branding.
* `ISO 7010 first aid green cross symbol emblem`: Look for equal-arm green cross proportions.
* `temporary venue medical room cot interior window`: Look for vision panel window framing.

#### 13. Open Questions / Flagged Conflicts

* *Color Compliance:* Retained Safety Green Hex `#10B981` (ISO 7010 standard for emergency first aid) as defined in the Design Language Sheet.

---

### Emergency Exit Portal (`exit`)

#### 1. Purpose & Real-World Analogue

A primary life-safety emergency egress doorway featuring an outwards-opening door leaf, panic push-bar hardware, an overhead self-illuminated green "EXIT" running-man sign, and a photoluminescent floor arrow path, serving as critical destination targets for hall evacuation routing.

#### 2. Shape & Construction

Assembly tree centered at threshold floor center $(0, 0, 0)$:

* `DoorFramePortal`: Heavy steel door frame (`BoxGeometry` $1.5\text{ m} \times 2.4\text{ m} \times 0.4\text{ m}$) inset into perimeter hall wall.
* `EgressDoorLeaf`: Steel panic door (`BoxGeometry` $1.35\text{ m} \times 2.25\text{ m} \times 0.06\text{ m}$) hinged on left edge.
* `PanicPushBar`: Horizontal panic crash bar (`BoxGeometry` $1.1\text{ m} \times 0.08\text{ m} \times 0.1\text{ m}$) mounted at $Y = 1.0\text{ m}$ across inner door face.
* `OverheadExitSignBox`: Self-illuminated box sign (`BoxGeometry` $0.8\text{ m} \times 0.3\text{ m} \times 0.1\text{ m}$) mounted above frame at $Y = 2.55\text{ m}$.
* `PhotoluminescentFloorArrow`: Flat ground decal plane (`PlaneGeometry` $1.0\text{ m} \times 1.5\text{ m}$) extending inward from threshold with green chevron arrow graphics.

#### 3. Dimensions & Parameters

| Parameter | Default | Min | Max | Scales How | Locked? |
| --- | --- | --- | --- | --- | --- |
| Width ($W$) | $1.5\text{ m}$ ($1.35\text{ m}$ clear opening) | $1.2\text{ m}$ | $2.4\text{ m}$ | Stretch X | No |
| Height ($H$) | $2.4\text{ m}$ (Door) / $2.7\text{ m}$ (With Sign) | $2.2\text{ m}$ | $3.0\text{ m}$ | Stretch Y | No |
| Depth ($D$) | $0.4\text{ m}$ (Wall Frame) | $0.2\text{ m}$ | $0.6\text{ m}$ | Stretch Z | No |
| Door Egress State | `"CLOSED"` | `"CLOSED"` / `"OPEN"` | — | Rotates Door Leaf | No |
| Clear Opening Width | $1.35\text{ m}$ | $1.0\text{ m}$ | $2.2\text{ m}$ | Fixed Egress Code | Yes |

#### 4. Materials & Colors

* `DoorFramePortal` & `Leaf`: Metal Panel, Safety Green Hex `#10B981` (or Neutral Dark Hex `#1E2022`), Roughness `0.5`, Metalness `0.3`.
* `PanicPushBar`: Stainless Steel with Red Latch, Hex `#EF4444` (Warning Red touch pad), Roughness `0.3`, Metalness `0.8`.
* `OverheadExitSignBox`: Self-Illuminated Emissive Box, Safety Green Hex `#10B981`, Emissive Intensity `0.8` (`MeshBasicMaterial` / Emissive Standard - zero real light cost).
* `PhotoluminescentFloorArrow`: Emissive Floor Decal, Safety Green Hex `#10B981`, Emissive Intensity `0.4`.

#### 5. Realism Details

* `[always]` Self-illuminated green sign box above door header emitting constant green glow without adding dynamic point light overhead.
* `[near-only]` Tactile push pad instructions on crash bar (`"PUSH TO OPEN"`).
* `[near-only]` Twin emergency backup floodlight bulbs mounted above sign box.

#### 6. Signage & Text

* **Running Man & Exit Pictogram (Procedural Canvas Shape):**
```javascript
// 2D Canvas Context Draw Steps for ISO 7010 Running Man Egress Sign:
ctx.fillStyle = "#10B981"; // Safety Green background rectangle
ctx.fillRect(0, 0, 256, 128);
ctx.fillStyle = "#FFFFFF";
// Draw Doorway Rect
ctx.fillRect(20, 20, 40, 88);
// Draw Running Man Figure
ctx.beginPath(); ctx.arc(90, 35, 10, 0, Math.PI * 2); ctx.fill(); // Head
ctx.beginPath(); // Torso & angled running limbs
ctx.moveTo(90, 48); ctx.lineTo(105, 70); ctx.lineTo(120, 65);
ctx.moveTo(90, 52); ctx.lineTo(75, 75); ctx.lineTo(65, 95);
ctx.moveTo(105, 70); ctx.lineTo(95, 110);
ctx.stroke(); ctx.fill();
// Draw Egress Arrow
ctx.beginPath();
ctx.moveTo(160, 64); ctx.lineTo(210, 64); ctx.lineTo(210, 48);
ctx.lineTo(236, 64); ctx.lineTo(210, 80); ctx.lineTo(210, 64);
ctx.fill();

```


* **Top-Down View:** Green wall threshold block with outward door swing arc and bright green floor arrow.

#### 7. Moving Parts

* **Egress Door Swing Animation:**
* *Trigger:* State parameter or Evacuation Simulation event (`doorState: "OPEN"`).
* *Movement:* Y-axis rotation of door leaf around hinge at $X = -0.675\text{ m}$ from $0^\circ$ (closed) to $-90^\circ$ outwards (open).
* *Duration:* `0.6s`, `easeOutQuad`, state-bearing.



#### 8. Layer Split

* **Visual:** Wall portal frame, door leaf, panic bar, emissive sign box, backup lights, and floor arrow decal.
* **Collision:** Solid door leaf collision plane when closed; open portal collider when open.
* **Navigation:** Primary **Evacuation Destination Target Node**. Serves as a high-priority goal sink node in Recast Navigation evacuation pathing scripts.

#### 9. Connectivity

* `EvacuationSinkTarget`: Local coordinate $(0, 0, +0.5)$, facing $-Z$ (outward evacuation flow).
* `ApproachClearZone`: $1.5\text{ m} \times 2.0\text{ m}$ unimpeded clear floor zone directly inside doorway threshold.

#### 10. Placement & Interaction Behavior

* **2D Top-Down View:** Green frame portal rectangle (`#10B981`), dashed door swing radius line, and a green arrow pointing toward hall exterior.

#### 11. LOD & Performance

* **Near Detail:** 1,800 triangles (includes panic bar brackets, backup light fixtures, frame seals).
* **Far Detail:** 12 triangles (flat wall opening box + emissive sign quad).
* **Instancing Candidate:** Yes (shared emergency exit portal across venue perimeter walls).

#### 12. Reference Images

* `emergency exit door push bar running man green sign`: Look for panic bar mounting and ISO 7010 running man sign layout.
* `photoluminescent emergency exit floor arrow decal`: Look for floor arrow placement in front of exit threshold.
* `commercial panic hardware egress door detail`: Look for crash bar latch connections.

#### 13. Open Questions / Flagged Conflicts

* *Egress Capacity Check:* Clear opening width of $1.35\text{ m}$ supports a rated emergency egress capacity of up to 270 persons/min (based on IBC $0.2\text{ inches/person}$ door width factor). For larger hall capacities, multiple `exit` portal instances must be placed along perimeter walls.

---

### Cross-Item Notes

* **Zero-Texture-File Compliance:** Every pictogram specified (`i`, `food/fork`, `water drop`, `green cross`, and `running man exit`) is defined using step-by-step procedural HTML5 2D Canvas context rendering commands. These commands build crisp texture maps at runtime without relying on external image files.
* **Performance Optimization:** Emissive materials (`MeshBasicMaterial` with high color intensity) are utilized for all illuminated signage (`information`, `water`, `first-aid`, `exit`) to simulate vibrant self-illumination without spawning expensive real-time dynamic point/spot lights.