# Implementation Plan: Admin Floor Plan Builder

## Overview

This implementation plan covers the development of the Admin Floor Plan Builder feature, which provides a dedicated 3D floor planning interface with drag-and-drop capabilities, polygon-shaped booth editing, and dynamic visual feedback. The implementation follows the existing codebase patterns and extends the building schema infrastructure.

## Tasks

- [ ] 1. Set up project structure and directory layout
  - Create feature directory at `src/features/floor-plan-builder/`
  - Create subdirectories: `components/`, `hooks/`, `model/`, `types/`, `api/`
  - Set up `package.json` with required dependencies
  - Reference existing API client at `src/features/building/api/layouts-client.ts`
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 10.1, 10.2, 10.3, 10.4, 10.5, 12.1, 12.2, 12.3, 12.4_
  - **Complexity**: Simple

- [ ] 2. Define core TypeScript types and interfaces matching backend schema
  - Create `types/floor-plan-types.ts` with all type definitions
  - Define `FloorPlanObject` base interface with required fields: `assetId`/`url`, `dimensions`, `collidable`
  - Define object-specific interfaces: `BoothObject`, `StairsObject`, `TentObject`, `AmenityObject`, `AvatarObject`
  - Define state management types: `FloorPlanState`, `FloorPlanValidationError`
  - Ensure compatibility with `floorAuthoringSchema` from `building-schema.ts`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 4.2, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 8.1, 9.1, 12.2_
  - **Complexity**: Moderate

- [ ] 3. Create Zod schemas for validation matching backend schema
  - Create `types/schemas.ts` with all Zod validation schemas
  - Define `boothSchema`, `stairsSchema`, `tentSchema`, `amenitySchema`, `avatarSchema`
  - Include required fields: `assetId`/`url`, `dimensions`, `collidable` in all object schemas
  - Create `floorPlanObjectSchema` as discriminated union
  - Create API request/response schemas matching `floorAuthoringSchema`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 4.2, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 8.1, 9.1, 12.2_
  - **Complexity**: Moderate

- [ ] 4. Define validation rules and utilities
  - Create `model/validation.ts` with polygon and placement validation
  - Import and use `isSimplePolygon` from `@/utils/geometry/polygon.ts`
  - Implement `validateBoothPolygon()` for simple closed polygons (unique vertices, implicit closure)
  - Implement `validateObjectPlacement()` for collision detection with 0.5m minimum spacing
  - Create `utils.ts` with helper functions (polygon area, signed area, coordinate conversion)
  - _Requirements: 3.1, 3.2, 3.3, 4.2, 4.3, 5.1, 8.1, 8.2, 8.3, 8.4, 8.5_
  - **Complexity**: Complex

- [ ] 5. Implement Zustand store for state management with version tracking
  - Create `model/floor-plan-store.ts` using Zustand
  - Define state shape: `FloorPlanState` with instances mapping to `floorAuthoringSchema`
  - Implement actions: `addObject`, `updateObject`, `deleteObject`, `selectObject`
  - Implement drag-and-drop actions: `startDrag`, `updateDrag`, `endDrag`
  - Implement save status actions: `markDirty`, `saveSuccess`, `saveError`
  - Implement version management for `X-Venue-Version` header
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 5.1, 6.1, 8.1, 9.1, 10.1_
  - **Complexity**: Complex

- [ ] 6. Create API client for floor plan operations with version management
  - Create `api/floor-plan-client.ts` with API functions
  - Reuse existing `getLayout()`, `saveLayout()`, `getLayoutDraft()`, `saveLayoutDraft()` from `layouts-client.ts`
  - Implement `finalizeLayout()` for publishing changes via `/api/events/:eventId/layout` endpoint
  - Implement draft load/save with `X-Venue-Version` header for optimistic concurrency
  - Use existing API client patterns and schemas from `dto.ts`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 9.1, 9.2, 9.3, 9.4, 9.5, 10.5, 12.4_
  - **Complexity**: Moderate

