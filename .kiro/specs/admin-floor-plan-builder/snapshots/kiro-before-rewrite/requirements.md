# Requirements Document

## Introduction

The Admin Floor Plan Builder is a new admin-facing feature that provides a dedicated 3D floor planning interface. This feature enables venue administrators to create, edit, and manage 3D booth layouts with polygon-shaped (non-rectangular) booths, drag-and-drop inventory management, and dynamic visual feedback.

### Goals

- Provide an intuitive 3D floor planning interface for venue administrators
- Enable creation of polygon-shaped booths (not just rectangles)
- Implement drag-and-drop inventory system for placing objects directly in 3D scene
- Support dynamic booth coloring based on underlying surface color
- Create procedural 3D placeholders using R3F (React Three Fiber) without external GLB files
- Provide a new dedicated URL route for floor planning
- Establish clean separation from existing admin-builder functionality

## Glossary

- **Admin Floor Plan Builder**: The new admin interface for 3D floor planning with drag-and-drop capabilities
- **Booth**: A retail or exhibition space that can be placed on a floor with polygon shape
- **Inventory**: Collection of reusable 3D object definitions with metadata for placement in the scene
- **R3F (React Three Fiber)**: React rendering library for Three.js used to create 3D graphics
- **Polygon-shaped**: Multi-sided shapes defined by vertices,不限于矩形
- **Dynamic Coloring**: Automatic booth material color matching to the underlying floor texture
- **Drag-and-Drop**: Direct manipulation of 3D objects using mouse/touch interactions
- **Walkable Zones**: Areas designated for pedestrian movement on the floor plan
- **Source Coordinates**: Pixel-based coordinates from floor images, converted to meters via calibration
- **World Meters**: Metric coordinates used for 3D rendering and collision detection
- **Layout Version**: Backend-managed version identifier for concurrent edit handling
- **Draft**: Unsaved changes persisted to backend for recovery and collaboration
- **Finalize**: Publish changes from draft to live layout

## Requirements

### Requirement 1: Admin Interface with New URL Route

**User Story:** As a venue administrator, I want to access a dedicated floor planning interface through a new URL, so that I can manage floor layouts without interfering with visitor-facing views.

#### Acceptance Criteria

1. WHEN the user navigates to `/admin/floor-plan`, THE AdminFloorPlanPage component SHALL be displayed
2. THE interface SHALL include navigation controls to switch between floors
3. WHEN navigating away from the admin floor plan URL, THE system SHALL preserve the current state for later return

### Requirement 2: Inventory System with Drag-and-Drop

**User Story:** As a venue administrator, I want to drag inventory items from a sidebar and drop them onto the 3D floor plan, so that I can quickly populate the venue with booths and amenities.

#### Acceptance Criteria

1. WHEN a user drags an inventory item from the sidebar, THE system SHALL display a ghost representation of the item in the 3D scene
2. WHEN an inventory item is dropped onto a floor, THE system SHALL check collision bounds with existing objects and, IF overlap would occur, THE system SHALL block placement and display an error message; otherwise THE system SHALL create a booth instance at the drop position with appropriate collision bounds
3. WHERE multiple inventory items are available, THE system SHALL organize them into categories (booths, stairs, tents, amenities)
4. WHEN an item is successfully placed, THE system SHALL add it to the floor's instances array with position, rotation, and scale data

### Requirement 3: Polygon-Shaped Booths

**User Story:** As a venue administrator, I want to create booths with polygon shapes, so that I can match booth placement to irregular floor spaces and architectural features.

#### Acceptance Criteria

1. WHEN a new booth is created, THE system SHALL accept an array of unique polygon vertices defining the booth boundary
2. WHILE creating a booth shape, THE system SHALL display a preview polygon that updates in real-time as vertices are added
3. WHERE a booth polygon is invalid (not closed, self-intersecting, repeated vertices, fewer than three vertices, or zero-area), THE system SHALL prevent placement and display an error
4. WHEN a booth is moved or resized, THE system SHALL maintain the polygon vertex relationships and update bounding geometry accordingly
5. WHERE source coordinates are used (pixel-based), THE system SHALL convert to world meters using floor calibration for rendering

### Requirement 4: Dynamic Surface-Based Coloring

**User Story:** As a venue administrator, I want booths to automatically match the color of the floor surface they're placed on, so that the venue has a cohesive visual appearance.

#### Acceptance Criteria

1. WHEN a booth is placed on a floor, THE system SHALL sample the floor texture color at the booth's position
2. WHILE a booth remains on the floor, THE system SHALL update the booth material color whenever the underlying floor texture color changes
3. IF a booth is moved to a different floor, THE system SHALL sample and apply the new floor's dominant color to the booth
4. WHERE floor textures are not available, THE system SHALL immediately revert to a default booth color configurable in settings

### Requirement 5: Supported Object Types

