# Admin Authoring UX Plan

Status: interview complete; implementation authorized by the user. This document preserves the original todo wording and accepted interview decisions verbatim, then derives an implementation checklist and delivery order. Quoted user intent is evidence; derived requirements and implementation choices are labeled separately.

## Scope and precedence

- Target repository: `C:\Users\HarmeetSingh\Desktop\Projects\blender-3D-demo` (the frontend application). The orchestration workspace is a separate FastAPI repository; do not implement this plan there.
- All original todos below remain in scope. The first milestone establishes a reliable authoring workflow before new assets and loading-screen polish.
- When a proposal was superseded, the latest explicit user correction takes precedence. Superseded proposals remain recorded for traceability.
- The user authorized Luna agents to implement the work. No implementation task should start until the orchestrator assigns file ownership after the dependency audit.
- Preserve existing working-tree changes. Do not commit, push, delete, or deploy.

## Original todos — verbatim, original order and numbers

```text
37. i should get a slider for rotation instead of just number and need to remove rotation from the scene, will only be able to do from sidebar 
38. why do i get a red line while placing a polygone walkable zone 
39. should be able to zoom in and out while placing polygon booth, polygon booth have 2 separate behaviour one is above the vuew finder and one is in inventory
40. focus booth button doesnt work
41. apply changes and save arent working in sync and need to have a single save button across all editors for booth/POI/walkbale zone and everything. only the button on top right written along with unsaved changes will the sole authorative button. 
42. label on top of booth is quite small. it needs to get bigger and smaller in size as i zoom out and in 
43. resizing men booth and other things doesnt persist the change nor does saving it works. plus the live overlay needs to be black so that it can contract with the background.
44. selecting a object locks the rotation of the 3D  screen as well as zoom in out
45. placing rectangle is not working alway, neither is double clicking, 
46. need to think about the tooltip as it is quiet irrtating at times, including sometimes placing just alongside some booth
24. need customise button along with move, rotate, duplicate, delete. need to have a resize to resize it dynamically. with live preview.  PARTIAL DONE
22. Keep QUALITY PERMANENTLY HIGH and it shouldnt get into high quality once i zoom in. 
16. no need of this need as we should geta  shadcn notification only if the item cannot be placed there. Placement needs attention
Floor edge: 0.00 m · Nearest blocked geometry: 23.50 m

Keep the whole object inside the floor boundary
18. need to fix shimmering of all the objects
19. need to make a good interactive loading screen while the scene is being loaded
20. zoom in and out should work will in admin authoring 
21. what are all the pages in the new - wayfindingPreview, eventId=floor-plan-studio, ?furniturePreview=1
47. if no walking zone defined then give me a error toast for the same
13. right and left sidebar have a lot of unnecessary things that are not needed and should be hideable
14. zoom works perfectly when there is no item. but when there are items it kinda works slowly. 
3. need to refine admin authoring UX first then make new assets 
7. clciking on save shouldnt zoom out view should remain fixed 
5. the adjustments to inventory items are coming in a spearate page. i should be able to customise them while placing them on the scene by right clicking on the scene with a game like scene overlay on top of it for this page Procedural services preview
6. admin authoring needs to be a little simpler
34. what is colision and need to remove material roughness, metalness, position X/Y
```

## Reference user text — verbatim

```text
'I am about to start these Todos. Interview me until you have 95% confidence in what I actually want, not what I think I should want.'
'how to approach finding one a solution , how to think about these things, can you give me one small hint to steer me in right directions'
'you are gonna act as an orchestrator and let luna subagents do all the work.'
'directly in 3D'
'remove the standard and polydon booth from inventory. the sole authoritative will the viewfinder one for drawing new booths'
'Click to add corners, then click the starting corner, if the point is close to the start point but not on top of it then the editor should automatically move then last point to the starting point and then a finished polygon booth should appear on the screen.'
'yes to recommendation and i want all the features that this page has ?furniturePreview=1,'
'http://127.0.0.1:5175/?furniturePreview=1
this is page on frontend and lets keep moving forward with the questions'
'Yes. Booths need flexible floor dimensions; furniture should scale proportionally, with separate dimensions available where the preview page supports them. Every resize previews live and remains in the shared draft.
Yes. Keep furniture’s variant choices in Customize, separate from its resize handles.
and i want all the features of chnages aspects of object like furniture and different things in customise itself'
'400+ booths and 100+ all the other itms'
'you can use a everyday laptop as the baseline and instead put your focus on fixing this [File: Screen Recording 2026-10-28 122039.mp4; ref=file_e48ed45a-48e7-4e18-ba56-fe1d54ea5fa5]'
'no i want a fun loading screen that makes the user forget about the loading part. think it of as product design and UX'
'write everything planned here in a file and details should be verbatim and then start luna subagents for completing all the work. remenber you will be acting only as an orchestrator only.'
```

