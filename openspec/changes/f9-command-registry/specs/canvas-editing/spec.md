# Spec Delta

## MODIFIED Requirements

### Requirement: Predictable edit history
The editor SHALL retain the current state and no more than 20 prior committed states, SHALL release the oldest prior states once their snapshots exceed 256 MiB, discard redo states after a new edit, and safely ignore unavailable undo or redo actions. The current state does not count toward the byte budget.

#### Scenario: History reaches its limit
- **WHEN** a user commits more than 20 edits on an image whose snapshots fit under 256 MiB
- **THEN** the oldest prior states are discarded and at most 20 undo steps remain

#### Scenario: Large image reaches the byte budget
- **WHEN** a user commits edits on a 4000 by 3000 image until prior snapshots exceed 256 MiB
- **THEN** the oldest prior states are released before 20 undo steps accumulate, and the current image remains available

#### Scenario: New edit follows undo
- **WHEN** the user undoes an edit and then commits a new edit
- **THEN** the new edit becomes current and the previous redo sequence is discarded

#### Scenario: Undo or redo is unavailable
- **WHEN** the user requests undo or redo with no corresponding state
- **THEN** the editor keeps the current image unchanged and reports no runtime error

#### Scenario: A new image is loaded
- **WHEN** the editor successfully loads a replacement image
- **THEN** the replacement becomes the initial history state and history from the previous image is released

## ADDED Requirements

### Requirement: Crop clips to the image
The crop tool SHALL clip the selected rectangle to the image. A drag that extends outside the image SHALL keep the overlapping region. A selection with no overlap, or with zero width or height, SHALL leave the image and history unchanged.

#### Scenario: Drag past the image edge
- **WHEN** the user drags a crop from inside the image to a point outside it
- **THEN** the editor crops the overlapping region and records one history entry

#### Scenario: Ignore an empty crop
- **WHEN** the crop selection has zero width or zero height
- **THEN** the editor leaves the image and history unchanged
