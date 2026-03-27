(function(root, factory) {
    var exported = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = exported;
    }

    root.OnlyOfficeAgentZoteroField = exported;
})(typeof window !== "undefined" ? window : globalThis, function() {
    var CITATION_FIELD_PREFIX = "ZOTERO_ITEM CSL_CITATION";
    var CITATION_FIELD_PREFIX_WITH_SPACE = CITATION_FIELD_PREFIX + " ";
    var CITATION_SCHEMA = "https://github.com/citation-style-language/schema/raw/master/csl-citation.json";

    function normalizeString(value) {
        if (value === undefined || value === null) {
            return "";
        }

        return String(value);
    }

    function createCitationItem(item) {
        var citationItem = {};
        var itemId = "";

        if (!item) {
            return null;
        }

        itemId = item.id || item.key || item.itemId || item.itemID || "";
        if (!itemId) {
            return null;
        }

        citationItem.id = String(itemId);

        if (item.uri) {
            citationItem.uri = String(item.uri);
        }

        if (item.uris) {
            citationItem.uris = Array.isArray(item.uris)
                ? item.uris.map(function(uri) {
                    return String(uri);
                })
                : [String(item.uris)];
        }

        if (item.itemData) {
            citationItem.itemData = item.itemData;
        }

        if (item.prefix !== undefined) {
            citationItem.prefix = String(item.prefix);
        }

        if (item.suffix !== undefined) {
            citationItem.suffix = String(item.suffix);
        }

        if (item.locator !== undefined) {
            citationItem.locator = item.locator;
        }

        if (item.label !== undefined) {
            citationItem.label = String(item.label);
        }

        if (item["suppress-author"] !== undefined) {
            citationItem["suppress-author"] = !!item["suppress-author"];
        } else if (item.suppressAuthor !== undefined) {
            citationItem["suppress-author"] = !!item.suppressAuthor;
        }

        return citationItem;
    }

    function buildCitationItemUri(item, settings) {
        var libraryId = item && item.libraryId ? String(item.libraryId) : "";
        var key = item && (item.key || item.id || item.itemId || item.itemID) ? String(item.key || item.id || item.itemId || item.itemID) : "";

        if (!key) {
            return "";
        }

        if (item && item.library === "group") {
            return "http://zotero.org/groups/" + libraryId + "/items/" + key;
        }

        return "http://zotero.org/users/" + String(settings && settings.userId ? settings.userId : "") + "/items/" + key;
    }

    function normalizeCitationItem(item, requestItem, settings) {
        var citationItem = {};
        var normalizedItem = item || {};
        var request = requestItem || {};
        var uri = "";

        if (normalizedItem.id !== undefined) {
            citationItem.id = normalizedItem.id;
        } else if (request.key || request.id || request.itemId || request.itemID) {
            citationItem.id = request.key || request.id || request.itemId || request.itemID;
        }

        if (normalizedItem.uris) {
            citationItem.uris = Array.isArray(normalizedItem.uris)
                ? normalizedItem.uris.map(function(value) {
                    return String(value);
                })
                : [String(normalizedItem.uris)];
        }

        if (normalizedItem.uri) {
            citationItem.uri = String(normalizedItem.uri);
        }

        if (!citationItem.uri) {
            uri = buildCitationItemUri(request, settings);

            if (uri) {
                citationItem.uri = uri;
            }
        }

        if (!citationItem.uris && citationItem.uri) {
            citationItem.uris = [citationItem.uri];
        }

        if (normalizedItem.itemData) {
            citationItem.itemData = normalizedItem.itemData;
        } else if (request.itemData) {
            citationItem.itemData = request.itemData;
        }

        if (normalizedItem.prefix !== undefined) {
            citationItem.prefix = String(normalizedItem.prefix);
        } else if (request.prefix !== undefined) {
            citationItem.prefix = String(request.prefix);
        }

        if (normalizedItem.suffix !== undefined) {
            citationItem.suffix = String(normalizedItem.suffix);
        } else if (request.suffix !== undefined) {
            citationItem.suffix = String(request.suffix);
        }

        if (normalizedItem.locator !== undefined) {
            citationItem.locator = normalizedItem.locator;
        } else if (request.locator !== undefined) {
            citationItem.locator = request.locator;
        }

        if (normalizedItem.label !== undefined) {
            citationItem.label = String(normalizedItem.label);
        } else if (request.label !== undefined) {
            citationItem.label = String(request.label);
        }

        if (normalizedItem["suppress-author"] !== undefined) {
            citationItem["suppress-author"] = !!normalizedItem["suppress-author"];
        } else if (request["suppress-author"] !== undefined) {
            citationItem["suppress-author"] = !!request["suppress-author"];
        } else if (request.suppressAuthor !== undefined) {
            citationItem["suppress-author"] = !!request.suppressAuthor;
        }

        return citationItem;
    }

    function createCitationItems(items, sourceCitationItems, settings) {
        var normalizedCitationItems = [];
        var sourceItems = Array.isArray(sourceCitationItems) ? sourceCitationItems : [];
        var requestItems = Array.isArray(items) ? items : [];
        var index;
        var normalizedItem;

        if (sourceItems.length > 0) {
            for (index = 0; index < sourceItems.length; index += 1) {
                normalizedItem = normalizeCitationItem(sourceItems[index], requestItems[index], settings);

                if (normalizedItem) {
                    normalizedCitationItems.push(normalizedItem);
                }
            }
            return normalizedCitationItems;
        }

        requestItems.forEach(function(item) {
            var citationItem = createCitationItem(item);

            if (citationItem) {
                citationItem.uri = buildCitationItemUri(item, settings);
                citationItem.uris = citationItem.uri ? [citationItem.uri] : citationItem.uris;
                normalizedCitationItems.push(citationItem);
            }
        });

        return normalizedCitationItems;
    }

    function buildCitationFieldValue(citation) {
        return CITATION_FIELD_PREFIX_WITH_SPACE + JSON.stringify(citation);
    }

    function parseCitationFieldValue(value) {
        var text = normalizeString(value).replace(/^\s+/, "");
        var jsonText;

        if (!text) {
            return null;
        }

        if (text.indexOf("ADDIN ") === 0) {
            text = text.slice(6).replace(/^\s+/, "");
        }

        if (text.indexOf(CITATION_FIELD_PREFIX) !== 0) {
            return null;
        }

        jsonText = text.slice(CITATION_FIELD_PREFIX.length).replace(/^\s+/, "");
        if (!jsonText) {
            return null;
        }

        try {
            return JSON.parse(jsonText);
        } catch (error) {
            return null;
        }
    }

    function normalizeAddinField(field) {
        var citation;

        if (!field) {
            return null;
        }

        citation = parseCitationFieldValue(field.Value);
        if (!citation) {
            return null;
        }

        return {
            FieldId: field.FieldId !== undefined ? String(field.FieldId) : undefined,
            Value: normalizeString(field.Value),
            Content: normalizeString(field.Content),
            citation: citation
        };
    }

    function normalizeAddinFields(fields) {
        var normalizedFields = [];

        (Array.isArray(fields) ? fields : []).forEach(function(field) {
            var normalizedField = normalizeAddinField(field);

            if (normalizedField) {
                normalizedFields.push(normalizedField);
            }
        });

        return normalizedFields;
    }

    function getCitationItemIdentity(item) {
        var normalizedItem = item || {};

        if (normalizedItem.uri) {
            return String(normalizedItem.uri);
        }

        if (Array.isArray(normalizedItem.uris) && normalizedItem.uris.length > 0 && normalizedItem.uris[0]) {
            return String(normalizedItem.uris[0]);
        }

        if (normalizedItem.id !== undefined && normalizedItem.id !== null && String(normalizedItem.id).length > 0) {
            return "id:" + String(normalizedItem.id);
        }

        if (normalizedItem.itemData && normalizedItem.itemData.id !== undefined && normalizedItem.itemData.id !== null) {
            return "itemData.id:" + String(normalizedItem.itemData.id);
        }

        if (normalizedItem.itemData && normalizedItem.itemData.key !== undefined && normalizedItem.itemData.key !== null) {
            return "itemData.key:" + String(normalizedItem.itemData.key);
        }

        return "";
    }

    function isNumericDigit(value) {
        return value >= "0" && value <= "9";
    }

    function findNumericCitationLabelClusterSpan(value) {
        var text = normalizeString(value);
        var candidateSpans = [];
        var searchRanges = [];
        var openingBracket;
        var closingBracket;
        var bracketEnd;
        var index;
        var range;
        var candidate;
        var firstDigit;
        var lastDigit;

        for (index = 0; index < text.length; index += 1) {
            openingBracket = text[index];

            if (openingBracket !== "[" && openingBracket !== "(" && openingBracket !== "{") {
                continue;
            }

            closingBracket = openingBracket === "[" ? "]" : (openingBracket === "(" ? ")" : "}");
            bracketEnd = text.indexOf(closingBracket, index + 1);

            if (bracketEnd === -1) {
                continue;
            }

            searchRanges.push({
                start: index + 1,
                end: bracketEnd
            });
        }

        searchRanges.push({
            start: 0,
            end: text.length
        });

        for (index = 0; index < searchRanges.length; index += 1) {
            range = searchRanges[index];
            candidate = text.slice(range.start, range.end).trim();

            if (!candidate || candidate.replace(/[0-9\s,;:\/\\\-–—+]+/g, "") !== "") {
                continue;
            }

            firstDigit = -1;
            lastDigit = -1;

            for (var cursor = 0; cursor < candidate.length; cursor += 1) {
                if (!isNumericDigit(candidate[cursor])) {
                    continue;
                }

                if (firstDigit === -1) {
                    firstDigit = cursor;
                }

                lastDigit = cursor;
            }

            if (firstDigit !== -1 && lastDigit !== -1) {
                candidateSpans.push({
                    start: range.start + firstDigit,
                    end: range.start + lastDigit + 1
                });
            }
        }

        if (!candidateSpans.length) {
            return null;
        }

        return candidateSpans[0];
    }

    function findNumericCitationLabelOccurrences(value) {
        var text = normalizeString(value);
        var spans = [];
        var index;
        var start;
        var previousIndex;
        var previousChar;
        var hasSeenLabelInCluster = false;

        if (!text) {
            return spans;
        }

        for (index = 0; index < text.length; index += 1) {
            if (text[index] === "[" || text[index] === "(" || text[index] === "{") {
                hasSeenLabelInCluster = false;
                continue;
            }

            if (text[index] === "]" || text[index] === ")" || text[index] === "}") {
                hasSeenLabelInCluster = false;
                continue;
            }

            if (!isNumericDigit(text[index])) {
                continue;
            }

            if (index > 0 && isNumericDigit(text[index - 1])) {
                continue;
            }

            previousIndex = index - 1;
            while (previousIndex >= 0 && /\s/.test(text[previousIndex])) {
                previousIndex -= 1;
            }

            previousChar = previousIndex >= 0 ? text[previousIndex] : "";

            if (previousChar && previousChar !== "[" && previousChar !== "(" && previousChar !== "{" && !(hasSeenLabelInCluster && (previousChar === "," || previousChar === ";"))) {
                continue;
            }

            start = index;
            while (index < text.length && isNumericDigit(text[index])) {
                index += 1;
            }

            spans.push({
                start: start,
                end: index
            });
            hasSeenLabelInCluster = true;

            index -= 1;
        }

        return spans;
    }

    function findNumericCitationLabelSpan(value) {
        var occurrences = findNumericCitationLabelOccurrences(value);

        if (occurrences.length > 0) {
            return occurrences[0];
        }

        return findNumericCitationLabelClusterSpan(value);
    }

    function isNumericCitationContent(value) {
        return findNumericCitationLabelOccurrences(value).length > 0 || !!findNumericCitationLabelClusterSpan(value);
    }

    function extractNumericCitationLabels(value) {
        var text = normalizeString(value);
        var occurrences = findNumericCitationLabelOccurrences(text);
        var labelSpan = findNumericCitationLabelClusterSpan(text);
        var labelText;
        var labels = [];
        var pieces;
        var index;
        var piece;
        var rangeMatch;
        var start;
        var end;
        var current;

        if (occurrences.length > 1) {
            occurrences.forEach(function(span) {
                var label = parseInt(text.slice(span.start, span.end), 10);

                if (!isNaN(label)) {
                    labels.push(label);
                }
            });

            return labels;
        }

        if (!labelSpan) {
            return labels;
        }

        labelText = text.slice(labelSpan.start, labelSpan.end);
        pieces = labelText.split(/[;,]/);

        for (index = 0; index < pieces.length; index += 1) {
            piece = pieces[index].trim();

            if (!piece) {
                continue;
            }

            rangeMatch = piece.match(/^(\d+)\s*[–—-]\s*(\d+)$/);

            if (rangeMatch) {
                start = parseInt(rangeMatch[1], 10);
                end = parseInt(rangeMatch[2], 10);

                if (!isNaN(start) && !isNaN(end)) {
                    if (start > end) {
                        current = start;
                        start = end;
                        end = current;
                    }

                    for (current = start; current <= end; current += 1) {
                        labels.push(current);
                    }
                }

                continue;
            }

            current = parseInt(piece, 10);

            if (!isNaN(current)) {
                labels.push(current);
            }
        }

        return labels;
    }

    function buildNumericCitationLabelCluster(labels) {
        var normalizedLabels = [];
        var sortedLabels;
        var parts = [];
        var start;
        var previous;
        var current;
        var index;

        (Array.isArray(labels) ? labels : []).forEach(function(label) {
            var number = typeof label === "number" ? label : parseInt(label, 10);

            if (isNaN(number)) {
                return;
            }

            normalizedLabels.push(number);
        });

        if (!normalizedLabels.length) {
            return "";
        }

        sortedLabels = normalizedLabels.slice().sort(function(left, right) {
            return left - right;
        });
        start = sortedLabels[0];
        previous = sortedLabels[0];

        for (index = 1; index < sortedLabels.length; index += 1) {
            current = sortedLabels[index];

            if (current === previous + 1) {
                previous = current;
                continue;
            }

            parts.push(start === previous ? String(start) : String(start) + "–" + String(previous));
            start = current;
            previous = current;
        }

        parts.push(start === previous ? String(start) : String(start) + "–" + String(previous));

        return parts.join(", ");
    }

    function buildCitationLabelState(existingFields) {
        var labelByIdentity = Object.create(null);
        var reservedLabels = Object.create(null);
        var nextLabel = 1;
        var index;

        function reserveLabel(label) {
            if (typeof label !== "number" || isNaN(label) || label < 1) {
                return;
            }

            reservedLabels[label] = true;
            if (label >= nextLabel) {
                nextLabel = label + 1;
            }
        }

        function takeNextLabel() {
            while (reservedLabels[nextLabel]) {
                nextLabel += 1;
            }

            var label = nextLabel;
            reserveLabel(label);
            return label;
        }

        for (index = 0; index < (Array.isArray(existingFields) ? existingFields.length : 0); index += 1) {
            var field = existingFields[index] || {};
            var citation = field.citation || parseCitationFieldValue(field.Value);
            var citationItems = citation && Array.isArray(citation.citationItems)
                ? citation.citationItems
                : [];
            var fieldLabels;

            if (citationItems.length > 0) {
                fieldLabels = extractNumericCitationLabels(field.Content || (citation.properties && citation.properties.plainCitation) || "");
                if (citationItems.length > 1) {
                    fieldLabels.forEach(function(label) {
                        reserveLabel(label);
                    });
                    continue;
                }

                citationItems.forEach(function(item) {
                    var identity = getCitationItemIdentity(item);
                    var label = fieldLabels.length > 0 ? fieldLabels.shift() : null;

                    if (!identity || labelByIdentity[identity] !== undefined) {
                        if (typeof label === "number" && !isNaN(label)) {
                            reserveLabel(label);
                        }
                        return;
                    }

                    if (typeof label === "number" && !isNaN(label)) {
                        reserveLabel(label);
                        labelByIdentity[identity] = label;
                        return;
                    }

                    labelByIdentity[identity] = takeNextLabel();
                });
            } else {
                fieldLabels = extractNumericCitationLabels(field.Content);
                fieldLabels.forEach(function(label) {
                    reserveLabel(label);
                });
            }
        }

        return {
            labelByIdentity: labelByIdentity,
            nextLabel: nextLabel,
            takeNextLabel: takeNextLabel
        };
    }

    function assignCitationLabels(existingFields, citationItems) {
        var state = buildCitationLabelState(existingFields);
        var labels = [];

        (Array.isArray(citationItems) ? citationItems : []).forEach(function(item, index) {
            var identity = getCitationItemIdentity(item) || "item:" + index;

            if (state.labelByIdentity[identity] === undefined) {
                state.labelByIdentity[identity] = state.takeNextLabel();
            }

            labels.push(state.labelByIdentity[identity]);
        });

        return labels;
    }

    function replaceCitationLabelOccurrences(template, occurrences, labels) {
        var result = "";
        var lastIndex = 0;
        var index;

        for (index = 0; index < occurrences.length; index += 1) {
            result += template.slice(lastIndex, occurrences[index].start);
            result += String(labels[index]);
            lastIndex = occurrences[index].end;
        }

        result += template.slice(lastIndex);
        return result;
    }

    function resolveCitationContent(content, citationItems, existingFields) {
        if (content && typeof content === "object" && !Array.isArray(content) && (
            content.content !== undefined ||
            content.citationItems !== undefined ||
            content.existingFields !== undefined
        )) {
            return resolveCitationContent(content.content, content.citationItems, content.existingFields);
        }

        var template = normalizeString(content);
        var labels;
        var labelSpan;
        var labelOccurrences;
        var labelCluster;

        labels = assignCitationLabels(existingFields, citationItems);

        if (!labels.length) {
            return template;
        }

        if (labels.length === 1 && labels[0] >= 1000 && template.replace(/[0-9\s\[\]\(\)\{\}]/g, "") === "") {
            return template;
        }

        labelOccurrences = findNumericCitationLabelOccurrences(template);
        if (labelOccurrences.length === labels.length && labelOccurrences.length > 0) {
            return replaceCitationLabelOccurrences(template, labelOccurrences, labels);
        }

        labelSpan = findNumericCitationLabelClusterSpan(template);
        if (!labelSpan) {
            return template;
        }

        labelCluster = buildNumericCitationLabelCluster(labels);
        if (!labelCluster) {
            return template;
        }

        return template.slice(0, labelSpan.start) + labelCluster + template.slice(labelSpan.end);
    }

    function createCitationFieldPayload(options) {
        var citation = options && options.citation ? options.citation : {};
        var items = options && options.items ? options.items : [];
        var existingFields = normalizeAddinFields(options && options.existingFields);
        var rawExistingFields = options && options.existingFields;
        var content = normalizeString(
            options && options.content !== undefined
                ? options.content
                : (citation.content !== undefined ? citation.content : citation.html)
        );
        var citationObject = options && options.citationObject ? options.citationObject : null;
        var citationId = options && options.citationID ? String(options.citationID) : "";
        var citationItems = createCitationItems(items, citation.citationItems, options && options.settings);
        var noteIndex = options && typeof options.noteIndex === "number"
            ? options.noteIndex
            : ((citation.properties && typeof citation.properties.noteIndex === "number")
                ? citation.properties.noteIndex
                : 0);
        var resolvedContent = resolveCitationContent(content, citationItems, rawExistingFields);

        if (!citationObject) {
            citationObject = {
                citationID: citationId || citation.citationID || (options && options.requestId ? String(options.requestId) : "agent-citation-" + (existingFields.length + 1)),
                properties: {
                    formattedCitation: resolvedContent,
                    plainCitation: resolvedContent,
                    noteIndex: noteIndex
                },
                citationItems: citationItems,
                schema: citation.schema || CITATION_SCHEMA
            };
        } else if (!citationObject.citationItems || !citationObject.citationItems.length) {
            citationObject.citationItems = citationItems;

            if (!citationObject.schema) {
                citationObject.schema = citation.schema || CITATION_SCHEMA;
            }
        }

        citationObject.properties = citationObject.properties || {};
        citationObject.properties.formattedCitation = resolvedContent;
        citationObject.properties.plainCitation = resolvedContent;
        citationObject.properties.noteIndex = noteIndex;

        return {
            addinField: {
                Value: buildCitationFieldValue(citationObject),
                Content: resolvedContent
            },
            Value: buildCitationFieldValue(citationObject),
            Content: resolvedContent,
            citation: citationObject,
            existingFields: existingFields
        };
    }

    return {
        CITATION_FIELD_PREFIX: CITATION_FIELD_PREFIX,
        CITATION_SCHEMA: CITATION_SCHEMA,
        buildCitationFieldValue: buildCitationFieldValue,
        parseCitationFieldValue: parseCitationFieldValue,
        normalizeAddinField: normalizeAddinField,
        normalizeAddinFields: normalizeAddinFields,
        getCitationItemIdentity: getCitationItemIdentity,
        isNumericCitationContent: isNumericCitationContent,
        resolveCitationContent: resolveCitationContent,
        createCitationFieldPayload: createCitationFieldPayload
    };
});
