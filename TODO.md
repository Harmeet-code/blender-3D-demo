

## TODO > Next
```py
- [ ] Write `.opencode/instructions/opencode.jsonc` and `AGENTS.md` with repo-specific agent and contributor guidance; validate config and run `bun run verify` #developer-experience
17. need to have a little bit of automatic alignemnt for things like walls etc 

1. remove old and unwanted PNG and GLB files  DONE
2. remove all unnecessary skills    DONE
4. check if all the new items are in admin inventory  DONE
8. zooming in shouldnt make it animate and of high quality. it should remain in its default view as high quality
9. image upload is not working. if the image is bigger then the floor width and depth then it should automatically adjust. need to remove calibration coordinates DONE
10. polygon booth add isnt working as in demo.
11. route should be formed only if we have walking zone defined and there should be a avatar walking around not from the top/iso view, it should walk around the scene from the avatar POV DONE
12. remove sign in as it is not needed for now DONE

15. when placing an item into the scene it is currently stuck right there after placing it on the scene. after an item have been placed once it should go back to the state of empty. if the user wants to place the same thing then user will use shift + D shortcut which can then be dragged to any place and then click on the desired place to settle it right there DONE
23. need to fix the necessary ports for Frontend and backend DONE
25. remove night lighting feature(maybe), where is the information being stored regardingplacement of booths  DONE
26. walking modal should live in sidebar and not on the screen itself  DONE
27. need to have the admin sidebar things like walkable zones and other things collasible and visible at all times DONE
28. need to show shortcuts available  DONE
29. need to have all walls closed in shell layout DONE
30. need to have a notification when the save is successfull. DONE
31. need to display booth number or coompany name if company name is empty      DONE
32. should be able to completly backspace width and depth of the floor DONE
33. need to have drag and select multiple items as well DONE
34. as i zoom in sometimes the zoom and drag the scene gets slowed quite a lot
35. Ctrl+S needs to be in sync with UI unsaved changes DONE
36. need to have auto increamenting booth number from the previous DONE
37. need to remove L and U shpae reference DONE
38. availibilty and heat should onyl affect booth DONE
31. need to have extra items in inventory such as show office, shipping, wash rack, parking lot, food truck/dining DONE

32. move should display an overlau where that object is being placed DONE
33. need to have auto increamenting names for all inventory objwects as well even if they are duplicate DONE
35. some of the booths required to be placed next to each other so preveting the user from place it there isnt the right behaviour DONE
36. need to have stairs and escalators connected visually ie at a height distnace with stairs, escalator, lift connecting the 2 with animation. DONE
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
24. need customise button along with move, rotate, duplicate, delete. need to have a resize to resize it dynamically. with live preview.
22. Keep QUALITY PERMANENTLY HIGH and it shouldnt get into high quality once i zoom in. 
16. no need of this need as we should geta  shadcn notification only if the item cannot be placed there. Placement needs attention
Floor edge: 0.00 m · Nearest blocked geometry: 23.50 m

Keep the whole object inside the floor boundary
18.  need to fix shimmering of all the objects (source mitigation added; visual confirmation still needed)
19. need to make a good interactive loading screen while the scene is being loaded - Opening floor plan studio…
20. zoom in and out should work will in admin authoring 
21. what are all the pages in the new - wayfindingPreview, eventId=floor-plan-studio, ?furniturePreview=1
47. if no walking zone defined then give me a error toast for the same
13. right and left sidebar have a lot of unnecessary things that are not needed and should be hideable
14.  zoom works perfectly when there is no item. but when there are items it kinda works slowly. (400+ booths/100+ items performance remains unbenchmarked)
3.  need to refine admin authoring UX first then make new assets (authoring implementation landed; interactive verification and dense-scene performance remain)
7. clciking on save shouldnt zoom out view should remain fixed 
5. the adjustments to inventory items are coming in a spearate page. i should be able to customise them while placing them on the scene by right clicking on the scene with a game like scene overlay on top of it for this page Procedural services preview
6. admin authoring needs to be a little simpler
34. what is colision and need to remove material roughness, metalness, position X/Y
48. increasing width. height depth should happen only one direction
49.  interactive loading screen should come in opening the floor plan 
50. crossing the tooltip doesnt moves it away 
-  Review remaining polygon/resize helper copy for stale double-click or right-click finish directions and Enter/Esc Apply/Discard wording.
-  Interactive polygon/edit-footprint and resize Save/reload confirmation remains pending; see `src/admin-authoring-implementation-status.md`.
51. clicking on a object to swiftly focus on that object in the scene 
52. left click mouse doesnt release the rectangle being drawn and how is it being defined where the booth will be drawn and when the overlay line becomes red as sometimes i have space but it doesnt allow me to do so 
53. sometimes after drawing a booth save doesnt work neither can i draw new booths 
54. undo should also inlcude placing points of a polygon
55. clciking on another booth customise should update the sidebar with its information
56. modify wentrance prperties and saving doesnt work 
57. all overlay will be of deep black color 
58. walk through needs a lot of improvemnts  
59. make it restore the model in localstorage  DONE
60. drag and drop is not visible in the scene but does on other object. 
61. limit on a object's width and depth should be remove 
```



Link,What you see
http://127.0.0.1:5175/?furniturePreview=1,"Furniture — bench, table+chairs, belt barrier, planter, waste station (+ table/foliage/waste-stream variants) — the one you have open"
http://127.0.0.1:5175/?boothPreview=1,"Booths — standard/polygon layouts, roofs, signage, storage closet"
http://127.0.0.1:5175/?structurePreview=1,"Structure — barn/gazebo/marquee tents, sidewalls, flooring, entrance gates"
http://127.0.0.1:5175/?circulationPreview=1,"Connectors — stairs, elevator, escalator, accessible ramp (working mechanics)"
http://127.0.0.1:5175/?amenityPreview=1,"Amenities — washroom blocks, soft-play/kids zone, avatar poses"
http://127.0.0.1:5175/?servicePreview=1,"Services — information desk, food kiosk, water station, first aid, emergency exit"
http://127.0.0.1:5175/?shippingPreview=1,"Shipping/receiving — dock bay, container yard, staging apron"
http://127.0.0.1:5175/?washRackPreview=1,"Wash rack — equestrian/livestock/vehicle variants, connected row"
http://127.0.0.1:5175/?parkingPreview=1,"Parking lot — footprints, bay angles, aisles, occupancy heatmap"
http://127.0.0.1:5175/?wayfindingPreview=1,Wayfinding routes/walkthrough — extra &scenario=stairs|ramp|escalator|elevator|restricted|performance