- [ ] 7. Create main page component
  - Create `components/AdminFloorPlanPage.tsx`
  - Set up routing for `/admin/floor-plan`
  - Implement floor navigation with `FloorSelector`
  - Implement inventory sidebar with `InventorySidebar`
  - Implement main canvas with `FloorCanvas`
  - Implement validation panel with `ValidationPanel`
  - _Requirements: 1.1, 1.2, 2.1, 7.1, 7.2, 9.1, 11.1, 11.2, 12.1, 12.2_
  - **Complexity**: Complex

- [ ] 8. Create floor selector component
  - Create `components/FloorSelector.tsx`
  - Implement floor dropdown/selector UI
  - Handle floor switching logic with state persistence
  - Display current floor information
  - _Requirements: 1.2, 7.1, 7.2, 7.3, 11.1, 11.2_
  - **Complexity**: Simple

- [ ] 9. Create inventory sidebar component
  - Create `components/InventorySidebar.tsx`
  - Organize inventory by categories (booths, stairs, tents, amenities, avatars)
  - Implement draggable inventory items with proper drag types
  - Add inventory item count badges
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 7.1, 11.1_
  - **Complexity**: Moderate

- [ ] 10. Implement inventory drag-and-drop functionality
  - Create `hooks/use-inventory-drag.ts` custom hook
  - Implement drag start from inventory sidebar
  - Implement drag ghost rendering in 3D canvas
  - Implement drop detection and object placement
  - Handle drag cancellation and cleanup
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 7.1, 7.2, 7.3, 10.1, 10.2_
  - **Complexity**: Complex

- [ ] 11. Create main floor canvas component
  - Create `components/FloorCanvas.tsx`
  - Set up R3F Canvas with proper camera configuration
  - Implement floor background rendering
  - Implement walkable zones visualization
  - Handle object selection and highlighting
  - Implement hit detection for object placement
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 7.1, 7.2, 7.3, 10.1, 10.2, 10.3, 10.4_
  - **Complexity**: Complex

- [ ] 12. Create booth 3D rendering component
  - Create `components/booths/Booth3D.tsx`
  - Implement polynomial-shaped rendering using `extrudeGeometry` (unique vertices, implicit closure)
  - Support dynamic surface-based coloring from floor texture
  - Implement selection highlighting
  - Implement hover visual feedback
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 6.4, 6.5_
  - **Complexity**: Complex

- [ ] 13. Create stairs 3D rendering component
  - Create `components/stairs/Stairs3D.tsx`
  - Implement multi-step stairs geometry using `boxGeometry`
  - Add handrail support
  - Support configurable steps, tread, and rise
  - _Requirements: 5.2, 6.1, 6.2, 6.3, 6.4, 6.5_
  - **Complexity**: Moderate

- [ ] 14. Create tent 3D rendering component
  - Create `components/tents/Tent3D.tsx`
  - Implement barn, gazebo, and marquee tent styles
  - Support configurable width, depth, and height
  - Add roof geometry details
  - _Requirements: 5.3, 6.1, 6.2, 6.3, 6.4, 6.5_
  - **Complexity**: Moderate

- [ ] 15. Create amenity 3D rendering components
  - Create `components/amenities/Washroom3D.tsx`
  - Create `components/amenities/KidsZone3D.tsx`
  - Create `components/amenities/Entrance3D.tsx`
  - Implement appropriate signage and visual representation
  - Support gender selection for washrooms
  - _Requirements: 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5_
  - **Complexity**: Moderate

- [ ] 16. Create avatar 3D rendering component
  - Create `components/avatars/Avatar3D.tsx`
  - Implement standing-person representation using R3F primitives (cylinder body, sphere head)
  - Support positioning and rotation in 3D space
  - Implement selection highlighting
  - _Requirements: 5.7, 6.1, 6.2, 6.3, 6.4, 6.5_
  - **Complexity**: Moderate

