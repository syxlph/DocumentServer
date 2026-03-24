# ONLYOFFICE Agent Plugin Bridge Contract

## Scope

This fork ships a bundled hidden `agent` plugin that runs in the browser session owning the live editor instance. The agent runtime is the frontend-callable execution bridge for:

- `executeMethod(...)`
- `callCommand(...)`
- Zotero-backed citation insertion
- future read/search/edit tools that stay outside the plugin as app-layer logic

Direct backend-to-plugin transport is out of scope for phase 1. Backend orchestration must route through the frontend/session owner that can post messages into the live editor.

## Transport

The host application talks to the agent plugin through the existing ONLYOFFICE external plugin message path:

1. Host page posts a message into the editor iframe with `type: "onExternalPluginMessage"`.
2. The hidden agent runtime receives the payload through `window.Asc.plugin.onExternalPluginMessage(...)`.
3. The agent runtime executes the requested bridge action.
4. The agent runtime emits a callback envelope back to the host through `type: "onExternalPluginMessageCallback"`.

The agent plugin filters requests by `target: "agent"`.

## Request Envelope

Every request sent to the hidden runtime uses a stable envelope:

```json
{
  "type": "agent.request",
  "target": "agent",
  "requestId": "uuid",
  "kind": "executeMethod",
  "name": "GetVersion",
  "args": []
}
```

Supported command families:

```json
{
  "type": "agent.request",
  "target": "agent",
  "requestId": "uuid",
  "kind": "executeMethod",
  "name": "GetVersion",
  "args": []
}
```

```json
{
  "type": "agent.request",
  "target": "agent",
  "requestId": "uuid",
  "kind": "callCommand",
  "code": "return { text: Api.GetDocument().GetText() };",
  "args": {
    "selectionOnly": false
  },
  "options": {
    "recalculate": true
  }
}
```

```json
{
  "type": "agent.request",
  "target": "agent",
  "requestId": "uuid",
  "kind": "insertCitation",
  "items": [
    {
      "key": "ITEMKEY",
      "library": "user"
    }
  ],
  "options": {
    "style": "apa",
    "locale": "en-US"
  }
}
```

## Response Envelope

Every response uses the same success/error envelope:

```json
{
  "type": "agent.response",
  "target": "agent",
  "requestId": "uuid",
  "kind": "executeMethod",
  "success": true,
  "result": "8.3.0"
}
```

```json
{
  "type": "agent.response",
  "target": "agent",
  "requestId": "uuid",
  "kind": "callCommand",
  "success": false,
  "error": {
    "code": "CALL_COMMAND_EXECUTION_FAILED",
    "message": "Api is not defined",
    "details": {}
  }
}
```

## Runtime Events

The runtime may also emit host-visible events through the same callback transport:

- `agent.ready`
- `agent.contextMenuClick`
- `agent.log`

Example:

```json
{
  "type": "agent.contextMenuClick",
  "guid": "asc.{7C0D3AE4-4932-4A1D-9E7A-6A7A2C7D98F1}",
  "itemId": "agent-add-citation"
}
```

## Logging

Every bridge request is logged in the agent runtime with:

- timestamp
- requestId
- kind
- method name or command summary
- argument summary
- success/failure
- durationMs

During development the runtime keeps logging unrestricted and emits `agent.log` callback events in addition to console logging.

## `callCommand` Rules

`callCommand` is the primitive for document traversal and structured editor-context work.

Rules:

- request code runs with `payload` copied into `Asc.scope.__agentPayload`
- request code must return JSON-compatible data only
- runtime serializes the return value to a JSON string before it leaves editor context
- runtime parses that JSON string in plugin context before returning it to the host
- non-serializable editor objects must be normalized inside the command code

Structured error codes:

- `CALL_COMMAND_EXECUTION_FAILED`
- `CALL_COMMAND_SERIALIZATION_FAILED`
- `CALL_COMMAND_RESPONSE_PARSE_FAILED`

## Zotero Settings And Citation Flow

The hidden runtime reads the same browser-side Zotero settings that the visible Zotero plugin uses:

- `zoteroUserId`
- `zoteroApiKey`
- `zoteroUserGroups`
- `zoteroStyleId`
- `zoteroLocale`

Citation flow:

1. Agent runtime receives `onContextMenuShow`.
2. Agent runtime adds `Add Citation`.
3. Click emits `agent.contextMenuClick` to the host app.
4. Host app resolves which Zotero item(s) to cite.
5. Host app sends `kind: "insertCitation"` back through the hidden agent bridge.
6. Hidden runtime formats the citation using the vendored Zotero executor and inserts it at the cursor.

The agent runtime owns transport plus execution. Citation selection and orchestration stay in app-layer code.

## Hardening Notes

Phase 1 intentionally keeps passthrough unrestricted to speed app-layer iteration. The envelope and logging shape are designed so a future allowlist or capability model can be added without changing transport.
