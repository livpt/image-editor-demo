# Spec Delta

## Purpose

Defines efficient, reliable loading, resizing, filtering, and export behavior for large images without avoidable synchronous encoding.

## ADDED Requirements

### Requirement: Asynchronous local image loading
The editor SHALL decode a dropped local image asynchronously without first converting the file to a base64 data URL.

#### Scenario: Load a representative large image
- **WHEN** the user drops a valid 4000 by 3000 pixel local image
- **THEN** the editor decodes it, displays it at its intrinsic resolution, enables editing controls, and establishes the initial history state

#### Scenario: Reject an invalid image
- **WHEN** a dropped local file cannot be decoded as an image
- **THEN** the editor keeps the existing image unchanged and presents a recoverable error without enabling controls for an empty editor

### Requirement: Validated image resize
The editor SHALL resize the committed image to validated positive integer dimensions, optionally preserving its aspect ratio, and SHALL record one history entry per confirmed resize.

#### Scenario: Resize while preserving aspect ratio
- **WHEN** the user changes one dimension with aspect-ratio preservation enabled
- **THEN** the editor derives the other positive integer dimension from the current image ratio

#### Scenario: Confirm a valid resize
- **WHEN** the user confirms valid dimensions
- **THEN** the editor renders the image at those intrinsic dimensions with high-quality smoothing and records exactly one history entry

#### Scenario: Reopen the resize control
- **WHEN** the user opens and confirms the resize control multiple times
- **THEN** each confirmation triggers exactly one resize operation

#### Scenario: Reject invalid dimensions
- **WHEN** either requested dimension is missing, non-finite, zero, or negative
- **THEN** the editor does not resize the image or add a history entry

### Requirement: Efficient built-in filters
The editor SHALL apply grayscale, threshold, sepia, and invert filters using a supported accelerated path when available and a compatible fallback otherwise.

#### Scenario: Apply a supported filter
- **WHEN** the user selects a built-in filter for a loaded image
- **THEN** the editor applies the effect to the entire intrinsic image and records exactly one history entry

#### Scenario: Accelerated path is unavailable
- **WHEN** the browser lacks the accelerated operation required by a selected filter
- **THEN** the editor applies a fallback that produces the requested effect without reporting a runtime error

#### Scenario: Filter an image with transparency
- **WHEN** the loaded image contains transparent or partially transparent pixels
- **THEN** the selected filter changes color channels while preserving each pixel's alpha value

### Requirement: Asynchronous PNG export
The editor SHALL create a PNG Blob asynchronously for download and SHALL release temporary download URLs after use.

#### Scenario: Export an edited image
- **WHEN** the user saves a non-empty canvas
- **THEN** the browser downloads a PNG containing the current intrinsic image without constructing a base64 data URL

#### Scenario: Save an empty editor
- **WHEN** the user requests save before an image is loaded
- **THEN** no download is started

#### Scenario: Export repeatedly
- **WHEN** the user exports the image more than once
- **THEN** each download reflects the current committed image and temporary resources from prior exports are released