## Accepted recommendations — verbatim, with supersession notes

Each numbered recommendation below was accepted by the user, except where a later explicit correction is recorded as superseding it.

1. ```text
Yes. Selection exposes editing controls; dragging a specific handle moves or resizes the booth. Camera controls stay available.
```
2. ```text
Yes. Moving, rotating, resizing, and customizing update one shared unsaved draft. Switching objects keeps those edits; Save persists them and preserves your camera view.
```
3. ```text
Yes, throughout the current editing session. One completed drag or resize counts as one undo step. Undoing a saved change makes the floor plan unsaved again.
```
4. Context: “If you release an object partly outside the floor boundary, should it return to its last valid position and show one brief toast explaining why?” Accepted answer:

   ```text
   Yes. For a new object, keep placement active so you can try another position. Show the toast only when you attempt placement, without the persistent distance readout.
   ```
5. Context: “Should furniture and décor be allowed inside a booth’s footprint, while booths cannot overlap other booths?” Accepted answer:

   ```text
   Yes. Placement rules should depend on the object type, so furnishing a booth remains possible.
   ```
6. ```text
Hovering near the start previews the snap; clicking closes the polygon and creates the booth. The snap target should feel the same size on screen at every zoom level.
```
7. ```text
Click the first corner, move the pointer to preview its size, then click the opposite corner to create it. Esc cancels, and camera controls stay available between clicks.
```
8. Initial proposal, later superseded only as to panel location:

   ```text
   A compact panel over the scene for color, appearance presets, and item-specific options, with immediate previews. Resize handles appear on the object; the rotation slider stays in the sidebar.
   ```
9. ```text
Yes. Keep furniture’s variant choices in Customize, separate from its resize handles.
```
10. Context: “Should Customize open the sidebar as the complete object editor—including rotation, dimensions, variants, colors, and other supported settings?” Accepted answer:

    ```text
    Yes. Right-click → Customize opens that sidebar. Scene resize handles remain shortcuts to the same settings. This preserves your sidebar-only rotation rule and gives every object setting one home.
    ```
    Explicitly supersedes the separate floating customization panel in recommendation 8. Its requested capabilities and immediate preview remain in scope.
11. Context: collapsed sidebar remains closed on selection until Customize. Accepted answer:

    ```text
    Yes. Selection reveals the object’s scene controls; Customize opens its full editor. An already-open sidebar updates to the newly selected object.
    ```
12. ```text
Allow editing and saving incomplete floor plans. Show an error toast when someone attempts wayfinding preview or route generation without a walkable zone, with an action to start drawing one.
```
13. Context: “When you zoom out, should booth labels stay roughly the same readable size on screen, even as the booths become smaller?” Accepted answer:

    ```text
Yes. Use readable screen-sized labels so you can identify booths at different zoom levels.
```
14. Context: “Should object tooltips appear only after a brief, stationary hover, and stay hidden while you’re drawing, placing, moving, resizing, or orbiting?” Accepted answer:

    ```text
Yes. Dismiss them when an action starts, and make them ignore mouse clicks so they cannot obstruct placement.
```
15. Context: “Should Focus Booth smoothly center the selected booth and zoom until the whole booth fits comfortably, while preserving your current viewing angle?” Accepted answer:

    ```text
Yes. Orbiting should then pivot around that booth. Focusing changes only the camera and never marks the floor plan as unsaved.
```
16. Context: leaving with unsaved edits. Accepted answer:

    ```text
Yes. Stay returns you to the editor, where the top-right Save remains the only save button. Discard and leave explicitly abandons the draft.
```
    For internal navigation, show a custom dialog with Stay and Discard and leave. Browser refresh/close uses the native unsaved-change warning. Do not add a second save button to the dialog.