**User Story:** As a venue administrator, I want to place various venue elements including booths, stairs, tents, and amenities, so that I can create a complete floor plan with all necessary features.

#### Acceptance Criteria

1. WHEN placing a booth, THE system SHALL create a retail/exhibition space with configurable dimensions and polygon shape
2. WHEN placing stairs, THE system SHALL create a stair structure connecting different floors with appropriate slope and tread dimensions
3. WHEN placing barn tents, THE system SHALL create a tent structure with configurable size and position
4. WHEN placing an entrance, THE system SHALL mark a floor location as a primary entry point with directional guidance
5. WHEN placing washrooms (men/women), THE system SHALL create restroom facilities with appropriate signage and dimensions
6. WHEN placing a kids zone, THE system SHALL mark an area designated for children's activities
7. WHEN placing an avatar, THE system SHALL create a reference point for attendee navigation or meeting locations with explicit rendering task
8. FOR ALL object types, THE system SHALL map to existing backend schema with required fields (assetId or url, dimensions, collidable)

### Requirement 6: Procedural-Only Rendering

**User Story:** As a venue administrator, I want to see procedural 3D placeholders for venue elements, so that I can plan layouts without requiring external 3D model files.

#### Acceptance Criteria

1. WHEN rendering any object type, THE system SHALL use R3F primitives (boxes, cylinders, cones) to generate shapes programmatically
2. WHERE realistic objects are needed, THE system SHALL defer implementation to a later phase
3. FOR inventory definitions, THE system SHALL define procedural placeholder geometry for each type
4. WHEN rendering an avatar, THE system SHALL use a standing-person representation composed of R3F primitives
5. WHEN lighting conditions change, THE system SHALL update object appearance to reflect real-time lighting using R3F materials

### Requirement 7: Floor Management and Navigation

**User Story:** As a venue administrator, I want to manage multiple floors and navigate between them, so that I can organize the venue layout across different levels.

#### Acceptance Criteria

1. WHEN multiple floors exist, THE system SHALL display a floor selector in the interface
2. WHEN switching floors, THE system SHALL update the 3D scene to show the selected floor's layout
3. WHILE editing a floor, THE system SHALL allow adding, moving, and removing objects on that floor only
4. WHEN a new floor is created, THE system SHALL initialize it with default dimensions and coordinate system
5. WHEN deleting a floor, THE system SHALL confirm action and, IF confirmed, THE system SHALL remove all objects and data associated with that floor; IF cancelled, THE system SHALL leave the floor and all objects fully intact and unmodified

### Requirement 8: Validation and Error Handling

**User Story:** As a venue administrator, I want clear feedback when my actions are invalid, so that I can quickly identify and fix issues in my floor plan.

#### Acceptance Criteria

1. WHEN a booth is placed overlapping another object, THE system SHALL display an error message and prevent placement
2. WHEN a polygon vertex is placed invalidly, THE system SHALL provide immediate feedback and suggest corrections
3. IF a required field is missing when saving, THE system SHALL display validation errors and prevent save
4. WHEN network operations fail, THE system SHALL display error messages with retry options
5. IF invalid geometry is detected, THE system SHALL highlight problematic areas and suggest fixes

### Requirement 9: Data Persistence with Backend Integration

**User Story:** As a venue administrator, I want my floor plan changes saved automatically while preserving backend compatibility, so that I don't lose work and can track changes over time.

#### Acceptance Criteria

1. WHEN an object is added, moved, or removed, THE system SHALL mark the layout as dirty
2. WHILE idle for 2 seconds after a change, THE system SHALL automatically save the layout to the server as a draft
3. WHEN saving succeeds, THE system SHALL display a success confirmation
4. WHEN saving fails, THE system SHALL maintain unsaved changes and provide retry options
5. IF a draft exists on the server, THE system SHALL indicate draft status and provide options to load or discard
6. WHEN the user finalize changes, THE system SHALL publish the layout via `/api/events/:eventId/layout` endpoint
7. WHEN finalizing succeeds, THE system SHALL receive `{ saved: boolean }` response and update layout version
8. THE system SHALL use `X-Venue-Version` header for optimistic concurrency control on all backend calls
9. FOR all backend calls, THE system SHALL include venue authorization headers for authentication

### Requirement 10: Shortcut Handler Parity with Existing Demo

**User Story:** As a venue administrator, I want all keyboard shortcuts to work consistently with the existing demo, so that I can efficiently manage floor plans using keyboard controls.

#### Acceptance Criteria

