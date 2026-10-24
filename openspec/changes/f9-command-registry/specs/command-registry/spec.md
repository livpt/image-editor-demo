# Spec Delta

## Purpose

Named edits with validated parameters, one labelled history entry per successful edit, and one facade for the toolbar, the keyboard, and the console.

## ADDED Requirements

### Requirement: Registered commands
The editor SHALL expose a catalog of commands covering load, crop, resize, grayscale, threshold, sepia, invert, pen, line, rectangle, and ellipse. Each catalog entry SHALL include a name, a label, and a parameter schema, and SHALL NOT include an executable body.

#### Scenario: List commands as JSON
- **WHEN** a caller requests the command catalog
- **THEN** the result is JSON for every registered name and includes no executable body

#### Scenario: Unknown command
- **WHEN** a caller runs a name that is not registered
- **THEN** the editor throws an unknown-command error and leaves the image and history unchanged

### Requirement: Validated command parameters
The editor SHALL accept only the fields declared by the command. It SHALL reject a missing required field, an unknown field, and a value of the wrong type, including a numeric string where a number is required. It SHALL report every problem in one error.

#### Scenario: Invalid resize
- **WHEN** a caller runs resize with a width below 1
- **THEN** the editor throws an invalid-parameter error and leaves the image and history unchanged

#### Scenario: Several problems at once
- **WHEN** a caller runs resize with a string width and no height
- **THEN** the error message names both problems and the editor does not apply the command

### Requirement: One history entry per successful command
A successful command SHALL append exactly one history entry labelled with that command. The entry SHALL record the command name, the label, and the JSON parameters. Undo and redo SHALL NOT themselves append entries.

#### Scenario: Filter from the toolbar
- **WHEN** the user applies Sepia from the toolbar
- **THEN** history gains one Sepia entry and the status line reports the elapsed time

#### Scenario: Same filter from the facade
- **WHEN** a caller runs the Sepia command through the facade
- **THEN** the image and the history entry match the toolbar action

### Requirement: Command facade
The page SHALL publish a frozen `window.app` object with `run`, `undo`, `redo`, `commands`, and `doc`. `doc` SHALL report width, height, whether an image is loaded, whether a command is in progress, retained history bytes, and the history labels. `run` SHALL reject work while a command is in progress and SHALL reject an edit when no image is loaded.

#### Scenario: Console uses the facade
- **WHEN** the user submits an expression in the console panel
- **THEN** the expression runs against `window.app` and the panel shows the JSON result or the error message

#### Scenario: Busy editor
- **WHEN** a caller runs a command while another command is still committing
- **THEN** the editor throws a busy error and does not start a second edit

#### Scenario: Empty editor
- **WHEN** a caller runs an edit before an image is loaded
- **THEN** the editor throws an empty-document error and does not paint

### Requirement: Load stays a baseline
Loading an image SHALL reset history and install that image as the only history state, labelled as a load. The load control SHALL accept a decoded image. `run` SHALL NOT accept a decoded image in JSON parameters.

#### Scenario: Replace the image
- **WHEN** the user loads a new image after editing
- **THEN** the new image is the only history state and the previous snapshots are released

### Requirement: Undo and redo shortcuts
Ctrl+Z and Cmd+Z SHALL undo. Ctrl+Shift+Z, Cmd+Shift+Z, and Ctrl+Y or Cmd+Y SHALL redo. The shortcuts SHALL be ignored while a dialog is open or while focus is in a text field. An unavailable undo or redo SHALL leave the image unchanged.

#### Scenario: Undo from the keyboard
- **WHEN** the user presses Ctrl+Z or Cmd+Z after a successful edit and focus is on the page
- **THEN** the editor restores the previous image and reports the undone label

#### Scenario: Redo from the keyboard
- **WHEN** the user presses Ctrl+Shift+Z, Cmd+Shift+Z, Ctrl+Y, or Cmd+Y after an undo
- **THEN** the editor restores the undone image
