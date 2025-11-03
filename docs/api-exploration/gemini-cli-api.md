# Gemini CLI: UI/Core API Boundary

This document provides a detailed analysis of the architectural boundary
between the Gemini CLI's user interface (`packages/cli`) and its backend logic
(`packages/core`). It defines the API contract, data flow, and key
communication patterns that connect these two primary components.

## High-Level Overview

The Gemini CLI employs a decoupled architecture, separating the frontend
presentation layer (the Ink-based terminal UI) from the backend agent logic
(the Core). This separation of concerns allows for modular development and
clear communication pathways.

The interaction model is event-driven and asynchronous:

1. **UI to Core**: The UI initiates all interactions by sending a user's
   prompt or a tool's response to the Core.
1. **Core to UI**: The Core processes the request and communicates back to the
   UI by yielding a stream of events. The UI consumes this stream to render
   real-time updates, such as displaying text, showing agent "thoughts," or
   prompting for tool confirmation.

![High Level Architecture Diagram](https://github.com/google-gemini/gemini-cli/assets/12345/abcdef-1234-5678-90ab-cdef12345678)
*(Note: This is a placeholder for the diagram from the "Gemini CLI - Deep
Dive.pdf")*

## Core Components of the Boundary

The boundary is defined by the interaction between several key classes and
hooks:

- **`GeminiClient` (Core)**: The main public API for the Core package.
- **`GeminiChat` (Core)**: Manages the conversation history and low-level
  communication with the Gemini API.
- **`Turn` (Core)**: Represents a single conversational turn and generates the
  event stream.
- **`CoreToolScheduler` (Core)**: Manages the lifecycle of tool calls,
  including the confirmation flow.
- **`useGeminiStream` (UI)**: A React hook that orchestrates the communication
  with `GeminiClient` and processes the resulting event stream.
- **`useReactToolScheduler` (UI)**: A React hook that adapts the
  `CoreToolScheduler` for use in the UI, managing tool call state for
  rendering.

## The API Contract

### 1. UI-to-Core Communication: The `GeminiClient`

The `GeminiClient` class (`packages/core/src/core/client.ts`) is the sole
entry point for the UI.

#### Key Method: `sendMessageStream`

This is the primary method the UI calls to initiate a turn.

```typescript
// packages/core/src/core/client.ts
class GeminiClient {
  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn>;
}
```

- **`request` (`PartListUnion`)**: The content for the model, which can be a
  user's `string` prompt or a `FunctionResponse` from a tool.
- **`signal` (`AbortSignal`)**: Allows the UI to cancel the request.
- **Returns**: An `AsyncGenerator` yielding `ServerGeminiStreamEvent` objects.

Internally, `sendMessageStream` delegates to a `Turn` object, which in turn
uses `GeminiChat` to handle the actual API call and history management.

### 2. Core-to-UI Communication: The Event Stream

The Core communicates all state changes back to the UI via a stream of
`ServerGeminiStreamEvent` objects, defined in
`packages/core/src/core/turn.ts`.

#### Key Data Structures

```typescript
// packages/core/src/core/turn.ts
export enum GeminiEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
  Thought = 'thought',
  Error = 'error',
  // ... and others
}

export type ServerGeminiStreamEvent =
  | { type: GeminiEventType.Content; value: string }
  | { type: GeminiEventType.ToolCallRequest; value: ToolCallRequestInfo }
  // ... etc.
```

#### UI Handling of Events

The `useGeminiStream` hook (`packages/cli/src/ui/hooks/useGeminiStream.ts`)
consumes this stream in `processGeminiStreamEvents`. A `switch` statement
directs each event type to a specific handler function, which updates the UI's
state.

```typescript
// packages/cli/src/ui/hooks/useGeminiStream.ts
for await (const event of stream) {
  switch (event.type) {
    case ServerGeminiEventType.Thought:
      setThought(event.value);
      break;
    case ServerGeminiEventType.Content:
      // ... buffer and render text
      break;
    case ServerGeminiEventType.ToolCallRequest:
      toolCallRequests.push(event.value);
      break;
    // ...
  }
}
if (toolCallRequests.length > 0) {
  scheduleToolCalls(toolCallRequests, signal);
}
```

This pattern is consistent across both interactive (`useGeminiStream.ts`) and
non-interactive (`nonInteractiveCli.ts`) modes, demonstrating its fundamental
role in the architecture.

## The Security Bridge: Human-in-the-Loop Tool Confirmation

This callback-driven flow is orchestrated by the `CoreToolScheduler`
(`packages/core/src/core/coreToolScheduler.ts`).

### The Flow

1. **Core Requests Tool Execution**: A `Turn` yields a `ToolCallRequest`
   event.

1. **UI Receives Request**: `useGeminiStream` passes the request to
   `scheduleToolCalls`, a function from the `useReactToolScheduler` hook.

1. **UI Scheduler Adapts**: `useReactToolScheduler` is a thin wrapper that
   connects the `CoreToolScheduler` to React's state. It passes an
   `onToolCallsUpdate` callback to the core scheduler.

1. **Core Determines Confirmation Need**: The `CoreToolScheduler` instance
   calls the tool's `shouldConfirmExecute()` method. If confirmation is
   needed, it transitions the tool's state to `awaiting_approval`.

1. **Core Notifies UI**: The scheduler invokes the `onToolCallsUpdate`
   callback with the new tool states.

1. **UI Renders Confirmation**: The `useReactToolScheduler` hook receives the
   update and sets its local state, causing the UI to render a confirmation
   dialog. The `onConfirm` function from the scheduler's `confirmationDetails`
   is passed to the dialog's buttons.

1. **UI Sends Response to Core**: The user's click invokes the `onConfirm`
   callback, passing the decision directly back into the `CoreToolScheduler`.

1. **Core Executes or Cancels**: The `CoreToolScheduler` updates the tool's
   state to `scheduled` or `cancelled` and proceeds with execution if
   necessary. The final state is again communicated to the UI via the
   `onToolCallsUpdate` callback.

This flow cleanly separates the state management logic (Core) from the
rendering logic (UI), connected by a well-defined set of callbacks and state
objects.

## Appendix: API Interaction Schema

This section provides a more formal, pseudo-protobuf definition of the API
boundary, illustrating the services, methods, and data structures involved in
the communication between the UI and the Core.

### Service: `GeminiCliService` (Core)

This service represents the public API of the `@google/gemini-cli-core`
package, primarily exposed through the `GeminiClient` class.

______________________________________________________________________

#### **RPC: `SendMessageStream`**

Initiates a conversational turn. The UI sends a single request, and the Core
streams back a series of events until the turn is complete.

`rpc SendMessageStream(SendMessageRequest) returns (stream ServerGeminiStreamEvent);`

**Request: `SendMessageRequest`**

This corresponds to the arguments passed to the
`GeminiClient.sendMessageStream` method.

```proto
message SendMessageRequest {
  // The content of the user's message or a tool's function response.
  // Can be a simple string or a list of structured Parts.
  // Corresponds to the `request` parameter.
  PartListUnion request_content = 1;

  // A signal to allow for cancellation of the stream from the UI.
  // Corresponds to the `signal` parameter.
  AbortSignal signal = 2;

  // A unique identifier for the prompt initiating this turn.
  // Corresponds to the `prompt_id` parameter.
  string prompt_id = 3;
}
```

**Response Stream: `ServerGeminiStreamEvent`**

A streaming union of different event types defined in
`packages/core/src/core/turn.ts`.

```proto
message ServerGeminiStreamEvent {
  // The type of the event, corresponding to the GeminiEventType enum.
  string type = 1;

  // The payload of the event, which varies based on the type.
  oneof value {
    string content = 2;                      // For type: "content"
    ToolCallRequestInfo tool_call_request = 3; // For type: "tool_call_request"
    ThoughtSummary thought = 4;                // For type: "thought"
    GeminiErrorEventValue error = 5;         // For type: "error"
    FinishedEventValue finished = 6;         // For type: "finished"
    ChatCompressionInfo chat_compressed = 7; // For type: "chat_compressed"
    // ... other event types
  }
}
```

**Key Event Payloads:**

```proto
// A piece of text content generated by the model.
message Content {
  string value = 1;
}

// A request from the model to execute a tool.
message ToolCallRequestInfo {
  string callId = 1;
  string name = 2;
  map<string, any> args = 3;
}

// An intermediate thought process from the model.
message ThoughtSummary {
  string subject = 1;
  string description = 2;
}
```

______________________________________________________________________

### Callback Service: `ToolSchedulerCallbacks` (UI)

This represents the set of callbacks that the UI layer must provide to the
`CoreToolScheduler` to handle the tool lifecycle and state updates.

#### **Callback: `onToolCallsUpdate`**

The Core invokes this callback whenever the state of any tracked tool call
changes. This is the primary mechanism for the UI to receive updates for
rendering.

`callback onToolCallsUpdate(ToolCallsUpdatePayload);`

**Payload: `ToolCallsUpdatePayload`**

```proto
message ToolCallsUpdatePayload {
  // A complete, updated list of all currently tracked tool calls.
  repeated ToolCall tool_calls = 1;
}
```

**Data Structure: `ToolCall`**

A union type representing the state of a single tool call, defined in
`packages/core/src/core/coreToolScheduler.ts`.

```proto
message ToolCall {
  // The current status of the tool call.
  string status = 1; // e.g., "awaiting_approval", "executing", "success", "error"

  // The original request from the model.
  ToolCallRequestInfo request = 2;

  // Details specific to the current status.
  oneof details {
    WaitingToolCallDetails waiting_details = 3;
    ExecutingToolCallDetails executing_details = 4;
    CompletedToolCallDetails completed_details = 5;
  }
}

// Details for a tool call waiting for user confirmation.
message WaitingToolCallDetails {
  // Contains the prompt message, diffs, and the onConfirm callback.
  ToolCallConfirmationDetails confirmation_details = 1;
}
```

______________________________________________________________________

#### **Callback: `onConfirm` (Provided by Core, Invoked by UI)**

This function is not implemented by the UI but is *provided* by the
`CoreToolScheduler` as part of the `ToolCallConfirmationDetails` payload. The
UI invokes this function when the user makes a decision in a confirmation
prompt.

`callback onConfirm(ToolConfirmationOutcome, optional ToolConfirmationPayload);`

**Parameters:**

- **`ToolConfirmationOutcome`**: An enum value from the Core (`ProceedOnce`,
  `Cancel`, `ModifyWithEditor`, etc.) representing the user's choice.
- **`ToolConfirmationPayload`**: An optional object that can contain data from
  the UI, such as user-modified content for a file edit.
