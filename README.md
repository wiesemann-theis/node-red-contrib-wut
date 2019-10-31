# @wiesemann-theis/node-red-contrib-wut

[![build](https://travis-ci.com/wiesemann-theis/node-red-contrib-wut.svg?branch=master)](https://travis-ci.com/wiesemann-theis/node-red-contrib-wut)
[![coverage](https://coveralls.io/repos/github/wiesemann-theis/node-red-contrib-wut/badge.svg?branch=master)](https://coveralls.io/github/wiesemann-theis/node-red-contrib-wut?branch=master)
[![dependencies](https://img.shields.io/david/wiesemann-theis/node-red-contrib-wut)](package.json)
[![issues](https://img.shields.io/github/issues/wiesemann-theis/node-red-contrib-wut)](https://github.com/wiesemann-theis/node-red-contrib-wut/issues)
[![license](https://img.shields.io/github/license/wiesemann-theis/node-red-contrib-wut?color=blue)](LICENSE)
[![npm (scoped)](https://img.shields.io/npm/v/@wiesemann-theis/node-red-contrib-wut)](https://www.npmjs.com/package/@wiesemann-theis/node-red-contrib-wut)

Integrate [Wiesemann & Theis](https://www.wut.de/) products - like Com-Servers, Web-IOs or Web-Thermometers - into Node-RED.

The package currently provides the following nodes:

- Com-Server (handle both incoming and outgoing serial communication through [Com-Servers](https://www.wut.de/e-58665-ww-daus-000.php))
- Digital IN (display input values of [Digital Web-IOs](https://www.wut.de/e-50www-10-inus-000.php))
- Digital OUT (display and possibly set output values of [Digital Web-IOs](https://www.wut.de/e-50www-10-inus-000.php))
- Digital COUNTER (display and possibly set counter values of [Digital Web-IOs](https://www.wut.de/e-50www-10-inus-000.php))
- Analog IN (display input values of [Analog Web-IOs](https://www.wut.de/e-5764w-10-inus-000.php) or [Web-Thermometers](https://www.wut.de/e-5760w-10-inus-000.php))
- Analog OUT (display and possibly set output values of [Analog Web-IOs](https://www.wut.de/e-5764w-10-inus-000.php))

## Installation

The easiest way to install the WuT nodes is to use the Node-RED editor's `Menu -> Manage palette` option.
In the `Install` tab you can search for the `@wiesemann-theis/node-red-contrib-wut` package and click `install`.
Once the installation is complete the nodes will available straight away (no Node-RED restart required).

Alternatively, you can run the following command in your Node-RED user directory (typically `~/.node-red`):

    npm i @wiesemann-theis/node-red-contrib-wut

The WuT nodes will then be available after you have restarted your Node-RED instance.

## Usage

For detailed information about the nodes and their configuration please look at the nodes' help texts at the Node-RED editor.

Please note that Web-IOs and Web-Thermometers don't allow http access by default.
To access these devices through Node-RED, please ensure that the "allow http requests" option in the "communication paths -> web API" section of the web configuration is enabled.

To visualize your data, you might for example use the nodes provided by the [node-red-dashboard project](https://flows.nodered.org/node/node-red-dashboard).

## License

[MIT](LICENSE)