- [ ] 17. Create booth editor component
  - Create `components/booths/BoothEditor.tsx`
  - Implement polygon vertex editing UI
  - Add vertex manipulation controls (add, remove, move)
  - Validate polygon in real-time using `isSimplePolygon`
  - Show preview of booth with edited polygon
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 8.1, 8.2_
  - **Complexity**: Complex

- [ ] 18. Implement dynamic surface-based coloring
  - Create `hooks/use-floor-color.ts` custom hook
  - Sample floor texture color at booth position
  - Calculate dominant floor color using canvas pixel sampling
  - Update booth material color dynamically
  - Support fallback to configurable default color
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.1_
  - **Complexity**: Complex

- [ ] 19. Implement procedural-only rendering for Phase 1
  - Create `components/procedural/ProceduralBooth.tsx`
  - Create `components/procedural/ProceduralStairs.tsx`
  - Create `components/procedural/ProceduralTent.tsx`
  - Create `components/procedural/ProceduralAmenity.tsx`
  - Define procedural geometry for each object type
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 11.1, 12.1_
  - **Complexity**: Moderate

- [ ] 20. Create floor plan editor hook with shortcut handling
  - Create `hooks/use-floor-manager.ts` custom hook
  - Encapsulate complex state transitions
  - Provide undo/redo functionality with per-floor history
  - Handle object grouping operations
  - Manage selection history
  - _Requirements: 4.1, 8.1, 8.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 10.14, 10.15_
  - **Complexity**: Complex

- [ ] 21. Implement drag ghost rendering
  - Update `components/FloorCanvas.tsx` with drag ghost
  - Render ghost representation during drag operations
  - Update ghost position in real-time
  - Show collision feedback on ghost
  - Implement drag opacity and styling
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 8.2, 8.3, 8.4_
  - **Complexity**: Moderate

- [ ] 22. Implement collision highlighting
  - Add collision detection feedback to `FloorCanvas`
  - Highlight colliding objects when dragging
  - Show collision distance indicators
  - Implement visual feedback for minimum spacing
  - _Requirements: 4.3, 8.1, 8.2, 8.3, 8.4, 8.5_
  - **Complexity**: Moderate

- [ ] 23. Implement object selection system
  - Update `model/floor-plan-store.ts` with selection management
  - Implement selection highlighting in `FloorCanvas`
  - Add selection keyboard shortcuts
  - Support multi-selection if needed
  - _Requirements: 8.1, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11_
  - **Complexity**: Moderate

- [ ] 24. Implement polygon editing validation
  - Create `model/polygon-validator.ts` for polygon validation
  - Import and use `isSimplePolygon` from `@/utils/geometry/polygon.ts`
  - Implement simple polygon check (no self-intersections)
  - Implement closed polygon check (first/last point implicit)
  - Implement unique vertices check (no repeated vertices)
  - Implement positive area check
  - Provide detailed error messages for each validation failure
  - _Requirements: 3.1, 3.2, 3.3, 4.2, 8.1, 8.2, 8.3, 8.4_
  - **Complexity**: Complex

- [ ] 25. Implement undo/redo system with per-floor history
  - Extend `model/floor-plan-store.ts` with history management
  - Implement command pattern for undo/redo operations
  - Add undo/redo keyboard shortcuts (Shift+Z, Shift+X)
  - Implement per-floor history stacks
  - Implement history stack limits
  - _Requirements: 4.1, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_
  - **Complexity**: Complex

- [ ] 26. Add routing configuration
  - Configure route for `/admin/floor-plan` in routing system
  - Implement parameterized routes for building ID
  - Add navigation guards for admin role
  - Implement route protection
  - _Requirements: 1.1, 11.1, 11.2, 11.3_
  - **Complexity**: Simple

