# CHANGELOG

## unreleased

### Added

- Analog OUT node added
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
