# Spec Delta

## Purpose

Defines responsive, device-independent canvas editing behavior and predictable undo/redo memory use for full-resolution images.

## ADDED Requirements

### Requirement: Device-independent editing input
The editor SHALL support drawing and crop interactions with mouse, touch, and stylus input in current Chrome, Firefox, and Safari.

#### Scenario: Edit with any supported pointer
- **WHEN** a user presses, moves, and releases a mouse, touch contact, or stylus on the canvas
- **THEN** the selected tool completes the same logical edit for each pointer type

#### Scenario: Pointer releases outside the canvas
- **WHEN** an active pointer leaves the canvas and is released
- **THEN** the editor ends the interaction and does not continue drawing on later pointer movement

### Requirement: Frame-coalesced edit previews
The editor SHALL keep the committed image unchanged during a transient shape or crop preview and SHALL render no more than one preview update per animation frame using the latest pointer position.

#### Scenario: Rapid pointer movement
- **WHEN** multiple pointer-move events arrive before the next animation frame
- **THEN** the editor renders one preview for that frame at the latest received position

#### Scenario: Commit a previewed edit
- **WHEN** the user releases the active pointer after previewing a valid edit
- **THEN** the editor applies the final result to the committed image exactly once and records one history entry

#### Scenario: Cancel an interrupted preview
- **WHEN** an active preview is cancelled by the browser or input device
- **THEN** the editor removes the preview without changing the committed image or history

### Requirement: Coordinates follow the displayed canvas
The editor SHALL map pointer positions to intrinsic image coordinates when the canvas is displayed at a different CSS size.

#### Scenario: Edit a scaled image
- **WHEN** an image is displayed smaller than its intrinsic pixel dimensions and the user targets a visible point
- **THEN** the edit is applied to the corresponding intrinsic image coordinate

#### Scenario: View an image wider than the viewport
- **WHEN** an image's intrinsic width exceeds the available viewport width
- **THEN** the editor displays it within the available width without changing its intrinsic resolution

### Requirement: Direction-independent crop
The crop tool SHALL normalize the selected bounds so a valid rectangular crop works in every drag direction.

#### Scenario: Crop toward the top-left
- **WHEN** the user begins at a lower-right point and releases at an upper-left point
- **THEN** the editor produces the image inside the normalized selected rectangle

#### Scenario: Ignore an empty crop
- **WHEN** the crop selection has zero width or zero height
- **THEN** the editor leaves the image and history unchanged

### Requirement: Predictable edit history
The editor SHALL retain the current state and no more than 20 prior committed states, discard redo states after a new edit, and safely ignore unavailable undo or redo actions.

#### Scenario: History reaches its limit
- **WHEN** a user commits more than 20 edits
- **THEN** the oldest prior states are discarded and at most 20 undo steps remain

#### Scenario: New edit follows undo
- **WHEN** the user undoes an edit and then commits a new edit
- **THEN** the new edit becomes current and the previous redo sequence is discarded

#### Scenario: Undo or redo is unavailable
- **WHEN** the user requests undo or redo with no corresponding state
- **THEN** the editor keeps the current image unchanged and reports no runtime error

#### Scenario: A new image is loaded
- **WHEN** the editor successfully loads a replacement image
- **THEN** the replacement becomes the initial history state and history from the previous image is released