17. Initial real-progress / early-orbit proposal was rejected. Superseding playful loading concept accepted by the user:

    ```text
Think of a tiny living exhibition: miniature booths pop into place, visitors wander between them, and clicking makes a visitor wave or a booth do a little bounce. It’s amusing even without interacting.

When the editor is ready, the miniature venue smoothly gives way to your actual floor plan. No score, task to finish, or extra waiting.

Would this playful miniature-world direction fit your product?

Recommendation: Yes—make the delight specific to designing venues, with lightweight animation so the loading screen doesn’t compete with the scene being loaded.
```
18. Context: “Should Customize let you reshape a polygon booth by moving, adding, or removing individual corners after it’s created?” Accepted answer:

    ```text
Yes. Through an explicit Edit footprint mode. Changes preview live, support Undo/Redo, and preserve a valid polygon. Corner handles appear only in that mode.
```
19. Context: “If a walkable zone covers a booth or another blocking object, should routing automatically exclude that object’s footprint?” Accepted answer:

    ```text
Yes. You draw the permitted walking area, and routing accounts for obstacles inside it. Moving a booth updates the usable walking space without requiring you to redraw the zone.
```
20. Context: customizations only selected item. Accepted answer:

    ```text
Yes. Other items and inventory defaults stay unchanged. Duplicating an item copies its current settings, but the duplicate can then be edited independently.
```
21. Context: changing width×depth in metres. Accepted answer:

    ```text
Yes. Show measurements during the gesture, using the black overlay you requested for contrast. Hide them when resizing ends; exact dimensions remain available in Customize.
```
22. Context: rotation slider plus editable degree values. Accepted answer:

    ```text
Yes. Keep both synchronized in the Customize sidebar, with no rotation control over the scene.
```
23. ```text
Yes. Keep name, dimensions, rotation, and common appearance options visible. Group the remaining supported settings by purpose, and hide raw polygon coordinates under Advanced. Remove roughness, metalness, and position X/Y as you requested.
```
24. First milestone accepted by the user:

    ```text
Should the first milestone be one fully reliable authoring workflow, before we add new assets or the playful loading screen?

Recommendation: Prove this sequence works:

Draw booths → place furniture → customize and resize → edit walkable zones/POIs → orbit and zoom → Save without a camera jump → reload and recover every saved change.

All your todos remain in scope; this sets their order.
```

## Source-backed reference page

The user-provided local page is `http://127.0.0.1:5175/?furniturePreview=1`. It is in the frontend app, not the FastAPI orchestration workspace.

Observed page features (separate from user-approved requirements):

- Preview props: bench, table with chairs, belt barrier, planter, and waste station.
- Table variants: cocktail-standing, standard-dining, cloth-draped.
- Foliage variants: tall-tree, hedge-box, flower-shrub.
- Waste stream variants: general-waste, recycling, organics.
- Top view / Isometric view toggle and orbit interaction.
- It is a static showcase and exposes no placement, resize, rotation, save, or customization UI.
- The source model has additional fields for supported procedural props. The editor must inspect and expose meaningful per-item settings, but must omit raw roughness, metalness, and position X/Y per explicit user direction.

The user also asked what the `wayfindingPreview`, `eventId=floor-plan-studio`, and `?furniturePreview=1` pages are. Explain their actual roles from the frontend route/component source; do not infer roles from URL names alone.

## Derived implementation checklist — source todos and decision references

The following checklist is derived from (not a verbatim quote by the user) the original todo IDs and accepted recommendations above. “D#” refers to the accepted recommendation number; all original todos remain in scope.

### 1. Authoring interactions and camera

- [ ] Keep orbit and zoom available during selection, rectangle creation, polygon creation, resizing, and other object edits; only explicit handles manipulate objects. (T44, T39, T45; D1, D7)
- [ ] Make Focus Booth frame the full selected booth with padding, smoothly update the orbit target to that booth, retain viewing direction, and leave draft state untouched. (T40; D15)
- [ ] Fix zoom/orbit responsiveness with populated scenes and retain permanently high visual quality rather than changing quality on zoom. Target 400+ booths plus 100+ other objects on an everyday laptop. (T20, T22, T14; user workload quote)
- [ ] Fix the recording’s visible floor/tile shimmer and missing/stippled underlay without hiding floor content. Record and visually retest the existing depth-bias change; do not claim it is verified until retested. (T18; recording attachment)