- [ ] 27. Create inventory definition schema with acceptance scenarios
  - Create `model/inventory-definition.ts` with complete inventory schema
  - Define schema for all object types with: id, name, category, procedural geometry, dimensions, collidable
  - Define booths: shape, dimensions, default color, asset reference
  - Define stairs: steps, tread, riser, total height, width, material properties
  - Define tents: base dimensions, peak height, overhang, pole positions, canopy
  - Define amenities: bounding box, collision behavior, visual representation
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
  - **Complexity**: Moderate

- [ ] 28. Create test infrastructure
  - Set up testing framework (Jest, React Testing Library)
  - Configure test utilities and mocks
  - Set up CI/CD test integration
  - _Requirements: 12.1, 12.2, 12.3_
  - **Complexity**: Simple

- [ ] 29. Write unit tests for validation logic
  - Test polygon validation functions using `isSimplePolygon`
  - Test collision detection logic with 0.5m minimum spacing
  - Test field validation with backend schema
  - Test edge cases and error conditions
  - _Requirements: 3.1, 3.2, 3.3, 4.2, 4.3, 8.1, 8.2, 8.3, 8.4, 8.5, 10.1, 10.2_
  - **Complexity**: Moderate

- [ ] 30. Write unit tests for store actions
  - Test state management actions
  - Test drag-and-drop state transitions
  - Test selection management
  - Test save status changes with version tracking
  - Test undo/redo operations with per-floor history
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.1, 6.1, 8.1, 9.1, 10.1, 10.2_
  - **Complexity**: Moderate

- [ ] 31. Write component tests for UI components
  - Test `AdminFloorPlanPage` integration
  - Test `FloorSelector` interaction
  - Test `InventorySidebar` rendering
  - Test `ValidationPanel` display
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.1, 7.1, 7.2, 8.1, 9.1, 9.2, 11.1_
  - **Complexity**: Moderate

- [ ] 32. Write 3D rendering tests
  - Test booth rendering with polygon geometry (unique vertices, implicit closure)
  - Test stairs rendering with multiple steps
  - Test tent rendering with different styles
  - Test amenity rendering with various configurations
  - Test avatar rendering with R3F primitives
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5_
  - **Complexity**: Complex

- [ ] 33. Write drag-and-drop integration tests
  - Test inventory drag from sidebar
  - Test drop on floor and object creation with backend schema
  - Test drag cancellation and cleanup
  - Test collision feedback during drag
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 4.1, 4.3, 8.1, 8.2, 8.3, 10.1, 10.2_
  - **Complexity**: Complex

- [ ] 34. Write property test for polygon validity preservation
  - **Property 1: Polygon validity preservation**
  - **Validates: Requirements 3.1, 3.2, 3.3**
  - Run minimum 100 iterations
  - Generate random polygons with unique vertices, verify simple, closed, positive area
  - **Complexity**: Complex

- [ ] 35. Write property test for collision avoidance
  - **Property 2: Object placement collision avoidance**
  - **Validates: Requirements 4.3**
  - Run minimum 100 iterations
  - Generate random object placements, verify no collisions with 0.5m minimum spacing
  - **Complexity**: Complex

- [ ] 36. Write property test for save/load data integrity (round-trip)
  - **Property 3: Save/load data integrity (Round-trip)**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
  - Run minimum 100 iterations
  - Generate random layouts, save/reload via API, verify data integrity with backend schema
  - **Complexity**: Complex

- [ ] 37. Write property test for finalize/publish workflow
  - **Property 4: Finalize workflow preserves layout version**
  - **Validates: Requirements 6.3, 6.4, 6.5, 6.6, 6.7, 6.8**
  - Run minimum 100 iterations
  - Generate layouts with draft state, finalize, verify version increment and success response
  - **Complexity**: Complex

