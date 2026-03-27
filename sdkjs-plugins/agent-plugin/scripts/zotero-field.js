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

    function createCitationItems(items) {
        var citationItems = [];

        (Array.isArray(items) ? items : []).forEach(function(item) {
            var citationItem = createCitationItem(item);

            if (citationItem) {
                citationItems.push(citationItem);
            }
        });

        return citationItems;
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

    function createCitationFieldPayload(options) {
        var citation = options && options.citation ? options.citation : {};
        var items = options && options.items ? options.items : [];
        var existingFields = Array.isArray(options && options.existingFields) ? options.existingFields : [];
        var content = normalizeString(
            options && options.content !== undefined
                ? options.content
                : (citation.content !== undefined ? citation.content : citation.html)
        );
        var citationObject = options && options.citationObject ? options.citationObject : null;
        var citationId = options && options.citationID ? String(options.citationID) : "";
        var noteIndex = options && typeof options.noteIndex === "number"
            ? options.noteIndex
            : ((citation.properties && typeof citation.properties.noteIndex === "number")
                ? citation.properties.noteIndex
                : 0);

        if (!citationObject) {
            citationObject = {
                citationID: citationId || (options && options.requestId ? String(options.requestId) : "agent-citation-" + (existingFields.length + 1)),
                properties: {
                    formattedCitation: content,
                    plainCitation: content,
                    noteIndex: noteIndex
                },
                citationItems: createCitationItems(items),
                schema: CITATION_SCHEMA
            };
        }

        return {
            Value: buildCitationFieldValue(citationObject),
            Content: content
        };
    }

    return {
        CITATION_FIELD_PREFIX: CITATION_FIELD_PREFIX,
        CITATION_SCHEMA: CITATION_SCHEMA,
        buildCitationFieldValue: buildCitationFieldValue,
        parseCitationFieldValue: parseCitationFieldValue,
        createCitationFieldPayload: createCitationFieldPayload
    };
});