1. WHEN Shift+S is pressed AND input is not focused, THE system SHALL save the current layout as draft
2. WHEN Shift+R is pressed AND input is not focused, THE system SHALL reload the layout from server
3. WHEN Shift+M is pressed AND input is not focused, THE system SHALL toggle move mode for selected objects
4. WHEN Shift+D is pressed AND input is not focused, THE system SHALL duplicate the selected object
5. WHEN Shift+B is pressed AND input is not focused, THE system SHALL toggle booth selection mode
6. WHEN Shift+P is pressed AND input is not focused, THE system SHALL toggle placement mode
7. WHEN Shift+T is pressed AND input is not focused, THE system SHALL toggle text input mode
8. WHEN Shift+I is pressed AND input is not focused, THE system SHALL toggle inventory sidebar
9. WHEN Shift+Z is pressed AND input is not focused, THE system SHALL undo the last action per-floor
10. WHEN Shift+X is pressed AND input is not focused, THE system SHALL redo the last action per-floor
11. WHEN Ctrl/Cmd+Z is pressed AND input is not focused, THE system SHALL undo the last action
12. WHEN input fields are focused, THE system SHALL allow standard text editing without triggering shortcuts
13. WHEN an object is being moved, THE system SHALL keep the original object at its start position while creating and moving a duplicate if the Shift key is held
14. WHEN switching floors, THE system SHALL validate that floor-specific operations are permitted
15. FOR all shortcut handlers, THE system SHALL check `isEditableTarget()` before executing shortcuts

### Requirement 11: Inventory Definition

**User Story:** As a venue administrator, I want clearly defined inventory types with their properties, so that I can understand what objects are available and how to use them.

#### Acceptance Criteria

1. FOR ALL inventory types, THE system SHALL define a consistent schema with: id, name, category, procedural geometry definition, dimensions, collidable flag
2. WHEN defining booths, THE system SHALL specify: booth shape (polygon), minimum/maximum dimensions, default color, asset reference
3. WHEN defining stairs, THE system SHALL specify: number of steps, tread depth, riser height, total height, width, material properties
4. WHEN defining tents, THE system SHALL specify: base dimensions, peak height, roof overhang, pole positions, canopy material
5. WHEN defining amenities, THE system SHALL specify: bounding box, collision behavior, visual representation
6. FOR all inventory types, THE system SHALL provide example acceptance scenarios for placement, movement, and editing

### Requirement 12: Integration with Existing Codebase

**User Story:** As a developer, I want the new admin floor plan builder to follow existing conventions, so that it's consistent with the rest of the application and maintainable.

#### Acceptance Criteria

1. WHEN creating new components, THE system SHALL follow shadcn UI patterns and component structure
2. WHEN defining data types, THE system SHALL extend existing TypeScript interfaces and schemas from `building-schema.ts`
3. WHEN managing state, THE system SHALL use Zustand stores following the pattern of `viewer-store.ts` and `layout-store.ts`
4. WHEN implementing 3D rendering, THE system SHALL use R3F patterns consistent with existing venue components
5. WHEN creating API endpoints, THE system SHALL follow the existing API client structure in `src/features/building/api/`
6. FOR all instances, THE system SHALL ensure compatibility with existing schema requiring: assetId or url, dimensions, collidable

## Non-Functional Requirements

### Performance

- WHEN rendering complex floor plans with 50+ objects, THE system SHALL maintain 60 FPS on modern hardware
- WHEN loading a floor plan, THE system SHALL display initial content within 2 seconds
- WHEN saving layout changes, THE system SHALL complete within 5 seconds

### Accessibility

- WHEN using keyboard navigation, THE system SHALL allow all floor plan operations without mouse
- WHEN screen readers are active, THE system SHALL provide appropriate ARIA labels for interactive elements

### Maintainability

- WHEN adding new object types, THE system SHALL require minimal changes to existing code
- WHEN updating 3D rendering, THE system SHALL separate concerns between logic, rendering, and state management
- WHEN modifying inventory definitions, THE system SHALL support new types without breaking existing functionality

## Constraints and Dependencies

### Technical Constraints

- MUST use React 19, TypeScript, and R3F as the core rendering technology
- MUST use existing shadcn UI components for interface elements
- MUST use Zustand for state management following existing patterns
- MUST extend existing `building-schema.ts` types rather than creating parallel type definitions
- MUST use existing backend endpoints: `/api/events/:eventId/layout` and `/api/events/:eventId/layout/draft`

### Integration Constraints

- MUST integrate with existing floor plan data structures without breaking existing admin-builder functionality
- MUST share backend API endpoints where possible (no backend changes required)
- MUST use existing navigation and routing infrastructure
- MUST preserve all existing shortcut handler behaviors from demo

### Resource Constraints

- MUST not require external 3D model files (GLB/GLTF) - all objects must be procedurally generated with R3F primitives
- MUST work within existing asset delivery infrastructure without new CDN requirements

## Out of Scope

- Real-time multiplayer editing (multiple admins working simultaneously)
- Booth reservation or booking workflow
- Customer-facing booth customization
- Financial transactions or payment processing
- Advanced analytics or usage tracking
- 3D object modeling tools (creation of new object shapes)
- Realistic object rendering with external GLB files (deferred to Phase 2)
- User authentication/authorization (handled by existing venue authorization)