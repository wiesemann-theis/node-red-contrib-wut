(function ($, window) {
    function prepareWebioClamp(clampNumber, isAnalog, defaultClampCount, labels, ranges) {
        let lastWebio = null;
        let lastNumber = clampNumber;

        $('#node-input-webio').change(function () {
            const tempWebio = $(this).val();
            if (tempWebio !== lastWebio) {
                lastWebio = tempWebio;
                $('#node-input-number').children('option').remove(); // remove all clamp options

                let labelData = labels[tempWebio];
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
                    $('#measurement-range-wrapper').removeClass('hidden');
                    $('#measurement-range').text(range.min + ' ' + range.unit + ' ... ' + range.max + ' ' + range.unit);
                } else {
                    $('#measurement-range-wrapper').addClass('hidden');
                }
            }
        });
    }

    $(document).ready(function () {
        window.wut = { prepareWebioClamp };
    });
})(jQuery, window);