- [ ] 38. Write property test for drag-and-drop object creation
  - **Property 5: Drag-and-drop object creation**
  - **Validates: Requirements 7.1, 7.2, 7.3**
  - Run minimum 100 iterations
  - Generate random inventory items and drop positions, verify object creation with backend schema
  - **Complexity**: Complex

- [ ] 39. Write property test for undo/redo consistency with per-floor history
  - **Property 6: Undo/redo consistency with per-floor history**
  - **Validates: Requirements 4.1, 10.1, 10.2**
  - Run minimum 100 iterations
  - Generate random edit sequences per floor, verify undo restores original state
  - **Complexity**: Complex

- [ ] 40. Write integration tests for full workflows
  - Test complete floor plan creation workflow with backend schema
  - Test object placement and editing workflow with polygon validation
  - Test validation and error resolution workflow
  - Test save/draft and finalize/publish workflow
  - Test version management with `X-Venue-Version` header
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 8.1, 8.2, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 10.14, 10.15_
  - **Complexity**: Complex

- [ ] 41. Performance testing
  - Test 60 FPS rendering with 50+ objects
  - Test floor plan load time under 2 seconds
  - Test auto-save completion under 2 seconds
  - Test finalize workflow completion under 2 seconds
  - Profile memory usage with complex layouts
  - _Requirements: 12.4, Non-Functional Performance_
  - **Complexity**: Complex

- [ ] 42. Accessibility testing
  - Test keyboard navigation for all features including shortcut handlers
  - Verify ARIA labels on interactive elements
  - Test screen reader compatibility
  - Fix any accessibility issues
  - _Requirements: Non-Functional Accessibility_
  - **Complexity**: Moderate

- [ ] 43. Final checkpoint - Ensure all tests pass
  - Run all tests and verify passing status
  - Verify no console errors or warnings
  - Check performance benchmarks
  - Verify accessibility compliance
  - Verify backend schema compatibility
  - **Complexity**: Simple

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases

### Implementation Guidance

1. **Start with tasks 1-5**: Set up the foundation (types, schemas, validation, store, API client)
2. **Implement backend compatibility (tasks 6, 7)**: Get API integration working early
3. **Then implement core 3D rendering (tasks 11-17)**: Get visual feedback early
4. **Add inventory system (tasks 8, 9, 10)**: Connect UI components
5. **Implement complex features (tasks 18-25)**: Polygon editing, dynamic coloring, shortcuts
6. **Add persistence (tasks 27, 28)**: Save and finalize workflows
7. **Test thoroughly (tasks 29-42)**: Comprehensive test coverage
8. **Final validation (task 43)**: Ensure everything works

### Task Dependencies Summary

- Tasks 2, 3, 4, 5 are foundational and can run in parallel
- Task 6 (API client) depends on types and schemas
- Tasks 7, 8, 9 depend on store implementation
- Tasks 10, 11 depend on store and UI components
- Tasks 12, 13, 14, 15, 16 depend on store and 3D rendering
- Tasks 17-25 depend on core 3D rendering and store
- Task 26 (routing) can be done at any time before integration
- Tasks 29-42 (testing) should follow implementation tasks

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3", "4"] },
    { "id": 1, "tasks": ["5", "6", "27"] },
    { "id": 2, "tasks": ["7", "8", "9"] },
    { "id": 3, "tasks": ["10", "11"] },
    { "id": 4, "tasks": ["12", "13", "14", "15", "16"] },
    { "id": 5, "tasks": ["17", "18", "24", "25"] },
    { "id": 6, "tasks": ["19", "20", "21", "22", "23"] },
    { "id": 7, "tasks": ["26", "28"] },
    { "id": 8, "tasks": ["29", "30", "31"] },
    { "id": 9, "tasks": ["32", "33"] },
    { "id": 10, "tasks": ["34", "35", "36", "37", "38", "39"] },
    { "id": 11, "tasks": ["40", "41", "42"] },
    { "id": 12, "tasks": ["43"] }
  ]
}
```