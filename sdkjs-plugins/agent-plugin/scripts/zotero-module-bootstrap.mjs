import { loadVendoredZotero } from "./zotero-modern-loader.mjs";
import "./zotero-native-adapter.js";
import "./agent.js";

await loadVendoredZotero(window);

if (window.OnlyOfficeAgentPlugin && window.Asc && window.Asc.plugin) {
    window.OnlyOfficeAgentPlugin.bootstrap(window);
}