### 2. Booth creation and geometry editing

- [ ] Remove standard and polygon booth presets from inventory; make the viewfinder the only authoritative path for creating new booths. (T39; direct user correction)
- [ ] Implement two-click rectangle placement: first corner, live preview, opposite-corner click; Esc cancels. (T45; D7)
- [ ] Implement polygon placement: each click adds a vertex; hovering near start previews zoom-invariant snap; clicking near start closes and creates. Keep orbit/zoom accessible between clicks. (T39; D1, D6)
- [ ] Make in-progress and invalid polygon feedback legible, including the reported red line on walkable-zone drawing; determine from source and visual evidence whether red means invalid, active, or another state, and make the state intentional. (T38; D12, D18)
- [ ] Add explicit **Edit footprint** mode after polygon creation. Support moving, adding, and removing corners; keep shape valid; preview live; make each completed edit undoable. Hide corner handles outside this mode. (T39; D18)

### 3. Customize and direct manipulation

- [ ] Make right-click **Customize** open the complete selected-object editor in the sidebar. Keep object scene controls visible; make an open sidebar follow selection; keep a closed sidebar closed until Customize. (T24, T5, T6; D8–D11)
- [ ] Keep object settings per-instance. Do not mutate inventory defaults or other placed instances. A duplicate copies current values, then edits independently. (D20)
- [ ] Show name, dimensions, rotation, and common appearance options first; put remaining supported object settings into purpose-named collapsible groups; place raw polygon coordinates under Advanced. (T6, T34; D23)
- [ ] Expose useful supported per-item options, including the preview page’s table, foliage, and waste stream variants plus other meaningful settings supported by the renderer. Keep variants in Customize and separate from resize handles. (T5; preview page; D9, D10, D23)
- [ ] Remove raw roughness, metalness, and position X/Y fields from the user-facing object editor. Preserve required internal data only where implementation needs it, without exposing those fields as controls. (T34; D23)
- [ ] Provide a rotation slider and synchronized numeric degree field in Customize only; remove rotation control from the scene. (T37, T24; D8, D10, D22)
- [ ] Provide direct resize handles on scene objects. Booth width and depth resize independently; furniture remains proportional by default, with separate dimensions available where supported. All changes preview immediately and remain in the shared draft. (T24, T43; D1, user dimension quote)
- [ ] During resize, display a high-contrast black width × depth measurement in metres; hide it when the gesture ends. Keep exact values in Customize. (T43; D21)

### 4. Draft, undo/redo, save, and navigation

- [ ] Make edits to booths, POIs, zones, and furniture update one shared live draft. Selection changes retain draft edits. Remove competing Apply/save semantics so only the top-right **Save** persists all editor changes. (T41; D2)
- [ ] Preserve the camera pose when Save runs; saving must not refocus or zoom out. (T7; D2)
- [ ] Add session-wide Undo/Redo across object and zone edits, including polygon corner edits. One completed gesture is one history step; history continues after Save; undoing saved work makes the draft dirty. (D3, D18)
- [ ] On internal navigation with an unsaved draft, offer Stay or Discard and leave. Stay returns to the editor; the user uses the top-right Save. Use native unsaved-change protection for browser refresh/close. (D16)
- [ ] Reload saved changes reliably. Keep the distinction clear: camera preservation on Save is explicitly required; restoring the camera after a full reload should follow existing product behavior/source unless separately confirmed. (First milestone quote)

### 5. Placement, collisions, zones, and wayfinding

- [ ] Use type-specific placement: booths cannot overlap booths; furniture/decor can be placed within booth footprints. Define blocking geometry from object types instead of a blanket all-object collision rule. (T34; D5)
- [ ] When an attempted placement is invalid, reject it and restore an existing object to its last valid position; show one concise shadcn toast with the reason. Keep a new object in placement mode for retry. Remove the persistent distance readout. (T16; D4)
- [ ] Allow incomplete floor plans to be edited and saved. Attempting route generation or wayfinding preview without a walkable zone shows one error toast with an action to start drawing a zone. (T47; D12)
- [ ] Treat walkable zones as permitted areas; subtract booths and other blocking geometry from routable space automatically. Moving a blocker updates available space without redrawing the zone. Do not treat furniture/decor as blockers unless their object type specifies it. (D19, D5)

