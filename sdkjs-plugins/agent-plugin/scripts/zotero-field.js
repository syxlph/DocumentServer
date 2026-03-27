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

    function createCitationFieldPayload(options) {
        var citation = options && options.citation ? options.citation : {};
        var items = options && options.items ? options.items : [];
        var existingFields = normalizeAddinFields(options && options.existingFields);
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

        if (!citationObject) {
            citationObject = {
                citationID: citationId || citation.citationID || (options && options.requestId ? String(options.requestId) : "agent-citation-" + (existingFields.length + 1)),
                properties: {
                    formattedCitation: content,
                    plainCitation: content,
                    noteIndex: noteIndex
                },
                citationItems: citationItems,
                schema: citation.schema || CITATION_SCHEMA
            };
        } else if (!citationObject.citationItems || !citationObject.citationItems.length) {
            citationObject.citationItems = citationItems;
        }

        return {
            addinField: {
                Value: buildCitationFieldValue(citationObject),
                Content: content
            },
            Value: buildCitationFieldValue(citationObject),
            Content: content,
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
        createCitationFieldPayload: createCitationFieldPayload
    };
});
