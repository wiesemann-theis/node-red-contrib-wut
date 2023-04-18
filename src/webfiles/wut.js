/*!
  * @wiesemann-theis/node-red-contrib-wut (https://github.com/wiesemann-theis/node-red-contrib-wut)
  * Licensed under MIT (https://github.com/wiesemann-theis/node-red-contrib-wut/blob/master/LICENSE)
  */
/* global RED */
/* eslint-env browser, jquery */ // flags to enable correct linting handling
(function ($, window, RED) {
    let allDevices = {};

    /********** helper functions ****************/
    function sanitize(htmlText) {
        return $('<div>' + (htmlText || '').replace(/<br[ /]*>/g, ' ') + '</div>').text();
    }
    function onKeyDown(e) {
        if (e.keyCode === 13 && $(e.target).hasClass('select2-search__field')) {
            e.stopPropagation(); // blame: for some reason, this event causes an error in Node-RED core when propagated to window...
        }
    }
    function getI18nMessages() {
        const lang = (navigator ? navigator.language || navigator.userLanguage || '' : '').toLowerCase();
        if (lang.slice(0, 2) === 'de') {
            return {
                errorLoading: function () { return 'Die Daten konnten nicht geladen werden.' },
                noResults: function () { return 'Keine Übereinstimmungen gefunden' }
                // all other possible messages are currently not used/needed (errorLoading, inputTooLong, inputTooShort, loadingMore, maximumSelected, searching, removeAllItems)
            };
        }
        return {}; // default -> will fall back to English anyway
    }

    let hasSelect2EventHandler = false;
    function addSelect2EventHandler() {
        if (!hasSelect2EventHandler) {
            hasSelect2EventHandler = true;
            $('body').on('keydown', onKeyDown);
            $('body').on('keydown', '.select2.select2-container', function (e) {
                const KEYS = { UP: 38, DOWN: 40 };
                if (e.keyCode === KEYS.UP || (e.keyCode === KEYS.DOWN && !e.altKey)) {
                    e.preventDefault();
                    const select = $(this).siblings('select');
                    if (select && select.length) {
                        let newValue;
                        if (e.keyCode === KEYS.UP) {
                            newValue = select.find('option:selected').prevAll(':enabled').first().val();
                        } else {
                            newValue = select.find('option:selected').nextAll(':enabled').first().val();
                        }

                        if (newValue) {
                            select.val(newValue).trigger('change');
                        }
                    }
                }
            });
        }
    }

    /**************** oneditprepare functions  ************************/

    function initClampConfig(clampNumber, isAnalog, defaultClampCount, labels, ranges) {
        let lastWebio = null;
        let lastLabelData = '';
        let lastNumber = clampNumber;

        $('#node-input-webio').change(function () {
            const tempWebio = $(this).val();
            let labelData = labels[tempWebio];
            if (tempWebio !== lastWebio || JSON.stringify(labelData) !== lastLabelData) {
                lastWebio = tempWebio;
                lastLabelData = JSON.stringify(labelData);
                $('#node-input-number').children('option').remove(); // remove all clamp options

                if (!labelData) { // generate default data
                    labelData = {};
                    const startIndex = isAnalog ? 1 : 0; // NOTE: analog clamp numbers are 1 based (digital are 0 based!)
                    const endIndex = startIndex + defaultClampCount;
                    for (let i = startIndex; i < endIndex; ++i) {
                        labelData[i] = i;
                    }
                }
                const slotNumbers = Object.keys(labelData).sort(function (a, b) { return (+a - +b); });
                for (let i = 0; i < slotNumbers.length; ++i) { // add new options according to label list
                    const slot = +slotNumbers[i];
                    const label = +labelData[slot] !== slot ? (slot + ': ' + labelData[slot]) : slot;
                    $('#node-input-number').append($('<option></option>').attr('value', slot).text(label));
                }

                $('#node-input-number').val(lastNumber).trigger('change'); // finally, restore selection
            }
        });

        $('#node-input-number').change(function () {
            lastNumber = $(this).val() || lastNumber;

            if (ranges) { // e. g. digital devices do not have ranges at all
                const range = (ranges[lastWebio] || {})[lastNumber];
                if (range) {
                    $('#measurement-range-wrapper').show();
                    $('#measurement-range').text(range.min + ' ' + range.unit + ' ... ' + range.max + ' ' + range.unit);
                } else {
                    $('#measurement-range-wrapper').hide();
                }
            }
        });

        if ($(window).select2) {
            addSelect2EventHandler();
            $('select.wut-select2,#node-input-webio').select2({ language: getI18nMessages() });
        }

        const webioId = $('#node-input-webio').val();
        const webio = RED.nodes.node(webioId);
        if (webio && !labels[webioId]) { // trigger portinfo and portdata update if there is no data available yet
            $.ajax({
                type: "PUT",
                url: 'wut/portinfo/' + webioId,
                data: { protocol: webio.protocol, host: webio.host, port: webio.port }
            });
        }
    }

    function initDeviceConfig(node) {
        let isDiscovering = false;
        let isManualConfig = node.manualConfig;
        let lastDeviceId = node.device;

        const isWebio = node.type === 'Web-IO';
        const idPrefix = isWebio ? '#node-config-input-' : '#node-input-';
        const type = isWebio ? 'webio' : 'comserver';

        const discoverDevices = function (clearCache) {
            isDiscovering = true;
            $('#btn-discover-devices').prop('disabled', true);
            $('#btn-discover-devices > i').attr('class', 'fa fa-fw fa-spinner fa-spin');
            const url = 'wut/devices/' + type + '?nodeId=' + node.id + (clearCache ? '&clearCache=true' : '');
            $.getJSON(url, function (data) {
                isDiscovering = false;
                $('#btn-discover-devices > i').attr('class', 'fa fa-fw fa-search');
                $('#btn-discover-devices').prop('disabled', isManualConfig || isDiscovering);
                if (data) {
                    allDevices[type] = data;
                    $(idPrefix + 'device').children('option').remove(); // remove all clamp options

                    for (let i = 0; i < data.length; ++i) {
                        const device = data[i];
                        device.text = device.ip + (isWebio ? ':' + device.port : '') + ' (' + device.mac + ')';
                        $(idPrefix + 'device').append($('<option></option>').attr('value', device.id).text(device.text).attr('data-data', JSON.stringify(device)));
                    }

                    if (!lastDeviceId) {
                        const matches = data.filter(function (d) {
                            let match = d.ip === node.host;
                            if (isWebio) {
                                match &= +d.port === +node.port && node.protocol === (d.httpsEnabled ? 'https' : 'http');
                            }
                            return match;
                        });
                        lastDeviceId = (matches[0] || {}).id;
                    }
                    $(idPrefix + 'device').val(lastDeviceId).trigger('change'); // finally, restore selection
                }
            });
        };

        $(idPrefix + 'device').change(function () {
            const selectedId = $(this).val();
            lastDeviceId = selectedId || lastDeviceId;
            const device = (allDevices[type] || []).filter(function (d) { return d.id === selectedId; })[0];
            if (device) { // set host, protocol and port values
                $(idPrefix + 'host').val(device.ip || '').trigger('change');
                if (isWebio) {
                    $(idPrefix + 'protocol').val(device.httpsEnabled ? 'https' : 'http').trigger('change');
                    $(idPrefix + 'port').val(device.port || '').trigger('change');
                }
            }
            if (device && !isManualConfig) { // set product details
                $('#device-details-wrapper').show();
                const productId = device.productId || '';
                $('#device-details-productid').text(productId).attr('href', 'https://www.wut.de/' + productId);
                $('#device-details-prodname').text(sanitize(device.prodname));
                $('#device-details-sysname').text(sanitize(device.sysname));
            } else {
                $('#device-details-wrapper').hide();
            }
        });

        $(idPrefix + 'manualConfig').change(function () {
            isManualConfig = this.checked;
            $('.manual-config-input').prop('disabled', !isManualConfig);
            $(idPrefix + 'device').prop('disabled', isManualConfig);
            $('#btn-discover-devices').prop('disabled', isManualConfig || isDiscovering);
            if (!isManualConfig) {
                $(idPrefix + 'device').trigger('change');
            } else {
                $('#device-details-wrapper').hide();
            }
        });

        $('#btn-discover-devices').click(function (e) {
            e.preventDefault();
            discoverDevices(true); // re-discover devices (clear cache!)
        });

        $('#btn-webconfig').click(function (e) {
            e.preventDefault();
            const protocol = isWebio ? $(idPrefix + 'protocol').val() : 'http';
            const host = $(idPrefix + 'host').val();
            const port = isWebio ? $(idPrefix + 'port').val() : 80;
            if (protocol && host && port) {
                window.open(protocol + '://' + host + ':' + port, '_blank');
            }
        });

        if ($(window).select2) {
            addSelect2EventHandler();
            setTimeout(function () {
                $('select.wut-select2:not(' + idPrefix + 'device)').select2({ language: getI18nMessages() });
                $(idPrefix + 'device').select2({
                    templateResult: function (device) {
                        let template = '<div class="wut-select2-dropdown"><div class="wut-row">' + device.text + '</div>'
                        let title = device.text;
                        if (device.prodname) {
                            if (device.productId) {
                                template += '<div style="display: flex;"><small class="wut-row">' + sanitize(device.prodname) + '</small><small>&nbsp;(#' + device.productId + ')</small></div>';
                                title += '\n' + sanitize(device.prodname) + ' (#' + device.productId + ')';
                            } else {
                                template += '<div class="wut-row"><small>' + sanitize(device.prodname) + '</small></div>';
                                title += '\n' + sanitize(device.prodname);
                            }
                        } else if (device.productId) {
                            template += '<div class="wut-row"><small>' + node._('config.label.productid') + ' #' + device.productId + '</small></div>';
                            title += '\n' + node._('config.label.productid') + ' #' + device.productId;
                        }
                        if (device.sysname) {
                            template += '<div class="wut-row"><small>' + sanitize(device.sysname) + '</small></div>';
                            title += '\n' + sanitize(device.sysname);
                        }
                        template += '</div>';
                        return $(template).attr('title', title);
                    },
                    matcher: function (params, data) {
                        const searchBase = [data.text, data.prodname, data.sysname, data.productId].filter(Boolean).join('   ').toLowerCase();
                        const searchString = $.trim(params.term).toLowerCase();
                        return searchBase.indexOf(searchString) > -1 ? data : null;
                    },
                    language: getI18nMessages()
                });
            }, 500); // blame: otherwise i18n select values might not be loaded/visualized correctly!
        }

        discoverDevices(false); // initially discover devices (cached data is ok)
    }

    $(document).ready(function () {
        window.wut = { initClampConfig: initClampConfig, initDeviceConfig: initDeviceConfig };
    });
})(jQuery, window, RED);