### 6. Labels, tooltips, sidebars, and clarity

- [ ] Keep booth labels at readable screen-sized scale across zoom levels. (T42; D13)
- [ ] Show object tooltips only after stationary hover; dismiss on action; suppress while drawing/placing/moving/resizing/orbiting; ignore pointer input so tooltips cannot obstruct scene placement. (T46; D14)
- [ ] Simplify left/right sidebars, make them hideable, and remove unnecessary controls while preserving required tools. Keep **Customize** behavior above. (T13, T6; D10–D11)
- [ ] Explain the actual page/route roles for `wayfindingPreview`, `eventId=floor-plan-studio`, and `?furniturePreview=1` from code. Do not invent behavior. (T21)

### 7. Loading experience and new assets

- [ ] After the first reliable authoring milestone, create a lightweight, delightful miniature exhibition loading experience: booths pop in; tiny visitors wander; clicking can cause a wave or bounce; no score, task, fake progress, or extra waiting; transition smoothly to the real scene when ready. (T19, T3; D17; direct loading-screen correction)
- [ ] Keep any new assets behind the reliable admin authoring milestone. All listed todos remain in scope. (T3; D24)

## Delivery and validation order

1. **Dependency/source audit and file ownership.** Read this frontend repository’s local instructions, package tooling, route/component map, and dependency boundaries. Assign non-overlapping ownership before parallel implementation. Preserve current user changes.
2. **Reliable authoring workflow.** Draw booths; place furniture; Customize and resize; edit walkable zones and POIs; orbit/zoom; Save without camera jump; reload and recover all saved edits. This is the user-accepted first milestone. (D24)
3. **Reliability and scene quality.** Resolve rectangle/polygon behavior, invalid placement toasts and collision rules, focus, labels/tooltips, polygon editing, resize persistence, underlay shimmer, populated-scene camera responsiveness, and 400+/100+ performance while keeping quality high. (Todos and D1–D23)
4. **Loading experience.** Add the miniature venue once authoring is reliable. (T19; D17)
5. **New assets.** Only after authoring UX has been refined. (T3; D24)

Validation must use the frontend repo’s actual instructions and scripts. Include typecheck, lint, formatting, applicable unit/integration tests, and a visual/manual check of the supplied recording defect and high-density scenes. Report pre-existing failures separately. Do not claim a visual fix without retesting the recording symptom on the frontend app.

## Recording and prior change

- Attachment: `C:\Users\HarmeetSingh\.t3\userdata\attachments\c3461ab1-0249-4804-a247-a46ea6ee1c0a-9389a668-b50b-4d3c-8441-0610e3a5c921-mp4.mp4` (“Screen Recording 2026-10-28 122039.mp4”).
- A prior one-line change adds `polygonOffsetUnits={-1}` to `src/features/world/components/TiledUnderlay.tsx`, matching the parent underlay. It has not been visually confirmed against the recording. Preserve it during further work and retest it as part of the visual-quality scope.

## Session amendment — 2026-10-28

The user supplied this latest steering verbatim. It overrides earlier repository and validation guidance where they conflict:

> you know i accidently started this session in the wrong directory. but no wrorries you just need to do all the work here C:\Users\HarmeetSingh\Desktop\Projects\blender-3D-demo\src
> move the plan there and continue doing all the work there

> and forget about tests i dont need them now

The plan and implementation status were moved under the frontend repository's `src/` directory. Continue implementation only in `C:\Users\HarmeetSingh\Desktop\Projects\blender-3D-demo\src`; automated tests are not requested. Typecheck, lint, build, and source review may still be used to ensure the implementation is usable.

## Session amendment — TODO completion and commit

The user later authorized this follow-up verbatim:

> mark the tasks as done in todo.md that have been completed here. after that do conventional git commit

This later instruction supersedes the earlier no-commit clause for the completed authoring work and its completion markers. It does not authorize pushing or running tests; automated tests remain deferred.

