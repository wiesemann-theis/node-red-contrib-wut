# CHANGELOG

## Unreleased

## 2.1.6

### Fixed

- fixed Web-IO https portinfo handling
- workaround for Travis CI issues with NodeJS v18

## 2.1.5

### Changed

- updated dependencies

### Fixed

- fixed Web-IO https handling

## 2.1.4

### Changed

- improved error status handlilng
- updated dependencies

### Fixed

- fixed multiple portinfoTypes handling

## 2.1.3

### Changed

- updated dependencies

### Fixed

- remove event listeners individually in each node (needed for partial deploys)

## 2.1.2

### Changed

- increased http timeout
- updated dependencies

## 2.1.1

### Added

- Web-IO: diff and lastValue properties for output messages of all node types

### Changed

- portinfo polling interval increased
- increased request queueing robustness

### Fixed

- httpAdmin permissions

## 2.1.0

### Changed

- Web-IO: on error (e. g. device not reachable) - retry after 10 s latest
- Web-IO: improved interval configuration
- properties list reorderd

## 2.0.0

### Added

- added digital counter node
- made topic (for outgoing messages) configurable
- made polling interval for Web-IOs configurable
- dynamically get portinfos on local config changes (not only on deploy!)

### Changed

- custom node icons
- increased robustness for portinfo validation
- increased max listeners limit for event emitter
- example workflows adjusted

## 1.4.1

### Added

- locales files for de-DE, de-AT and de-CH (workaround for invalid language fallback behaviour in Node-RED)

### Changed

- Use browser instead of server language for status messages
- demo workflows adjusted
- improved input value handling (allow/parse certain string inputs)
- updated dependencies

## 1.4.0

### Added

- Example workflows
- Unit Tests

### Misc

- Minor changes for Node-RED v1.0 compatibility

## 1.3.0

### Added

- auto-discovery / W&T broadcast feature (-> select available devices from dropdown list instead of adding connection parameters manually)
- display device details for Web-IOs and Com-Servers (like article no., device type,...)
- quicklinks from config nodes to web config application
- [select2@4.0.8](https://select2.org/) for advanced select boxes

### Changed

- minor layout adjustments
- resolved redundancies

### Fixed

- prevent empty messages on startup
- prevent http request failures due to tcp connection resets

## 1.2.0

### Added

- Analog OUT node
- msg.clampName parameter for Web-IO output messages
- display measurement value ranges for analog clamps (in config dialog + as parameters in output messages)

### Changed

- identify device type based on /portinfo (instead of /version)
- analyze slot information from /portinfo
- display clamp index in clamp selection config dialog
- error handling improved
- event handling improved
- resolved redundancies in web-io i18n/locales files

## 1.1.1

updated readme and changelog

## 1.1.0

renamed package from `node-red-contrib-wut` to `@wiesemann-theis/node-red-contrib-wut` (npm org scoped package)

## 1.0.2

fixed node names to get all nodes listed on the Node-RED homepage

## 1.0.1

first npm release (deprecated -> npm package `node-red-contrib-wut` doesn't exist anymore (see v1.1.0))

## 1.0.0

Initial (public) release

### Added

- Com-Server node
- Web-IO/Web-Thermometer nodes
    - Digital IN
    - Digital OUT
    - Analog IN
